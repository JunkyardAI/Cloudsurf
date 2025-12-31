// --- MODULE: DATABASE (IndexedDB Wrapper) ---

let dbInstance;
const DB_NAME = 'cloudstax_v2';
const DB_VERSION = 1;
const STORE_NAME = 'apps';

window.initDB = async function() {
    return new Promise((resolve, reject) => {
        if (dbInstance) {
            resolve(dbInstance);
            return;
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onupgradeneeded = (event) => {
            const db = event.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            }
        };

        request.onsuccess = (event) => {
            dbInstance = event.target.result;
            console.log("DB: Connected");
            resolve(dbInstance);
        };

        request.onerror = (event) => {
            console.error("DB: Connection Failed", event);
            reject(event);
        };
    });
};

window.dbOp = async function(op, val) {
    if (!dbInstance) await window.initDB();

    return new Promise((resolve, reject) => {
        const tx = dbInstance.transaction([STORE_NAME], 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        let req;

        try {
            switch (op) {
                case 'put': // Save App
                    req = store.put(val);
                    break;

                case 'get': // Get All (if val is null) or One (if val is ID)
                    if (val) req = store.get(val);
                    else req = store.getAll();
                    break;

                case 'delete': // Delete by ID
                    req = store.delete(val);
                    break;

                default:
                    reject(new Error(`Unknown DB operation: ${op}`));
                    return;
            }

            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
            
        } catch (e) {
            reject(e);
        }
    });
};

// Wrapper for editor compatibility
window.dbPut = async function(app) {
    return window.dbOp('put', app);
};
