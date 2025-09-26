

// save buttons
const saveBtns = {
        "1": document.getElementById('saveContinueButton'),
        "2": document.getElementById('saveDefinitionButton'),
        "3": document.getElementById('submitDomainButton'),
        "4": document.getElementById('saveThemeButton'),
        "5": document.getElementById('saveSubdimensionsButton')
}

const domPanel1 = document.getElementById('step1panel1');
const domPanel2 = document.getElementById('step1panel2');
const domPanel3 = document.getElementById('step1panel3');
const domPanel4 = document.getElementById('step1panel4');
const domPanel5 = document.getElementById('step1panel5');
const resultingDefinitionContainer = document.getElementById('resultingDefinitionContainer');
const resultingDefinitionTextarea = document.getElementById('resultingDefinitionTextarea');
const addAttributeButton = document.getElementById('addAttributeButton');
const attributesContainer = document.getElementById('attributesContainer');
const subdimensionsContainer = document.getElementById('subdimensionsContainer');
// Available theme attributes from panel4
let availableAttributes = [];
const addSubdimensionButton = document.getElementById('addSubdimensionButton');




// ***********************************    Auto-load Data    ***********************************************

document.addEventListener("DOMContentLoaded", () => syncData());
syncData = async function () {
    if (document.getElementById('constructName') && document.getElementById('initialDefinition')) {
        // If definitions were previously fetched, re-render them
        const saved = await window.dataStorage.getData('data_step_1')
            const panel1 = saved?.panel1
            const panel2 = saved?.panel2
            const panel3 = saved?.panel3;
            const panel4 = saved?.panel4;
            const panel5 = saved?.panel5;

            if (panel1) {
                document.getElementById('constructName').value = panel1.constructName || '';
                document.getElementById('initialDefinition').value = panel1.initialDefinition || '';
            } else {
                document.getElementById('constructName').value = '';
                document.getElementById('initialDefinition').value = '';
            }
            // handle panel 2
            if(!panel2){
                domPanel2.classList.add("d-none")
                resultingDefinitionTextarea.value = "";
                resultingDefinitionContainer.classList.add('d-none'); // Ensure the textarea is visible  
            }else{
                domPanel2.classList.remove("d-none")
                
                // Handle Cards
                if (panel2.definitions) {
                    renderDefinitions();
                } 
                // Handle resulting definition
                if (panel2.resultingDefinition) {
                    resultingDefinitionTextarea.value = panel2.savedDefinition || panel2.resultingDefinition;
                    resultingDefinitionContainer.classList.remove('d-none'); // Ensure the textarea is visible  
                } else {
                    resultingDefinitionTextarea.value = "";
                    resultingDefinitionContainer.classList.add('d-none'); // Ensure the textarea isn't visible
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

            // handle panel 5 (only if multidimensional)
            if (panel4 && panel4.dimensionality === "Multidimensional") {
                domPanel5.classList.remove('d-none');
                // Load stored subdimensions 
                subdimensions = panel5?.subdimensions || [{id:genSubdimensionId(), name: '', definition: '', attributes: [] }];
                renderSubdimensions();
                if (panel5?.subdimensions && panel5.subdimensions.length > 0 && panel3) {
                    // If subdimensions exist
                    continueBtn.classList.remove("d-none")
                }else{
                    continueBtn.classList.add("d-none")
                }
            }
            else { // if not panel4 or not multidimensional
                if(panel4?.dimensionality === "Unidimensional" && panel3) {
                    continueBtn.classList.remove("d-none")
                }else{
                    continueBtn.classList.add("d-none")
                }
                resetPanel5();
                domPanel5.classList.add('d-none');

            }

            emitDataChanged();
    }
}



// ***********************************    Panel 1 Functions    ***********************************************

async function saveConstructData(dontSave = false) {
    const constructName = document.getElementById('constructName')?.value?.trim();
    const initialDefinition = document.getElementById('initialDefinition')?.value?.trim();
    
    
    const constructData = {
        "constructName": constructName,
        "initialDefinition": initialDefinition,
        "timestamp": new Date().toISOString()
    };
    let step1Data = {}
    step1Data.panel1 = constructData;
    
    if (dontSave) {
        delete step1Data.panel1.timestamp
        return {"data":{...step1Data.panel1}, "empty": !constructName && !initialDefinition}; // Return data without saving
    }
    if (!initialDefinition) {
        const userConfirmed = await customConfirm({
                title: '⚠️ Leave Definition Empty?',
                message: `Are you sure?`,
                confirmText: 'Yes, leave it empty',
                cancelText: 'No, add definition'
        });
        if (!userConfirmed) {
        console.log('User cancelled data storage — existing data preserved');
        emitDataChanged()
        return;
        } else {
            step1Data.panel1.initialDefinition = 'no definition provided'; // Set a placeholder if the user confirms leaving it empty
        }
    }

    
    if (!constructName) {
        window.displayInfo('warning', 'Please fill in the construct name before saving.');
        emitDataChanged()
        return false;
    }
    // Store in IndexedDB using the renamed DataStorage
    try {
        const storedStep1Data = await window.dataStorage.getData('data_step_1')
        
        if (storedStep1Data.panel1) {
            const userConfirmed = await customConfirm({
                title: '⚠️ Start Over?',
                message: `Are you sure? This will restart step 1`,
                confirmText: 'Yes, overwrite',
                cancelText: 'No, keep it'
            });
            if (!userConfirmed) {
                console.log('User cancelled data storage — existing data preserved');
                emitDataChanged()
                return;
            }
        }
        await window.dataStorage.storeData('data_step_1', step1Data, false);

        projects.changeProjectName(constructName); // Update project name in ProjectManager
        syncData();
        // Data saved successfully
        window.displayInfo('success', 'Construct data saved successfully!');
        // After saving, fetch and display definitions
        getDefinitions();
        emitDataChanged()
        return true;
    } catch (error) {
        if (error === 'User cancelled overwrite') {
            // Treat cancellation as successful, non-error
            window.displayInfo('info', 'Data overwrite cancelled; existing data preserved.');
            emitDataChanged()
            return true;
        }
        console.error('Error saving construct data:', error);
        window.displayInfo('danger', 'Failed to save construct data. Please try again.');
        emitDataChanged()
        return false;
    }
}

// ***********************************    Panel 2 Functions    ***********************************************
async function getDefinitions(forceNewDefs = false) {
    const step1Data = await window.dataStorage.getData('data_step_1')
    const constructData = step1Data.panel1;
    const getDefinitionsPrompt = `
    You are assisting with the development of a conceptual definition following MacKenzie et al. (2011), which requires definitions to be clear, concise, theoretically grounded, and distinct from related constructs. Definitions should specify the essential attributes of the construct and its domain (e.g., property type, target entity, dimensionality if mentioned).

    Given the construct name "${constructData.constructName}" and the rough initial definition provided below, retrieve 3-5 concise, relevant academic definitions (maximum 1-2 sentences each) from well-known published literature in this area. Additionally include 1-2 definitions of closely related constructs that capture similar concepts. You don't have to be limited to the exact construct name, but ensure the definitions are relevant to the construct's core idea.

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
        showLoading();
        let generatedDefinitions = step1Data.panel2?.definitions || [];
        if (generatedDefinitions.length > 0 && !forceNewDefs) { // If definitions is provided, include it in the request. This happens when the user has already generated definitions
            let fakeHistory = [
                {
                    "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers.",
                    "role": "system"
                },
                {
                    "content": getDefinitionsPrompt,
                    "role": "user"
                },
                {
                    "content": "These definitions are already existent: "+ JSON.stringify(step1Data.panel2.definitions),
                    "role": "system"
                }
            ]
            response = await window.sendChat(" Generate 2 or 3 different definitions: ", fakeHistory, "search");
        }else{ // If no history, use default system prompt
            response = await window.sendChat(getDefinitionsPrompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}],"search");
        }
        responseText = response[0]; // Get the reply text from the response
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
        if (definitions.length === 0) {
            throw new Error('Your query returned no results.');
            
        }
    } catch (err) {
        console.error('Could not parse definitions JSON:', err, responseText);
        window.displayInfo('danger', err.message);
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
    await getDefinitions(true);
}

async function getDefinitionsMore() {
    // Fetch and append more definitions
    await getDefinitions();
}

// Choose the definition
async function chooseDefinition() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    

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
        if (resultingDefinitionTextarea?.value?.trim() === resultDefinition) {
            displayMessage = `No changes detected. Selected definition: ${references}`;
        }
    }
    if ((resultingDefinitionTextarea?.value?.trim() && resultingDefinitionTextarea.value.trim() !== resultDefinition) || (cards.length > 1 && resultingDefinitionTextarea?.value?.trim() !== "")) {
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

            Your task is to synthesize a definition of the construct "${step1Data.panel1.constructName}" based on the following selected definitions. The resulting definition should integrate their core ideas while adhering to the above criteria.

            These are the selected definitions:
            ${definitionsList}

            Instructions:
                - Focus only on merging and refining the content of these definitions.
                - Avoid redundancies and ensure theoretical clarity.
            `;
        // Send prompt to chat API and retrieve JSON text
        try {
            showLoading();
            response = await window.sendChat(promptText);
            displayMessage = 'Definitions merged.';
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
    emitDataChanged();
    console.log('Resulting definition saved');

    // Display success message and set the resulting definition in the textarea
    window.displayInfo('info', displayMessage);
    resultingDefinitionTextarea.value = resultDefinition; // Set the definition in the textarea
    resultingDefinitionContainer.classList.remove('d-none'); // Ensure the textarea is visible


}

async function saveDefinition(dontSave = false) {
    const resultingDefinition = resultingDefinitionTextarea?.value?.trim();
    

    
    const step1Data = await window.dataStorage.getData('data_step_1');
    const isSavedDefinition = !!step1Data?.panel2?.savedDefinition;


    // Check for conflicting definitions
    const currentDefinition = step1Data?.panel2?.savedDefinition || step1Data?.panel2?.resultingDefinition;
    const prevDefinition = step1Data?.panel2?.savedDefinition;


    if (step1Data?.panel2) {
        step1Data.panel2.savedDefinition = resultingDefinition;
        step1Data.panel2.savedSelectedDefinitions = step1Data.panel2.selectedDefinitions;
    }


    if(dontSave) {
        return {"data":{...step1Data.panel2}, "empty": !resultingDefinition}; // Return data without saving
    }

    if (!resultingDefinition) {
        window.displayInfo('warning', 'Please enter a resulting definition before saving.');
        emitDataChanged()
        return;
    }
    if (prevDefinition === resultingDefinition) {
        window.displayInfo('info', "No changes found on Definition.");
        emitDataChanged()
        return
    }
    if(isSavedDefinition){
        const userConfirmed = await customConfirm({
            title: '⚠️ Restart from here?',
            message: `Do you want to restart and delete all further edits?`,
            confirmText: 'Yes, restart from here',
            cancelText: 'No, just change definition'
        });
        if (userConfirmed) {
            if (step1Data?.panel3) {
                delete step1Data.panel3; // Remove panel 3 data if it exists
            }
            await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
            await resetPanel4(); // Reset panel 4 data
            await resetPanel5(); // Reset panel 5 data
            console.log('User decided to delete and restart from here');
            setTimeout(() => {
                scrollToElement(document.getElementById("step1panel3"));
            }, 400);
        }
    }else{
        console.log("no previous definition, creating new one");
        setTimeout(() => {
            scrollToElement(document.getElementById("step1panel3"));
        }, 400);
    }
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    emitDataChanged()
    console.log('Definition saved');

    syncData();

    // Display success message
    window.displayInfo('success', "New Definition saved successfully.");
    emitDataChanged()
    return;
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

async function saveDomainData(dontSave = false) {
    const step1Data = await window.dataStorage.getData('data_step_1');
    const property = getSelectedValue("property");
    const entity = getSelectedValue("entity");
    const propertyNote = document.getElementById("propertyExplanation").value.trim();
    const entityNote = document.getElementById("entityExplanation").value.trim();

    
    if (!step1Data.panel3) {
        step1Data.panel3 = {};        
    }
    
    // Store in IndexedDB
    step1Data.panel3.property = property;
    step1Data.panel3.entity = entity;
    step1Data.panel3.propertyExplanation = propertyNote || null;
    step1Data.panel3.entityExplanation = entityNote || null;
    if (dontSave) return {"data":{...step1Data.panel3}, "empty": !property && !entity && !step1Data.panel3.propertyExplanation && !step1Data.panel3.entityExplanation}; // Return data without saving

    
    if (!property || !entity) {
        window.displayInfo('warning', 'Please select both a property and an entity before saving.');
        return;
        
    }
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Panel 3 data saved');
    // Display success message
    window.displayInfo('success', 'Construct domain and referent saved successfully.');
    if (!step1Data.panel4) {
        setTimeout(() => {
            scrollToElement(document.getElementById("step1panel4"));
        }, 400);
    }
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
    panelData = await saveDomainData(true); // Get the current panel 3 data without saving
    if ((step1Data.panel3 && step1Data.panel3.property && step1Data.panel3.entity)|| panelData.data.property || panelData.data.entity || panelData.data.propertyExplanation || panelData.data.entityExplanation) {
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
async function loadPanel4(data = null) {
    const step1Data = await window.dataStorage.getData('data_step_1');
    let panel4 = data || step1Data?.panel4;

    // Clear existing rows
    attributesContainer.innerHTML = '';

    if (panel4?.attributes.length) {
        panel4?.attributes.forEach(attr => addAttributeRow(attr.name, attr.classification, attr.indication, attr.core));
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


// Save Panel 4 data
async function saveTheme(dontSave = false) {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (!step1Data.panel4) step1Data.panel4 = {};
    // Attributes
    // Collect attributes including indication
    const attrs = Array.from(attributesContainer.querySelectorAll('.attribute-row')).map(row => ({
        name: row.querySelector('.attribute-name').value.trim(),
        classification: row.querySelector('.attribute-classification').value,
        indication: row.querySelector('.attribute-indication').value,
        core: row.querySelector('.attribute-core').checked
    })).filter(a => a.name); // Filter out empty attributes

    const prev = step1Data.panel4?.attributes || [];
    // simplest deep-compare for JSON‐serializable arrays:
    
    let resetP5 = JSON.stringify(attrs) !== JSON.stringify(prev);



    step1Data.panel4.attributes = attrs;
    // Breadth & Inclusiveness
    step1Data.panel4.breadthInclusiveness = document.getElementById('breadthInclusivenessInput')?.value.trim() || null;
    // Dimensionality
    const prevDimensionality = step1Data?.panel4?.dimensionality;
    step1Data.panel4.dimensionality = (() => {
        const sel = document.querySelector('input[name="dimensionality"]:checked');
        return sel ? sel.value : null;
    })();
    if (prevDimensionality !== step1Data.panel4.dimensionality) resetP5 = true; // If dimensionality changed, reset panel 5
    // Stability via radios
    step1Data.panel4.stabilityTime = document.querySelector('input[name="stabilityTime"]:checked')?.value || null;
    step1Data.panel4.stabilitySituation = document.querySelector('input[name="stabilitySituation"]:checked')?.value || null;
    step1Data.panel4.stabilityCases = document.querySelector('input[name="stabilityCases"]:checked')?.value || null;

    if (dontSave) return {"data":{...step1Data.panel4}, "empty": 
        !step1Data.panel4.stabilitySituation && 
        !step1Data.panel4.stabilityCases && 
        !step1Data.panel4.stabilityTime && 
        !step1Data.panel4.breadthInclusiveness && 
        !step1Data.panel4.dimensionality && 
        step1Data.panel4.attributes.length === 0 
    }; // Return data without saving
    emitDataChanged();  
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

    const storedData = await window.dataStorage.getData('data_step_1');

    if (storedData.panel4) {
        let messageText = "This will overwrite any stored theme data.<br/>Do you want to continue?.";
        if (resetP5 && prevDimensionality === "Multidimensional"){
            messageText = "You have changed the attributes or dimensionality of the construct. This will reset Panel 5 and all its data.";
        } 

        // If panel4 already exists, confirm overwrite
        const userConfirmed = await customConfirm({
            title: '⚠️ Overwrite stored Data?',
            message: messageText,
            confirmText: 'Yes, overwrite',
            cancelText: 'No, keep it'
        });
        if (!userConfirmed) {
            console.log('User cancelled data storage — existing data preserved');
            emitDataChanged()
            return;
        }
    }
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    window.displayInfo('success', 'Conceptual theme saved successfully.');
    if (resetP5) {
            await resetPanel5(); // Reset panel 5 if attributes change
        }
    syncData();
    

    setTimeout(() => {
        if (!document.getElementById("continueStep1Btn").classList.contains("d-none")) {
            scrollToElement(document.getElementById("continueStep1Btn"));
        }
    }, 400);
    if (!step1Data.panel5) {
        setTimeout(() => {
            scrollToElement(document.getElementById("step1panel5"));
        }, 400);
    }
    emitDataChanged();
}
async function resetPanel4() {
    console.log('Resetting Panel 4 data');
    
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

// ***********************************    Panel 4 AI Suggestion ***********************************************
// todo MAYBE: add optional Comments on the panel

async function getThemeAISuggestion(tries = 0) {
    const step1Data = await window.dataStorage.getData('data_step_1');
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
- A list of 1-7 likely defining **attributes** (name + classification as: Common|Unique|Both|Neither + indication as: Necessary|Sufficient|Both|Neither)
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
    { "name": "AttributeName1", "classification": "CLASSIFICATION HERE", "indication": "INDICATION HERE", "core": "CORE STATUS HERE" },
    { "name": "AttributeName2", "classification": "CLASSIFICATION HERE", "indication": "INDICATION HERE", "core": "CORE STATUS HERE" },
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
        const response = await window.sendChat(prompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}],"search");
        
        try{
            const match = response[0].match(/```json\s*({[\s\S]*?})\s*```/);
            let responseJson = null;
            if (match) {
                responseJson = JSON.parse(match[1]);
            } else {
                responseJson = JSON.parse(response[0]);
            }
            // Save AI suggestion into aiPanel4
            const { attributes, breadthInclusiveness, dimensionality, stabilityTime, stabilitySituation, stabilityCases, justification } = responseJson;
            if (!attributes || !breadthInclusiveness || !dimensionality || !stabilityTime || !stabilitySituation || !stabilityCases || !justification) {
                throw new Error('Incomplete AI response');
            }
            if (!step1Data.aiPanel4) step1Data.aiPanel4 = {};
            step1Data.aiPanel4.attributes = attributes;
            step1Data.aiPanel4.breadthInclusiveness = breadthInclusiveness;
            step1Data.aiPanel4.dimensionality = dimensionality;
            step1Data.aiPanel4.stabilityTime = stabilityTime;
            step1Data.aiPanel4.stabilitySituation = stabilitySituation;
            step1Data.aiPanel4.stabilityCases = stabilityCases;
            step1Data.aiPanel4.justification = justification;
            
            await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
            
            showThemeAISuggestion();
        }
        catch (err) {
            if (tries < 2) {
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

async function takeThemeAISuggestion(fill= false, onlyAttributes = false) {
    const step1Data = await window.dataStorage.getData('data_step_1');   
    
    if (!step1Data || !step1Data.aiPanel4) {
        console.warn(step1Data.aiPanel4);
        
        window.displayInfo('warning', 'No AI theme suggestion available. Please generate one first.');
        return;
    }
    let dataPanel4 = await saveTheme(true) 
    dataPanel4 = dataPanel4.data;

    

    function isPanelEmpty(panel) {
        return !panel || 
            (!panel.attributes || panel.attributes.length === 0) &&
            !panel.breadthInclusiveness &&
            !panel.dimensionality &&
            !panel.stabilityTime &&
            !panel.stabilitySituation &&
            !panel.stabilityCases;
    }

    if (!isPanelEmpty(dataPanel4) && !fill && !onlyAttributes) {
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

    if (fill) {
        // Collect attributes including indication
        dataPanel4.attributes = dataPanel4.attributes.length === 0 ? [...(dataPanel4.attributes|| []), ...(step1Data?.aiPanel4?.attributes || [])] : dataPanel4.attributes;
        dataPanel4.breadthInclusiveness = dataPanel4.breadthInclusiveness || step1Data?.aiPanel4?.breadthInclusiveness || '';
        dataPanel4.dimensionality = dataPanel4.dimensionality || step1Data?.aiPanel4?.dimensionality || '';
        dataPanel4.stabilityTime = dataPanel4.stabilityTime || step1Data?.aiPanel4?.stabilityTime || '';
        dataPanel4.stabilitySituation = dataPanel4.stabilitySituation || step1Data?.aiPanel4?.stabilitySituation || '';
        dataPanel4.stabilityCases = dataPanel4.stabilityCases || step1Data?.aiPanel4?.stabilityCases || '';

        // Load attributes
        loadPanel4({...dataPanel4});

        return;
    }
    if(onlyAttributes){
        // Only save attributes, no other data
        dataPanel4.attributes = [...(dataPanel4.attributes|| []), ...(step1Data?.aiPanel4?.attributes || [])];
        // Load attributes
        loadPanel4({...dataPanel4});
        return
    }

        
        let copy = {...step1Data.aiPanel4} || null;
        if (copy) {
            delete copy.justification;
        }
        step1Data.panel4 = copy;
        loadPanel4({...copy})

}


// ***********************************    Panel 5: Subdimensions    ***********************************************

// Panel 5 globals
let subdimensions = [];
let allAttrs = [];

// Helper: derive a short human-friendly code from a subdimension name
function deriveSubdimensionCode(name) {
    if (!name) return '';
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

// Ensure a code is unique among current subdimensions (case-insensitive); if not, append number suffix
function ensureUniqueSubdimCode(baseCode, ignoreIndex = -1) {
    if (!baseCode) baseCode = 'SD';
    const existing = new Set();
    subdimensions.forEach((sd, i) => {
        if (i === ignoreIndex) return;
        if (sd.code) existing.add(sd.code.toUpperCase());
    });
    let candidate = baseCode.toUpperCase();
    if (!existing.has(candidate)) return candidate;
    let n = 2;
    while (existing.has((baseCode + n).toUpperCase())) n++;
    return (baseCode + n).toUpperCase();
}


addSubdimensionButton.addEventListener('click', addSubdimension);

async function renderSubdimensions() {
    const step1Data = await window.dataStorage.getData('data_step_1') || {};
    allAttrs = step1Data?.panel4?.attributes || [];
    subdimensionsContainer.innerHTML = '';
    subdimensions.forEach((sd, idx) => {
        const wrapper = document.createElement('div');
        wrapper.className = 'card mb-3 p-3';
        wrapper.dataset.index = idx;
        // build dropdown options excluding already-selected attributes
        const availableOpts = allAttrs.filter(attrObj => !sd.attributes.includes(attrObj.name));
        const optionsHtml = availableOpts.map(a => `<option value="${a.name}">${a.name}</option>`).join('');
        wrapper.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <h5 class="mb-0">Subdimension ${idx + 1}</h5>
          <button class="btn btn-outline-danger btn-sm" type="button" onclick="deleteSubdimension(${idx})">&times;</button>
        </div>
        <input type="text" class="form-control mb-2" placeholder="Name" id="subdim-name-${idx}" value="${sd.name || ''}" />
        <input type="text" class="form-control mb-2" placeholder="Short ID" id="subdim-code-${idx}" value="${sd.code || ''}" maxlength="10" />
        <textarea class="form-control mb-2" placeholder="Definition" id="subdim-def-${idx}" rows="3">${sd.definition || ''}</textarea>
        <div id="subattrs-${idx}" class="mb-2"></div>
        <div class="input-group mb-2">
            <select id="subdim-select-${idx}" class="form-select">
            ${optionsHtml}
            </select>
            <button class="btn btn-outline-secondary" type="button" onclick="addSubAttr(${idx})">
            <i class="bi bi-plus-lg"></i> Add attribute
            </button>
        </div>
        `;
        subdimensionsContainer.appendChild(wrapper);
        // display current attributes as badges
        sd.attributes = sd.attributes || [];
        const attrsDiv = document.getElementById(`subattrs-${idx}`);
        sd.attributes.forEach(attr => {
        // Badge with embedded close button
        const badgeWrapper = document.createElement('span');
        badgeWrapper.className = 'badge bg-secondary me-1 d-inline-flex align-items-center';
        badgeWrapper.textContent = attr;
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-close btn-close-white btn-sm ms-1';
        removeBtn.onclick = () => {
            subdimensions[idx].attributes = subdimensions[idx].attributes.filter(a => a !== attr);
            renderSubdimensions();
        };
        badgeWrapper.appendChild(removeBtn);
        attrsDiv.appendChild(badgeWrapper);
        });
        // Auto-generate code if empty and name exists
        const nameInput = document.getElementById(`subdim-name-${idx}`);
        const codeInput = document.getElementById(`subdim-code-${idx}`);
        nameInput.addEventListener('blur', () => {
            if (!codeInput.value.trim() && nameInput.value.trim()) {
                let base = deriveSubdimensionCode(nameInput.value.trim());
                const unique = ensureUniqueSubdimCode(base, idx);
                codeInput.value = unique;
                subdimensions[idx].code = unique; // sync model
            }
        });
        codeInput.addEventListener('blur', () => {
            let val = codeInput.value.trim().toUpperCase();
            if (!val && nameInput.value.trim()) {
                val = deriveSubdimensionCode(nameInput.value.trim());
            }
            if (val) {
                val = ensureUniqueSubdimCode(val, idx);
                codeInput.value = val;
            }
            subdimensions[idx].code = val; // sync model
        });
    });
    showSubdimAISuggestion()
}

function addSubdimension() {
  subdimensions.push({ id: genSubdimensionId(), code: '', name: '', definition: '', attributes: [] });
  renderSubdimensions();
}

function addSubAttr(subIdx) {
  const selectEl = document.getElementById(`subdim-select-${subIdx}`);
  const val = selectEl.value;
  if (val && !subdimensions[subIdx].attributes.includes(val)) {
    subdimensions[subIdx].attributes.push(val);
    renderSubdimensions();
  }
}

// Delete a subdimension by index
function deleteSubdimension(subIdx) {
  subdimensions.splice(subIdx, 1);
  renderSubdimensions();
}

async function saveSubdimensions(dontSave=false) {
  // collect current values
  subdimensions.forEach((sd, idx) => {
      sd.name = document.getElementById(`subdim-name-${idx}`).value.trim();
      sd.definition = document.getElementById(`subdim-def-${idx}`).value.trim();
      sd.code = document.getElementById(`subdim-code-${idx}`).value.trim().toUpperCase();
      const inputs = Array.from(document.querySelectorAll(`#subattrs-${idx} .badge`));
      sd.attributes = inputs.map(i => i.textContent.trim()).filter(v => v);
      // If code missing but name present, derive it now
      if (!sd.code && sd.name) {
          let base = deriveSubdimensionCode(sd.name);
          sd.code = ensureUniqueSubdimCode(base, idx);
      }
  });
  resultSubdimensions = subdimensions.filter(sd => sd.name || sd.definition || sd.attributes.length > 0);
  // Validate unique codes (ignore blanks on empty rows not saved)
  const codes = {};
  let duplicateCodes = new Set();
  resultSubdimensions.forEach((sd) => {
      if (!sd.code) return; // allow empty until derived
      const key = sd.code.toUpperCase();
      if (codes[key]) duplicateCodes.add(key); else codes[key] = 1;
  });
  if (duplicateCodes.size > 0 && !dontSave) {
      window.displayInfo('warning', `Duplicate Subdimension IDs found: ${Array.from(duplicateCodes).join(', ')}. Please make them unique.`);
      return;
  }
  // save to IndexedDB
  if (dontSave) {
    return {"data":{"subdimensions": [...resultSubdimensions]}, "empty": resultSubdimensions.length === 0}; // Return data without saving

  }
  if (resultSubdimensions.length === 0) {
    window.displayInfo('warning', 'Please add at least one subdimension before saving.');
    return;

    
  }
  const step1Data = await window.dataStorage.getData('data_step_1') || {};
  if (step1Data.panel5) {
    const userConfirmed = await customConfirm({
      title: '⚠️ Overwrite Subdimensions? ',
      message: 'This will overwrite any stored subdimension definitions.<br/>Do you want to continue?',
      confirmText: 'Yes, overwrite',
      cancelText: 'No, keep existing'
    });
    if (!userConfirmed) return;
  }
  
  step1Data.panel5 = {"subdimensions": resultSubdimensions };
  await window.dataStorage.storeData('data_step_1', step1Data, false);
  window.displayInfo('success', 'Subdimensions saved successfully!');
  if (!document.getElementById("continueStep1Btn").classList.contains("d-none")) {
    setTimeout(() => {
        scrollToElement(document.getElementById("continueStep1Btn"));
    }, 400);
  }
}

async function resetPanel5() {
    console.log('Resetting Panel 5 data');

    const step1Data = await window.dataStorage.getData('data_step_1');

    if (step1Data?.panel5) {
        delete step1Data.panel5; // Remove panel 5 data
    }
    if (step1Data?.aiPanel5) {
        delete step1Data.aiPanel5; // Remove AI subdimension suggestion data
    }
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Panel 5 data reset');
  // Clear subdimensions
  subdimensions = [];
  renderSubdimensions();
}

// ***********************************    Panel 5 AI Suggestion ***********************************************

async function getSubdimAISuggestion(tries = 0) {
  const step1Data = await window.dataStorage.getData('data_step_1') || {};
  const prompt = `
You are assisting with construct conceptualization based on MacKenzie et al. (2011). 
Your goal is to identify and define the construct's subdimensions. 

---

### Process You Must Follow

1. **Understand the construct and the multidimensionality**
   - Review the construct's integrated definition and attributes.
   - MacKenzie et al. (2011, p. 300) state: 
     "Many constructs are defined as having multiple, distinct sub-dimensions. 
     If a construct is multidimensional, then it is important to define each of the sub-dimensions 
     with the same care that was used in the case of the focal construct itself."

2. **Apply diagnostic questions** (MacKenzie et al., 2011, p. 301):
   - (a) How distinctive are the essential attributes from each other (apart from their common theme)?
   - (b) Would eliminating any one of them restrict the domain of the construct in a significant way?

3. **Group attributes into subdimensions**
   - Combine attributes into meaningful clusters based on their conceptual similarity.
   - Each subdimension should be conceptually distinct from the others but still aligned with the overall construct.

4. **Define each subdimension**
   - Provide a clear conceptual definition for each subdimension.
   - Assign the attributes that belong to each subdimension.

---
### Input Data

Construct name: **${step1Data.panel1.constructName}**

Construct definition:  
"${step1Data.panel2.savedDefinition || step1Data.panel2.resultingDefinition || step1Data.panel1.initialDefinition}"

Attributes:  
${JSON.stringify(step1Data?.panel4?.attributes, null, 2)}

---

Return your answer in **strict JSON format**:
{
  "diagnostic": {
    "distinctiveness": "Brief answer to diagnostic question (a)",
    "eliminationImpact": "Brief answer to diagnostic question (b)"
  },
  "subdimensions": [
    {
      "name": "Fitting Dimension Name",
      "definition": "Short conceptual definition (1-2 sentences)",
      "attributes": ["Attribute 1", "Attribute 2", "Attribute 3"]
    }
  ],
  "justification": "Explain how the attributes were clustered and why they form a coherent subdimension.",
}`;
  try {
    showLoading();
    const response = await window.sendChat(prompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}],"search");
    try {
        const match = response[0].match(/```json\s*({[\s\S]*?})\s*```/);
        let responseJson = null;
        if (match) {
            responseJson = JSON.parse(match[1]);
        } else {
            responseJson = JSON.parse(response[0]);
        }
        // Save AI suggestion
        const { diagnostic, subdimensions, justification} = responseJson;
        if (!diagnostic || !subdimensions || !justification) {
            throw new Error('Incomplete AI response');
        }
        // Map and assign short codes (unique) for AI-suggested subdimensions
        const seenCodes = new Set();
        let subdimensionsWithId = subdimensions.filter(sd => (sd.name || sd.definition || sd.attributes.length > 0)).map((sd, idx) => {
            const name = sd.name || '';
            let base = deriveSubdimensionCode(name);
            if (!base) base = 'SD';
            let code = base.toUpperCase();
            let cIdx = 2;
            while (seenCodes.has(code)) { code = (base + cIdx).toUpperCase(); cIdx++; }
            seenCodes.add(code);
            return {
                id: sd.id || genSubdimensionId(),
                code,
                name: sd.name,
                definition: sd.definition,
                attributes: sd.attributes
            };
        });
        if(!step1Data.aiPanel5) step1Data.aiPanel5 = {};
        step1Data.aiPanel5.diagnostic = diagnostic;
        step1Data.aiPanel5.subdimensions = subdimensionsWithId;
        step1Data.aiPanel5.justification = justification;
        
        await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
        showSubdimAISuggestion();
    } catch (e) {
         if (tries < 2) {
                console.error('Error processing AI response:', e, 'Response: ',response[0]);
                window.displayInfo('info', 'AI suggestion format is invalid. Trying again...');
                return await getSubdimAISuggestion(tries + 1);
            }
      window.displayInfo('danger', 'AI subdimension suggestion failed to parse.');
      return;
        }
    } catch (err) {
        console.error('Error fetching subdimension AI suggestion:', err);
        window.displayInfo('danger', 'Failed to retrieve AI subdimension suggestion.');
    } finally {
        hideLoading();
    }   
}

/**
 * Display the AI subdimension suggestion UI (Panel 5)
 */
async function showSubdimAISuggestion() {
  const step1Data = await window.dataStorage.getData('data_step_1');
  const container = document.getElementById('aiSubdimSuggestion');
  const textEl = document.getElementById('aiSubdimSuggestionText');
  // Hide if no suggestion
  if (!step1Data?.aiPanel5?.subdimensions) {
    container.classList.add('d-none');
    textEl.innerHTML = '';
    return;
  }
  // Render suggestion
  const suggestion = step1Data.aiPanel5.subdimensions;
  textEl.innerHTML = `<h4>AI Suggestion</h4>
  <strong>Distinctiveness:</strong> ${step1Data.aiPanel5?.diagnostic?.distinctiveness}<br/>
    <strong>Elimination Impact:</strong> ${step1Data.aiPanel5?.diagnostic?.eliminationImpact}<br/>
  <strong>Justification:</strong> ${step1Data.aiPanel5.justification}<hr/>
  `
  + suggestion.map((sd, i) =>
    `<strong>Subdimension ${i+1}</strong>: <em>${sd.name}</em><br/>` +
    `Definition: ${sd.definition}<br/>` +
    `Attributes: ${sd.attributes.join(', ')}<hr/>`
  ).join('');
  container.classList.remove('d-none');
}

/**
 * Take and apply AI subdimension suggestion (Panel 5)
 */
async function takeSubdimAISuggestion(overwrite = true) {
  const step1Data = await window.dataStorage.getData('data_step_1');
  if (!step1Data?.aiPanel5?.subdimensions || !step1Data.aiPanel5.subdimensions.length) {
    window.displayInfo('warning', 'No AI subdimension suggestion available. Please generate one first.');
    return;
  }
  resultSubdimension = await saveSubdimensions(true); // Save current subdimensions to check for changes
  // Confirm overwrite if existing data present
  if ((resultSubdimension.data.subdimensions.length !== 0) && overwrite) {
    const userConfirmed = await customConfirm({
      title: '⚠️ Overwrite Subdimensions? ',
      message: 'This will overwrite any existing subdimension definitions.<br/>Do you want to continue?',
      confirmText: 'Yes, overwrite',
      cancelText: 'No, keep existing'
    });
    if (!userConfirmed) return;
  }
  if (overwrite) {
      subdimensions = step1Data.aiPanel5.subdimensions;
  } else {
      // If not overwriting, just append AI subdimensions
      subdimensions = [...(subdimensions || []), ...(step1Data.aiPanel5.subdimensions || [])];
  }

  // Copy suggestion into panel5 storage
  // Apply to UI
  renderSubdimensions();
}

// ***********************************   Continue to Step 4    ***********************************************#

const continueBtn = document.getElementById('continueStep1Btn');
if (continueBtn) {
    continueBtn.addEventListener('click', async () => {
        const step1Data = await window.dataStorage.getData('data_step_1');
        if (unsavedPanels.length > 0) {
            // Warn user about unsaved changes
            const message = `You have unsaved changes in the following ${unsavedPanels.length == 1 ? 'panel' : 'panels'}: <br><strong>${unsavedPanels.map(panel => panelName[panel]).join('<br>')}</strong><br><br>Do you want to continue and lose these changes?`;
            const userConfirmed = await customConfirm({
                title: '⚠️ Unsaved Changes',
                message: message,
                confirmText: 'Yes, continue',
                cancelText: 'No, go back'
            });
            if (!userConfirmed) {
                console.log('User cancelled navigation — unsaved changes preserved');
                return;
            }
        }
            
        // persist any unsaved data if needed, then navigate:
    // user confirmed via custom dialog -> bypass native beforeunload briefly
    window._bypassUnloadConfirm = true;
    setTimeout(()=>{ window._bypassUnloadConfirm = false; }, 3000);
    window.location.href = '/step/2';
  });
}

// Manage native unload prompt; allow temporary bypass after custom confirmation
window._bypassUnloadConfirm = window._bypassUnloadConfirm || false;
function step1BeforeUnloadHandler(e){
    if (hasUnsavedChangesFlag && !window._bypassUnloadConfirm) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    }
}
window.addEventListener('beforeunload', step1BeforeUnloadHandler);

// warn on navbar navigation
const navbarLinks = document.querySelectorAll('#navbar a');
navbarLinks.forEach(link => {
  link.addEventListener('click', async function(e) {
    if (hasUnsavedChangesFlag) {
      e.preventDefault();
      const targetUrl = this.href;
      const confirmed = await customConfirm({
        title: '⚠️ Unsaved Changes',
        message: 'You have unsaved changes. Do you want to leave this page and lose them?',
        confirmText: 'Yes, leave',
        cancelText: 'No, stay'
      });
            if (confirmed) {
                // Bypass native prompt briefly since user already confirmed
                window._bypassUnloadConfirm = true;
                setTimeout(()=>{ window._bypassUnloadConfirm = false; }, 3000);
                window.location.href = targetUrl;
            }
    }
  });
});


// ***********************************    Save Methods    ***********************************************
const saveMethod = {
            1: saveConstructData,
            2: saveDefinition,
            3: saveDomainData,
            4: saveTheme,
            5: saveSubdimensions
        }

const panelName = {
            "panel1": 'Panel: Construct Name',
            "panel2": 'Panel: Definition',
            "panel3": 'Panel: Conceptual Domain',
            "panel4": 'Panel: Conceptual Theme',
            "panel5": 'Panel: Subdimensions'
        }
async function checkIfSaved(panelId){
    try {
        
        const step1Data = await window.dataStorage.getData('data_step_1');
        
        


        let domVisible = !document.getElementById('step1panel' + panelId).classList.contains("d-none");
        let availableData = await saveMethod[panelId](true); // get data without saving
        let savedData = step1Data[`panel${panelId}`]
        if (panelId == 1) {
            delete savedData?.timestamp
        }
        if (panelId == 2) domVisible = !resultingDefinitionContainer.classList.contains("d-none"); // Panel 2 is special, we check if the resulting definition is visible
        
        // if we can't see the panel. Say it is saved
        if (!domVisible) {
            return true; 
        }
        
        if (savedData === undefined && panelId == 1) {
            if(availableData.data?.constructName == "" && availableData.data?.initialDefinition == "") // wenn beide leer sind, dant ist gesaved
                return true
            return false; 
        }        
        
        if (JSON.stringify(savedData) !== JSON.stringify(availableData.data)) {
            return false;
        }
        return true;
    } catch (error) {
        console.log("couldn't get save data on Panel " + panelId + ": ", error);
        return false;
    }
}

async function checkAllSavedState(){
    results = {}
    for (let index = 1; index <= 5; index++) {
        var isElementSaved = await checkIfSaved(index);
        if (isElementSaved) {
            saveBtns[index.toString()].classList.add('disabled-like');
        }else{
            saveBtns[index.toString()].classList.remove('disabled-like');
        }
        results[`panel${index}`] = isElementSaved;
    }
    return results;
}

async function anyUnsavedChanges() {
    results = {}
    for (let index = 1; index <= 5; index++) {
        panelData = await saveMethod[index](true); // get data without saving
        if (panelData.empty) {
            results[`panel${index}`] = true;
        }else{
            var isElementSaved = await checkIfSaved(index);
            results[`panel${index}`] = isElementSaved;
        }
    }
    unsavedPanels = Object.keys(results).filter(key => !results[key]);
    return Object.values(results).some(v => !v);
}

let unsavedPanels = []


function debounce(fn, delay=300) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(async function () {
            fn(...args);
            // track unsaved edits
            hasUnsavedChangesFlag = await anyUnsavedChanges();
            if (hasUnsavedChangesFlag) {
                continueBtn.classList.add("disabled-like");
            } else {
                continueBtn.classList.remove("disabled-like");
            }
            nextStepBtnThere();

        }, delay);
    };
}

function runDebounce(){
    debounce(checkAllSavedState,300)()
}

document.addEventListener('dataChanged',runDebounce);

function emitDataChanged() {
    document.dispatchEvent(new Event('dataChanged'));
}


// Delegated event listener for input events on inputs, textareas, and selects (handles dynamic elements)
document.addEventListener('input', event => {
    const el = event.target;
    if (el.matches('input, textarea, select')) {
        emitDataChanged();
    }
});

// Delegated event listener for button clicks (handles dynamic buttons)
document.addEventListener('click', event => {
    const btn = event.target.closest('button');
    if (btn) {
        emitDataChanged();
    }
});

document.getElementById("area1").addEventListener("click", emitDataChanged);


// track unsaved edits
window.hasUnsavedChangesFlag = false;



window.nextStepBtnThere = nextStepBtnThere

function nextStepBtnThere(){
    // handle panel 5 (only if multidimensional)
    window.dataStorage.getData('data_step_1').then(saved => {
        const panel3 = saved?.panel3;
        const panel4 = saved?.panel4;
        const panel5 = saved?.panel5;
        
        if (panel4 && panel4?.dimensionality === "Multidimensional") {
            if (panel5?.subdimensions && panel5.subdimensions.length > 0 && panel3 && panel3.property && panel3.entity) {
                // If subdimensions exist
                continueBtn.classList.remove("d-none")
            }else{
                continueBtn.classList.add("d-none")
            }
        }
        else { // if not panel4 or not multidimensional
            if(panel4?.dimensionality === "Unidimensional" && panel3 && panel3.property && panel3.entity) {
                continueBtn.classList.remove("d-none")
            }else{
                continueBtn.classList.add("d-none")
            }
        }
    });
}


async function getAllResults() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    delete step1Data.panel3.aiProperty
    delete step1Data.panel3.aiEntity
    delete step1Data.panel3.aiJustification
    results = {
        "constructName": step1Data?.panel1?.constructName || '',
        "initialDefinition": step1Data?.panel1?.initialDefinition || '',
        "savedDefinition": step1Data?.panel2?.savedDefinition || '',
        "domain": step1Data?.panel3 || {},
        "theme": step1Data?.panel4 || {},
        "subdimensions": step1Data?.panel5?.subdimensions || [],
    };
    return results
}