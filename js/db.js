const DB_NAME = 'pdf-viewer-db';
const STORE_NAME = 'files';
const DB_VERSION = 1;

let _dbInstance = null;

export function initDB() {
  return new Promise((resolve, reject) => {
    if (_dbInstance) {
      return resolve(_dbInstance);
    }
    
    if (!window.indexedDB) {
      console.warn("IndexedDB could not be found in this browser.");
      return reject("IndexedDB not supported");
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => {
      console.error('Database error:', event.target.error);
      reject('Database error: ' + event.target.error);
    };

    request.onupgradeneeded = (event) => {
      const dbInstance = event.target.result;
      if (!dbInstance.objectStoreNames.contains(STORE_NAME)) {
        dbInstance.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
      }
    };

    request.onsuccess = (event) => {
      _dbInstance = event.target.result;
      resolve(_dbInstance);
    };
  });
}

function getDB() {
    if (!_dbInstance) {
        throw new Error('Database has not been initialized. Call initDB() first.');
    }
    return _dbInstance;
}

export function saveFiles(files) {
  return new Promise((resolve, reject) => {
    try {
        const db = getDB();
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        transaction.onerror = (event) => reject('Transaction error: ' + event.target.error);

        const clearRequest = store.clear();
        clearRequest.onerror = (event) => reject('Failed to clear old files: ' + event.target.error);
        
        clearRequest.onsuccess = () => {
            if (!files || files.length === 0) {
                return resolve();
            }

            let completedAdds = 0;
            files.forEach(file => {
                const addRequest = store.add({ file });
                addRequest.onsuccess = () => {
                    completedAdds++;
                    if (completedAdds === files.length) {
                        resolve();
                    }
                };
                addRequest.onerror = (event) => {
                    console.error('Could not add file to store', event.target.error);
                    reject('Failed to add a file: ' + event.target.error);
                };
            });
        };
    } catch (error) {
        reject(error);
    }
  });
}

export function getFiles() {
  return new Promise((resolve, reject) => {
    try {
        const db = getDB();
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.getAll();

        request.onerror = (event) => reject('Failed to retrieve files: ' + event.target.error);
        request.onsuccess = (event) => {
          const files = event.target.result.map(item => item.file);
          resolve(files);
        };
    } catch (error) {
        reject(error);
    }
  });
}
