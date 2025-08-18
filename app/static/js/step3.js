let items = [];
let subdimensions = [];
let ratings = {}; // current rater ratings
let ratingTable;
let raters = []; // [{id, name, ratings}]
let activeRaterId = null;

init()

async function init(){
    const step1Data = await window.dataStorage.getData('data_step_1');
    const step2Data = await window.dataStorage.getData('data_step_2');
    const step3Data = await window.dataStorage.getData('data_step_3') || {};
    subdimensions = step1Data?.panel5?.subdimensions || [];
    items = step2Data.items || [];
    raters = step3Data.raters || [];
    activeRaterId = step3Data.activeRaterId || (raters[0]?.id ?? null);
    ratings = (raters.find(r => r.id === activeRaterId)?.ratings) || {};

    wireRaterUI();
    renderRatingTable();


}

// Persist raters, activeRaterId, and ratings
async function saveStep3Data() {
    // update current rater's ratings in raters array
    const idx = raters.findIndex(r => r.id === activeRaterId);
    if (idx !== -1) raters[idx].ratings = ratings;
    const stored = await window.dataStorage.getData('data_step_3') || {};
    const merged = { ...stored, raters, activeRaterId };
    return window.dataStorage.storeData('data_step_3', merged, false);
}

function buildRows() {
    return items.map(it => {
        const row = { id: it.id, Item: it.text };
        subdimensions.forEach(sd => {
            const key = sd.name; // use subdimension name as column key
            row[key] = (ratings[it.id] && ratings[it.id][key] !== undefined) ? ratings[it.id][key] : null;
        });
        return row;
    });
}

function wireRaterUI() {
    const tabs = document.getElementById('raterTabs');
    const addBtn = document.getElementById('addRaterBtn');
    if (!tabs || !addBtn) return;
    // render tabs
    tabs.innerHTML = '';
    raters.forEach(r => {
        const li = document.createElement('li');
        li.className = 'nav-item me-1';

        // Tab button
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'nav-link' + (r.id === activeRaterId ? ' active' : '');
        a.textContent = r.name;
        a.onclick = async (e) => {
            // Persist current active rater's ratings before switching
            const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
            if (currentIdx !== -1) {
                raters[currentIdx].ratings = ratings;
            }

            // Switch active rater
            activeRaterId = r.id;
            ratings = r.ratings || {};

            await saveStep3Data();

            // update active class
            tabs.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
            a.classList.add('active');
            renderRatingTable();
        };
    li.appendChild(a);
        tabs.appendChild(li);
    });
    // add rater button
    addBtn.onclick = async () => {
        const name = await window.customPrompt({title: 'Rater name'});
        if (!name) return;
        const newRater = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, ratings: {} };
        raters.push(newRater);
        activeRaterId = newRater.id;
        ratings = newRater.ratings;
        await saveStep3Data();
        wireRaterUI();
        renderRatingTable();
    };
    // When no raters, ensure activeRaterId is null and table is non-interactive
    if (raters.length === 0) {
        activeRaterId = null;
        ratings = {};
        saveStep3Data();
        // No tabs to mark active; table render will disable editors
    }
}

// Bulk delete UI wiring
(function wireBulkDeleteControls() {
    const btn = document.getElementById('deleteRatersBtn');
    const modalEl = document.getElementById('bulkDeleteRatersModal');
    if (!btn || !modalEl) return;
    const list = document.getElementById('bulkDeleteRatersList');
    const selectAll = document.getElementById('bulkDeleteSelectAll');
    const confirmBtn = document.getElementById('confirmBulkDeleteRaters');
    const bsModal = new bootstrap.Modal(modalEl);

    const populateList = () => {
        list.innerHTML = '';
        raters.forEach(r => {
            const id = `delr_${r.id}`;
            const item = document.createElement('label');
            item.className = 'list-group-item d-flex align-items-center';
            item.innerHTML = `
              <input class="form-check-input me-2" type="checkbox" value="${r.id}" id="${id}">
              <span>${r.name}</span>
            `;
            list.appendChild(item);
        });
        selectAll.checked = false;
    };

    btn.onclick = () => {
        populateList();
        bsModal.show();
    };

    selectAll.onchange = () => {
        const boxes = list.querySelectorAll('input[type="checkbox"]');
        boxes.forEach(cb => cb.checked = selectAll.checked);
    };

    list.addEventListener('change', () => {
        const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
        selectAll.checked = boxes.length > 0 && boxes.every(cb => cb.checked);
    });

    confirmBtn.onclick = async () => {
        const selected = [...list.querySelectorAll('input[type="checkbox"]:checked')]
            .map(cb => cb.value);
        if (selected.length === 0) {
            window.displayInfo && window.displayInfo('warning', 'Select at least one rater to delete.');
            return;
        }

        const confirmed = await window.customConfirm({
            title: 'Delete Raters?',
            message: `Delete ${selected.length} selected rater(s)?`,
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

        // Persist current active rater's ratings before deletion
        const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
        if (currentIdx !== -1) {
            raters[currentIdx].ratings = ratings;
        }

        // Remove selected raters
        raters = raters.filter(r => !selected.includes(r.id));

        // Adjust active rater if it was deleted
        if (!raters.find(r => r.id === activeRaterId)) {
            activeRaterId = raters[0]?.id ?? null;
            ratings = activeRaterId ? (raters.find(r => r.id === activeRaterId)?.ratings || {}) : {};
        }

        await saveStep3Data();
        wireRaterUI();
        renderRatingTable();
        bsModal.hide();
        window.displayInfo && window.displayInfo('success', 'Selected raters deleted.');
    };
})();

// Import raters from JSON
(function wireImportRaters() {
    const importBtn = document.getElementById('importRatersBtn');
    const fileInput = document.getElementById('importRatersFile');
    if (!importBtn || !fileInput) return;

    importBtn.onclick = () => fileInput.click();

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            // Accept either { raters, activeRaterId } or a plain array of raters
            const incomingRaters = Array.isArray(json) ? json : (Array.isArray(json.raters) ? json.raters : []);
            if (!Array.isArray(incomingRaters) || incomingRaters.length === 0) {
                window.displayInfo && window.displayInfo('warning', 'No raters found in file.');
                fileInput.value = '';
                return;
            }

            // Normalize and validate
            const toId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
            const cleaned = incomingRaters.map(r => {
                const id = (typeof r.id === 'string' && r.id.trim()) ? r.id : toId();
                const name = (typeof r.name === 'string' && r.name.trim()) ? r.name.trim() : 'Rater';
                const rat = (r && typeof r.ratings === 'object' && r.ratings) ? r.ratings : {};
                return { id, name, ratings: rat };
            });

            // Merge: keep existing raters, add new ones; avoid id collisions by remapping duplicates
            const existingIds = new Set(raters.map(r => r.id));
            const merged = [...raters];
            for (const r of cleaned) {
                let newId = r.id;
                if (existingIds.has(newId)) {
                    newId = toId();
                }
                existingIds.add(newId);
                merged.push({ ...r, id: newId });
            }

            raters = merged;
            // Keep current active if still present; else set to first imported or null
            if (!raters.find(r => r.id === activeRaterId)) {
                activeRaterId = raters[0]?.id ?? null;
                ratings = activeRaterId ? (raters.find(r => r.id === activeRaterId)?.ratings || {}) : {};
            }

            await saveStep3Data();
            wireRaterUI();
            renderRatingTable();
            window.displayInfo && window.displayInfo('success', `Imported ${cleaned.length} rater(s).`);
        } catch (err) {
            console.error('Import raters failed', err);
            window.displayInfo && window.displayInfo('danger', 'Failed to import raters. Ensure it is valid JSON.');
        } finally {
            // reset input so same file can be re-imported if needed
            fileInput.value = '';
        }
    });
})();

// Export raters to JSON
(function wireExportRaters() {
    const btn = document.getElementById('exportRatersBtn');
    if (!btn) return;
    btn.onclick = async () => {
        try {
            // Ensure current state is saved
            const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
            if (currentIdx !== -1) {
                raters[currentIdx].ratings = ratings;
            }
            await saveStep3Data();

            // Load current items from storage to determine valid IDs
            const step2Data = await window.dataStorage.getData('data_step_2') || {};
            const currentItems = Array.isArray(step2Data.items) ? step2Data.items : [];
            const allowedIds = new Set(currentItems.map(it => String(it.id)));

            // Filter each rater's ratings to only include current item IDs
            const filteredRaters = raters.map(r => {
                const rr = r.ratings || {};
                const filtered = {};
                for (const [itemId, val] of Object.entries(rr)) {
                    if (allowedIds.has(String(itemId))) {
                        filtered[itemId] = val;
                    }
                }
                return { ...r, ratings: filtered };
            });

            const exportItems = currentItems.map(it => ({
                id: it.id,
                text: it.text,
                subdimension: it.subdimension ?? null,
            }));
            const payload = { items: exportItems, raters: filteredRaters, activeRaterId };
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `raters-export-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.displayInfo && window.displayInfo('success', 'Raters exported.');
        } catch (err) {
            console.error('Export raters failed', err);
            window.displayInfo && window.displayInfo('danger', 'Failed to export raters.');
        }
    };
})();

function renderRatingTable() {
    const container = document.getElementById('item-rating-table');
    if (!container) return;

    // Define columns: first frozen Item column, then one per subdimension
    const columns = [
        {
            title: 'Item', field: 'Item', headerSort: false, frozen: true,
            // Fix the left column width so other columns share remaining space
            widthGrow: 0, minWidth: 320,
            tooltip: true
        },
        ...subdimensions.map(sd => ({
            title: sd.name,
            field: sd.name,
            headerTooltip: sd.definition || sd.name,
            hozAlign: 'center', headerSort: false,
            editor: (activeRaterId ? 'select' : false),
            editorParams: { values: { '': '', 1: '1', 2: '2', 3: '3', 4: '4', 5: '5' } },
            validator: ["integer", "min:1", "max:5"],
            // Equal grow so all subdimension columns share remaining width
            widthGrow: 1
        }))
    ];

    const data = buildRows();

    if (ratingTable) {
        ratingTable.setColumns(columns);
        ratingTable.replaceData(data);
        return;
    }

    ratingTable = new Tabulator('#item-rating-table', {
        data,
        columns,
        index: 'id',
        // Make columns fill the table width; subdimension cols share remaining width
        layout: 'fitColumns',
        reactiveData: true,
        resizableColumns: true,
        movableColumns: true,
        placeholder: 'No items available',
        rowHeight: 40,
        // Modern dark appearance is handled by midnight theme from base.html
    });

    ratingTable.on('cellEdited', async (cell) => {
        if (!activeRaterId) return; // no raters -> ignore edits
        const field = cell.getField();
        if (field === 'Item') return; // do not edit item text here
        const row = cell.getRow().getData();
        const value = cell.getValue();
        if (!ratings[row.id]) ratings[row.id] = {};
        // Normalize empty selection to null (allow clearing)
        ratings[row.id][field] = (value === '' || value === undefined) ? null : Number(value);
        try {
            await saveStep3Data();
        } catch (e) {
            console.error('Failed to save ratings', e);
            window.displayInfo && window.displayInfo('danger', 'Failed to save rating');
        }
    });
}
