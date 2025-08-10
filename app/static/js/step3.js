let items = [];
let subdimensions = [];
let ratings = {};
let ratingTable;

init()

async function init(){
    const step1Data = await window.dataStorage.getData('data_step_1');
    const step2Data = await window.dataStorage.getData('data_step_2');
    const step3Data = await window.dataStorage.getData('data_step_3') || {};
    subdimensions = step1Data?.panel5?.subdimensions || [];
    items = step2Data.items || [];
    ratings = step3Data.ratings || {};

    renderRatingTable();


}

// Persist ratings without overwriting other step-3 fields
async function saveStep3Data() {
    const stored = await window.dataStorage.getData('data_step_3') || {};
    const merged = { ...stored, ratings };
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
            editor: 'select',
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
