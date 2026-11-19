import type { DeviceStorage } from './storage.ts';
import { checkOrigin } from '../api/origins.ts';

/** Same-origin installations keep their existing slots. Other boards have disjoint keys, receipts, heads and recovery markers. */
export function boardStorage(storage: DeviceStorage, board: string, pageOrigin: string): DeviceStorage {
  checkOrigin(board); checkOrigin(pageOrigin);
  if (board === pageOrigin) return storage;
  const prefix = `board:${encodeURIComponent(board)}:`;
  const id = (value: string): string => prefix + value;
  return {
    getKey: (slot) => storage.getKey(id(slot)),
    putKey: (slot, key) => storage.putKey(id(slot), key),
    ...(storage.installKeyIfAbsent ? { installKeyIfAbsent: (slot: string, key: Parameters<NonNullable<DeviceStorage['installKeyIfAbsent']>>[1], current?: () => boolean) => storage.installKeyIfAbsent!(id(slot), key, current) } : {}),
    listKeySlots: async () => (await storage.listKeySlots()).filter((slot) => slot.startsWith(prefix)).map((slot) => slot.slice(prefix.length)),
    getReceipts: async (electionId) => (await storage.getReceipts(id(electionId))).map((r) => ({ ...r, electionId })),
    putReceipt: (r) => storage.putReceipt({ ...r, electionId: id(r.electionId) }),
    getHead: async (electionId) => { const h = await storage.getHead(id(electionId)); return h && { ...h, electionId }; },
    putHead: (h) => storage.putHead({ ...h, electionId: id(h.electionId) }),
    getPendingCast: async (origin, electionId) => { const p = await storage.getPendingCast(origin, id(electionId)); return p && { ...p, electionId }; },
    putPendingCast: (p) => storage.putPendingCast({ ...p, electionId: id(p.electionId) }),
    deletePendingCast: (p) => storage.deletePendingCast({ ...p, electionId: id(p.electionId) }),
    // Preferences are device-wide; acknowledgement keys are already bound to the signed manifest hash.
    getSettings: () => storage.getSettings(), putSettings: (s) => storage.putSettings(s),
    updateSettings: (change, current) => storage.updateSettings(change, current),
    clearAll: () => storage.clearAll(), requestPersistence: () => storage.requestPersistence(),
  };
}
