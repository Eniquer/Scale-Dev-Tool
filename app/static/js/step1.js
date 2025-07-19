
// Make functions available globally
window.saveConstructData = saveConstructData;
window.getDefinitions = getDefinitions;
window.getDefinitionsAgain = getDefinitionsAgain;
window.getDefinitionsMore = getDefinitionsMore;
window.chooseDefinition = chooseDefinition;
window.mergeDefinitions = mergeDefinitions;

// ***********************************    Panel 1 Functions    ***********************************************

async function saveConstructData() {
    const constructName = document.getElementById('constructName')?.value?.trim();
    const initialDefinition = document.getElementById('initialDefinition')?.value?.trim();
    
    if (!constructName || !initialDefinition) {
        window.displayInfo('warning', 'Please fill in both the construct name and initial definition before saving.');
        return false;
    }

    const constructData = {
        constructName: constructName,
        initialDefinition: initialDefinition,
        timestamp: new Date().toISOString()
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
// todo include own definition
definitionHistory = [];
async function getDefinitions(history = []) {
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
    if (!step1Data.definitions) {
        step1Data.definitions = [];
    }
    const uniqueDefinitions = definitions.filter(newDef => 
        !step1Data.definitions.some(existingDef => 
            existingDef.reference === newDef.reference && existingDef.definition === newDef.definition
        )
    );
    step1Data.definitions.push(...uniqueDefinitions);
    await window.dataStorage.storeData('data_step_1', { ...step1Data }, false);
    console.log('Definitions saved');
    // Render definitions
    renderDefinitions(definitions);
}

async function getDefinitionsAgain() {
    const step1Data = await window.dataStorage.getData('data_step_1')
    if (step1Data.definitions) {
        delete step1Data.definitions;
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

// Choose a single selected definition
function chooseDefinition() {
    const card = document.querySelector('#definitionsContainer .card.selected');
    if (!card) {
        window.displayInfo('warning', 'Please select one definition first.');
        return;
    }
    const reference = card.querySelector('.card-title')?.textContent;
    window.displayInfo('success', `Selected definition: ${reference}`);
    // TODO: further processing of the chosen definition
}

// Merge multiple selected definitions into the initial definition textarea
function mergeDefinitions() {
    const cards = document.querySelectorAll('#definitionsContainer .card.selected');
    if (cards.length < 2) {
        window.displayInfo('warning', 'Select at least two definitions to merge.');
        return;
    }
    const mergedText = Array.from(cards)
        .map(c => c.querySelector('.card-text')?.textContent.trim())
        .join(' ');
    window.displayInfo('success', 'Definitions merged into initial definition.');
}


// Update action buttons based on selection count
function updateActionButtons() {
    const selectedCards = document.querySelectorAll('#definitionsContainer .card.selected');
    const chooseBtn = document.getElementById('chooseDefinitionButton');
    const mergeBtn = document.getElementById('mergeDefinitionsButton');
    if (chooseBtn) {
        chooseBtn.disabled = selectedCards.length !== 1;
    }
    if (mergeBtn) {
        mergeBtn.disabled = selectedCards.length < 2;
    }
}

// Auto-load data when the page loads (if we're on step 1)
// Function to render definition cards
async function renderDefinitions() {
    const step1Data = await window.dataStorage.getData('data_step_1');
    if (!step1Data || !step1Data.definitions) {
        console.warn('No definitions found in step 1 data');
        return;
    }
    const definitions = step1Data.definitions;
    const container = document.getElementById('definitionsContainer');
    if (!container) return;
    container.innerHTML = '';
    definitions.forEach(item => {
        const col = document.createElement('div');
        col.className = 'col';
        col.innerHTML = `
            <div class="card bg-secondary h-100">
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
        container.appendChild(col);
    });
    // Initialize button states
    updateActionButtons();
}
// Auto-load data and existing definitions on page load
document.addEventListener('DOMContentLoaded', function() {
    if (document.getElementById('constructName') && document.getElementById('initialDefinition')) {
        // If definitions were previously fetched, re-render them
        window.dataStorage.getData('data_step_1').then(saved => {
            if (saved && saved.definitions) {
                renderDefinitions(saved.definitions);
            }
        });
    }
});
