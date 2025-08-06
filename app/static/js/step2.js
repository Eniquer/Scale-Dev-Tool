// =====================
// Step 2: Item Management
// =====================

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

/**
 * syncData: rebuilds all item rows based on current `items` array
 * Clears old rows and calls createItemRow for each stored item.
 */
function syncData() {
    // Remove all existing item rows and re-render from data array
    // Clear existing rows
    const allItemRows = document.querySelectorAll('.item-row');
    allItemRows.forEach(row => row.remove());
    // Populate with current items
    items.forEach(item => {
        createItemRow(item.text, item.subdimension, item.id);
    });

}

/**
 * init: loads saved state from IndexedDB, configures UI elements,
 * sets up subdimension panels, and populates items.
 */
async function init(){
    const step1Data = await window.dataStorage.getData('data_step_1');
    const step2Data = await window.dataStorage.getData('data_step_2') || {};
    dimensionality = step1Data?.panel4?.dimensionality || "";
    // Load full subdimension objects (with name, definition, attributes)
    subdimensions = step1Data?.panel5?.subdimensions || [];
    items = step2Data?.items || [];

    if (dimensionality != "Multidimensional") {
        // Hide subdimension selector when not multidimensional
        addItemSubdimension.style.display = 'none';
    } else {
        // add items input
        addItemSubdimension.innerHTML = 
        `<option value="" disabled selected>Select subdimension</option>
        ${
            subdimensions.map(sd =>
                `<option value="${sd.name}">${sd.name}</option>`
            ).join('')
        }
        <option value="">No Subdimension</option>`;
    }

    // Build dynamic panels for each subdimension
    renderSubdimensionPanels()
    // Populate items in their panels
    syncData();

}

/**
 * renderSubdimensionPanels: creates a card per subdimension including
 * its name, definition, and attribute summary, plus a default panel
 * for items without subdimensions.
 */
function renderSubdimensionPanels() {
    // Clear and rebuild the subdimension cards, including attributes
    const container = document.getElementById('subdimensionsContainer');
    const title = dimensionality === "Multidimensional" ? "No Subdimension" : "Items";
    const subtitle = dimensionality === "Multidimensional" ? '<small class="text-muted">If not yet selected, items will be shown here.</small>' : "";
    container.innerHTML = ''; // Clear existing content
    subdimensions.forEach((sd, index) => {
        const panel = document.createElement('div');
        panel.className = 'card mb-3';
        panel.id = `subdim-${index}`;
        const attributes = sd.attributes.length?`<p class="small text-muted">Attributes: ${sd.attributes.join(', ')}</p>`:'';
        panel.innerHTML = `
            <div class="card-body">
                <h5 class="card-title">${sd.name}</h5>
                <p class="small text-muted">${sd.definition}</p>
                ${attributes}
                <div class="item-panel" id="items-${index}"></div>
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
    // Panels updated
}

 /**
 * changeSubdimension: update an item's text and/or move it to a new subdimension
 * Persists changes to storage and refreshes the UI.
 * @param {string} text - New text for the item (if provided)
 * @param {string} subdimension - Target subdimension name or empty for none
 * @param {number|null} id - Unique item identifier, or null for new item
 */
 function changeSubdimension(text = '', subdimension = '', id = null) {
     // Log the intended change for debugging
     console.log(`Changing subdimension for item ID ${id} to "${subdimension}" with text "${text}"`);

     // If item exists (id provided), update existing entry
     if (id !== null) {
         const itemIndex = items.findIndex(i => i.id === id);
         if (itemIndex !== -1) {
             // Assign new subdimension and update text if non-empty
             items[itemIndex].subdimension = subdimension;
             if (text) {
                 items[itemIndex].text = text;
             }
         } else {
             console.warn(`Item with ID ${id} not found in storage`);
         }
     } else {
         // No ID => create a new item with fresh ID
         const nextId = items.length ? Math.max(...items.map(i => i.id)) + 1 : 1;
         items.push({ id: nextId, text: text, subdimension: subdimension });
     }
     // Persist updated list to IndexedDB
     window.dataStorage.storeData('data_step_2', { items }, false).then(() => {
         console.log('Data saved successfully');
     });
     // Refresh UI to reflect changes
     syncData(); 
 }

/**
 * createItemRow: build and insert a DOM element representing a single item
 * Includes input for text, save/remove buttons, and a dropdown to change subdimension.
 * @param {string} itemText - Display text of the item
 * @param {string} subdimension - Current subdimension of the item
 * @param {number|null} id - Unique identifier of the item
 */
 function createItemRow(itemText = '', subdimension = '', id = null) {
     // Determine which panel to append this row into
     const subdimensionIndex = subdimensions.findIndex(sd => sd.name === subdimension);
     const subdimensionPanel = document.getElementById(`items-${subdimensionIndex}`);

     // Container for the row and its controls
     const row = document.createElement('div');
     row.className = 'input-group mb-2 item-row';
     row.dataset.id = id || null;

     // Build <select> options for changing subdimension if applicable
     let optionsHtml = '';
     if (dimensionality === 'Multidimensional') {
         // List all other subdimensions as options
         const opts = subdimensions
             .filter(sd => sd.name !== subdimension)
             .map(sd => `<option value="${sd.name}" onclick="changeSubdimension('', '${sd.name}', ${id})">${sd.name}</option>`)
             .join('');
         // Option to clear subdimension
         const noSubOpt = subdimensionIndex !== -1
             ? `<option value="" onclick="changeSubdimension('', '', ${id})">No Subdimension</option>`
             : '';
         optionsHtml = `
         <select class="form-select item-subdimension" style="flex:0.2; cursor:pointer;">
           <option disabled selected>Change subdimension</option>
           ${opts}
           ${noSubOpt}
         </select>`;
     }

     // Compose inner HTML: text input, save button, subdimension dropdown, remove button
     row.innerHTML = `
         <input type="text" class="form-control item-text" placeholder="Item text" value="${itemText}">
         <button class="btn btn-outline-secondary save-item" type="button" style="display:none;"><i class="bi bi-floppy2"></i></button>
         ${optionsHtml}
         <button class="btn btn-outline-danger remove-item" type="button">&times;</button>
     `;

     // Remove handler: delete from array, persist, and refresh
     row.querySelector('.remove-item').addEventListener('click', () => {
         items = items.filter(i => i.id !== parseInt(row.dataset.id));
         window.dataStorage.storeData('data_step_2', { items }, false).then(() => {
             console.log('Data saved successfully');
         });
         syncData();
     });

     // Show save button on input change
     const saveBtn = row.querySelector('.save-item');
     row.addEventListener('input', () => saveBtn.style.display = 'block');

     // Enter key triggers save
     row.addEventListener('keypress', event => {
         if (event.key === 'Enter') {
             event.preventDefault();
             saveBtn.click();
         }
     });

     // Save handler: validate, persist change, then hide save button
     saveBtn.addEventListener('click', async () => {
         const itemTextInput = row.querySelector('.item-text');
         const newText = itemTextInput.value.trim();
         if (!newText) {
             await customConfirm({
                 title: '⚠️',
                 message: 'Item text cannot be empty',
                 cancelText: '__ONLYALERT__'
             });
             syncData();
             saveBtn.style.display = 'none';
             return;
         }
         changeSubdimension(newText, subdimension, id);
         saveBtn.style.display = 'none';
         itemTextInput.blur();
     });

     // Insert the row into its designated panel
     subdimensionPanel.appendChild(row);
}

document.addEventListener('input', event => {
    const el = event.target;
    if (el.matches('.item-text')) {
        console.log(`Item text changed: ${el.value}`);
        
    }
});

// Handler for Add Item button (adds a new item)
if (addItemButton) {
    addItemButton.addEventListener('click', async() => {
        // Read inputs, validate, add to `items`, persist, then refresh UI
        const subdimension = addItemSubdimension.value || '';
        const itemText = addItemText.value.trim();
        if (!itemText) {
            await customConfirm({
                title: '⚠️',
                message: 'Item text cannot be empty',
                cancelText: '__ONLYALERT__'
            });
            syncData(); // Refresh items
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