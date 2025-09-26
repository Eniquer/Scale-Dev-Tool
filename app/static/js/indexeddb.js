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

        // Recursively sanitize strings in data using DOMPurify
        sanitizeData(input) {
            if (typeof input === 'string') {
                return window.DOMPurify ? DOMPurify.sanitize(input) : input;
            } else if (Array.isArray(input)) {
                return input.map(item => this.sanitizeData(item));
            } else if (input && typeof input === 'object') {
                const out = {};
                for (const k in input) {
                    if (Object.prototype.hasOwnProperty.call(input, k)) {
                        out[k] = this.sanitizeData(input[k]);
                    }
                }
                return out;
            }
            return input;
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
                    if (request.result === undefined) {
                        resolve(null); // no data
                        return;
                    }
                    // Sanitize raw stored string before parsing
                    let raw = request.result;
                    if (typeof raw === 'string' && window.DOMPurify) {
                        raw = DOMPurify.sanitize(raw);
                    }
                    let data;
                    if (typeof raw === 'string') {
                        try {
                            data = JSON.parse(raw);
                        } catch (e) {
                            console.log(`Data for key '${key}' is not JSON, returning sanitized string`);
                            data = raw;
                        }
                    } else {
                        data = raw;
                    }
                    // Recursively sanitize parsed data
                    data = this.sanitizeData(data);
                    resolve(data);
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

        async hasKeyEntryLax(key) {
            if (!this.db) {
                await this.init()
            }
            const entries = await this.getAllEntries()
            return entries
                .map(entry => entry.key)
                .some(name => name.startsWith(key))
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

        // Remove all keys from the object store
        async clearAll() {
            if (!this.db) {
                await this.init();
            }
            const entries = await this.getAllEntries();
            const keys = entries.map(e => e.key);
            await Promise.all(keys.map(k => this.deleteData(k).catch(err => {
                console.warn('Failed to delete key during clearAll:', k, err);
            })));
            console.log('IndexedDB: all data cleared');
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
    /**
     * Import a previously exported project JSON (supports cleaned view or raw bundle).
     * @param {object} exportedRoot - Root JSON
     * @param {string|null} newName - Optional override name
     * @param {boolean} activate - Set imported project active
     * @returns {Promise<object|null>} project with _importReport or null
     */
    async importFromExport(exportedRoot, newName = null, activate = true){
        try {
            if (!exportedRoot || typeof exportedRoot !== 'object') throw new Error('Invalid export structure');

            const report = { warnings: [], inferred: {}, createdIds: {}, counts: {} };
            // Normalize: detect raw (step1..step6) OR flattened/cleaned
            const normalized = { step1:null, step2:null, step3:null, step4:null, step5:null, step6:null };
            const hasStepKeys = Object.keys(exportedRoot).some(k=>/^step[1-6]$/.test(k));
            if (hasStepKeys) {
                // Raw bundle
                for (const k of Object.keys(normalized)) normalized[k] = exportedRoot[k] || null;
            } else {
                // Cleaned style (Step_1 etc.) OR merged root
                // Step 1 (look for constructName etc.)
                const step1Keys = ['constructName','savedDefinitions','property','entity','subdimensions','nomologicalNetwork','examples','notes'];
                if (step1Keys.some(k=>k in exportedRoot)) {
                    normalized.step1 = {
                        constructName: exportedRoot.constructName,
                        savedDefinitions: exportedRoot.savedDefinitions,
                        property: exportedRoot.property,
                        entity: exportedRoot.entity,
                        propertyExplanation: exportedRoot.propertyExplanation,
                        entityExplanation: exportedRoot.entityExplanation,
                        subdimensions: exportedRoot.subdimensions,
                        nomologicalNetwork: exportedRoot.nomologicalNetwork,
                        examples: exportedRoot.examples,
                        notes: exportedRoot.notes
                    };
                }
                if (Array.isArray(exportedRoot.items)) normalized.step2 = { items: exportedRoot.items };
                if (Array.isArray(exportedRoot.raters) || Array.isArray(exportedRoot.anovaResults)) {
                    normalized.step3 = {
                        raters: exportedRoot.raters || [],
                        anovaResults: exportedRoot.anovaResults || [],
                        extraColumnName: exportedRoot.extraColumnName || null,
                        extraColumnDescription: exportedRoot.extraColumnDescription || null,
                        aiRaterGroupDescription: exportedRoot.aiRaterGroupDescription || null
                    };
                }
                if (exportedRoot.itemCustomIds || exportedRoot.dimensionItemMapping || exportedRoot.indicators) {
                    normalized.step4 = {
                        itemCustomIds: exportedRoot.itemCustomIds || {},
                        dimensionItemMapping: exportedRoot.dimensionItemMapping || {},
                        indicators: exportedRoot.indicators || [],
                        lastAISuggestions: exportedRoot.lastAISuggestions || [],
                        updatedAt: exportedRoot.updatedAt || null
                    };
                }
                if (Array.isArray(exportedRoot.personas) || Array.isArray(exportedRoot.questionnaireItems)) {
                    normalized.step5 = {
                        personas: exportedRoot.personas || [],
                        questionnaireItems: exportedRoot.questionnaireItems || [],
                        extraItems: exportedRoot.extraItems || [],
                        likertAnswers: exportedRoot.likertAnswers || []
                    };
                }
                if (exportedRoot.reversedItems || exportedRoot.reverseColumns || exportedRoot.lastEFAResult || exportedRoot.lastCFAResult) {
                    normalized.step6 = {
                        reversedItems: exportedRoot.reversedItems || exportedRoot.reverseColumns || [],
                        lastEFAResult: exportedRoot.lastEFAResult || null,
                        lastCFAResult: exportedRoot.lastCFAResult || null,
                        lavaanEdited: exportedRoot.lavaanEdited || null,
                        lavaanOriginalSnapshot: exportedRoot.lavaanOriginalSnapshot || null,
                        scaleMin: exportedRoot.scaleMin,
                        scaleMax: exportedRoot.scaleMax
                    };
                }
            }
            const steps = normalized;

            const projects = await this.getProjects();
            const inferredName = newName || steps.step1?.constructName || steps.step1?.panel1?.constructName || exportedRoot.constructName || `Imported ${new Date().toLocaleString()}`;
            let candidate = (inferredName||'Imported Project').trim();
            let suffix = 2;
            while (projects.some(p=>p.name===candidate)) candidate = `${inferredName} (${suffix++})`;
            const newProj = await this.addProject(candidate, false);
            if (!newProj) throw new Error('Failed creating project entry');
            const prevActive = await this.getActiveProjectId();
            await this.setActiveProjectId(newProj.id);

            // -------- Step 1 --------
            if (steps.step1) {
                const s1 = steps.step1;
                const isRaw = !!(s1.panel1 && s1.panel5 && s1.panel5.subdimensions);
                if (isRaw) {
                    const cloned = JSON.parse(JSON.stringify(s1));
                    if (Array.isArray(cloned.panel5?.subdimensions)) {
                        cloned.panel5.subdimensions = cloned.panel5.subdimensions.map(sd=>{
                            if (!sd.id) { sd.id = crypto.randomUUID?.() || Math.random().toString(36).slice(2); report.createdIds[sd.name]=sd.id; }
                            return sd;
                        });
                    } else {
                        cloned.panel5 = { subdimensions: [] };
                        report.warnings.push('Raw step1 missing panel5.subdimensions');
                    }
                    await this.storage.storeData('data_step_1', cloned, false);
                } else {
                    const panel1 = { constructName: s1.constructName || null };
                    const panel2 = { savedDefinition: s1.savedDefinitions || [] };
                    const panel3 = { property: s1.property || null, entity: s1.entity || null, propertyExplanation: s1.propertyExplanation || null, entityExplanation: s1.entityExplanation || null };
                    let subs = Array.isArray(s1.subdimensions)? s1.subdimensions : (s1?.panel5?.subdimensions || []);
                    if (!subs || subs.length===0) report.warnings.push('No subdimensions in step1; may infer later.');
                    const panel5 = { subdimensions: (subs||[]).map(sd=>{ const id= sd.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2); report.createdIds[sd.name]=id; return { id, name: sd.name, definition: sd.definition }; }) };
                    const panel4Keys = ['nomologicalNetwork','examples','notes'];
                    const panel4 = {}; panel4Keys.forEach(k=>{ if (k in s1) panel4[k]=s1[k]; });
                    await this.storage.storeData('data_step_1', { panel1, panel2, panel3, panel4, panel5 }, false);
                }
            }

            const step1Stored = await this.storage.getData('data_step_1');
            const subNameToId = new Map((step1Stored?.panel5?.subdimensions||[]).map(sd=>[sd.name, sd.id]));
            // Infer from step2 if necessary
            if (subNameToId.size===0 && steps.step2?.items) {
                const unique = Array.from(new Set(steps.step2.items.map(it=>it.subdimension).filter(Boolean)));
                if (unique.length) {
                    report.warnings.push('Inferring subdimensions from Step 2 item.subdimension names');
                    const inferred = unique.map(n=>({ id: crypto.randomUUID?.() || Math.random().toString(36).slice(2), name: n, definition: '' }));
                    const upd = await this.storage.getData('data_step_1') || {};
                    upd.panel5 = { subdimensions: inferred };
                    await this.storage.storeData('data_step_1', upd, false);
                    subNameToId.clear(); inferred.forEach(sd=>subNameToId.set(sd.name, sd.id));
                }
            }

            // -------- Step 2 --------
            if (steps.step2) {
                const s2 = steps.step2;
                const items = Array.isArray(s2.items) ? s2.items.map(it=>{
                    let subId = it.subdimensionId || subNameToId.get(it.subdimension) || subNameToId.values().next().value || null;
                    return { id: it.id || crypto.randomUUID?.() || Math.random().toString(36).slice(2), text: it.text, subdimensionId: subId };
                }) : [];
                await this.storage.storeData('data_step_2', { items }, false);
                report.counts.items = items.length;
            }

            // -------- Step 3 --------
            if (steps.step3) {
                const s3 = steps.step3;
                const raters = Array.isArray(s3.raters)? s3.raters.map(r=>({ id: r.id || crypto.randomUUID?.(), name: r.name, ratings: r.ratings || {} })) : [];
                const step3Internal = { raters, activeRaterId: s3.activeRaterId || raters[0]?.id || null, anovaResults: s3.anovaResults || [], extraColumnName: s3.extraColumnName || null, extraColumnDescription: s3.extraColumnDescription || null, aiRaterGroupDescription: s3.aiRaterGroupDescription || null };
                await this.storage.storeData('data_step_3', step3Internal, false);
                report.counts.raters = raters.length;
            }

            // -------- Step 4 --------
            if (steps.step4) {
                const s4 = { ...steps.step4 };
                await this.storage.storeData('data_step_4', s4, false);
            }

            // -------- Step 5 --------
            if (steps.step5) {
                const s5 = steps.step5;
                const step5Internal = { personas: s5.personas || [], questionnaireItems: s5.questionnaireItems || [], extraItems: s5.extraItems || [], likertAnswers: s5.likertAnswers || [] };
                await this.storage.storeData('data_step_5', step5Internal, false);
            }

            // -------- Step 6 --------
            if (steps.step6) {
                const s6 = steps.step6;
                const step6Internal = { reverseColumns: s6.reversedItems || s6.reverseColumns || [], lavaanEdited: s6.lavaanEdited || null, lastEFAResult: s6.lastEFAResult || null, lastCFAResult: s6.lastCFAResult || null };
                await this.storage.storeData('data_step_6', step6Internal, false);
            }

            // Project flags (raw) -> store as data_flags
            if (exportedRoot.projectFlags) {
                try { await this.storage.storeData('data_flags', exportedRoot.projectFlags, false); report.inferred.projectFlags = true; }
                catch(e){ report.warnings.push('Failed storing projectFlags: '+e.message); }
            }

            if (activate) await this.setActiveProjectId(newProj.id); else await this.setActiveProjectId(prevActive);
            newProj._importReport = report;
            return newProj;
        } catch(err) {
            console.error('Import failed:', err);
            return null;
        }
    }

    /** Raw bundle convenience wrapper */
    async importRawBundle(bundle, projectName = null){
        return this.importFromExport(bundle, projectName, true);
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
                // Prefer setting to 0; if calling context needs different behavior it can adjust later
                try {
                    if (typeof this.storage.hasKeyEntryLax === 'function') {
                        if (await this.storage.hasKeyEntryLax('proj_')) {
                            console.log('Project data exists, setting first project as active');
                            return await this.storage.storeData('activeProject', 0, false);
                        }
                    }
                } catch (_) {
                    // ignore and fall through
                }
                return await this.storage.storeData('activeProject', 0, false);
            }
            const activeProjectId = await this.storage.getData('activeProject');

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
            const targetId = projectId ?? activeProjectId;
            const match = projects.find(p => p.id === targetId);
            if (match == null) {
                if (projectId != null) {
                    console.warn('Project not found, returning null');
                    return null;
                }
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
                try {
                    if (typeof this.storage.getAllEntries === 'function') {
                        const entries = await this.storage.getAllEntries();
                        const keysToDelete = entries
                            .map(entry => entry.key)
                            .filter(key => key.startsWith(`proj_${projectId}_`));
                        await Promise.all(keysToDelete.map(key => this.storage.deleteData(key)));
                    }
                } catch (e) {
                    console.warn('Skipping deletion of project-scoped keys due to storage limitations', e);
                }

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

    /**
     * Clone a project, duplicating all project-scoped keys (proj_{id}_*) to a new project id.
     * @param {number} sourceProjectId - Project id to clone from
     * @param {string|null} newName - Optional name for the cloned project
     * @param {boolean} setAsCurrent - Whether to set the new project as active
     * @returns {Promise<object|null>} The new project object or null on failure
     */
    async cloneProject(sourceProjectId, newName = null, setAsCurrent = true) {
        try {
            const projects = await this.getProjects();
            const source = projects.find(p => p.id === sourceProjectId);
            if (!source) {
                console.warn(`Source project ${sourceProjectId} not found`);
                return null;
            }

            // Determine new id
            const newProjectId = Math.max(...projects.map(p => p.id), -1) + 1;

            // Determine new unique name
            let baseName = newName ?? `Copy of ${source.name}`;
            let candidate = baseName;
            let suffix = 2;
            while (projects.some(p => p.name === candidate)) {
                candidate = `${baseName} (${suffix++})`;
            }

            const newProject = { id: newProjectId, name: candidate };
            // Persist new project list early so id is reserved
            await this.storage.storeData('projectData', [...projects, newProject], false);

            // Clone all project-scoped keys
            const entries = await this.storage.getAllEntries();
            const toClone = entries.filter(e => typeof e.key === 'string' && e.key.startsWith(`proj_${sourceProjectId}_`));
            await Promise.all(toClone.map(async ({ key, value }) => {
                const newKey = key.replace(`proj_${sourceProjectId}_`, `proj_${newProjectId}_`);
                // store without overwrite prompt
                await this.storage.storeData(newKey, value, false);
            }));

            if (setAsCurrent) {
                await this.setActiveProjectId(newProjectId);
            }
            return newProject;
        } catch (error) {
            console.error('Error cloning project:', error);
            return null;
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