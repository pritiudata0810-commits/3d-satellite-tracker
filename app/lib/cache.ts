export type CacheEntry<T> = { data: T; storedAt: number }

export function createMemoryCache<T>() {
  let entry: CacheEntry<T> | null = null
  return {
    get(maxAgeMs: number): T | null {
      if (!entry) return null
      if (Date.now() - entry.storedAt > maxAgeMs) {
        entry = null
        return null
      }
      return entry.data
    },
    set(data: T) {
      entry = { data, storedAt: Date.now() }
    },
    clear() {
      entry = null
    },
  }
}
