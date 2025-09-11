/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

const DB_NAME = 'BananaCamDB';
const DB_VERSION = 1;
const STORES = {
  INPUTS: 'inputs',
  OUTPUTS: 'outputs',
};

let dbPromise = null;

function getDB() {
  if (!window.indexedDB) {
    console.warn("IndexedDB not supported. Photos will not be saved across sessions.");
    return Promise.reject("IndexedDB not supported");
  }

  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB error:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = event => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORES.INPUTS)) {
          db.createObjectStore(STORES.INPUTS);
        }
        if (!db.objectStoreNames.contains(STORES.OUTPUTS)) {
          db.createObjectStore(STORES.OUTPUTS);
        }
      };
    });
  }
  return dbPromise;
}

async function get(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readonly');
    const store = transaction.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function set(storeName, key, value) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.put(value, key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function del(storeName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function clear(storeName) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, 'readwrite');
    const store = transaction.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function getAll(storeName) {
    try {
        const db = await getDB();
        return new Promise((resolve, reject) => {
            const transaction = db.transaction(storeName, 'readonly');
            const store = transaction.objectStore(storeName);
            const request = store.openCursor();
            const data = {};

            request.onsuccess = event => {
                const cursor = event.target.result;
                if (cursor) {
                    data[cursor.key] = cursor.value;
                    cursor.continue();
                } else {
                    resolve(data);
                }
            };
            request.onerror = event => {
                reject(event.target.error);
            };
        });
    } catch (error) {
        console.error(`Failed to get all from ${storeName}`, error);
        return {}; // Return empty object if DB is not supported
    }
}


export const db = {
  get,
  set,
  del,
  clear,
  getAll,
  STORES,
};
