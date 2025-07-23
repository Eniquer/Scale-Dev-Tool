// IndexedDB functionality for generic data storage
if (!window.DataStorage) {
    class DataStorage {
        constructor() {
            this.dbName = 'data-store';
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
            // Use the generic storeData function
            try {
                await this.storeData(key, csvContent, showWarning);
                return JSON.parse(csvContent);
            } catch (error) {
                if (error === 'User cancelled overwrite') {
                    console.log('User cancelled CSV storage - existing data preserved');
                    return Promise.reject('User cancelled overwrite');
                }
                throw error;
            }
        }

        async getCSV(key = 'uploadedCSV') {
            try {
                const csvData = await this.getData(key);
                if (csvData === null) {
                    throw new Error('No CSV found in storage');
                }
                return csvData; 
            } catch (error) {
                if (error.message === 'No CSV found in storage') {
                    throw error;
                }
                console.error('Error retrieving CSV from IndexedDB');
                throw error;
            }
        }

        async hasCSV(key = 'uploadedCSV') {
            return this.hasData(key);
        }

        async deleteCSV(key = 'uploadedCSV') {
            try {
                await this.deleteData(key);
                console.log(`CSV data with key '${key}' deleted from IndexedDB`);
            } catch (error) {
                console.error('Error deleting CSV from IndexedDB');
                throw error;
            }
        }

        // Generic functions for storing and retrieving any data
        async storeData(key, data, showWarning = true, customMessage = null) {
            if (!this.db) {
                await this.init();
            }
            
            // Check if data already exists
            if (showWarning) {
                try {
                    const existingData = await this.getData(key);
                    if (existingData !== null) {
                        let message = `This will overwrite existing data for key '${key}'.<br/>
                        Do you want to continue and replace the current data?`
                        if (customMessage) {
                            message = customMessage;
                        }
                        const userConfirmed = await customConfirm({
                            title: '⚠️ Overwrite Definition?',
                            message: message,
                            confirmText: 'Yes, overwrite',
                            cancelText: 'No, keep it'
                        });
                        if (!userConfirmed) {
                            console.log(`User cancelled data storage for key '${key}' - existing data preserved`);
                            return Promise.reject('User cancelled overwrite');
                        }

                        
                    }
                } catch (error) {
                    // No existing data found, continue normally
                    console.log(`No existing data found for key '${key}', proceeding with storage`);
                }
            }
            
            // Convert data to string if it's not already
            let dataToStore;
            if (typeof data === 'string') {
                dataToStore = data;
            } else {
                dataToStore = JSON.stringify(data);
            }
            
            console.log(`Storing data for key '${key}':`, typeof data, dataToStore.length, 'characters');
            
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.put(dataToStore, key);
                
                request.onsuccess = () => {
                    console.log(`Data saved to IndexedDB with key '${key}'`);
                    resolve(data); // Return original data
                };
                
                request.onerror = () => {
                    console.error(`Error saving data to IndexedDB with key '${key}'`);
                    reject(request.error);
                };
            });
        }

        async getData(key) {
            if (!this.db) {
                await this.init();
            }
            
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    if (request.result !== undefined) {
                        let data = request.result;
                        
                        // Try to parse as JSON, if it fails return as string
                        if (typeof data === 'string') {
                            try {
                                data = JSON.parse(data);
                            } catch (e) {
                                // Not JSON, return as string
                                console.log(`Data for key '${key}' is not JSON, returning as string`);
                            }
                        }
                        
                        resolve(data);
                    } else {
                        resolve(null); // Return null instead of rejecting for consistency
                    }
                };
                
                request.onerror = () => {
                    console.error(`Error retrieving data from IndexedDB with key '${key}'`);
                    reject(request.error);
                };
            });
        }

        async hasData(key) {
            if (!this.db) {
                await this.init();
            }
            
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    resolve(request.result !== undefined);
                };
                
                request.onerror = () => {
                    resolve(false);
                };
            });
        }

        async deleteData(key) {
            if (!this.db) {
                await this.init();
            }
            
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readwrite');
                const store = tx.objectStore(this.storeName);
                const request = store.delete(key);
                
                request.onsuccess = () => {
                    console.log(`Data with key '${key}' deleted from IndexedDB`);
                    resolve();
                };
                
                request.onerror = () => {
                    console.error(`Error deleting data from IndexedDB with key '${key}'`);
                    reject(request.error);
                };
            });
        }
    }

    
    // Global instance
    if (!window.dataStorage) {
        window.dataStorage = new DataStorage();
    }
}
