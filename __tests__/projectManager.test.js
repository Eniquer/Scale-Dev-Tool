const { ProjectManager } = require('../app/static/js/indexeddb.js');


// Mock Storage class for testing
class MockStorage {
    constructor(initial = {}) {
        this.data = { ...initial };
    }
    async getData(key) {
        // Simulate IndexedDB returning null if no entry
        if (!this.data.hasOwnProperty(key)) {
            return null;
        }
        // Return deep clone to prevent reference mutation
        return JSON.parse(JSON.stringify(this.data[key]));
    }
    async storeData(key, value, _overwrite = false) {
        // Simulate stringified storage and JSON.parse on retrieval
        this.data[key] = JSON.parse(JSON.stringify(value));
        return JSON.parse(JSON.stringify(value));
    }
    async hasData(key) {
        return this.data.hasOwnProperty(key) && this.data[key] != null;
    }
    async deleteData(key) {
        if (!this.data.hasOwnProperty(key)) {
            // IndexedDB delete does nothing but resolves
            return;
        }
        delete this.data[key];
    }
}

// Helper to reset storage for each test
function createManagerWithData(data = {}) {
    const storage = new MockStorage(data);
    const pm = new ProjectManager(storage);
    return { pm, storage };
}

// Jest-style describe/test blocks
describe('ProjectManager', () => {

    test('Initializes with default project if none exists', async () => {
        const { pm, storage } = createManagerWithData();
        const projects = await pm.getProjects();
        expect(Array.isArray(projects)).toBe(true);
        expect(projects.length).toBe(1);
        expect(projects[0].name).toBe('First Project');
    });

    test('Does not overwrite existing projects on init', async () => {
        const initialProjects = [
            { id: 42, name: "My Project" }
        ];
        const { pm, storage } = createManagerWithData({ projectData: initialProjects });
        const projects = await pm.getProjects();
        expect(projects).toEqual(initialProjects);
    });

    // Verify default projectData is persisted in storage
    test('getProjects persists default project to storage', async () => {
        const { pm, storage } = createManagerWithData();
        const projects = await pm.getProjects();
        expect(storage.data).toHaveProperty('projectData');
        expect(Array.isArray(storage.data.projectData)).toBe(true);
        expect(storage.data.projectData[0]).toMatchObject({ id: 0, name: 'First Project' });
    });

    test('Returns and initializes active project id', async () => {
        const { pm, storage } = createManagerWithData();
        const activeId = await pm.getActiveProjectId();
        expect(activeId).toBe(0);
        // Should remain stable on second call
        const again = await pm.getActiveProjectId();
        expect(again).toBe(0);
    });

    // Verify default activeProject is persisted in storage
    test('getActiveProjectId persists default activeProject key', async () => {
        const { pm, storage } = createManagerWithData();
        const activeId = await pm.getActiveProjectId();
        expect(activeId).toBe(0);
        expect(storage.data).toHaveProperty('activeProject', 0);
    });

    test('Sets and gets active project id', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.addProject("Test Project");
        await pm.setActiveProjectId(1);
        const activeId = await pm.getActiveProjectId();
        expect(activeId).toBe(1);
    });

    test('setActiveProjectId returns -1 for invalid project', async () => {
        const { pm, storage } = createManagerWithData();
        const result = await pm.setActiveProjectId(999);
        expect(result).toBe(-1);
    });

    // Edge cases for getActiveProjectId fallback
    test('getActiveProjectId resets to default when stored id is undefined', async () => {
        const initialData = { projectData: [{ id: 10, name: 'X' }], activeProject: undefined };
        const { pm, storage } = createManagerWithData(initialData);
        const result = await pm.getActiveProjectId();
        expect(result).toBe(0);
        expect(storage.data.activeProject).toBe(0);
    });

    test('getActiveProjectId resets to default when stored id is -1', async () => {
        const initialData = { projectData: [{ id: 20, name: 'Y' }], activeProject: -1 };
        const { pm, storage } = createManagerWithData(initialData);
        const result = await pm.getActiveProjectId();
        expect(result).toBe(0);
        expect(storage.data.activeProject).toBe(0);
    });

    test('addProject creates new project and sets as active', async () => {
        const { pm, storage } = createManagerWithData();
        const newProject = await pm.addProject("Alpha");
        expect(newProject.name).toBe("Alpha");
        const projects = await pm.getProjects();
        expect(projects.length).toBe(2);
        
        expect(await pm.getActiveProjectId()).toBe(newProject.id);
    });

    test('addProject rejects duplicate names', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.addProject("DupTest");
        const result = await pm.addProject("DupTest");
        expect(result).toBeNull();
        const projects = await pm.getProjects();
        expect(projects.filter(p => p.name === "DupTest").length).toBe(1);
    });

    test('addProject can skip setAsCurrent', async () => {
        const { pm, storage } = createManagerWithData();
        const newProject = await pm.addProject("Beta", false);
        expect(await pm.getActiveProjectId()).toBe(0);
        expect((await pm.getProjects()).find(p => p.name === "Beta")).toBeDefined();
    });

    test('getProject returns by id and by current', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.addProject("Gamma");
        const byCurrent = await pm.getProject();
        expect(byCurrent.name).toBe("Gamma");
        const byId = await pm.getProject(0);
        expect(byId.name).toBe("First Project");
    });

    test('getProject returns null if not found', async () => {
        const { pm, storage } = createManagerWithData();
        const result = await pm.getProject(999);
        expect(result).toBeNull();
    });

    test('changeProjectName updates project name', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.addProject("Delta");
        const delta = (await pm.getProjects()).find(p => p.name === "Delta");
        await pm.changeProjectName("DeltaPrime", delta.id);
        const updated = (await pm.getProjects()).find(p => p.id === delta.id);
        expect(updated.name).toBe("DeltaPrime");
    });

    test('changeProjectName does nothing for missing project', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.changeProjectName("Nonexistent", 999); // Should not throw
        const projects = await pm.getProjects();
        expect(projects[0].name).not.toBe("Nonexistent");
    });



    test('deleteProject removes project and resets active if needed', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.addProject("Epsilon");
        await pm.setActiveProjectId(1);
        await pm.deleteProject(1);
        const projects = await pm.getProjects();
        expect(projects.find(p => p.id === 1)).toBeUndefined();
        expect(await pm.getActiveProjectId()).toBe(0);
    });

    test('deleteProject does nothing for missing id', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.deleteProject(1234); // Should not throw
        expect((await pm.getProjects()).length).toBe(1);
    });

    test('Can add, rename, set active, and delete projects in sequence', async () => {
        const { pm, storage } = createManagerWithData();
        await pm.addProject("Zeta");
        await pm.addProject("Eta");
        await pm.setActiveProjectId(2);
        await pm.changeProjectName("EtaPrime", 2);
        let projects = await pm.getProjects();
        expect(projects.find(p => p.name === "EtaPrime")).toBeDefined();
        await pm.deleteProject(2);
        projects = await pm.getProjects();
        expect(projects.find(p => p.name === "EtaPrime")).toBeUndefined();
        expect(await pm.getActiveProjectId()).toBe(0);
    });

    test('Handles storage errors gracefully', async () => {
        const brokenStorage = {
            async getData() { throw new Error("fail"); },
            async storeData() { throw new Error("fail"); },
            async hasData() { throw new Error("fail"); }
        };
        const pm = new ProjectManager(brokenStorage);
        await expect(pm.getProjects()).resolves.toBeUndefined();
        await expect(pm.getActiveProjectId()).resolves.toBeUndefined();
        await expect(pm.setActiveProjectId(0)).resolves.toBeNull();
        await expect(pm.addProject("ErrorProject")).resolves.toBeUndefined();
        await expect(pm.changeProjectName("fail")).resolves.toBeUndefined();
        await expect(pm.deleteProject(0)).resolves.toBeUndefined();
    });
    
});
