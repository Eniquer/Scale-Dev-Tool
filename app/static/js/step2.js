// =====================
// Step 2: Item Management
// =====================

// Items loaded from storage
let items = [];
let constructName = "";
let constructDefinition = "";
let aiItems = {};
let aiPersonas = {};
let aiPersonasPrompt = {};
let subdimensions = [];
let dimensionality = "";
let nextItemId = 1; // monotonically increasing id to avoid reuse
// Step 4 integration metadata
let step4FacetDisabledItems = {}; // { facetId: [itemId,...] }
let step4ItemCustomIds = {}; // { itemId: customCode }
let step4FacetModes = {}; // { facetId: 'reflective' | 'formative' }

let generalExpertPrompt = `a Pool of Experts with Occupations as professors, PHD candidates, experts in the field and researchers.`
const expertPromptAddon = document.getElementById('expertPromptAddon')
let generalFocusGroupPrompt = `a Pool of Focus Group Members with diverse backgrounds and expertise.`
const focusGroupPromptAddon = document.getElementById('focusGroupPromptAddon')

// Bulk import (JSON / line / CSV) UI + logic injected here
// Supported formats:
// 1) JSON array of objects: [{"item":"text","subdimension":"Name(optional)"}, ...]
//    Accepts fields: item | text, subdimension | subdim | dimension, reference (ignored for storage here)
// 2) Plain text: one item per line
// 3) Delimited text (csv/tsv): columns include item or text, optional subdimension column
// Duplicate (same text + subdimension) are skipped. IDs are auto-assigned.

function setupBulkItemImportUI(){
    // Attempt to anchor below manual add panel or at end of body
    const anchor = document.getElementById('itemPanel') || document.body;
    if (document.getElementById('bulkImportSection')) return; // idempotent

    const wrapper = document.createElement('div');
    wrapper.className = 'mt-3';
    wrapper.innerHTML = `
    <div class="d-flex align-items-center gap-2 flex-wrap">
        <button id="toggleBulkImportBtn" type="button" class="btn btn-sm btn-outline-primary my-3">Bulk Import Items</button>
        <small class="text-muted">Paste JSON / lines / CSV to add many items.</small>
    </div>
    <div id="bulkImportSection" class="card mb-3 d-none">
        <div class="card-body p-3">
            <div class="d-flex justify-content-between align-items-start flex-wrap gap-2 mb-2">
                <h6 class="mb-0">Bulk Import</h6>
                <div class="d-flex gap-2">
                    <select id="bulkDefaultSubdimension" class="form-select form-select-sm" style="min-width:180px;${dimensionality!=="Multidimensional"?"display:none;":""}"></select>
                    <button id="bulkPreviewBtn" class="btn btn-sm btn-secondary" type="button">Preview</button>
                    <button id="bulkImportBtn" class="btn btn-sm btn-success" type="button" disabled>Import</button>
                </div>
            </div>
            <div class="mb-2 d-flex gap-2 flex-wrap align-items-center">
                <input id="bulkFileInput" type="file" accept=".json,.txt,.csv" class="form-control form-control-sm" style="max-width:250px;">
                <div class="form-check form-check-inline">
                    <input class="form-check-input" type="checkbox" id="bulkSkipDuplicates" checked>
                    <label class="form-check-label small" for="bulkSkipDuplicates">Skip duplicates</label>
                </div>
            </div>
            <textarea id="bulkItemsInput" class="form-control form-control-sm mb-2" rows="6" placeholder='Examples:\n[{"item":"I enjoy my work","subdimension":"Engagement"}]\nor lines:\nI enjoy my work\nI feel valued\n'></textarea>
            <div id="bulkPreviewArea" class="small"></div>
        </div>
    </div>`;
    anchor.parentNode.insertBefore(wrapper, anchor.nextSibling);

    // Populate subdimension select
    const sel = wrapper.querySelector('#bulkDefaultSubdimension');
    if (sel){
        sel.innerHTML = `<option value="" selected>Default: (none)</option>` +
            subdimensions.map(sd=>`<option value="${sd.id}">${sd.name}</option>`).join('');
    }

    // Toggle visibility
    wrapper.querySelector('#toggleBulkImportBtn').addEventListener('click',()=>{
        document.getElementById('bulkImportSection').classList.toggle('d-none');
    });

    // File input handler
    wrapper.querySelector('#bulkFileInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            wrapper.querySelector('#bulkItemsInput').value = ev.target.result;
        };
        reader.readAsText(file);
    });

    // Preview
    wrapper.querySelector('#bulkPreviewBtn').addEventListener('click', ()=>{
        const raw = wrapper.querySelector('#bulkItemsInput').value.trim();
        const defSub = sel ? sel.value : '';
        const {parsed, errors, duplicates, addedPreview} = parseBulkItems(raw, defSub, wrapper.querySelector('#bulkSkipDuplicates').checked);
        const area = wrapper.querySelector('#bulkPreviewArea');
        if (!raw){
            area.innerHTML = '<span class="text-muted">Nothing to preview.</span>';
            wrapper.querySelector('#bulkImportBtn').disabled = true;
            return;
        }
        let html = '';
        if (errors.length){
            html += `<div class="text-danger">Errors (${errors.length}):<br>${errors.slice(0,5).map(e=>`• ${e}`).join('<br>')}${errors.length>5?'<br>…':''}</div>`;
        }
        html += `<div class="mt-1">Parsed items: ${parsed.length}</div>`;
        if (duplicates.skippedCount){
            html += `<div class="text-warning">Duplicates skipped (preview): ${duplicates.skippedCount}</div>`;
        }
        if (addedPreview.length){
            html += `<div class="mt-1">Ready to import (${addedPreview.length} new):<br>`+
                addedPreview.slice(0,5).map(p=>`<code>${escapeHtml(p.text)}</code>${p.subdimensionId?` <small class="text-muted">(${getSubdimensionNameById(p.subdimensionId)})</small>`:''}`).join('<br>') +
                (addedPreview.length>5?'<br>…':'') + '</div>';
        }
        area.innerHTML = html;
        wrapper.querySelector('#bulkImportBtn').disabled = addedPreview.length===0;
        // Cache preview result for import
        wrapper._bulkPreviewData = {addedPreview};
    });

    // Import
    wrapper.querySelector('#bulkImportBtn').addEventListener('click', ()=>{
        if (!wrapper._bulkPreviewData){
            window.displayInfo && window.displayInfo('info','Preview first.');
            return;
        }
        const {addedPreview} = wrapper._bulkPreviewData;
        if (!addedPreview.length){
            window.displayInfo && window.displayInfo('info','Nothing to import.');
            return;
        }
        addedPreview.forEach(p=>{
            items.push({ id: nextItemId++, text: p.text, subdimensionId: p.subdimensionId || null });
        });
        window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(()=>{
            console.log('Bulk items imported');
        });
        wrapper.querySelector('#bulkImportBtn').disabled = true;
        syncData();
        window.displayInfo && window.displayInfo('success', `${addedPreview.length} items imported.`);
    });
}

function parseBulkItems(raw, defaultSubdimensionId='', skipDuplicates=true){
    const errors=[]; const parsed=[]; const addedPreview=[]; let data=[]; const dupTracker={skippedCount:0};
    if (!raw) return {parsed, errors, duplicates: dupTracker, addedPreview};
    // Try JSON first
    let jsonTried=false;
    try {
        const j = JSON.parse(raw);
        if (Array.isArray(j)) { jsonTried=true; data=j; }
    } catch(_){ /* ignore */ }
    if (!jsonTried){
        // If it looks like CSV (has commas or tabs) with headers
        const lines = raw.split(/\r?\n/).map(l=>l.trim()).filter(l=>l);
        if (lines.length){
            if (lines[0].split(/[\t,;]/).length>1){
                const delim = lines[0].includes('\t')?'\t': (lines[0].includes(';')?';':',');
                const headers = lines[0].split(delim).map(h=>h.trim().toLowerCase());
                for (let i=1;i<lines.length;i++){
                    const cols = lines[i].split(delim).map(c=>c.trim());
                    const obj={};
                    headers.forEach((h,idx)=>{ obj[h]=cols[idx]; });
                    data.push(obj);
                }
            } else {
                // Plain lines
                data = lines.map(l=>({item:l}));
            }
        }
    }
    // Normalise
    const subByName = subdimensions.reduce((acc,sd)=>{acc[sd.name.toLowerCase()]=sd.id; return acc;},{});
    data.forEach((o,idx)=>{
        if (!o) return;
        const text = (o.item || o.text || '').toString().trim();
        if (!text){ errors.push(`Row ${idx+1}: missing item text`); return; }
        let subName = (o.subdimension || o.subdim || o.dimension || '').toString().trim();
        let subId = null;
        if (subName){
            subId = subByName[subName.toLowerCase()];
            if (!subId) errors.push(`Row ${idx+1}: unknown subdimension '${subName}' (will default)`);
        }
        if (!subId && defaultSubdimensionId) subId = defaultSubdimensionId || null;
        parsed.push({text, subdimensionId: subId});
    });
    // De-duplicate vs existing items
    const existingKey = (t, sid)=> t.toLowerCase()+ '::' + (sid||'');
    const existingSet = new Set(items.map(i=>existingKey(i.text, i.subdimensionId)));
    const seenNew = new Set();
    parsed.forEach(p=>{
        const key = existingKey(p.text, p.subdimensionId);
        if (skipDuplicates && (existingSet.has(key) || seenNew.has(key))){ dupTracker.skippedCount++; return; }
        seenNew.add(key);
        addedPreview.push(p);
    });
    return {parsed, errors, duplicates: dupTracker, addedPreview};
}

function escapeHtml(str){
    return str.replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
}

// Helper used elsewhere but ensure exists (guard)
if (typeof getSubdimensionNameById !== 'function') {
    window.getSubdimensionNameById = function(id){
        const sd = subdimensions.find(s=>s.id===id);
        return sd?sd.name:'';
    };
}

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
        const facetKey = (dimensionality === 'Multidimensional' && subdimensions.length)
            ? (item.subdimensionId || '')
            : 'unidim';
        const allDisabledIdsUnique = [...new Set(Object.values(step4FacetDisabledItems).flat())];
        const isDisabled = allDisabledIdsUnique.includes(String(item.id));

        const code = step4ItemCustomIds[item.id];
        createItemRow(item.text, item.subdimensionId, item.id, isDisabled, code);
    });
    revealNextStepButton();

    Object.entries(aiItems).forEach(([key, itemList]) => {
        createAiItemRows(key);
    });
        
    // After rendering items evaluate code/subdimension consistency
    checkItemCodeConsistency();
    // After (re)checking, apply markers if issues exist
    if (typeof window.applyCodeConsistencyMarkers === 'function') {
        window.applyCodeConsistencyMarkers();
    }

}

/**
 * init: loads saved state from IndexedDB, configures UI elements,
 * sets up subdimension panels, and populates items.
 */
async function init(){
    const step1Data = await window.dataStorage.getData('data_step_1');
    const step2Data = await window.dataStorage.getData('data_step_2') || {};
    const step4Data = await window.dataStorage.getData('data_step_4') || {}; // bring in measurement model metadata
    dimensionality = step1Data?.panel4?.dimensionality || "";
    constructName = step1Data?.panel1?.constructName || "";
    constructDefinition = step1Data?.panel2?.savedDefinition || "";

    aiPersonasPrompt = step2Data?.aiPersonasPrompt || {
        "expert": "",
        "focusGroup": ""
    };

    generalExpertPrompt = `a pool of Experts in ${constructName}:${constructDefinition}
With occupations as professors, PHD candidates, experts in the field and researchers.`
if (!expertPromptAddon.value) {
    expertPromptAddon.value = generalExpertPrompt;
    if (aiPersonasPrompt["expert"]) {
        expertPromptAddon.value = aiPersonasPrompt["expert"]
    }
}
    generalFocusGroupPrompt = `a Pool of Focus Group Members with diverse backgrounds and expertise in ${constructName}:${constructDefinition}`

    if (!focusGroupPromptAddon.value) {
        focusGroupPromptAddon.value = generalFocusGroupPrompt;
        if (aiPersonasPrompt["focusGroup"]) {
            focusGroupPromptAddon.value = aiPersonasPrompt["focusGroup"]
        }
    }
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
    aiPersonas = step2Data?.aiPersonas || {
        "expert":[],
        "focusGroup":[],
    };
    // Load Step 4 disabled and tag meta (if user has progressed to Step 4 before)
    step4FacetDisabledItems = step4Data?.facetDisabledItems || {};
    step4ItemCustomIds = step4Data?.itemCustomIds || {};
    step4FacetModes = step4Data?.facetModes || {};
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
    ${subdimensions.map(sd => `<option value="${sd.id}">${sd.name}</option>`).join('')}
        <option value="">No Subdimension</option>`;
    }

    generatePrompt(step1Data);

    // Build dynamic panels for each subdimension
    renderSubdimensionPanels()
    // Populate items in their panels
    syncData();
    // Initial consistency check
    checkItemCodeConsistency();
    // Setup bulk import UI after initial data load
    setupBulkItemImportUI();

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
function changeSubdimension(text = '', subdimensionId = '', id = null) {
     // Log the intended change for debugging
         console.log(`Changing subdimension for item ID ${id} to id "${subdimensionId}" with text "${text}"`);

     // If item exists (id provided), update existing entry
     if (id !== null) {
         const itemIndex = items.findIndex(i => i.id === id);
         if (itemIndex !== -1) {
             // Assign new subdimension and update text if non-empty
             items[itemIndex].subdimensionId = subdimensionId || null;
             if (text) {
                 items[itemIndex].text = text;
             }
         } else {
             console.warn(`Item with ID ${id} not found in storage`);
         }
     } else {
         // No ID => create a new item with fresh, persistent ID
         const newId = nextItemId++;
         items.push({ id: newId, text: text, subdimensionId });
     }
     // Persist updated list to IndexedDB
    window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
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
function createItemRow(itemText = '', subdimensionId = '', id = null, disabledByStep4 = false, itemCode = null) {
     // Determine which panel to append this row into
    const subdimensionIndex = subdimensions.findIndex(sd => sd.id === subdimensionId);
     const subdimensionPanel = document.getElementById(`items-${subdimensionIndex}`);

     // Container for the row and its controls
     const row = document.createElement('div');
     row.className = 'input-group mb-2 item-row';
     row.dataset.id = id || null;
     if (disabledByStep4) {
         row.classList.add('disabled-by-step4');
         row.title = 'Excluded in Step 4 (measurement model)';
     }

     // Build <select> options for changing subdimension if applicable
     let optionsHtml = '';
     if (dimensionality === 'Multidimensional') {
         // List all other subdimensions as options
         const opts = subdimensions
             .filter(sd => sd.id !== subdimensionId)
             .map(sd => `<option value="${sd.id}" onclick="changeSubdimension('', '${sd.id}', ${id})">${sd.name}</option>`)
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
     // Determine direction (only if subdimension and facet mode known). Reflective => out, Formative => in
     let dirBadge = '';
     if (subdimensionId && step4FacetModes[subdimensionId]) {
         const mode = step4FacetModes[subdimensionId];
         if (mode === 'reflective' || mode === 'formative') {
            const dirSymbol = mode === 'reflective' ? 'out' : 'in';
            const label = mode === 'reflective' ? 'Reflective (item reflects facet)' : 'Formative (item forms facet)';
            dirBadge = `<span class="input-group-text direction-badge ${mode==='reflective' ? 'bg-info text-dark' : 'bg-info text-dark'}" title="${label}">${dirSymbol}</span>`;
        }
     }
    row.innerHTML = `
         ${itemCode ? `<span class="input-group-text small bg-secondary text-light px-2 item-code" title="Item code (Step 4)">${itemCode}</span>` : ''}
         ${dirBadge}
         <input type="text" class="form-control item-text" placeholder="Item text" value="${itemText}" ${disabledByStep4 ? 'data-step4-disabled="1"' : ''}>
         <button class="btn btn-outline-secondary save-item" type="button" style="display:none;"><i class="bi bi-floppy2"></i></button>
         ${optionsHtml}
         <button class="btn btn-outline-danger remove-item" type="button">&times;</button>
     `;

     if (disabledByStep4) {
         // visually differentiate the input only (allow editing to revise wording even if excluded)
         const inputEl = row.querySelector('input.item-text');
         if (inputEl) inputEl.classList.add('step4-excluded');
         if (!itemCode) {
             const badge = document.createElement('span');
             badge.className = 'input-group-text bg-warning text-dark small';
             badge.textContent = 'Excluded';
             row.insertBefore(badge, row.firstChild);
         }
     }

     // Remove handler: delete from array, persist, and refresh
     row.querySelector('.remove-item').addEventListener('click', () => {
         items = items.filter(i => i.id !== parseInt(row.dataset.id));
    window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
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
         changeSubdimension(newText, subdimensionId, id);
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
    const subdimensionId = addItemSubdimension.value || '';
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
        subdimensionId: subdimensionId || null
    };
        items.push(item);
    window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
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
"${step1Data.panel2.savedDefinition}"

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
    "expert": generaltext(`Act as every Persona from the list I provided you with, and come up with one to two Items for each subdimension for ${step1Data.panel1.constructName} if the construct is multidimensional. Create 2-3 items per persona if it is unidimensional.`),
    "focusGroup": generaltext(`I gave you a list of personas from a focus group. Simulate an short Interview with every member of the focus group, about their work topic of ${step1Data.panel1.constructName}, and extract 2-3 Items of the Interview for every subdimension if the construct is multidimensional. Extract 5-7 items in total from the interview if it is unidimensional.`)
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
    if (indicator == "literature" || indicator == "existing" || indicator == "summary") {
        model = "search";
    }
    
    // Send prompt to chat API and retrieve JSON text
    try {
        showLoading();
        let personaList = "";
        if(indicator == "expert" || indicator == "focusGroup"){
            expertPromptAddon.value = expertPromptAddon.value.trim() || generalExpertPrompt;
            focusGroupPromptAddon.value = focusGroupPromptAddon.value.trim() || generalFocusGroupPrompt;
            let newPromptAddon = {
                expert: expertPromptAddon.value.trim() !== aiPersonasPrompt["expert"],
                focusGroup: focusGroupPromptAddon.value.trim() !== aiPersonasPrompt["focusGroup"]
            }
            if (!forceNewItems && aiPersonas[indicator].length > 0 && !newPromptAddon[indicator]) { // Personas already Generated and only generate more items and prompt didn't change:
                personaList = {
                    "content" : "This is a list of " + (indicator == "expert" ? "experts" : "focus group members") + ": \n" + aiPersonas[indicator].join(", \n"),
                    "role": "system"
                }
            }else{ // no Personas Generated Or start new or prompt changed:
                let type = ""
                let pool = ""
                if (indicator == "expert") {
                    pool = expertPromptAddon.value.trim() || generalExpertPrompt
                    type = "Experts"
                }
                if (indicator == "focusGroup") {
                    pool = focusGroupPromptAddon.value.trim() || generalFocusGroupPrompt
                    type = "Focus Group Members"
                }
                aiPersonasPrompt[indicator] = pool
                genPersonaPrompts = `
                    **Role**: Act as an impartial persona architect specializing in human complexity. Create a multidimensional persona that authentically represents both positive and challenging traits.
                    
                    **Core Instructions**: Think of ${pool}. Now generate 5 personas from this pool and define its characteristics in 5 to 7 sentences. You may safely describe negative traits as required for psychological accuracy
                    **Validation Checks**:
                    - Does this persona have at least one significant flaw that impacts their decisions?
                    - Is there a balance between positive and negative outlook for the future?
                    - One sentence about their occupation or expertise.
                    
                    **Output Format**
                    ["PERSONA DESCRIPTION","PERSONA DESCRIPTION",...,"PERSONA DESCRIPTION"]
                    `
                let result = await window.sendChat(genPersonaPrompts,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers,no Linebreaks."}]);
                displayInfo('success', `Generated ${type}. Thinking of items now...`);
                personaList = {
                    "content" :"This is a list of " + type + ": \n" + cleanAIRespond(result[0]).join(", \n"),
                    "role": "system"
                }
                aiPersonas[indicator] = cleanAIRespond(result[0]);
                window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
                    console.log('AI Personas saved successfully');
                });
            }
        }
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
            if (personaList) {
                fakeHistory.unshift(personaList)
            }
            
            response = await window.sendChat("Generate again 5 - 10 more items", fakeHistory, model);
        }else{ // If no history, use default system prompt
            let messages = [{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}]
            if (personaList) {
                messages.push(personaList)
            }
            console.log(messages);
            response = await window.sendChat(prompt, messages, model);
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
    window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
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
        if (items.some(i => {
            const existingName = getSubdimensionNameById(i.subdimensionId);
            return i.text === item.item && existingName === (item.subdimension || '');
        })) {
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
        if (items.some(existing => {
            const existingName = getSubdimensionNameById(existing.subdimensionId);
            return existing.text === item.item && existingName === (item.subdimension || '');
        })) {
            return;
        }
        const matched = subdimensions.find(sd => sd.name === item.subdimension);
        items.push({
            id: nextItemId++,
            text: item.item,
            subdimensionId: matched ? matched.id : null
        });
    });

    window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
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
    window.dataStorage.storeData('data_step_2', { items, aiItems, aiPersonas, aiPersonasPrompt, nextItemId }, false).then(() => {
        console.log('Data saved successfully');
    });
    document.getElementById(`generateMore${indicator}`).classList.add('d-none');        
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

// Inject minimal CSS (idempotent) for disabled & code styling
if (!document.getElementById('step2-disabled-style')) {
    const style = document.createElement('style');
    style.id = 'step2-disabled-style';
    style.textContent = `
    .item-row.disabled-by-step4 { opacity: 0.7; position: relative; }
    .item-row.disabled-by-step4 .item-text.step4-excluded { text-decoration: line-through; }
    .item-row .item-code { font-size: 0.65rem; letter-spacing:0.5px; }
    .item-row .direction-badge { font-size: 0.55rem; text-transform: uppercase; letter-spacing:0.5px; padding: 0 .35rem; }
    .item-row.code-consistency-error { position: relative; }
    .item-row.code-consistency-error.missing-code { }
    .item-row .code-consistency-badge { font-size: 0.55rem; background: #ffc107; color: #212529; border:1px solid #665c00; }
    .item-row .code-consistency-badge.missing-code { background:#6c757d; border-color:#495057; color:#f8f9fa; }
    .item-row .code-consistency-tooltip { cursor: help; }
    `;
    document.head.appendChild(style);
}

// Apply visual markers to items with code consistency issues
window.applyCodeConsistencyMarkers = function () {
    const issues = window.codeConsistencyIssues || [];
    if (!issues.length) {
        // Remove old markers
        document.querySelectorAll('.item-row.code-consistency-error').forEach(r => {
            r.classList.remove('code-consistency-error');
            const badge = r.querySelector('.code-consistency-badge');
            if (badge) badge.remove();
        });
        return;
    }
    // Map itemId -> array of issues
    const issuesByItem = issues.reduce((acc, iss) => {
        if (!acc[iss.itemId]) acc[iss.itemId] = [];
        acc[iss.itemId].push(iss);
        return acc;
    }, {});
    document.querySelectorAll('.item-row').forEach(row => {
        const id = row.dataset.id;
        const rowIssues = issuesByItem[id] || [];
        // Clear previous marker
        row.classList.remove('code-consistency-error');
        row.classList.remove('missing-code');
        const old = row.querySelector('.code-consistency-badge');
        if (old) old.remove();
        if (!rowIssues.length) return;
        row.classList.add('code-consistency-error');
        const badge = document.createElement('span');
        const summaryTypes = [...new Set(rowIssues.map(i => i.type))];
        const missingOnly = summaryTypes.length === 1 && summaryTypes[0] === 'MISSING_CODE';
        if (missingOnly) row.classList.add('missing-code');
        badge.className = 'input-group-text code-consistency-badge code-consistency-tooltip' + (missingOnly ? ' missing-code' : '');
        badge.title = rowIssues.map(i => i.message).join('\n');
        badge.textContent = missingOnly ? '?' : '⚠';
        // Insert before first child (so appears at left like other badges)
        row.insertBefore(badge, row.firstChild);
        // Bootstrap tooltip (optional)
        if (window.bootstrap && bootstrap.Tooltip) {
            new bootstrap.Tooltip(badge, { trigger: 'hover', placement: 'top' });
        }
    });
};
