// Make functions available globally
window.saveConstructData = saveConstructData;
window.getDefinitions = getDefinitions;
window.getDefinitionsAgain = getDefinitionsAgain;
window.getDefinitionsMore = getDefinitionsMore;
window.chooseDefinition = chooseDefinition;
// Expose functions globally
window.saveTheme = saveTheme;
window.getThemeAISuggestion = getThemeAISuggestion;
window.showThemeAISuggestion = showThemeAISuggestion;
window.takeThemeAISuggestion = takeThemeAISuggestion;
// window.analyseDefinition = analyseDefinition;

const domPanel1 = document.getElementById('step1panel1');
const domPanel2 = document.getElementById('step1panel2');
const domPanel3 = document.getElementById('step1panel3');
const domPanel4 = document.getElementById('step1panel4');
const resultingDefinitionContainer = document.getElementById('resultingDefinitionContainer');
const resultingDefinitionTextarea = document.getElementById('resultingDefinitionTextarea');
const addAttributeButton = document.getElementById('addAttributeButton');
const attributesContainer = document.getElementById('attributesContainer');



// ***********************************    Auto-load Data    ***********************************************

// Auto-load data and existing definitions on page load
document.addEventListener('DOMContentLoaded', syncData);


function syncData() {
    if (document.getElementById('constructName') && document.getElementById('initialDefinition')) {
        // If definitions were previously fetched, re-render them
        window.dataStorage.getData('data_step_1').then(saved => {
            const panel1 = saved?.panel1
            const panel2 = saved?.panel2
            const panel3 = saved?.panel3;
            const panel4 = saved?.panel4;

            if (panel1) {
                document.getElementById('constructName').value = panel1.constructName || '';
                document.getElementById('initialDefinition').value = panel1.initialDefinition || '';
            }


            // handle panel 2
            if(!panel2){
                domPanel2.classList.add("d-none")
                definitionHistory = []
                resultingDefinitionTextarea.value = "";
                resultingDefinitionContainer.classList.add('d-none'); // Ensure the textarea is visible  
            }else{
                domPanel2.classList.remove("d-none")
                
                // Handle Cards
                if (panel2.definitions) {
                    renderDefinitions();
                } else{
                    definitionHistory = []
                }
                // Handle resulting definition
                if (panel2.resultingDefinition) {
                    resultingDefinitionTextarea.value = panel2.savedDefinition || panel2.resultingDefinition;
                    resultingDefinitionContainer.classList.remove('d-none'); // Ensure the textarea is visible  
                } else {
                    resultingDefinitionTextarea.value = "";
                    resultingDefinitionContainer.classList.add('d-none'); // Ensure the textarea is visible  
                }
            }
            // handle panel 3
            if (panel2 && panel2.savedDefinition) {
                domPanel3.classList.remove('d-none'); // Ensure panel 3 is visible
                
            } else {
                domPanel3.classList.add('d-none'); // Hide panel 3 if no saved definition
            }

            // handle property and entity
            showAISuggestion();
            if (panel3 && panel3.property && panel3.entity) {
                updateRadio(panel3.property, panel3.entity, panel3.propertyExplanation, panel3.entityExplanation);
            } else {
                // hide panel 3 and clear fields
                document.getElementsByName('property').forEach(r => r.checked = false);
                document.getElementById('propertyExplanation').value = '';
                document.getElementsByName('entity').forEach(r => r.checked = false);
                document.getElementById('entityExplanation').value = '';
            }

            // handle panel 4
            if (!panel2 || !panel2.savedDefinition) {
                domPanel4.classList.add('d-none');
                resetPanel4();
            } else {
                domPanel4.classList.remove('d-none');
                loadPanel4();
            }
        });
    }
}



// ***********************************    Panel 1 Functions    ***********************************************

async function saveConstructData() {
    const constructName = document.getElementById('constructName')?.value?.trim();
    const initialDefinition = document.getElementById('initialDefinition')?.value?.trim();
    
    if (!constructName || !initialDefinition) {
        window.displayInfo('warning', 'Please fill in both the construct name and initial definition before saving.');
        return false;
    }

    const constructData = {
        "constructName": constructName,
        "initialDefinition": initialDefinition,
        "timestamp": new Date().toISOString()
    };
    let step1Data = {}
    step1Data.panel1 = constructData; 

    // Store in IndexedDB using the renamed DataStorage
    try {
        await window.dataStorage.storeData(
            'data_step_1',
            step1Data,
            true,
            'Are you sure? This will restart step 1'
        );

        syncData();
        // Data saved successfully
        window.displayInfo('success', 'Construct data saved successfully!');
        // After saving, fetch and display definitions
        getDefinitions();
        return true;
    } catch (error) {
        if (error === 'User cancelled overwrite') {
            // Treat cancellation as successful, non-error
            window.displayInfo('info', 'Data overwrite cancelled; existing data preserved.');
            return true;
        }
        console.error('Error saving construct data:', error);
        window.displayInfo('danger', 'Failed to save construct data. Please try again.');
        return false;
    }
}

// ***********************************    Panel 2 Functions    ***********************************************
definitionHistory = [];
async function getDefinitions(history = []) {
    showLoading();
    const step1Data = await window.dataStorage.getData('data_step_1')
    const constructData = step1Data.panel1;
    const getDefinitionsPrompt = `
    You are assisting with the development of a conceptual definition following MacKenzie et al. (2011), which requires definitions to be clear, concise, theoretically grounded, and distinct from related constructs. Definitions should specify the essential attributes of the construct and its domain (e.g., property type, target entity, dimensionality if mentioned).

    Given the construct name "${constructData.constructName}" and the rough initial definition provided below, retrieve 3–5 concise, relevant academic definitions (maximum 1–2 sentences each) from well-known published literature in this area.

    Construct name:  
    "${constructData.constructName}"

    Rough initial definition:  
    "${constructData.initialDefinition}"

    Instructions:
    - Include author names and publication year in each reference.
    - Output must be valid JSON only — no markdown, no explanation, no formatting wrappers.
    - Return only a JSON array of objects, each with a "reference" and a "definition" key.

    Example output:
    [
    {
        "reference": "AUTHOR, YYYY",
        "definition": "CONCISE DEFINITION HERE"
    }
    ]`

    // Send prompt to chat API and retrieve JSON text
    let responseText;
    try {
        if (history.length > 0) { // If history is provided, include it in the request. This happens when the user has already generated definitions
            response = await window.sendChat("Generate 2 or 3 Definitions more", history);
        }else{ // If no history, use default system prompt
            response = await window.sendChat(getDefinitionsPrompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}]);
        }
        responseText = response[0]; // Get the reply text from the response
        definitionHistory = response[1]; // Store the history for future requests
    } catch (err) {
        console.error('Error fetching definitions:', err);
        window.displayInfo('danger', 'Failed to retrieve definitions. Please try again.');
        return;
    }finally {
        hideLoading();
        setTimeout(() => {
            scrollToElement(document.getElementById("step1panel2"));
        }, 400);
    }
    // Parse JSON response
    let definitions;
    try {
        definitions = JSON.parse(responseText);
    } catch (err) {
        console.error('Could not parse definitions JSON:', err, responseText);
        window.displayInfo('danger', 'Unexpected response format.');
        return;
    }
    
    // store definitions in IndexedDB
    if (!step1Data.panel2) {
        step1Data.panel2 = {};
    }
    if (!step1Data.panel2.definitions) {
        step1Data.panel2.definitions = [];
    }
    const uniqueDefinitions = definitions.filter(newDef => 
        !step1Data.panel2.definitions.some(existingDef => 
            existingDef.reference === newDef.reference && existingDef.definition === newDef.definition
        )
    );
    step1Data.panel2.definitions.push(...uniqueDefinitions);
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Definitions saved');
    // Render definitions
    renderDefinitions(definitions);
}

async function getDefinitionsAgain() {
    const step1Data = await window.dataStorage.getData('data_step_1')
    if (step1Data.panel2.definitions) {
        delete step1Data.panel2.definitions;
        await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
        console.log('Definitions removed');
    }
    // Re-fetch definitions
    definitionHistory = []; // Reset history for new fetch
    await getDefinitions();
}

async function getDefinitionsMore() {
    // Fetch and append more definitions
    await getDefinitions(definitionHistory);
}

// Choose the definition
async function chooseDefinition() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (resultingDefinitionTextarea?.value?.trim()) {
        const userConfirmed = await customConfirm({
        title: '⚠️ Overwrite Definition?',
        message: `This will overwrite the existing definition.<br/>
                    Do you want to continue and replace the current one?`,
        confirmText: 'Yes, overwrite',
        cancelText: 'No, keep it'
        });
        if (!userConfirmed) {
        console.log('User cancelled data storage — existing data preserved');
        return;
        }
    }

    let resultDefinition = "";
    let references = [];
    let displayMessage = "";

    const cards = document.querySelectorAll('#definitionsContainer .card.selected');
    if (cards.length < 1) {
        window.displayInfo('warning', 'Select at least one definition.');
        return;
    }
    // Just selected one Card
    if (cards.length == 1) {
        const card = cards[0];
        references = [card.querySelector('.card-title')?.textContent];
        resultDefinition = card.querySelector('.card-text')?.textContent.trim();
        displayMessage = `Selected definition: ${references}`;
    }
    if (cards.length > 1) {
        // Multiple cards selected, merge their definitions
        // Build a numbered list of selected definitions
        const selectedDefs = Array.from(cards).map(c => c.querySelector('.card-text')?.textContent.trim());
        const definitionsList = selectedDefs
            .map((def, i) => `Definition ${i + 1}: ${def}`)
            .join('\n');
        // Create merge prompt with numbered definitions
        const promptText = `
            You are assisting in the development of a conceptual definition following MacKenzie et al. (2011). According to their guidelines, a strong conceptual definition must be:

                - clear and concise,
                - theoretically grounded and distinct from related constructs,
                - specific about the essential attributes and the domain of the construct (including property type, target entity, and dimensionality, if applicable).

            Your task is to synthesize a definition of the construct "${step1Data.panel1.constructName}" based on the following selected definitions. The resulting definition should integrate their core ideas while adhering to the above criteria.

            These are the selected definitions:
            ${definitionsList}

            Instructions:
                - Focus only on merging and refining the content of these two definitions.
                - Avoid redundancies and ensure theoretical clarity.
            `;
        // Send prompt to chat API and retrieve JSON text
        try {
            showLoading();
            response = await window.sendChat(promptText);
            displayMessage = 'Definitions merged into initial definition.';
            resultDefinition = response[0].trim();
        } catch (error) {
            console.error('Error fetching chat response:', error);
            window.displayInfo('error', 'Failed to merge definitions.');
            return;
        }finally {
            hideLoading();
        }
    }

    // Store all selected definitions
    selectedDefinitions = Array.from(cards).map(card => ({
        "reference": card.querySelector('.card-title')?.textContent,
        "definition": card.querySelector('.card-text')?.textContent.trim()
    }));
    step1Data.panel2.selectedDefinitions = selectedDefinitions;


    // Store the resulting definition in IndexedDB
    step1Data.panel2.resultingDefinition = resultDefinition;
    step1Data.panel2.references = references;
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Resulting definition saved');

    // Display success message and set the resulting definition in the textarea
    window.displayInfo('success', displayMessage);
    resultingDefinitionTextarea.value = resultDefinition; // Set the definition in the textarea
    resultingDefinitionContainer.classList.remove('d-none'); // Ensure the textarea is visible


}

async function saveDefinition() {
    const resultingDefinition = resultingDefinitionTextarea?.value?.trim();
    if (!resultingDefinition) {
        window.displayInfo('warning', 'Please enter a resulting definition before saving.');
        return;
    }
    const step1Data = await window.dataStorage.getData('data_step_1');

    // Check for conflicting definitions
    // console.log(step1Data.panel2.savedDefinition && (step1Data.panel2.savedDefinition !== resultingDefinition));
    // console.log(step1Data.panel2.resultingDefinition && (step1Data.panel2.resultingDefinition !== resultingDefinition));

    let currentDefinition = step1Data.panel2.savedDefinition || step1Data.panel2.resultingDefinition;

     
    if (currentDefinition !== resultingDefinition) {
        const userConfirmed = await customConfirm({
            title: '⚠️ Overwrite Definition?',
            message: `This will overwrite the previously stored definition and any further edits.<br/>
                        Do you want to continue and replace the current one?`,
            confirmText: 'Yes, overwrite',
            cancelText: 'No, keep it'
        });
        if (!userConfirmed) {
        console.log('User cancelled data storage — existing data preserved');
        return;
        }
    }

    if (step1Data.panel2.savedDefinition === resultingDefinition) {
        window.displayInfo('info', "No changes found on Definition.");
        return
    }

    if (step1Data.panel2) {
        step1Data.panel2.savedDefinition = resultingDefinition;
        step1Data.panel2.savedSelectedDefinitions = step1Data.panel2.selectedDefinitions;
    }

    if (step1Data.panel3) {
        delete step1Data.panel3; // Remove panel 3 data if it exists
    }
    
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    await resetPanel4(); // Reset panel 4 data
    console.log('Definition saved');
    

    syncData();

    // Display success message
    window.displayInfo('success', "Definition saved successfully.");
    setTimeout(() => {
        scrollToElement(document.getElementById("step1panel3"));
    }, 400);
}


// Update action buttons based on selection count
function updateActionButtons() {
    const selectedCards = document.querySelectorAll('#definitionsContainer .card.selected');
    const chooseBtn = document.getElementById('chooseDefinitionButton');
    const mergeBtn = document.getElementById('mergeDefinitionsButton');
    if (chooseBtn && mergeBtn && selectedCards.length === 1) {
        chooseBtn.classList.remove('d-none');
        mergeBtn.classList.add('d-none');
        return;
    }
    if (selectedCards.length > 1) {
        mergeBtn.classList.remove('d-none');
        chooseBtn.classList.add('d-none');
        return;
    }
    chooseBtn.classList.add('d-none');
    mergeBtn.classList.add('d-none');
}

// Auto-load data when the page loads (if we're on step 1)
// Function to render definition cards
async function renderDefinitions() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (!step1Data) {
        console.warn('No step 1 data found');
        return;
    }
    if (!step1Data.panel2 || !step1Data.panel2.definitions || step1Data.panel2.definitions.length === 0) {
        console.warn('No panel2 data found in step 1');
        domPanel2.classList.add('d-none');
        return;
    }
    

    domPanel2.classList.remove('d-none'); // Ensure panel 2 is visible

    // Build definitions list, starting with the user's initial definition
    const definitions = [];
    if (step1Data.panel1 && step1Data.panel1.initialDefinition) {
        definitions.push({
            "reference": 'Your Definition',
            "definition": step1Data.panel1.initialDefinition
        });
    }
    // Append any generated definitions
    if (Array.isArray(step1Data.panel2.definitions)) {
        definitions.push(...step1Data.panel2.definitions);
    }
    if (definitions.length === 0) {
        console.warn('No definitions to render');
        return;
    }
    const container = document.getElementById('definitionsContainer');
    if (!container) return;
    container.innerHTML = '';
    
    definitions.forEach(item => {
        const col = document.createElement('div');
        col.className = 'col';
        col.innerHTML = `
            <div class="card border-2 h-100">
                <div class="card-body">
                    <h5 class="card-title text-light">${item.reference}</h5>
                    <p class="card-text text-light">${item.definition}</p>
                </div>
            </div>`;
        // Make the card selectable
        const cardEl = col.querySelector('.card');
        cardEl.style.cursor = 'pointer';
        cardEl.addEventListener('click', () => {
            cardEl.classList.toggle('selected');
            cardEl.classList.toggle('border-primary');
            updateActionButtons();
        });
        // if Card is already selected, add the selected class

        let selectedDefinitions = step1Data.panel2.savedSelectedDefinitions || step1Data.panel2.selectedDefinitions || [];
        if (selectedDefinitions.length > 0) {
            const isSelected = selectedDefinitions.some(def => def.reference === item.reference && def.definition === item.definition);
            if (isSelected) {
                cardEl.classList.add('selected');
                cardEl.classList.add('border-primary');
            }
        }


        container.appendChild(col);
    });
    // Initialize button states
    updateActionButtons();
}





// ***********************************    Panel 3 Functions    ***********************************************

function getSelectedValue(name) {
    const radios = document.getElementsByName(name);
    for (const radio of radios) {
        if (radio.checked) return radio.value;
    }
    return null;
}

async function submitDomain() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    const property = getSelectedValue("property");
    const entity = getSelectedValue("entity");
    const propertyNote = document.getElementById("propertyExplanation").value.trim();
    const entityNote = document.getElementById("entityExplanation").value.trim();

    if (!property || !entity) {
        window.displayInfo('warning', 'Please select both a property and an entity before saving.');
        return;
        
    }

    if (!step1Data.panel3) {
        step1Data.panel3 = {};        
    }
    
    // Store in IndexedDB
    step1Data.panel3.property = property;
    step1Data.panel3.entity = entity;
    step1Data.panel3.propertyExplanation = propertyNote || null;
    step1Data.panel3.entityExplanation = entityNote || null;
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Panel 3 data saved');
    // Display success message
    window.displayInfo('success', 'Construct domain and referent saved successfully.');
    setTimeout(() => {
        scrollToElement(document.getElementById("step1panel4"));
    }, 400);
    // activate panel 4
    domPanel4.classList.remove('d-none');
    loadPanel4();
}

async function getAISuggestion() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    var prompt = `You are assisting with construct development following the guidelines of MacKenzie et al. (2011), who emphasize that a proper conceptual definition must specify:

        1. The conceptual domain or type of property the construct represents — that is, the general kind of phenomenon it refers to. Choose one of the following:
        - "Thought" (e.g., belief, value, intention)
        - "Feeling" (e.g., emotion, attitude)
        - "Perception" (e.g., perceived ease of use, fairness perception)
        - "Action" (e.g., behavior, activity)
        - "Outcome" (e.g., performance, ROI)
        - "Intrinsic Characteristic" (e.g., intelligence, speed, conscientiousness)

        2. The referent entity to which the construct applies — that is, who or what the construct describes. Choose one of the following:
        - "Individual"
        - "Team / Group"
        - "Organization"
        - "Technology / Artifact"
        - "Situation / Task"
        - "Other" (if none of the above apply)

        Given the construct definition below, return:
        - The most appropriate **property** and **entity**
        - A short **justification** for your choices

        Construct definition:
        ${step1Data.panel1.constructName}: "${step1Data.panel2.savedDefinition || step1Data.panel2.resultingDefinition || step1Data.panel1.initialDefinition}".

        Return your answer in strict JSON format:
        {
        "property": "PROPERTY TYPE HERE",
        "entity": "REFERENT ENTITY HERE",
        "justification": "Brief explanation why this property and entity are most appropriate."
        }`;

    try {
        showLoading();
        
        response = await window.sendChat(prompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}]);

        
        responseText = JSON.parse(response[0]); // Get the reply text from the response
    } catch (err) {
        console.error('Error fetching definitions:', err);
        window.displayInfo('error', 'Failed to retrieve definitions. Please try again.');
        return;
    } finally {
        hideLoading();
    }
    window.testing = responseText;

    if (responseText.property && responseText.entity && responseText.justification) {
        // Validate the response structure
        if (typeof responseText.property !== 'string' || typeof responseText.entity !== 'string' || typeof responseText.justification !== 'string') {
            throw new Error('Invalid AI response format');
        }
        let aiResults = {
            "aiProperty": responseText.property.trim(),
            "aiEntity": responseText.entity.trim(),
            "aiJustification": responseText.justification.trim()
        };
        
        // Save AI suggestion into panel3 object
        if (!step1Data.panel3) {
            step1Data.panel3 = {};
        }
        step1Data.panel3.aiProperty = aiResults.aiProperty;
        step1Data.panel3.aiEntity = aiResults.aiEntity;
        step1Data.panel3.aiJustification = aiResults.aiJustification;
        await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
        showAISuggestion();
    }
}

async function showAISuggestion() {
    const step1Data = await window.dataStorage.getData('data_step_1');
        if (!step1Data) {
        console.warn('No step 1 data found');
        return;
    }
    const panel3 = step1Data.panel3;

    if (!panel3 || !panel3.aiProperty || !panel3.aiEntity || !panel3.aiJustification) {
        console.warn('No AI suggestion available. Please generate one first.');
        document.getElementById("aiSuggestion").classList.add("d-none");
        document.getElementById("aiSuggestionText").innerHTML = "";
        return;
    }
    document.getElementById("aiSuggestion").classList.remove("d-none");
    document.getElementById("aiSuggestionText").innerHTML = `<h4>AI Suggestion</h4>
    <strong>Property:</strong> ${panel3.aiProperty}<br>
    <strong>Entity:</strong> ${panel3.aiEntity}<br>
    <strong>Justification:</strong> ${panel3.aiJustification}`;
}

async function takeAISuggestion() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (step1Data.panel3 && step1Data.panel3.property && step1Data.panel3.entity) {
        // If AI suggestion already exists, confirm overwrite
        const userConfirmed = await customConfirm({
            title: '⚠️ Overwrite AI Suggestion?',
            message: `This will overwrite the existing AI suggestion.<br/>
                        Do you want to continue and replace the current one?`,
            confirmText: 'Yes, overwrite',
            cancelText: 'No, keep it'
        });
        if (!userConfirmed) {
            console.log('User cancelled data storage — existing data preserved');
            return;
        }
        
    }
    const property = step1Data.panel3.aiProperty;
    const entity = step1Data.panel3.aiEntity;
    updateRadio(property, entity);
    submitDomain();
}

function updateRadio(property, entity, propertyExplanation = null, entityExplanation = null) {
    // show panel 3
    domPanel3.classList.remove('d-none');
    // set property radio
    const propertyRadios = document.getElementsByName('property');
    propertyRadios.forEach(radio => {
        radio.checked = (radio.value === property);
    });
    // set property explanation
    const propertyNote = document.getElementById('propertyExplanation');
    if (propertyNote) propertyNote.value = propertyExplanation || '';
    // set entity radio
    const entityRadios = document.getElementsByName('entity');
    entityRadios.forEach(radio => {
        radio.checked = (radio.value === entity);
    });
    // set entity explanation
    const entityNote = document.getElementById('entityExplanation');
    if (entityNote) entityNote.value = entityExplanation || '';
}

// ***********************************    Panel 4    ***********************************************

// Panel 4 globals are declared at the top of this file

// Create a new attribute row
// Create a new attribute row, with optional necessity/sufficiency indication
function createAttributeRow(name = '', classification = '', indication = '', core = false) {
    const row = document.createElement('div');
    const coreSwitchId = `coreSwitch_${Math.random().toString(36).slice(2, 11)}`;
    row.className = 'input-group mb-2 attribute-row';
    row.innerHTML = `
        <input type="text" class="form-control attribute-name" placeholder="Attribute name" value="${name}">
        <select class="form-select attribute-classification">
            <option value="" disabled selected>Select classification</option>
            <option value="Common">Common</option>
            <option value="Unique">Unique</option>
            <option value="Both">Both</option>
            <option value="Neither">Neither</option>
        </select>
        <select class="form-select attribute-indication">
            <option value="" disabled selected>Select indication</option>
            <option value="Necessary">Necessary</option>
            <option value="Sufficient">Sufficient</option>
            <option value="Both">Both</option>
            <option value="Neither">Neither</option>
        </select>
        <div class="input-group-text d-flex align-items-center px-3 dark-bg-bs">
            <div class="form-check form-switch mb-0">
                <input class="form-check-input attribute-core me-2" type="checkbox" id="${coreSwitchId}">
                <label class="form-check-label mb-0" for="${coreSwitchId}">Core</label>
            </div>
        </div>
        <button class="btn btn-outline-danger remove-attribute" type="button" >&times;</button>
    `;

    // Set classification, indication, and core flag
    if (classification) row.querySelector('.attribute-classification').value = classification;
    if (indication) row.querySelector('.attribute-indication').value = indication;
    if (core) row.querySelector('.attribute-core').checked = !!core;
    // Remove handler
    row.querySelector('.remove-attribute').addEventListener('click', () => row.remove());
    return row;
}

// Add a blank initial row or from data
function addAttributeRow(name, classification, indication, core = false) {
    const row = createAttributeRow(name, classification, indication, core);
    attributesContainer.appendChild(row);
}

// Handler for Add Attribute button
if (addAttributeButton) {
    addAttributeButton.addEventListener('click', () => addAttributeRow());
}

// Load Panel 4 data into form
async function loadPanel4() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    const panel4 = step1Data?.panel4;
    // Clear existing rows
    attributesContainer.innerHTML = '';
    if (panel4?.attributes?.length) {
        panel4.attributes.forEach(attr => addAttributeRow(attr.name, attr.classification, attr.indication, attr.core));
    } else {
        addAttributeRow();
    }
    // Breadth & Inclusiveness
    const biEl = document.getElementById('breadthInclusivenessInput');
    if (biEl) biEl.value = panel4?.breadthInclusiveness || '';
    // Dimensionality
    if (panel4?.dimensionality) {
        document.getElementsByName('dimensionality').forEach(r => r.checked = (r.value === panel4.dimensionality));
    } else {
        document.getElementsByName('dimensionality').forEach(r => r.checked = false);
    }
    // Stability via radio toggles
    document.querySelectorAll('input[name="stabilityTime"]').forEach(r => r.checked = (r.value === panel4?.stabilityTime));
    document.querySelectorAll('input[name="stabilitySituation"]').forEach(r => r.checked = (r.value === panel4?.stabilitySituation));
    document.querySelectorAll('input[name="stabilityCases"]').forEach(r => r.checked = (r.value === panel4?.stabilityCases));

    showThemeAISuggestion()
}

// ***********************************    Panel 4 AI Suggestion ***********************************************
// todo maybe add optional Comments on the panel

async function getThemeAISuggestion(tries = 0) {
    const step1Data = await window.dataStorage.getData('data_step_1');
    // todo evtl noch extra kategory by attributen. altes design checken und mackenzie paper
    const panel4 = step1Data.panel4 || {};
    const prompt = `
    
    You are assisting with construct conceptualization following MacKenzie et al. (2011). Your goal is to help the user define the **conceptual theme** of their construct. This includes classifying its defining attributes, evaluating breadth, dimensionality, and stability.
    
    Construct name: ${step1Data.panel1.constructName}  
    Definition: "${step1Data.panel2.savedDefinition || step1Data.panel2.resultingDefinition || step1Data.panel1.initialDefinition}"
    
Use the following rules to classify attributes:

- **Classification (Common | Unique | Both | Neither)**:
  - *Common*: The attribute is shared by many similar or related constructs.
  - *Unique*: The attribute is distinctively associated with this construct.
  - *Both*: The attribute is partly shared and partly distinct.
  - *Neither*: The attribute is not clearly diagnostic for classification.

- **Indication (Necessary | Sufficient | Both | Neither)**:
  - *Necessary*: The construct **cannot exist without** this attribute.
  - *Sufficient*: This attribute **alone guarantees** the presence of the construct.
  - *Both*: The attribute is individually both necessary and sufficient.
  - *Neither*: The attribute is helpful but not essential or definitive.


Given the construct definition, return:
- A list of 1–7 likely defining **attributes** (name + classification as: Common|Unique|Both|Neither + indication as: Necessary|Sufficient|Both|Neither)
- From the list of attributes, identify the smallest subset that is jointly necessary and sufficient to define the construct according to MacKenzie et al. (2011). This means:
    - If all of these attributes are present, the construct is present.
    - If any of these attributes are absent, the construct is incomplete.
    - this is the **core** of the construct, so mark it as core (true/false).
- An estimate of the construct's **breadth and inclusiveness** in 1 or 2 sentences
- A classification of its **dimensionality** (Unidimensional|Multidimensional)
- An evaluation of its **stability**:
  - Over time: "Stable (trait-like)" | "Variable (state-like)" | "Depends / Not sure"
  - Across situations: "Generalizable" | "Situation-specific" | "Depends / Not sure"
  - Across cases: "Broadly applicable" | "Applies only to specific subgroups" | "Depends / Not sure"
- A brief **justification** for your choices, explaining how they align with the construct's definition and theoretical context.


  Use existing definitions and theoretical context to inform your decisions.
  
  Return your answer in **strict JSON format**:
{
  "attributes": [
    { "name": "AttributeName1", "classification": "CLASSIFICATION HERE", "indication": "INDICATION HERE", "core": CORE STATUS HERE },
    { "name": "AttributeName2", "classification": "CLASSIFICATION HERE", "indication": "INDICATION HERE", "core": CORE STATUS HERE },
    ...
  ],
  "breadthInclusiveness": "TEXT HERE",
  "dimensionality": "DIMENSIONALITY HERE",
  "stabilityTime": "TIME STABILITY HERE",
  "stabilitySituation": "SITUATION STABILITY HERE",
  "stabilityCases": "CASES STABILITY HERE",
  "justification": "Brief explanation of your choices."
}


       
        }`;
    try {
        showLoading();
        const response = await window.sendChat(prompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}]);
        
        try{
            const responseJson = JSON.parse(response[0]);
            // Save AI suggestion into aiPanel4
            const { attributes, breadthInclusiveness, dimensionality, stabilityTime, stabilitySituation, stabilityCases, justification } = responseJson;
            if (!attributes || !breadthInclusiveness || !dimensionality || !stabilityTime || !stabilitySituation || !stabilityCases || !justification) {
                throw new Error('Incomplete AI response');
            }
            if (!step1Data.aiPanel4) step1Data.aiPanel4 = {};
            step1Data.aiPanel4.attributes = responseJson.attributes;
            step1Data.aiPanel4.breadthInclusiveness = responseJson.breadthInclusiveness;
            step1Data.aiPanel4.dimensionality = responseJson.dimensionality;
            step1Data.aiPanel4.stabilityTime = responseJson.stabilityTime;
            step1Data.aiPanel4.stabilitySituation = responseJson.stabilitySituation;
            step1Data.aiPanel4.stabilityCases = responseJson.stabilityCases;
            step1Data.aiPanel4.justification = responseJson.justification;
            
            await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
            
            showThemeAISuggestion();
        }
        catch (err) {
            if (tries < 2) {

                console.log(response[0]);
                console.error('Error processing AI response:', err, 'Response: ',response[0]);
                window.displayInfo('info', 'AI suggestion format is invalid. Trying again...');
                return await getThemeAISuggestion(tries + 1);
            }
            window.displayInfo('danger', 'AI suggestion failed after multiple attempts. Please change definition or try again later.');
            return;
        }
    } catch (err) {
        
        console.error('Theme AI suggestion error:', err);
        window.displayInfo('danger', 'Failed to retrieve theme AI suggestion.');
    } finally {
        hideLoading();
    }
}

async function showThemeAISuggestion() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (!step1Data || !step1Data.aiPanel4) {
        console.warn('No AI theme suggestion available. Please generate one first.');
        document.getElementById('aiThemeSuggestion').classList.add('d-none');
        document.getElementById('aiThemeSuggestionText').innerHTML = '';
        return;
    }
    document.getElementById('aiThemeSuggestionText').innerHTML =  `<h4>AI Suggestion</h4>
    <strong>Attributes:</strong> ${step1Data.aiPanel4.attributes.map(attr => `${attr.name} (${attr.classification}|${attr.indication}|${attr.core?"Core":"Not Core"})`).join(', ')}<br>
    <strong>Breadth & Inclusiveness:</strong> ${step1Data.aiPanel4.breadthInclusiveness}<br>
    <strong>Dimensionality:</strong> ${step1Data.aiPanel4.dimensionality}<br>
    <strong>Stability (Time):</strong> ${step1Data.aiPanel4.stabilityTime}<br>
    <strong>Stability (Situation):</strong> ${step1Data.aiPanel4.stabilitySituation}<br>
    <strong>Stability (Cases):</strong> ${step1Data.aiPanel4.stabilityCases}<br><br>
    <strong>Justification:</strong> ${step1Data.aiPanel4.justification}`;
    document.getElementById('aiThemeSuggestion').classList.remove('d-none');
}

async function takeThemeAISuggestion() {
    const step1Data = await window.dataStorage.getData('data_step_1');   
    
    if (!step1Data || !step1Data.aiPanel4) {
        console.warn(step1Data.aiPanel4);
        
        window.displayInfo('warning', 'No AI theme suggestion available. Please generate one first.');
        return;
    }

    if (step1Data.panel4){
        // If panel4 already exists, confirm overwrite
        const userConfirmed = await customConfirm({
            title: '⚠️ Overwrite AI Theme Suggestion?',
            message: `This will overwrite the existing theme data.<br/>
                        Do you want to continue and replace the current one?`,
            confirmText: 'Yes, overwrite',
            cancelText: 'No, keep it'
        });
        if (!userConfirmed) {
            console.log('User cancelled data storage — existing data preserved');
            return;
        }
    }

    let copy = {...step1Data.aiPanel4} || null;
    if (copy) {
        delete copy.justification;
    }
    step1Data.panel4 = copy;
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);

    // Load attributes
    loadPanel4().then(() => {
        saveTheme();
    });
}

// Save Panel 4 data
async function saveTheme() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (!step1Data.panel4) step1Data.panel4 = {};
    // Attributes
    // Collect attributes including indication
    const attrs = Array.from(attributesContainer.querySelectorAll('.attribute-row')).map(row => ({
        name: row.querySelector('.attribute-name').value.trim(),
        classification: row.querySelector('.attribute-classification').value,
        indication: row.querySelector('.attribute-indication').value,
        core: row.querySelector('.attribute-core').checked
    })).filter(a => a.name);
    step1Data.panel4.attributes = attrs;
    // Breadth & Inclusiveness
    step1Data.panel4.breadthInclusiveness = document.getElementById('breadthInclusivenessInput')?.value.trim() || null;
    // Dimensionality
    step1Data.panel4.dimensionality = (() => {
        const sel = document.querySelector('input[name="dimensionality"]:checked');
        return sel ? sel.value : null;
    })();
    // Stability via radios
    step1Data.panel4.stabilityTime = document.querySelector('input[name="stabilityTime"]:checked')?.value || null;
    step1Data.panel4.stabilitySituation = document.querySelector('input[name="stabilitySituation"]:checked')?.value || null;
    step1Data.panel4.stabilityCases = document.querySelector('input[name="stabilityCases"]:checked')?.value || null;

    // Ensure all required data is present before saving
    if (!step1Data.panel4.attributes.length) {
        window.displayInfo('warning', 'Please add at least one attribute before saving.');
        return;
    }
    if (!step1Data.panel4.breadthInclusiveness) {
        window.displayInfo('warning', 'Please provide breadth and inclusiveness information before saving.');
        return;
    }
    if (!step1Data.panel4.dimensionality) {
        window.displayInfo('warning', 'Please select dimensionality before saving.');
        return;
    }
    if (!step1Data.panel4.stabilityTime || !step1Data.panel4.stabilitySituation || !step1Data.panel4.stabilityCases) {
        window.displayInfo('warning', 'Please complete all stability fields before saving.');
        return;
    }
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    window.displayInfo('success', 'Conceptual theme saved successfully.');
}

async function resetPanel4() {
    // Clear all attributes
    attributesContainer.innerHTML = '';
    // Reset other fields
    document.getElementById('breadthInclusivenessInput').value = '';
    document.querySelectorAll('input[name="dimensionality"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="stabilityTime"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="stabilitySituation"]').forEach(r => r.checked = false);
    document.querySelectorAll('input[name="stabilityCases"]').forEach(r => r.checked = false);
    // Hide AI suggestion
    document.getElementById('aiThemeSuggestion').classList.add('d-none');

    const step1Data = await window.dataStorage.getData('data_step_1');
    if (!step1Data) {
        console.warn('No step 1 data found');
        return;
    }
    if (step1Data.panel4) {
        delete step1Data.panel4; // Remove panel 4 data
    }
    if (step1Data.aiPanel4) {
        delete step1Data.aiPanel4; // Remove AI theme suggestion data
    }
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Panel 4 data reset');
}






