
// Make functions available globally
window.saveConstructData = saveConstructData;
window.getDefinitions = getDefinitions;
window.getDefinitionsAgain = getDefinitionsAgain;
window.getDefinitionsMore = getDefinitionsMore;
window.chooseDefinition = chooseDefinition;
// window.analyseDefinition = analyseDefinition;

const domPanel1 = document.getElementById('step1panel1');
const domPanel2 = document.getElementById('step1panel2');
const domPanel3 = document.getElementById('step1panel3');
const resultingDefinitionContainer = document.getElementById('resultingDefinitionContainer');
const resultingDefinitionTextarea = document.getElementById('resultingDefinitionTextarea');



// ***********************************    Auto-load Data    ***********************************************

// Auto-load data and existing definitions on page load
document.addEventListener('DOMContentLoaded', syncData);


function syncData() {
    console.log("syncing data");
    
    if (document.getElementById('constructName') && document.getElementById('initialDefinition')) {
        // If definitions were previously fetched, re-render them
        window.dataStorage.getData('data_step_1').then(saved => {
            const panel1 = saved?.panel1
            const panel2 = saved?.panel2
            const panel3 = saved?.panel3;

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
// todo loading animation and remove others while loading
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
        userConfirmed = confirm(
                                `⚠️ Warning: This will overwrite the existing definition.\n\n` +
                                'Do you want to continue and replace the current one?'
                            );
                    
        if (!userConfirmed) {
            console.log(`User cancelled data storage for definition - existing data preserved`);
            return
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
    console.log(selectedDefinitions);


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
    
     
    if (step1Data.panel2.savedDefinition && (step1Data.panel2.savedDefinition !== resultingDefinition) && step1Data.panel2.resultingDefinition && (step1Data.panel2.resultingDefinition !== resultingDefinition)) {
        userConfirmed = confirm(
                                `⚠️ Warning: This will overwrite the previously stored definition and any further edits.\n\n` +
                                'Do you want to continue and replace the current one?'
                            );
                    
        if (!userConfirmed) {
            console.log(`User cancelled data storage for definition - existing data preserved`);
            return
        }
    }

    if (step1Data.panel2.savedDefinition === resultingDefinition) {
        window.displayInfo('info', "No changes found on Definition.");
        return
    }
    step1Data.panel2.savedDefinition = resultingDefinition;

    if (step1Data.panel3) {
        delete step1Data.panel3; // Remove panel 3 data if it exists
    }

    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Definition saved');
    // Sync data to ensure the latest definition is used
    syncData();

    // Display success message
    window.displayInfo('success', "Definition saved successfully.");
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
        if (step1Data.panel2.selectedDefinitions && step1Data.panel2.selectedDefinitions.length > 0) {
            const isSelected = step1Data.panel2.selectedDefinitions.some(def => def.reference === item.reference && def.definition === item.definition);
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
        console.log(response[0]);
        
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
        console.log(aiResults);
        
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
    const panel3 = step1Data.panel3;
    console.log(panel3);

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