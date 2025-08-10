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
