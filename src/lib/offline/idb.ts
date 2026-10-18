/** Tiny IndexedDB key-value store (two stores: saved data reads, and changes waiting to sync). */
const DB = 'agri-offline'
export type StoreName = 'reads' | 'ops'

let dbp: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbp) {
    dbp = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 1)
      req.onupgradeneeded = () => {
        for (const s of ['reads', 'ops'] as StoreName[]) if (!req.result.objectStoreNames.contains(s)) req.result.createObjectStore(s)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }
  return dbp
}

function run<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return db().then((d) => new Promise<T>((resolve, reject) => {
    const tx = d.transaction(store, mode)
    const r = fn(tx.objectStore(store))
    tx.oncomplete = () => resolve(r.result)
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error)
  }))
}

export const idbGet = <T>(store: StoreName, key: string) => run<T | undefined>(store, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>)
export const idbSet = (store: StoreName, key: string, value: unknown) => run(store, 'readwrite', (s) => s.put(value, key))
export const idbDel = (store: StoreName, key: string) => run(store, 'readwrite', (s) => s.delete(key))
export const idbAll = <T>(store: StoreName) => run<T[]>(store, 'readonly', (s) => s.getAll() as IDBRequest<T[]>)
export const idbClear = (store: StoreName) => run(store, 'readwrite', (s) => s.clear())
