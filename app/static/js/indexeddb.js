// IndexedDB functionality for generic data storage
if (typeof window !== 'undefined' && !window.DataStorage) {
    class DataStorage {
        constructor() {
            this.dbName = 'data-store';
            this.version = 1;
            this.storeName = 'files';
            this.db = null;
            // Initialize DB and ensure default projects
            this.init()
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
            return await this.hasData(key);
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
            key = await this.getSpecificKey(key);
            
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
            key = await this.getSpecificKey(key);
            
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
            key = await this.getSpecificKey(key);
            
            return new Promise((resolve) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const request = store.get(key);
                
                request.onsuccess = () => {
                    resolve(request.result != null);
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
            key = await this.getSpecificKey(key);

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

        async getSpecificKey(key) {
            if (key.startsWith('data_')) {
                // fetch the current project ID
                const projectId = await window.projects.getActiveProjectId();
                // append it to the key
                return `proj_${projectId}_${key}`;
            }
            return key;
        }



        async getAllEntries() {
            if (!this.db) {
                await this.init();
            }
            return new Promise((resolve, reject) => {
                const tx = this.db.transaction(this.storeName, 'readonly');
                const store = tx.objectStore(this.storeName);
                const entries = [];
                const request = store.openCursor();

                request.onsuccess = event => {
                    const cursor = event.target.result;
                    if (cursor) {
                        let value = cursor.value;
                        if (typeof value === 'string') {
                            try {
                                value = JSON.parse(value);
                            } catch (_) {
                                // leave as string
                            }
                        }
                        entries.push({ key: cursor.key, value });
                        cursor.continue();
                    } else {
                        resolve(entries);
                    }
                };

                request.onerror = () => {
                    reject(request.error);
                };
            });
        }
    }

    // Global instance
    if (typeof window !== 'undefined' && !window.dataStorage) {
        window.dataStorage = new DataStorage();
    }
}


// Project Management Module
// Storage format: { active: number, projectData: { [id: number]: { id: number, name: string } } }

class ProjectManager {
  constructor(storage) {
    this.storage = storage; // expects async getData(key) and storeData(key, value)
    this.getProjects().then(() => {
      console.log('Projects initialized successfully');
      this.getActiveProjectId();
    });
  }

    async getProjects() {
            try {
                const projects = await this.storage.getData('projectData');
                if (!projects || projects.length === 0) {
                    console.log('No projects found, initializing with default project');
                    let savedConstructName = await this.storage.getData('data_step_1')

                    let projectName = savedConstructName?.panel1?.constructName || 'First Project';
                    return await this.storage.storeData('projectData', [{ "id": 0, "name": projectName }], false);
                }
                return projects; // Return existing projects

            } catch (error) {
                console.error('Error initializing ProjectManager:', error);
            }
    }

    async getActiveProjectId() {
        try {
            // Check if activeProject exists, if not initialize it
            if (!await this.storage.hasData('activeProject')) {
                    console.log('No active project found, initializing with default project');
                    const projects = await this.getProjects()
                    if (projects.length > 0) {
                        console.log('Project data exists, setting first project as active');
                        return await this.storage.storeData('activeProject', 0, false);
                    } else {
                        return await this.storage.storeData('activeProject', -1, false);
                    }
                }
            const activeProjectId = await this.storage.getData('activeProject');
            console.log(`Active project ID retrieved: ${activeProjectId}`);


            // If no active project ID is found, initialize with default project
            if (activeProjectId === undefined || activeProjectId === -1) {
                console.log('No active project found, initializing with default project');
                return await this.storage.storeData('activeProject', 0, false);
            }
            return activeProjectId; // Return existing active project ID
        } catch (error) {
            console.error('Error initializing active project:', error);
        }

    }

    async setActiveProjectId(projectId) {
        try {   
            const projects = await this.getProjects();
            
            if (projects.some(p => p.id === projectId)) {
                console.log(`Active project set to ${projectId}`);
                
                return await this.storage.storeData('activeProject', projectId, false);
                
            } else {
                console.warn(`Project with ID ${projectId} does not exist`);
                return await this.storage.storeData('activeProject', -1, false);
            }
        } catch (error) {
            console.error('Error setting active project ID:', error);
            return null; // Return null on error
        }
    }

    async getProject(projectId = null) {
        try {
            const projects = await this.getProjects();
            const activeProjectId = await this.getActiveProjectId();
            // Find the first project matching the active ID
            const match = projects.find(p => p.id === (projectId ?? activeProjectId));
            if (match == null) {
                console.warn('Project not found, returning null');
                if (projects.length > 0) {
                    console.log('No matching project found; returning first project as fallback');
                    await this.setActiveProjectId(projects[0].id); // Set first project as active
                    console.log(`Active project reset to first project with ID ${projects[0].id}`);
                    return projects[0];
                }
                return null;
            }
            return match;
        } catch (error) {
            console.error('Error retrieving current project:', error);
            return null; // Return null on error
        }
    }

    async addProject(projectName = null, setAsCurrent = true) {
        try {
            const projects = await this.getProjects();
            const newProjectId = Math.max(...projects.map(p => p.id), -1) + 1; // Find the next available ID
            // Check if project with the same name already exists
            if (projects.some(p => p.name === projectName)) {
                console.warn(`Project with name '${projectName}' already exists`);
                return null; // Return null if project with the same name exists
            }
            // Create new project object
            const newProject = { "id": newProjectId, "name": projectName ?? `Project ${newProjectId}` };
            projects.push(newProject);
            await this.storage.storeData('projectData', projects, false);
            
            if (setAsCurrent) {
                await this.setActiveProjectId(newProjectId);
                console.log(`Project '${projectName}' set as current project`);
            }
            return newProject;
        } catch (error) {
            console.error('Error adding new project:', error);
        }
    }

    async changeProjectName(newName, projectId = null) {
        try {
            const projects = await this.getProjects();
            const activeProjectId = await this.getActiveProjectId();
            const project = projects.find(p => p.id === (projectId ?? activeProjectId));
            if (project) {
                project.name = newName;
                await this.storage.storeData('projectData', projects, false);
                console.log(`Project ID ${project.id} renamed to '${newName}'`);
            } else {
                // console.warn(`Project with ID ${projectIdd} does not exist`);
                console.warn(`Project with ID ${projectId ?? activeProjectId} does not exist`);
            }
        } catch (error) {
            console.error('Error changing project name:', error);
        }
    }

    async deleteProject(projectId) {
        try {
            const projects = await this.getProjects();
            const projectIndex = projects.findIndex(p => p.id === projectId);
            if (projectIndex !== -1) {
                projects.splice(projectIndex, 1); // Remove the project
                const entries = await this.storage.getAllEntries();

                const keysToDelete = entries
                    .map(entry => entry.key)
                    .filter(key => key.startsWith(`proj_${projectId}_`));
                
                await Promise.all(keysToDelete.map(key => this.storage.deleteData(key)));

                // If the deleted project was the active one, reset to default
                if (await this.getActiveProjectId() === projectId) {
                    if (projects.length > 0) {
                        await this.setActiveProjectId(projects[0].id); // Set first project as active
                    }else{
                        await this.setActiveProjectId(0); // Reset to first project or -1
                    }
                }
                await this.storage.storeData('projectData', projects, false);
                console.log(`Project with ID ${projectId} deleted`);
            } else {
                console.warn(`Project with ID ${projectId} does not exist`);
            }
        } catch (error) {
            console.error('Error deleting project:', error);
        }
    }


}

// Global instance
if (typeof window !== 'undefined' && !window.projects) {
    window.projects = new ProjectManager(window.dataStorage);
}

// Export for testing
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ProjectManager };
}