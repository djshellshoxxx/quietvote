// Device storage (QV-19 §4 "State"): the wrapped key blob, receipts, pinned tree heads and a small settings store live in
// IndexedDB. No cookies, no localStorage for anything sensitive. The interface is DOM-free so flows are testable with the
// in-memory implementation; the IndexedDB implementation is a thin adapter exercised in the browser e2e.
import type { QvKey1 } from './keystore.ts';

/** Public lookup data only: never ciphertext, choices, signing material or replayable request bytes. */
export interface PendingCast {
  origin: string;
  electionId: string;
  manifestHash: string;
  code: string;
  leafHash: string;
}
const pendingKey = (origin: string, electionId: string): string => `pending-cast/${origin}/${electionId}`;

export interface StoredReceipt {
  electionId: string;
  code: string;
  seq: number;
  /** Receipt file JSON text (no secrets). */
  json: string;
}
export interface PinnedHead {
  electionId: string;
  size: number;
  /** Signed checkpoint note text. */
  note: string;
}
export interface DeviceSettings {
  rememberReceipts: boolean;
  sharedDevice: boolean;
  /** BCP 47 UI language preference; absent means use browser negotiation. */
  language?: string;
  /** Per-election "Election ID confirmed" state (UX V1). */
  confirmed: Record<string, boolean>;
  /** Per-election "rules acknowledged" state (UX V2). */
  rulesSeen: Record<string, boolean>;
}
export const DEFAULT_SETTINGS: Readonly<DeviceSettings> = Object.freeze({ rememberReceipts: true, sharedDevice: false, confirmed: {}, rulesSeen: {} });
const settingsCopy = (s?: DeviceSettings): DeviceSettings => ({ ...DEFAULT_SETTINGS, ...s, confirmed: { ...s?.confirmed }, rulesSeen: { ...s?.rulesSeen } });

export interface DeviceStorage {
  getPendingCast(origin: string, electionId: string): Promise<PendingCast | undefined>;
  /** Atomically reserves this election; refuses a different unresolved submission. */
  putPendingCast(p: PendingCast): Promise<void>;
  deletePendingCast(p: PendingCast): Promise<void>;
  getKey(slot: string): Promise<QvKey1 | undefined>;
  putKey(slot: string, c: QvKey1): Promise<void>;
  /** Atomically install a new key without replacing one installed by another tab. */
  installKeyIfAbsent?(slot: string, c: QvKey1, canInstall?: () => boolean): Promise<boolean>;
  listKeySlots(): Promise<string[]>;
  getReceipts(electionId: string): Promise<StoredReceipt[]>;
  putReceipt(r: StoredReceipt): Promise<void>;
  getHead(electionId: string): Promise<PinnedHead | undefined>;
  putHead(h: PinnedHead): Promise<void>;
  getSettings(): Promise<DeviceSettings>;
  putSettings(s: DeviceSettings): Promise<void>;
  /** Merge against the latest settings in one transaction; an abandoned view may cancel before the write. */
  updateSettings(change: (s: DeviceSettings) => DeviceSettings, current?: () => boolean): Promise<DeviceSettings | undefined>;
  /** "Forget this device" / "Clear this device": wipes everything (QV-19 §15). */
  clearAll(): Promise<void>;
  /** Asks the browser for persistent storage; resolves false when denied or unsupported (UI warns, E-KEY-STORAGE). */
  requestPersistence(): Promise<boolean>;
}

export class MemoryStorage implements DeviceStorage {
  pendingCasts = new Map<string, PendingCast>();
  getPendingCast(origin: string, electionId: string): Promise<PendingCast | undefined> {
    return Promise.resolve(this.pendingCasts.get(pendingKey(origin, electionId)));
  }
  putPendingCast(p: PendingCast): Promise<void> {
    const old = this.pendingCasts.get(pendingKey(p.origin, p.electionId));
    if (old && old.leafHash !== p.leafHash) throw new Error('unresolved cast');
    this.pendingCasts.set(pendingKey(p.origin, p.electionId), { ...p });
    return Promise.resolve();
  }
  deletePendingCast(p: PendingCast): Promise<void> {
    const key = pendingKey(p.origin, p.electionId);
    if (this.pendingCasts.get(key)?.leafHash === p.leafHash) this.pendingCasts.delete(key);
    return Promise.resolve();
  }
  keys = new Map<string, QvKey1>();
  receipts: StoredReceipt[] = [];
  heads = new Map<string, PinnedHead>();
  settings: DeviceSettings = { ...DEFAULT_SETTINGS, confirmed: {}, rulesSeen: {} };
  persist = true;
  getKey(slot: string): Promise<QvKey1 | undefined> {
    return Promise.resolve(this.keys.get(slot));
  }
  putKey(slot: string, c: QvKey1): Promise<void> {
    this.keys.set(slot, c);
    return Promise.resolve();
  }
  installKeyIfAbsent(slot: string, c: QvKey1, canInstall: () => boolean = () => true): Promise<boolean> {
    if (!canInstall() || this.keys.has(slot)) return Promise.resolve(false);
    this.keys.set(slot, c);
    return Promise.resolve(true);
  }
  listKeySlots(): Promise<string[]> {
    return Promise.resolve([...this.keys.keys()]);
  }
  getReceipts(electionId: string): Promise<StoredReceipt[]> {
    return Promise.resolve(this.receipts.filter((r) => r.electionId === electionId));
  }
  putReceipt(r: StoredReceipt): Promise<void> {
    this.receipts = this.receipts.filter((x) => !(x.electionId === r.electionId && x.code === r.code));
    this.receipts.push(r);
    return Promise.resolve();
  }
  getHead(electionId: string): Promise<PinnedHead | undefined> {
    return Promise.resolve(this.heads.get(electionId));
  }
  putHead(h: PinnedHead): Promise<void> {
    this.heads.set(h.electionId, h);
    return Promise.resolve();
  }
  getSettings(): Promise<DeviceSettings> {
    return Promise.resolve(settingsCopy(this.settings));
  }
  putSettings(s: DeviceSettings): Promise<void> {
    this.settings = settingsCopy(s);
    return Promise.resolve();
  }
  updateSettings(change: (s: DeviceSettings) => DeviceSettings, current: () => boolean = () => true): Promise<DeviceSettings | undefined> {
    if (!current()) return Promise.resolve(undefined);
    this.settings = settingsCopy(change(settingsCopy(this.settings)));
    return Promise.resolve(settingsCopy(this.settings));
  }
  clearAll(): Promise<void> {
    this.pendingCasts.clear();
    this.keys.clear();
    this.receipts = [];
    this.heads.clear();
    this.settings = { ...DEFAULT_SETTINGS, confirmed: {}, rulesSeen: {} };
    return Promise.resolve();
  }
  requestPersistence(): Promise<boolean> {
    return Promise.resolve(this.persist);
  }
}

const DB_NAME = 'quietvote-v1';
const STORES = ['keys', 'receipts', 'heads', 'settings'] as const;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = (): void => resolve(r.result);
    r.onerror = (): void => reject(r.error ?? new Error('indexeddb error'));
  });
}

/** IndexedDB adapter. Throws on blocked storage; callers map that to E-KEY-STORAGE. */
export class IdbStorage implements DeviceStorage {
  private dbp: Promise<IDBDatabase> | undefined;
  private db(): Promise<IDBDatabase> {
    if (this.dbp) return this.dbp;
    let abandoned = false;
    const opening = new Promise<IDBDatabase>((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      const fail = (error: unknown): void => { abandoned = true; reject(error); };
      open.onupgradeneeded = (): void => {
        if (abandoned) { open.transaction?.abort(); return; }
        for (const s of STORES) open.result.createObjectStore(s);
      };
      open.onsuccess = (): void => { if (abandoned) open.result.close(); else resolve(open.result); };
      open.onerror = (): void => fail(open.error ?? new Error('indexeddb unavailable'));
      open.onblocked = (): void => fail(new Error('indexeddb blocked'));
    });
    const cached = opening.catch((error: unknown) => {
      if (this.dbp === cached) this.dbp = undefined;
      throw error;
    });
    return this.dbp = cached;
  }
  private async store(name: (typeof STORES)[number], mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(name, mode).objectStore(name);
  }
  async getPendingCast(origin: string, electionId: string): Promise<PendingCast | undefined> {
    return await req((await this.store('settings', 'readonly')).get(pendingKey(origin, electionId))) as PendingCast | undefined;
  }
  private async writeStore(name: (typeof STORES)[number], write: (store: IDBObjectStore) => void): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(name, 'readwrite');
      // Request success is not durability: POST and marker removal wait for commit.
      tx.oncomplete = (): void => resolve();
      tx.onabort = tx.onerror = (): void => reject(tx.error ?? new Error('device storage failed'));
      write(tx.objectStore(name));
    });
  }
  private changePending(p: PendingCast, remove: boolean): Promise<void> {
    return this.writeStore('settings', (store) => {
      const key = pendingKey(p.origin, p.electionId);
      const read = store.get(key);
      read.onsuccess = (): void => {
        const old = read.result as PendingCast | undefined;
        if (remove) {
          if (old?.leafHash === p.leafHash) store.delete(key);
        } else if (old && old.leafHash !== p.leafHash) store.transaction.abort();
        else store.put(p, key);
      };
    });
  }
  putPendingCast(p: PendingCast): Promise<void> { return this.changePending(p, false); }
  deletePendingCast(p: PendingCast): Promise<void> { return this.changePending(p, true); }
  async getKey(slot: string): Promise<QvKey1 | undefined> {
    return (await req((await this.store('keys', 'readonly')).get(slot))) as QvKey1 | undefined;
  }
  async putKey(slot: string, c: QvKey1): Promise<void> {
    await req((await this.store('keys', 'readwrite')).put(c, slot));
  }
  async installKeyIfAbsent(slot: string, c: QvKey1, canInstall: () => boolean = () => true): Promise<boolean> {
    const db = await this.db();
    if (!canInstall()) return false;
    return new Promise<boolean>((resolve, reject) => {
      // Read/write transactions on this object store serialize across connections/tabs.
      const tx = db.transaction('keys', 'readwrite');
      let installed = false;
      tx.oncomplete = (): void => resolve(installed);
      tx.onabort = (): void => reject(tx.error ?? new Error('key installation aborted'));
      tx.onerror = (): void => reject(tx.error ?? new Error('key installation failed'));
      const store = tx.objectStore('keys');
      const current = store.get(slot);
      current.onsuccess = (): void => {
        if (current.result === undefined && canInstall()) store.add(c, slot).onsuccess = (): void => { installed = true; };
      };
    });
  }
  async listKeySlots(): Promise<string[]> {
    return (await req((await this.store('keys', 'readonly')).getAllKeys())).map(String);
  }
  async getReceipts(electionId: string): Promise<StoredReceipt[]> {
    const all = (await req((await this.store('receipts', 'readonly')).getAll())) as StoredReceipt[];
    return all.filter((r) => r.electionId === electionId);
  }
  async putReceipt(r: StoredReceipt): Promise<void> {
    await this.writeStore('receipts', (store) => { store.put(r, `${r.electionId}/${r.code}`); });
  }
  async getHead(electionId: string): Promise<PinnedHead | undefined> {
    return (await req((await this.store('heads', 'readonly')).get(electionId))) as PinnedHead | undefined;
  }
  async putHead(h: PinnedHead): Promise<void> {
    await this.writeStore('heads', (store) => { store.put(h, h.electionId); });
  }
  async getSettings(): Promise<DeviceSettings> {
    const s = (await req((await this.store('settings', 'readonly')).get('settings'))) as DeviceSettings | undefined;
    return settingsCopy(s);
  }
  async putSettings(s: DeviceSettings): Promise<void> {
    await this.writeStore('settings', (store) => { store.put(s, 'settings'); });
  }
  async updateSettings(change: (s: DeviceSettings) => DeviceSettings, current: () => boolean = () => true): Promise<DeviceSettings | undefined> {
    let saved: DeviceSettings | undefined;
    await this.writeStore('settings', (store) => {
      const read = store.get('settings');
      read.onsuccess = (): void => {
        if (!current()) return;
        saved = settingsCopy(change(settingsCopy(read.result as DeviceSettings | undefined)));
        store.put(saved, 'settings');
      };
    });
    return saved;
  }
  async clearAll(): Promise<void> {
    const db = await this.db();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([...STORES], 'readwrite');
      tx.oncomplete = (): void => resolve();
      tx.onabort = tx.onerror = (): void => reject(tx.error ?? new Error('device clearing failed'));
      for (const s of STORES) tx.objectStore(s).clear();
    });
  }
  async requestPersistence(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }
}
