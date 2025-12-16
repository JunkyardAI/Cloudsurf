// --- MODULE: DB ---
    async function initDB(){return new Promise((r,j)=>{const q=indexedDB.open(DB_N,DB_V);q.onupgradeneeded=e=>{const d=e.target.result;if(!d.objectStoreNames.contains(ST)){d.createObjectStore(ST,{keyPath:'id'});}};q.onsuccess=e=>{db=e.target.result;r(db);};q.onerror=j;});}
    async function dbOp(op,val){
        if(!db) await initDB(); 
        return new Promise((r,j)=>{const tx=db.transaction([ST],'readwrite'),s=tx.objectStore(ST),q=op==='get'?s.getAll():op==='put'?s.put(val):s.delete(val);q.onsuccess=e=>r(e.target.result);q.onerror=j;});
    }

    