// =====================
// Step 2: Item Management
// =====================

// Items loaded from storage
let items = [];
let aiItems = {};
let subdimensions = [];
let dimensionality = "";
let nextItemId = 1; // monotonically increasing id to avoid reuse

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
    revealNextStepButton();

    Object.entries(aiItems).forEach(([key, itemList]) => {
        createAiItemRows(key);
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
    aiItems = step2Data?.aiItems || {
"literature":[],
"deduction":[],
"summary":[],
"expert":[],
"focusGroup":[],
"existing":[]
}
    // initialize nextItemId from storage or compute from existing items
    if (typeof step2Data.nextItemId === 'number' && step2Data.nextItemId > 0) {
        nextItemId = step2Data.nextItemId;
    } else {
        const maxId = items.length ? Math.max(...items.map(i => Number(i.id) || 0)) : 0;
        nextItemId = maxId + 1;
    }

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

    generatePrompt(step1Data);

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
         // No ID => create a new item with fresh, persistent ID
         const newId = nextItemId++;
         items.push({ id: newId, text: text, subdimension: subdimension });
     }
     // Persist updated list to IndexedDB
    window.dataStorage.storeData('data_step_2', { items, aiItems, nextItemId }, false).then(() => {
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
    window.dataStorage.storeData('data_step_2', { items, aiItems, nextItemId }, false).then(() => {
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
    const item = {
        id: nextItemId++,
            text: itemText,
            subdimension: subdimension || null
        };
        items.push(item);
    window.dataStorage.storeData('data_step_2', { items, aiItems, nextItemId }, false).then(() => {
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



// ***********************************        Item Generation          ************************************************************
let prompts = {}
function generatePrompt(step1Data){
    try{

    let dimensionText = ""
    let outputFormat = "";
    if (dimensionality === "Multidimensional") {

        dimensionText = `The construct is multidimensional, so items will be generated under each subdimension. Return a set of items for each individual sub-dimension. The subdimensions are: ${subdimensions.map(sd => `Dimensionname: ${sd.name}, Definition: ${sd.definition}, Attributes: ${sd.attributes.join(', ')}`).join('; ')}.`;
        outputFormat = `[{"item": "ITEM TEXT HERE","reference": "AUTHOR NAME, YEAR","subdimension":"DIMENSIONNAME HERE"},{"item": "ITEM TEXT HERE","reference": "AUTHOR NAME, YEAR","subdimension":"SUBDIMENSION HERE"}]`;
    } else {
        dimensionText = `The construct is unidimensional, so the item set should cover all aspects of the single dimension.`;
        outputFormat = `[{"item": "ITEM TEXT HERE","reference": "AUTHOR NAME, YEAR"},{"item": "ITEM TEXT HERE","reference": "AUTHOR NAME, YEAR"}]`;
    }
    let generaltext= (specificInstructions) =>{
    return `
    You are assisting with the generation of measurement items for a psychological construct following MacKenzie et al. (2011)
    goal of the item generation process is to produce a set of items that fully captures all of the essential aspects of the domain

    each item should be written so that its wording is as simple and precise as possible
    Double-barreled items split into two single-idea statements. If impossible -> do not include
    refine or remove items that contain obvious social desirability


    Items should reflect the essential attributes of the construct and its domain as specified in the definition.

    Given the construct name "${step1Data.panel1.constructName}" and the definition provided below, retrieve or generate 5–10 concise, relevant self-report questionnaire items (one per line)

    
 Construct name:
"${step1Data.panel1.constructName}"

Initial definition:
"${step1Data.panel1.initialDefinition}"

${dimensionText}



Instructions:

For each item, include the reference (author names and publication year) if the item is taken from existing literature; otherwise, mark as "generated".

Output must be valid JSON only — no markdown, no explanation, no formatting wrappers.

${specificInstructions}

    Example output:
    ${outputFormat}
    ` }
prompts = {
    "literature": generaltext(`Search the literature for validated scales related to ${step1Data.panel1.constructName}. Extract all papers with questionnaire items or measurement statements that are used to assess this construct and extract its items. Only generate items, if you can find a reference to it. Check again if any items have been marked as "generated" and exclude them from the output.`),
    "deduction": generaltext(`Based on the conceptual definition of ${step1Data.panel1.constructName}, generate a comprehensive list of potential scale items. Use the definition to deduct each item. It should reflect a specific attribute described in the definition.`),
    "summary": generaltext(`Summarize the literature regarding how ${step1Data.panel1.constructName} has been measured. Extract any reported survey items or indicators, and suggest new items based on patterns found in the results or discussions. Generate new questionnaire items that capture aspects which have been frequently measured or discussed.`),
    "existing": generaltext(`First, collect and compare all existing validated scales for ${step1Data.panel1.constructName}. Then extract the exact item wordings from each scale. Propose a list of candidate items for a new scale, prioritizing items that are clear, relevant, and not redundant.Only generate items, if you can find a reference to it. Check again if any items have been marked as "generated" and exclude them from the output.`),
    }
    }
    catch (error) {
        console.error("Error generating prompt:", error);
        window.displayInfo('danger', 'Failed to create item generation prompt. Please try again.');
        return
    }
}




async function generateItems(indicator, forceNewItems = false, tries = 0) {
    let prompt = prompts[indicator];
    let itemHistory = aiItems[indicator]
    if (!prompt) {
        window.displayInfo('danger', 'No prompt found for this indicator.');
        return;
    }
    if (dimensionality === "Multidimensional" && subdimensions.length < 1) {
        window.displayInfo('danger', 'Please define at least one subdimension for multidimensional constructs.');
        return;
    }

     if (forceNewItems) {
        // If forceNewItems is true, clear existing items for this indicator
        itemHistory = [];
        
    }
    model = undefined
    if (indicator == "literature" || indicator == "existing") {
        model = "search";
    }
    
    // Send prompt to chat API and retrieve JSON text
    try {
        
        showLoading();
        if (itemHistory.length > 0 && !forceNewItems) {
            let fakeHistory = [
                {
                    "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers.",
                    "role": "system"
                },
                {
                    "content": prompt,
                    "role": "user"
                },
                {
                    "content": "These Items are already existent: "+ JSON.stringify(itemHistory),
                    "role": "system"
                }
            ]
            response = await window.sendChat("Generate again 5 - 10 more items", fakeHistory, model);
        }else{ // If no history, use default system prompt
            response = await window.sendChat(prompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}], model);
        }
        AIResponse = window.cleanAIRespond(response[0]); // Get the reply text from the response
    } catch (err) {
        if (tries < 2) {
            console.error('Error processing AI response:', err, 'Response: ',response[0]);
            window.displayInfo('info', 'AI suggestion format is invalid. Trying again...');
            return await generateItems(indicator, forceNewItems,tries + 1);
        }
        console.error('Error fetching items:', err);
        window.displayInfo('danger', 'Failed to retrieve items. Please try again.');
        return;
    }finally {
        hideLoading();
        
    }
    
    
    // Parse JSON response
    if (AIResponse.length === 0) {
        window.displayInfo('info', 'No new items generated. Try again!');
        return
    }

    // filter out items already in the history
    AIResponse = AIResponse.filter(newItem =>
        !itemHistory.some(existing =>
            existing.item === newItem.item &&
            existing.reference === newItem.reference &&
            (existing.subdimension || '') === (newItem.subdimension || '')
        )
    );
    if (AIResponse.length === 0) {
        window.displayInfo('info', 'No new items generated. All items already exist.');
        return;
    }
    itemHistory.push(...AIResponse);
    aiItems[indicator] = itemHistory; // Update the aiItems object with new items
    window.dataStorage.storeData('data_step_2', { items, aiItems, nextItemId }, false).then(() => {
        console.log('aiItems saved successfully');
    });

    syncData()
}

function createAiItemRows(indicator){
    
    document.getElementById(`selectAll${indicator}`).checked = false; // Reset select all checkbox
    const itemList = aiItems[indicator] || [];
    if (itemList.length > 0) {
        const genMoreBtn = document.getElementById(`generateMore${indicator}`);        
        if (genMoreBtn) {
            genMoreBtn.classList.remove('d-none');
        }
    }
    const itemContainer = document.getElementById(`${indicator}-item-container`);
    if (!itemContainer) {
        console.info(`Container for ${indicator} items not found`);
        return;
    }
    const parentCard = itemContainer.closest('.card');
    if (itemList.length === 0) {
        parentCard.classList.add('d-none');
        return
    }
    console.log(indicator);
    parentCard.classList.remove('d-none');

    itemContainer.innerHTML = ''; // Clear existing items
    itemList.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'col form-check';
        const checkbox = document.createElement('input')
        if (items.some(i =>
            i.text === item.item &&
            (i.subdimension || '') === (item.subdimension || '')
        )) {
            checkbox.disabled = true; // Disable checkbox if item already exists in items
        }
        checkbox.className = `form-check-input ${indicator}-checkbox`
        checkbox.type = 'checkbox'
        checkbox.id = `${indicator}Item${itemList.indexOf(item)}`
        checkbox.value = `${itemList.indexOf(item)}`;
        itemDiv.appendChild(checkbox)

        const label = document.createElement('label')
        label.className = 'form-check-label'
        label.htmlFor = checkbox.id
        label.textContent = `${item.item} | ${item.reference}`
        if (item.subdimension) {
            label.textContent = `(${item.subdimension}) ${label.textContent}`
        }
        itemDiv.appendChild(label)
        itemContainer.appendChild(itemDiv);
    });

    // After populating `itemContainer`, sort its children alphabetically by their label text
    const rows = Array.from(itemContainer.children);
    rows.sort((a, b) => {
        const textA = a.querySelector('label').textContent.trim().toLowerCase();
        const textB = b.querySelector('label').textContent.trim().toLowerCase();
        return textA.localeCompare(textB);
    });
    // Re‐append in sorted order
    itemContainer.innerHTML = '';
    rows.forEach(row => itemContainer.appendChild(row));

}


function chooseSelectItems(indicator) {
    const itemList = aiItems[indicator] || [];
    const checkboxes = document.querySelectorAll(`.${indicator}-checkbox`);
    const selectedItems = Array.from(checkboxes)
        .filter(cb => cb.checked)
        .map(cb => itemList[cb.value]);

    if (selectedItems.length === 0) {
        window.displayInfo('info', 'No items selected.');
        return;
    }
    

    selectedItems.forEach(item => {
        if (items.some(existing =>
            existing.text === item.item &&
            (existing.subdimension || '') === (item.subdimension || '')
        )) {
            return;
        }
    items.push({
        id: nextItemId++,
            text: item.item,
            subdimension: item.subdimension || null
        });
    });

    window.dataStorage.storeData('data_step_2', { items, aiItems, nextItemId }, false).then(() => {
         console.log('Data saved successfully');
     });


    // Call the function to handle selected items
    syncData(); // Refresh the UI to show new items
}

async function deleteItems(indicator) {
    if (aiItems[indicator].length === 0) {
        window.displayInfo('info', `No items to delete in the ${indicator} list.`);
        return;
        
    }
    let confirm = await customConfirm({
        title: 'Delete Items',
        message: `Are you sure you want to delete all items from the ${indicator} list? This action cannot be undone.`,
        confirmText: 'Delete',
        cancelText: 'Cancel'
    });
    if (!confirm) {
        return; // User cancelled
    }
    aiItems[indicator] = []
    window.dataStorage.storeData('data_step_2', { items, aiItems, nextItemId }, false).then(() => {
         console.log('Data saved successfully');
     });

    // Refresh the UI to reflect changes
    syncData();
}

function revealNextStepButton(){
    const btn = document.getElementById('continueStep2Btn');
   if (items.length > 0) {
       btn.classList.remove('d-none');
   } else {
       btn.classList.add('d-none');
   }    
}