// ─── IndexedDB wrapper ────────────────────────────────────────────────────────
const DB_NAME = 'scheme-portal'
const DB_VERSION = 1

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result
      if (!db.objectStoreNames.contains('schemes'))
        db.createObjectStore('schemes', { keyPath: 'id' })
      if (!db.objectStoreNames.contains('meta'))
        db.createObjectStore('meta')
    }
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}

export async function saveSchemes(schemes) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['schemes', 'meta'], 'readwrite')
    const store = tx.objectStore('schemes')
    store.clear()
    schemes.forEach(s => store.put(s))
    tx.objectStore('meta').put(new Date().toISOString(), 'lastSync')
    tx.oncomplete = () => resolve()
    tx.onerror = e => reject(e.target.error)
  })
}

export async function loadSchemes() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('schemes', 'readonly')
    const req = tx.objectStore('schemes').getAll()
    req.onsuccess = e => resolve(e.target.result || [])
    req.onerror = e => reject(e.target.error)
  })
}

export async function getLastSync() {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction('meta', 'readonly')
    const req = tx.objectStore('meta').get('lastSync')
    req.onsuccess = e => resolve(e.target.result || null)
    req.onerror = e => reject(e.target.error)
  })
}
