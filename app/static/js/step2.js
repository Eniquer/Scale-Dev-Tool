let testItems = [{"id": 1, "text": "Sample Item 1", "subdimension": "Subdimension 1"}, 
    {"id": 2, "text": "Sample Item 2", "subdimension": "Subdimension 2"},
    {"id": 3, "text": "Sample Item 3", "subdimension": null}
];
// Items loaded from storage
let items = [];
let subdimensions = [];
let dimensionality = "";

// todo add Json input to add multiple Items

init()

// panel elements for manual item entry
const itemPanel = document.getElementById('itemPanel');
const addItemButton = document.getElementById('addItemButton');
const addItemText = document.getElementById('addItemText');
const addItemSubdimension = document.getElementById('addItemSubdimension');

function syncData() {
    // Clear existing rows
    const allItemRows = document.querySelectorAll('.item-row');
    allItemRows.forEach(row => row.remove());
    // Populate with current items
    items.forEach(item => {
        createItemRow(item.text, item.subdimension, item.id);
    });

}
// Initialize: fetch stored data and populate items table
async function init(){
    const step1Data = await window.dataStorage.getData('data_step_1');
    const step2Data = await window.dataStorage.getData('data_step_2') || {};
    dimensionality = step1Data.panel4?.dimensionality || "";
    subdimensions = step1Data.panel5?.subdimensions?.map(k => k.name) || [];
    items = step2Data.items || [];

    if (dimensionality != "Multidimensional") {
        // If not multidimensional, set subdimensions to empty array
        addItemSubdimension.style.display = 'none';
    } else {
        // add items input
        addItemSubdimension.innerHTML = 
        `<option value="" disabled selected>Select subdimension</option>
        ${
            subdimensions.map(name =>
                `<option value="${name}">${name}</option>`
            ).join('')
        }
        <option value="">No Subdimension</option>`;
    }

    renderSubdimensionPanels()
    syncData();

}

function renderSubdimensionPanels() {
    const container = document.getElementById('subdimensionsContainer');
    const title = dimensionality === "Multidimensional" ? "No Subdimension" : "Items";
    const subtitle = dimensionality === "Multidimensional" ? '<small class="text-muted">If not yet selected, items will be shown here.</small>' : "";
    container.innerHTML = ''; // Clear existing content
    subdimensions.forEach((subdim, index) => {
        const panel = document.createElement('div');
        panel.className = 'card mb-3';
        panel.id = `subdim-${index}`;
        panel.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">${subdim}</h5>
                <div class="item-panel" id="items-${index}">
                </div>
            </div>
        `;
        container.appendChild(panel);
    });
    const noSubPanel = document.createElement('div');
    noSubPanel.className = 'card mb-3';
    noSubPanel.id = `subdim--1`;
    noSubPanel.innerHTML = `
        <div class="card-body">
            <h5 class="card-title">${title}</h5>
            ${subtitle}
            <div class="item-panel" id="items--1">
            </div>
        </div>
    `;
    container.appendChild(noSubPanel);
    
}

function changeSubdimension(text = '', subdimension = '', id = null) {
    console.log(`Changing subdimension for item ID ${id} to "${subdimension}" with text "${text}"`);

    
    // const row = document.querySelector(`.item-row[data-id="${id}"]`) || document.createElement('div');
    // Update item in storage
    if (id !== null) {
        const itemIndex = items.findIndex(i => i.id === id);
        if (itemIndex !== -1) {

            items[itemIndex].subdimension = subdimension;
            if (text) {
                items[itemIndex].text = text;
            }
        } else {
            console.warn(`Item with ID ${id} not found in storage`);
        }
    } else {
        // If no ID, create a new item
        const nextId = items.length ? Math.max(...items.map(i => i.id)) + 1 : 1;
        items.push({ id: nextId, text: text, subdimension: subdimension });
    }
    window.dataStorage.storeData('data_step_2', { "items": items }, false).then(() => {
        console.log('Data saved successfully');
    });
    syncData(); 
}

// create a row for an item with text and subdimension inputs
function createItemRow(itemText = '', subdimension = '', id = null) {
    const subdimensionIndex = subdimensions.indexOf(subdimension);
    const subdimensionPanel = document.getElementById(`items-${subdimensionIndex}`);

    const row = document.createElement('div');
    row.className = 'input-group mb-2 item-row';
    row.dataset.id = id || null; // Store ID if provided
    // Build subdimension select options
    let optionsHtml = ''; // Reset if not multidimensional
    if (dimensionality === "Multidimensional") {
        let noSub = subdimensionIndex !== -1?
            `<option value="" onclick="changeSubdimension('', '', ${id})">No Subdimension</option>` : '';
        optionsHtml = `
        <select class="form-select item-subdimension" style="flex:0.2; cursor: pointer;">
        <option value="" disabled selected>Change subdimension</option>
        ${
            subdimensions.map(name => {
                if (name !== subdimension) {
                    return `<option value="${name}" onclick="changeSubdimension('', '${name}', ${id})">${name}</option>`;
                }
            }).join('')
        }
        ${ noSub }
        </select>
        ` 
    }

    row.innerHTML = `
        <input type="text" class="form-control item-text" placeholder="Item text" value="${itemText}">
        <button class="btn btn-outline-secondary save-item" type="button" style="display:none;"><i class="bi bi-floppy2"></i></button>
        ${optionsHtml}
        <button class="btn btn-outline-danger remove-item" type="button">&times;</button>
    `;
    // Remove row on click
    row.querySelector('.remove-item').addEventListener('click', () => {
        items = items.filter(i => i.id !== parseInt(row.dataset.id));
        window.dataStorage.storeData('data_step_2', { "items": items }, false).then(() => {
            console.log('Data saved successfully');
        });
        syncData();
    });
    const saveBtn = row.querySelector('.save-item');
    row.addEventListener('input', event => {
        saveBtn.style.display = 'block'; // Enable save button on input change
    });
    row.addEventListener('keypress', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            saveBtn.click();
        }
    });
    saveBtn.addEventListener('click', () => {
        const itemTextInput = row.querySelector('.item-text');
        const itemText = itemTextInput.value.trim();
        if (!itemText) {
            alert('Item text cannot be empty');
            return;
        }
        changeSubdimension(itemText, subdimension, id);
        saveBtn.style.display = 'none'; // Hide save button after saving
        itemTextInput.blur(); // Remove focus from input
    });
    // Append row to the appropriate subdimension panel
    subdimensionPanel.appendChild(row);
}

document.addEventListener('input', event => {
    const el = event.target;
    if (el.matches('.item-text')) {
        console.log(`Item text changed: ${el.value}`);
        
    }
});

// Handler for Add Item button (blank row)
if (addItemButton) {
    addItemButton.addEventListener('click', () => {
        const subdimension = addItemSubdimension.value || '';
        const itemText = addItemText.value.trim();
        if (!itemText) {
            alert('Item text cannot be empty');
            return;
        } 

        // Clear input after adding
        addItemText.value = "";
        // add item to storage
        const nextId = items.length
            ? Math.max(...items.map(item => item.id)) + 1
            : 1;
        const item = {
            id: nextId,
            text: itemText,
            subdimension: subdimension || null
        };
        items.push(item);
        window.dataStorage.storeData('data_step_2', { "items": items }, false).then(() => {
            console.log('Data saved successfully');
        });
        syncData()
    });
}

// if enter while in the addItemText input, add the item
addItemText.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        e.preventDefault();
        addItemButton.click();
    }
});