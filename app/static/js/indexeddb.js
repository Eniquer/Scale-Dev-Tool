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

        async storeCSV(csvContent, key = 'uploadedCSV', showWarning = true) {
            if (!this.db) {
                await this.init();
            }
            
            // Check if data already exists
            if (showWarning) {
                try {
                    const existingData = await this.getCSV(key);
                    if (existingData) {
                        const userConfirmed = confirm(
                            '⚠️ Warning: This will overwrite existing CSV data in storage.\n\n' +
                            'Do you want to continue and replace the current data?'
                        );
                        
                        if (!userConfirmed) {
                            console.log('User cancelled CSV storage - existing data preserved');
                            return Promise.reject('User cancelled overwrite');
                        }
                    }
                } catch (error) {
                    // No existing data found, continue normally
                    console.log('No existing data found, proceeding with storage');
                }
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
                    resolve(JSON.parse(csvContent));
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
                        let csvData = request.result;
                        if (typeof csvData !== 'string') {
                            csvData = String(csvData);
                        }
                        
                        resolve(JSON.parse(csvData));
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

        async hasCSV(key = 'uploadedCSV') {
            if (!this.db) {
                await this.init();
            }
            
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    resolve(!!request.result); // Convert to boolean
                };
                
                request.onerror = () => {
                    resolve(false);
                };
            });
        }

        async deleteCSV(key = 'uploadedCSV') {
            if (!this.db) {
                await this.init();
            }
            
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.delete(key);
                
                request.onsuccess = () => {
                    console.log(`CSV data with key '${key}' deleted from IndexedDB`);
                    resolve();
                };
                
                request.onerror = () => {
                    console.error('Error deleting CSV from IndexedDB');
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
