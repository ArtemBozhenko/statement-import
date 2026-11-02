/**
 * String storage: reads are synchronous so the state is known before the first frame,
 * writes return a promise that the controller awaits where ordering matters (key before POST).
 */
export interface KeyValueStore {
  getString(key: string): string | undefined;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export function createMemoryStore(): KeyValueStore {
  const map = new Map<string, string>();
  return {
    getString: (key) => map.get(key),
    async set(key, value) {
      map.set(key, value);
    },
    async remove(key) {
      map.delete(key);
    },
  };
}
