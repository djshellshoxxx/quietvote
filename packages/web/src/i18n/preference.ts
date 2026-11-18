import type { DeviceStorage } from '../key/storage.ts';

/** Read a saved UI language. Storage failure must not prevent the client from starting. */
export async function readLanguagePreference(storage: Pick<DeviceStorage, 'getSettings'>): Promise<string | undefined> {
  try {
    return (await storage.getSettings()).language;
  } catch {
    return undefined;
  }
}

/** Save a UI language without replacing unrelated device settings. */
export async function writeLanguagePreference(
  storage: Pick<DeviceStorage, 'getSettings' | 'putSettings'>,
  language: string,
): Promise<void> {
  const settings = await storage.getSettings();
  await storage.putSettings({ ...settings, language });
}
