// IndexedDB functionality for CSV storage
if (!window.CSVStorage) {
    class CSVStorage {
        constructor() {
            this.dbName = 'csv-store';
            this.version = 1;
            this.storeName = 'files';
            this.db = null;
            this.init();
        }

        async init() {
            return new Promise((resolve, reject) => {
                const dbRequest = indexedDB.open(this.dbName, this.version);
                
                dbRequest.onupgradeneeded = (event) => {
                    const db = event.target.result;
                    if (!db.objectStoreNames.contains(this.storeName)) {
                        db.createObjectStore(this.storeName);
                        console.log('IndexedDB object store created');
                    }
                };
                
                dbRequest.onsuccess = (event) => {
                    this.db = event.target.result;
                    console.log('IndexedDB initialized successfully');
                    resolve(this.db);
                };
                
                dbRequest.onerror = (event) => {
                    console.error('IndexedDB error:', event.target.error);
                    reject(event.target.error);
                };
            });
        }

        async storeCSV(csvContent, key = 'uploadedCSV') {
            if (!this.db) {
                await this.init();
            }
            
            // Ensure csvContent is a string
            if (typeof csvContent !== 'string') {
                console.warn('CSV content is not a string, converting...', typeof csvContent);
                csvContent = String(csvContent);
            }
            
            console.log('Storing CSV:', typeof csvContent, csvContent.length, 'characters');
            
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.put(csvContent, key);
                
                request.onsuccess = () => {
                    console.log('CSV saved to IndexedDB');
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('Error saving CSV to IndexedDB');
                    reject(request.error);
                };
            });
        }

        async getCSV(key = 'uploadedCSV') {
            if (!this.db) {
                await this.init();
            }
            
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    if (request.result) {
                        console.log('CSV retrieved from IndexedDB:', typeof request.result, request.result.length, 'characters');
                        
                        // Ensure result is a string
                        let csvData = request.result;
                        if (typeof csvData !== 'string') {
                            console.warn('Retrieved CSV is not a string, converting...', typeof csvData);
                            csvData = String(csvData);
                        }
                        
                        resolve(csvData);
                    } else {
                        reject('No CSV found in storage');
                    }
                };
                
                request.onerror = () => {
                    console.error('Error retrieving CSV from IndexedDB');
                    reject(request.error);
                };
            });
        }
    }

    window.CSVStorage = CSVStorage;
    
    // Global instance
    if (!window.csvStorage) {
        window.csvStorage = new CSVStorage();
    }
}
