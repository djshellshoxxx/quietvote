// Device storage (QV-19 §4 "State"): the wrapped key blob, receipts, pinned tree heads and a small settings store live in
// IndexedDB. No cookies, no localStorage for anything sensitive. The interface is DOM-free so flows are testable with the
// in-memory implementation; the IndexedDB implementation is a thin adapter exercised in the browser e2e.
import type { QvKey1 } from './keystore.ts';

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
  /** Per-election "Election ID confirmed" state (UX V1). */
  confirmed: Record<string, boolean>;
  /** Per-election "rules acknowledged" state (UX V2). */
  rulesSeen: Record<string, boolean>;
}
export const DEFAULT_SETTINGS: Readonly<DeviceSettings> = Object.freeze({ rememberReceipts: true, sharedDevice: false, confirmed: {}, rulesSeen: {} });

export interface DeviceStorage {
  getKey(slot: string): Promise<QvKey1 | undefined>;
  putKey(slot: string, c: QvKey1): Promise<void>;
  listKeySlots(): Promise<string[]>;
  getReceipts(electionId: string): Promise<StoredReceipt[]>;
  putReceipt(r: StoredReceipt): Promise<void>;
  getHead(electionId: string): Promise<PinnedHead | undefined>;
  putHead(h: PinnedHead): Promise<void>;
  getSettings(): Promise<DeviceSettings>;
  putSettings(s: DeviceSettings): Promise<void>;
  /** "Forget this device" / "Clear this device": wipes everything (QV-19 §15). */
  clearAll(): Promise<void>;
  /** Asks the browser for persistent storage; resolves false when denied or unsupported (UI warns, E-KEY-STORAGE). */
  requestPersistence(): Promise<boolean>;
}

export class MemoryStorage implements DeviceStorage {
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
    return Promise.resolve({ ...this.settings });
  }
  putSettings(s: DeviceSettings): Promise<void> {
    this.settings = { ...s };
    return Promise.resolve();
  }
  clearAll(): Promise<void> {
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
    this.dbp ??= new Promise((resolve, reject) => {
      const open = indexedDB.open(DB_NAME, 1);
      open.onupgradeneeded = (): void => {
        for (const s of STORES) open.result.createObjectStore(s);
      };
      open.onsuccess = (): void => resolve(open.result);
      open.onerror = (): void => reject(open.error ?? new Error('indexeddb unavailable'));
      open.onblocked = (): void => reject(new Error('indexeddb blocked'));
    });
    return this.dbp;
  }
  private async store(name: (typeof STORES)[number], mode: IDBTransactionMode): Promise<IDBObjectStore> {
    return (await this.db()).transaction(name, mode).objectStore(name);
  }
  async getKey(slot: string): Promise<QvKey1 | undefined> {
    return (await req((await this.store('keys', 'readonly')).get(slot))) as QvKey1 | undefined;
  }
  async putKey(slot: string, c: QvKey1): Promise<void> {
    await req((await this.store('keys', 'readwrite')).put(c, slot));
  }
  async listKeySlots(): Promise<string[]> {
    return (await req((await this.store('keys', 'readonly')).getAllKeys())).map(String);
  }
  async getReceipts(electionId: string): Promise<StoredReceipt[]> {
    const all = (await req((await this.store('receipts', 'readonly')).getAll())) as StoredReceipt[];
    return all.filter((r) => r.electionId === electionId);
  }
  async putReceipt(r: StoredReceipt): Promise<void> {
    await req((await this.store('receipts', 'readwrite')).put(r, `${r.electionId}/${r.code}`));
  }
  async getHead(electionId: string): Promise<PinnedHead | undefined> {
    return (await req((await this.store('heads', 'readonly')).get(electionId))) as PinnedHead | undefined;
  }
  async putHead(h: PinnedHead): Promise<void> {
    await req((await this.store('heads', 'readwrite')).put(h, h.electionId));
  }
  async getSettings(): Promise<DeviceSettings> {
    const s = (await req((await this.store('settings', 'readonly')).get('settings'))) as DeviceSettings | undefined;
    return { ...DEFAULT_SETTINGS, confirmed: {}, rulesSeen: {}, ...s };
  }
  async putSettings(s: DeviceSettings): Promise<void> {
    await req((await this.store('settings', 'readwrite')).put(s, 'settings'));
  }
  async clearAll(): Promise<void> {
    const db = await this.db();
    for (const s of STORES) await req(db.transaction(s, 'readwrite').objectStore(s).clear());
  }
  async requestPersistence(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }
}
