import { MemoryStorage, type DeviceStorage } from './storage.ts';
import type { Signer } from './signer.ts';

/** One document's explicit storage choice. Existing handles never change their backing store. */
export class StorageSession {
  current: DeviceStorage;
  isSession = false;
  failed = false;
  ballotStarted = false;
  generation = 0;
  changed?: () => void;
  private backing: DeviceStorage;
  private keyGeneration = 0;
  private readonly signers = new Set<Signer>();

  constructor(storage: DeviceStorage) {
    this.backing = storage;
    this.current = this.observe(storage);
  }

  private observe(storage: DeviceStorage): DeviceStorage {
    const generation = this.generation;
    return new Proxy(storage, { get: (target, name) => {
      const value: unknown = Reflect.get(target, name);
      if (typeof value !== 'function') return value;
      return async (...args: unknown[]) => {
        if (generation !== this.generation) throw new Error('storage context changed');
        try {
          const result: unknown = await Reflect.apply(value, target, args);
          if (generation !== this.generation) throw new Error('storage context changed');
          return result;
        } catch (error) {
          if (generation === this.generation && !this.failed) { this.failed = true; this.changed?.(); }
          throw error;
        }
      };
    } });
  }

  get canSelectSession(): boolean { return this.failed && !this.isSession && !this.ballotStarted; }
  get hasSigners(): boolean { return this.signers.size > 0; }

  /** Track a short-lived signing operation so mode switches and auto-lock also cancel its queued work. */
  async protectSigner(load: () => Promise<Signer>, current: () => boolean): Promise<Signer> {
    const generation = this.keyGeneration;
    const valid = (): boolean => generation === this.keyGeneration && current();
    if (!valid()) throw new Error('signing context changed');
    const signer = await load();
    if (!valid()) { signer.lock(); throw new Error('signing context changed'); }
    const sign = signer.sign.bind(signer), lock = signer.lock.bind(signer);
    this.signers.add(signer);
    signer.lock = (): void => { lock(); this.signers.delete(signer); };
    signer.sign = async (message): Promise<Uint8Array> => {
      if (!valid() || signer.locked) throw new Error('signing context changed');
      const signature = await sign(message);
      if (!valid() || signer.locked) { signature.fill(0); signer.lock(); throw new Error('signing context changed'); }
      return signature;
    };
    return signer;
  }

  lockSigners(): void {
    this.keyGeneration++;
    for (const signer of this.signers) signer.lock();
  }

  /** The caller first invalidates its key/view work. There is no automatic fallback or copy of unreadable data. */
  selectSession(): boolean {
    if (!this.canSelectSession) return false;
    this.lockSigners();
    const memory = new MemoryStorage(); memory.persist = false;
    this.generation++;
    this.isSession = true;
    this.failed = false;
    this.backing = memory;
    this.current = this.observe(memory);
    this.changed?.();
    return true;
  }

  /** Do not reroute or change stores while a ballot may be sealed, sent, or unresolved. */
  beginBallot(): void { if (!this.ballotStarted) { this.ballotStarted = true; this.changed?.(); } }
  retry(): void { this.failed = false; this.changed?.(); }

  async clear(): Promise<void> {
    // Late callbacks using an earlier handle cannot reinstall keys or receipts after this clear.
    this.lockSigners();
    const prior = this.generation;
    this.generation++;
    this.current = this.observe(this.backing);
    try { await this.current.clearAll(); }
    catch (error) {
      // A failed clear did not erase the old context, including its exact pending retry.
      this.generation = prior;
      this.current = this.observe(this.backing);
      throw error;
    }
  }
}
