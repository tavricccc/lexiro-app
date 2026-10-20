import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The idb-keyval surface the web's library repository and persist module use,
 * kept in AsyncStorage. Values are JSON, which every stored record already is;
 * the prefix keeps them apart from Firebase's and the localStorage mirror.
 */
const PREFIX = "idb:";

export async function get<T = unknown>(key: string): Promise<T | undefined> {
  const raw = await AsyncStorage.getItem(PREFIX + key);
  return raw === null ? undefined : (JSON.parse(raw) as T);
}

export async function set(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(PREFIX + key, JSON.stringify(value));
}

export async function setMany(entries: [string, unknown][]): Promise<void> {
  await AsyncStorage.multiSet(entries.map(([key, value]) => [PREFIX + key, JSON.stringify(value)]));
}

export async function del(key: string): Promise<void> {
  await AsyncStorage.removeItem(PREFIX + key);
}

export async function delMany(keys: string[]): Promise<void> {
  await AsyncStorage.multiRemove(keys.map((key) => PREFIX + key));
}

export async function keys(): Promise<string[]> {
  return (await AsyncStorage.getAllKeys())
    .filter((key) => key.startsWith(PREFIX))
    .map((key) => key.slice(PREFIX.length));
}
