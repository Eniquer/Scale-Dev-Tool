import { initAPIKey, storeAPIKey } from './handleAPIKey.js';
window.currentAPIKey_enc = await initAPIKey();
window.initAPIKey = initAPIKey;
// todo MAYBE: add option to modify the prompts

function displayInfo(type = 'info', message = '') {
    // Show success message
    const alertDiv = document.createElement('div');
    let messageStart = type
    if (type == "error") {
        type = "danger"; // Use 'danger' for error messages
    }

    alertDiv.className = `alert alert-${type} alert-dismissible fade show my-3`;
    alertDiv.style.opacity = '0'; // Slightly transparent for better visibility
    alertDiv.style.width = "fit-content"; // Adjust width to fit content
    alertDiv.style.maxWidth = "100%"; // Prevent overflow on small screens
    alertDiv.innerHTML = `

    <strong>${messageStart.charAt(0).toUpperCase() + messageStart.slice(1)}</strong> 
    ${document.createTextNode(message).textContent}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    const container = document.getElementById("displayInfoContainer");
    container.insertBefore(alertDiv, container.firstChild);

    setTimeout(() => {
        alertDiv.style.opacity = '0.9'; // Slightly transparent for better visibility
    }, 10);
    // Auto-remove alert after 4 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.style.opacity = '0'; // Fade out before removing
            setTimeout(() => {
                alertDiv.remove();
            }, 500); // Wait 500ms before starting fade out
        }
    }, 4000);
}
window.displayInfo = displayInfo;

function showLoading() {
    document.getElementById('loadingOverlay').classList.remove('visually-hidden');
    document.getElementById('loadingOverlay').style.opacity = '1';
}
function hideLoading() {
    document.getElementById('loadingOverlay').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('loadingOverlay').classList.add('visually-hidden');
    }, 500); // Wait for fade out before hiding
}
window.showLoading = showLoading;
window.hideLoading = hideLoading;

// Scroll utility: scroll to a given element
function scrollToElement(target, container = document.getElementById("area1")) {

    if (container === window) {
        target.scrollIntoView({ behavior: 'smooth' });
        return;
    }
    if (target.offsetTop < 10) return;
    container.scrollTo({ top: target.offsetTop - 50, behavior: 'smooth' });
}
window.scrollToElement = scrollToElement;

// ***********************************       SplitJS          ***********************************************

// then split the outer container horizontally into #left / #sidebar
// Initialize Split.js and keep instance for programmatic control
const splitInstance = Split(['#navbar', '#content'], {
    direction: 'horizontal',
    sizes: [20, 80],
    minSize: [0, 400],  // px minimum for each
    gutterSize: 4,
    cursor: 'col-resize',
    onDragStart: () => {
        if (document.getElementById("json-table")) {
            document.getElementById("json-table").style.width = document.getElementById("json-table").getClientRects()[0].width + "px"
        }
        if (document.getElementById("navbar").getBoundingClientRect().width < 1) {
            splitInstance.setSizes([20, 80]);
        }
    },
    onDragEnd: () => {
        if (document.getElementById("json-table")) {
            document.getElementById("json-table").style.width = "100%"; // Reset width to 100% after resizing
        }
    }
});

// **********************************************************************************

function makeHxPostRequest(url, data) {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url, true);
    xhr.setRequestHeader('Content-Type', 'application/json;charset=UTF-8');

    xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
            if (xhr.status >= 200 && xhr.status < 300) {
                console.log(`Response from ${url}:`, xhr.responseText);
            } else {
                console.log(`Error from ${url}:`, xhr.status, xhr.statusText);
            }
        }
    };

    xhr.send(JSON.stringify(data));
}
window.makeHxPostRequest = makeHxPostRequest;

async function sendChat(input, history = [], model=undefined) {
    // Determine effective model based on user settings if not explicitly passed
    if (!model || model === undefined) {
        try { model = await window.getActiveModel(); } catch(_) {}
    }
    let searchModelOverride = undefined;
    if (model === 'search') {
        // If model is search, modify the input for search context and pull user preferred search model
        input = `Search for: ${input}`;
        try { searchModelOverride = await window.getActiveModel('search'); } catch(_) {}
    }
    const cipher = window.currentAPIKey_enc;
    if (!cipher) {
        alert('API key is not set. Please enter your OpenAI API key first.');
        window.currentAPIKey_enc = await initAPIKey();
        return;
    }
    const promptText = input;
    if (!cipher || !promptText) {
        alert('Both key cipher and prompt are required');
        return;
    }
    const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: promptText, keyCipher: cipher, history: history, model: model, search_model: searchModelOverride })
    });
    if (resp.ok) {
        const { reply, history: updatedHistory } = await resp.json();
        return [reply, updatedHistory];
    } else {
        // Detailed error logging: parse JSON if possible
        let errorDetail;
        try {
            const errJson = await resp.json();
            errorDetail = errJson.detail || errJson.error || JSON.stringify(errJson);
        } catch {
            errorDetail = await resp.text();
        }
        console.error(`Error from chat endpoint: ${resp.status} ${resp.statusText}`, errorDetail);
        // Surface specific model-not-found scenario to user
        if (/model_not_found/i.test(errorDetail) || /does not exist/i.test(errorDetail)) {
            window.displayInfo && window.displayInfo('error', 'Selected AI model is unavailable. Choose another model in settings.');
        }
        // Handle invalid API key: prompt user to re-enter
        if ((resp.status === 401) && /invalid/i.test(errorDetail)) {
            const newKey = await window.customPrompt({ title: 'Your API key appears invalid or unauthorized. Please re-enter your key.', placeholder: 'sk-...', confirmText: 'Save', cancelText: 'Cancel' });
            // Re-init API key and retry storing cipher
            window.currentAPIKey_enc = await storeAPIKey(newKey, false);
            return await sendChat(input, history, model); // Retry with new key
        }
    }
}
window.sendChat = sendChat;

async function genPersonaPool({generatedPersonas = [], groupDescription, amount = 20, model} = {}) {
    const cipher = window.currentAPIKey_enc;
    if (!cipher) {
        alert('API key is not set. Please enter your OpenAI API key first.');
        window.currentAPIKey_enc = await initAPIKey();
        return;
    }
    // Fallback to user preferred model if none provided
    if (!model) {
        try { model = await window.getActiveModel(); } catch(_) {}
    }
    const resp = await fetch('/api/personaGen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generatedPersonas, groupDescription, keyCipher: cipher, amount, model })
    });
    if (resp.ok) {
        return resp.json();
    } else {
        // Detailed error logging: parse JSON if possible
        let errorDetail;
        try {
            const errJson = await resp.json();
            errorDetail = errJson.detail || errJson.error || JSON.stringify(errJson);
        } catch {
            errorDetail = await resp.text();
        }
        console.error(`Error from persona generation endpoint: ${resp.status} ${resp.statusText}`, errorDetail);
        // Handle invalid API key: prompt user to re-enter
        if ((resp.status === 401) && /invalid/i.test(errorDetail)) {
            const newKey = window.customPromp('Your API key appears invalid or unauthorized. Please re-enter your key.');
            window.currentAPIKey_enc = await storeAPIKey(newKey, false);
            return await genPersonaPool({ generatedPersonas, groupDescription, amount, model }); // Retry with new key
        }
    }
}

window.genPersonaPool = genPersonaPool;

// ***********************************       Export Data         ***********************************************


async function extractResults(step) {
    // todo MAYBE make it more human readable not ID everywhere
    if (parseInt(step) < 1 || parseInt(step) > 6) {
        throw new Error("Step not found on result extraction.");
    }
    try{
        const stepData = await window.dataStorage.getData('data_step_'+step) || {};
        if (stepData === undefined || Object.keys(stepData).length < 1) {
            return {["Step_"+step]: "No data available"}
        }
        let results = []
        switch (parseInt(step)) {
            case 1:
                results = {
                    constructName: stepData?.panel1?.constructName,
                    savedDefinitions: stepData?.panel2?.savedDefinition,
                    property: stepData?.panel3?.property,
                    entity: stepData?.panel3?.entity,
                    propertyExplanation: stepData?.panel3?.propertyExplanation,
                    entityExplanation: stepData?.panel3?.entityExplanation,
                    ...stepData?.panel4,
                    ...stepData?.panel5
                }
                break;
            case 2:
                const step1Data = await window.dataStorage.getData('data_step_1') || {};
    
                results = {
                    items: stepData?.items.map(item => ({ ...item, subdimension: step1Data?.panel5.subdimensions.find(subdim => subdim.id === item.subdimensionId).name }),),
                }
                break;
            case 3:
                results = {
                    raters: stepData?.raters,
                    anovaResults: stepData?.anovaResults
                }
                break;
            case 4: 
                delete stepData.lastAISuggestions;
                delete stepData.updatedAt;
                
                results = {...stepData}
                break;
            case 5:
                results = {
                    personas: stepData.personas,
                    questionnaireItems: stepData.questionnaireItems,
                    extraItems: stepData.extraItems,
                    likertAnswers: stepData.likertAnswers,
                }
                break;
            case 6:
                results = {
                    reversedItems: stepData.reverseColumns,
                    lavaanEdited: stepData.lavaanEdited,
                    lastEFAResult: stepData.lastEFAResult,
                    lastCFAResult: stepData.lastCFAResult
                }
                break;
            default:
                throw new Error("Step not found on result extraction.");
        }
        return {["Step_"+step]:results}
    }
    catch(e){
        console.error("Error extracting results:", e);
        return {["Step_"+step]: { error: e.message }};
    }
    
}

// Add exportSelected function for modal-based export
async function exportSelected() {
    const exportAll = document.getElementById('exportAll').checked;
    const exportRaw = document.getElementById('exportRaw')?.checked;
    let output = {};

    if (exportAll) {
        // fetch all data keys
        for (let i = 1; i <= 6; i++) {
            if (exportRaw) {
                const raw = await window.dataStorage.getData('data_step_'+i) || {};
                output[`step${i}`] = raw;
            } else {
                const data = await extractResults(i);
                if (data) output= {...output, ...data}
            }
        }
        if (exportRaw) {
            // include project flags (proj_x_data_flags) if present; we need active project id
            try {
                const activeId = await window.projects.getActiveProjectId();
                const entries = await window.dataStorage.getAllEntries();
                const flagEntry = entries.find(e => typeof e.key === 'string' && e.key === `proj_${activeId}_data_flags`);
                if (flagEntry) {
                    output['projectFlags'] = flagEntry.value;
                }
            } catch (e) { console.warn('Could not append project flags', e); }
        }
    } else {
        // fetch only checked steps
        const cbs = document.querySelectorAll('.export-step-checkbox:checked');
        for (const cb of cbs) {
            const stepNum = cb.value;
            if (exportRaw) {
                const raw = await window.dataStorage.getData('data_step_'+stepNum) || {};
                output[`step${stepNum}`] = raw;
            } else {
                const data = await extractResults(stepNum);
                if (data) output= {...output, ...data}
            }
        }
    }

    if (Object.keys(output).length === 0) {
        window.displayInfo('warning', 'No data available for selected steps.');
        return;
    }

    if (window.getUnsavedChangesFlag()) {
        const confirmed = await customConfirm({
            title: '⚠️ Unsaved Changes',
            message: 'You have unsaved changes. Do you want to export without saving?',
            confirmText: 'Yes, export',
            cancelText: 'No'
        });
        if (!confirmed) {
            return; // User chose to stay
        }
    }


    const jsonString = JSON.stringify(output, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let baseName;
    if (exportRaw) {
        baseName = exportAll ? 'data_all_steps_raw.json' : 'data_selected_steps_raw.json';
    } else {
        baseName = exportAll ? 'data_all_steps.json' : 'data_selected_steps.json';
    }
    a.download = baseName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // close modal
    const modalEl = document.getElementById('exportModal');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    modalInstance.hide();

    window.displayInfo('success', 'Data exported successfully.');
}
window.exportSelected = exportSelected;

// Populate export modal options dynamically
const exportModal = document.getElementById('exportModal');
if (exportModal) {
    exportModal.addEventListener('show.bs.modal', async () => {
        const container = document.getElementById('exportStepsContainer');
        container.innerHTML = '';
        // fetch availability for each step
        for (let i = 1; i <= 6; i++) {
            const key = `data_step_${i}`;
            const has = await window.dataStorage.hasData(key);
            if (has) {
                const stepData = await window.dataStorage.getData(key);
                if (i==3 && stepData.raters.length === 0 && !stepData.anovaResults) continue;
                if (i==4 && Object.keys(stepData.itemCustomIds).length === 0) continue;
                const div = document.createElement('div');
                div.className = 'form-check';
                const input = document.createElement('input');
                input.className = 'form-check-input export-step-checkbox';
                input.type = 'checkbox';
                input.value = `${i}`;
                input.id = `exportStep${i}`;
                const label = document.createElement('label');
                label.className = 'form-check-label';
                label.htmlFor = input.id;
                label.textContent = `Step ${i}`;
                div.appendChild(input);
                div.appendChild(label);
                container.appendChild(div);
            }
        }
        // reset exportAll and checkboxes
        const allCheckbox = document.getElementById('exportAll');
        if (allCheckbox) {
            allCheckbox.checked = false;
        }
        document.querySelectorAll('.export-step-checkbox').forEach(cb => cb.checked = false);
    });
}
// toggle individual when exportAll changes
const allCheckbox = document.getElementById('exportAll');
if (allCheckbox) {
    allCheckbox.addEventListener('change', e => {
        const disable = e.target.checked;
        document.querySelectorAll('.export-step-checkbox').forEach(cb => {
            cb.disabled = disable;
            if (disable) cb.checked = false;
        });
    });
}

// Populate projects modal with list of project names
async function populateProjectsModal() {
    const modalEl = document.getElementById('projectsModal');
    const body = modalEl.querySelector('.modal-body');
    body.innerHTML = '';
    const projects = await window.projects.getProjects() || [];
    const activeId = await window.projects.getActiveProjectId();
    const ul = document.createElement('ul');
    ul.className = 'list-group list-group-flush';
    projects.forEach(proj => {
        const li = document.createElement('li');
        li.className = 'list-group-item d-flex justify-content-between align-items-center border-secondary';

        const nameDiv = document.createElement('div');
        nameDiv.textContent = proj.name;
        if (proj.id === activeId) {
            const badge = document.createElement('span');
            badge.className = 'badge bg-primary ms-2';
            badge.textContent = 'Current';
            nameDiv.appendChild(badge);
        }

        const btnDiv = document.createElement('div');
        // Only show Select button for non-current projects
        if (proj.id !== activeId) {
            const selectBtn = document.createElement('button');
            selectBtn.className = 'btn btn-sm btn-outline-success me-2';
            // Use icon instead of text
            selectBtn.innerHTML = '<i class="bi bi-check-circle"></i>';
            selectBtn.setAttribute('aria-label', 'Select project');
            selectBtn.onclick = async () => {
                 if (window.getUnsavedChangesFlag()) {
                    const confirmed = await customConfirm({
                        title: '⚠️ Unsaved Changes',
                        message: 'You have unsaved changes. Do you want to leave this project and lose them?',
                        confirmText: 'Yes, leave',
                        cancelText: 'No, stay'
                    });
                    if (!confirmed) {
                        return; // User chose to stay
                    }
                    }
                await window.projects.setActiveProjectId(proj.id);
                // Clean full reload to ensure all step modules re-init under new project
                window.location.reload();
            };
            btnDiv.appendChild(selectBtn);
        }

        // Clone button (available for any project)
        const cloneBtn = document.createElement('button');
        cloneBtn.className = 'btn btn-sm btn-outline-primary me-2';
        cloneBtn.innerHTML = '<i class="bi bi-files"></i>';
        cloneBtn.setAttribute('aria-label', 'Clone project');
        cloneBtn.onclick = async () => {
            const confirmed = await customConfirm({
                title: 'Clone Project',
                message: `Create a duplicate of '${proj.name}'?`,
                confirmText: 'Clone',
                cancelText: 'Cancel'
            });
            if (!confirmed) return;
            const newProj = await window.projects.cloneProject(proj.id);
            if (newProj) {
                window.displayInfo('success', `Cloned to '${newProj.name}'`);
                // Navigate to step 1 of new active project
                window.location.href = '/step/1';
            } else {
                window.displayInfo('error', 'Could not clone project');
            }
        };
        btnDiv.appendChild(cloneBtn);

    const delBtn = document.createElement('button');
        delBtn.className = 'btn btn-sm btn-outline-danger';
        // Use icon instead of text
        delBtn.innerHTML = '<i class="bi bi-trash"></i>';
        delBtn.setAttribute('aria-label', 'Delete project');
        delBtn.onclick = async () => {
            const confirmed = await customConfirm({
                title: 'Delete Project?',
                message: `Are you sure you want to delete '${proj.name}'?`,
                confirmText: 'Delete',
                cancelText: 'Cancel'
            });
            if (confirmed) {
                
                await window.projects.deleteProject(proj.id);
                // If deleted project was active, reload; otherwise update list
                const activeIdAfter = await window.projects.getActiveProjectId();
                if (!activeIdAfter || activeIdAfter === proj.id){
                    window.location.reload();
                    return;
                }
                populateProjectsModal();
                // if (nameDiv.childNodes.length > 1) { 
                //     setTimeout(() => {
                //         bootstrap.Modal.getInstance(modalEl).hide();
                //     }, 500);
                // }
            }
        };
        btnDiv.appendChild(delBtn);

        li.appendChild(nameDiv);
        li.appendChild(btnDiv);
        ul.appendChild(li);
    });
    body.appendChild(ul);
}
window.populateProjectsModal = populateProjectsModal;

const projectsModal = document.getElementById('projectsModal');
if (projectsModal) {
    projectsModal.addEventListener('show.bs.modal', populateProjectsModal);
}

// After wiring up populateProjectsModal listener
const addProjectBtn = document.getElementById('addProjectBtn');
if (addProjectBtn) {
    addProjectBtn.addEventListener('click', async () => {
        const newProj = await window.projects.addProject();
        if (newProj) {
            window.displayInfo('success', `Project '${newProj.name}' added`);
            // New project becomes active inside addProject; force reload
            window.location.href = '/step/1';
        } else {
            window.displayInfo('error', `Could not add project. It may already exist.`);
        }
    });
}

// custom confirm
let customConfirmActive = false;
/**
 * Show a Bootstrap “are you sure?” modal with custom title & message.
 * @param {string} title — Modal header text (can include emojis)
 * @param {string} message — Modal body HTML (can include <br/>)
 * @param {string} [confirmText="OK"] — Text for the confirm button
 * @param {string} [cancelText="Cancel"] — Text for the cancel button
 * @returns {Promise<boolean>} — Resolves true if confirmed, false otherwise.
 */
function customConfirm({
    title,
    message,
    confirmText = 'OK',
    cancelText = 'Cancel'
}) {
    // Prevent overlapping modals; wait until prior fully closes
    if (customConfirmActive) return Promise.resolve(false);
    customConfirmActive = true;
    return new Promise(resolve => {
        // 1) Create a unique container for this modal
        const container = document.createElement('div');
        const modalId = `dynamicModal_${Date.now()}`;
        container.innerHTML = `
      <div class="modal text-center fade" id="${modalId}" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content rounded-3 shadow-lg">
            <div class="modal-header border-0">
              <h5 class="modal-title w-100">${title}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal"
                      aria-label="Close"></button>
            </div>
            <div class="modal-body">
              ${message}
            </div>
            <div class="modal-footer border-0">
              <button id="${modalId}_cancel" type="button" class="btn btn-outline-secondary"
                      data-bs-dismiss="modal">${cancelText}</button>
              <button id="${modalId}_confirm" type="button" class="btn btn-danger">
                ${confirmText}
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
        document.body.appendChild(container);
        if (cancelText == '__ONLYALERT__') {
            // If only alert, hide cancel button
            container.querySelector(`#${modalId}_cancel`).style.display = 'none';
            container.querySelector(`#${modalId}_confirm`).classList.remove('btn-danger');
            container.querySelector(`#${modalId}_confirm`).classList.add('btn-info');
            container.querySelector('.btn-close').style.display = 'none';
            container.querySelector('.modal-footer').classList.add('justify-content-center');   
        }

        // 2) Bootstrap modal instance
        const modalEl = document.getElementById(modalId);
        const bsModal = new bootstrap.Modal(modalEl);

        // 3) Handle button clicks but defer resolve until modal fully hidden
        let choice = false;
        modalEl.querySelector(`#${modalId}_confirm`).onclick = () => {
            choice = true;
            bsModal.hide();
        };
        const cancelHandler = () => {
            choice = false;
            bsModal.hide();
        };
        modalEl.querySelector(`#${modalId}_cancel`).onclick = cancelHandler;
        modalEl.querySelector('.btn-close').onclick = cancelHandler;

        // 4) Cleanup after hide (ensures sequential confirms work)
        modalEl.addEventListener('hidden.bs.modal', () => {
            customConfirmActive = false; // allow next confirm immediately after hide
            bsModal.dispose();
            container.remove();
            resolve(choice); // resolve only now so callers can safely chain awaits
        });

        // 5) Show it
        bsModal.show();
    });
}


// Removed getSyncFunc in favor of full page reload on project changes for cleaner state reset.

// Returns true if any element has an associated unsaved-changes flag set to true
window.getUnsavedChangesFlag = function () {
    const elements = document.querySelectorAll('[data-get-unsaved-changes-flag]');
    for (const el of elements) {
        const flagName = el.getAttribute('data-get-unsaved-changes-flag');
        if (flagName && typeof window[flagName] === 'boolean') {
            return window[flagName];
        }
    }
    // No flag found or none true
    return false;
};

window.customConfirm = customConfirm;

// custom prompt
let customPromptActive = false;
/**
 * Show a Bootstrap prompt modal to collect a single text value.
 * @param {object} opts
 * @param {string} opts.title - Modal title
 * @param {string} [opts.message] - Optional HTML message
 * @param {string} [opts.placeholder] - Input placeholder
 * @param {string} [opts.defaultValue] - Initial value in the input
 * @param {string} [opts.confirmText='OK'] - Confirm button text
 * @param {string} [opts.cancelText='Cancel'] - Cancel button text
 * @param {boolean} [opts.multiline=false] - Use a textarea instead of input
 * @param {number} [opts.rows=3] - Rows for textarea
 * @returns {Promise<string|null>} resolves to input string, or null if cancelled
 */
function customPrompt({
    title,
    message = '',
    placeholder = '',
    defaultValue = '',
    confirmText = 'OK',
    cancelText = 'Cancel',
    multiline = false,
    rows = 3,
} = {}) {
    if (customPromptActive) return Promise.resolve(null);
    customPromptActive = true;
    return new Promise(resolve => {
        const container = document.createElement('div');
        const modalId = `dynamicPrompt_${Date.now()}`;
        const inputId = `${modalId}_input`;
        container.innerHTML = `
      <div class="modal text-center fade" id="${modalId}" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
        <div class="modal-dialog modal-dialog-centered">
          <div class="modal-content rounded-3 shadow-lg">
            <div class="modal-header border-0">
              <h5 class="modal-title w-100">${title || 'Input'}</h5>
              <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
            </div>
            <div class="modal-body text-start">
              ${message || ''}
              <div class="mt-2">
                ${multiline
                    ? `<textarea id="${inputId}" class="form-control" rows="${rows}" placeholder="${placeholder || ''}">${defaultValue || ''}</textarea>`
                    : `<input id="${inputId}" class="form-control" type="text" placeholder="${placeholder || ''}" value="${defaultValue || ''}" />`
                }
              </div>
            </div>
            <div class="modal-footer border-0">
              <button id="${modalId}_cancel" type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">${cancelText}</button>
              <button id="${modalId}_confirm" type="button" class="btn btn-primary">${confirmText}</button>
            </div>
          </div>
        </div>
      </div>`;
        document.body.appendChild(container);

        const modalEl = document.getElementById(modalId);
        const bsModal = new bootstrap.Modal(modalEl);
        const inputEl = () => document.getElementById(inputId);
        const confirmBtn = () => modalEl.querySelector(`#${modalId}_confirm`);
        const cancelBtn = () => modalEl.querySelector(`#${modalId}_cancel`);

        const doConfirm = () => {
            const el = inputEl();
            const val = ((el?.value ?? '') + '').trim();
            if (!val) {
                if (window.displayInfo) window.displayInfo('error', 'Please enter a value.');
                // keep modal open and refocus input
                if (el) {
                    el.focus();
                    if (!multiline && el.select) el.select();
                }
                return; // do not resolve/close when empty
            }
            resolve(val);
            bsModal.hide();
        };
        const doCancel = () => {
            resolve(null);
            bsModal.hide();
        };

        confirmBtn().addEventListener('click', doConfirm, { once: true });
        cancelBtn().addEventListener('click', doCancel, { once: true });
        modalEl.querySelector('.btn-close').addEventListener('click', doCancel, { once: true });

        modalEl.addEventListener('shown.bs.modal', () => {
            const el = inputEl();
            if (!el) return;
            el.focus();
            if (!multiline && el.select) el.select();
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !multiline) {
                    e.preventDefault();
                    doConfirm();
                }
                if (e.key === 'Escape') {
                    e.preventDefault();
                    doCancel();
                }
            }, { once: false });
        });

        modalEl.addEventListener('hidden.bs.modal', () => {
            customPromptActive = false;
            bsModal.dispose();
            container.remove();
        });

        bsModal.show();
    });
}

window.customPrompt = customPrompt;


function cleanAIRespond(input) {
    // Remove leading/trailing whitespace and newlines
    input = input.trim();
    const match = input.match(/```json\s*([\s\S]*?)\s*```/);
    let responseJson = null;
    if (match) {
        responseJson = JSON.parse(match[1]);
    } else {
        responseJson = JSON.parse(input);
    }
    return responseJson;
}
window.cleanAIRespond = cleanAIRespond;


// ***************************************   Subdim***********************
// Generate a stable id for subdimensions (fallback if crypto.randomUUID not available)
function genSubdimensionId() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'sd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

window.genSubdimensionId = genSubdimensionId;
window.getSubdimensionNameById = getSubdimensionNameById;

// Helper: resolve a subdimensionId to its current display name
function getSubdimensionNameById(id){
    if(!id) return '';
    const sd = subdimensions.find(s => s.id === id);
    return sd ? sd.name : '';
}


// visualize inconsitency:

// =====================
// Validation: Item Code vs Subdimension Code Consistency
// =====================
// Rules:
// 1. If an item has a Step 4 custom code (e.g., TE1) and is assigned to a subdimension with code TE => OK.
//    Prefix = leading letters of item code (case-insensitive). Must match subdimension.code (case-insensitive).
// 2. If codes mismatch => flag.
// 3. If construct is Multidimensional and item has no subdimensionId but has a code => flag.
// 4. Any item code present in Step 4 (step4ItemCustomIds) whose itemId no longer exists in Step 2 items => flag.
// A global flag is stored in data_step_2.codeConsistency.hasIssues plus issue details.
// Triggered: on page load (init) and after every syncData (adds / edits / deletes / subdimension changes).

async function checkItemCodeConsistency(){
    try {
        const step1Data = await window.dataStorage.getData('data_step_1');
        const step2Data = await window.dataStorage.getData('data_step_2');
        const step4Data = await window.dataStorage.getData('data_step_4');
        
        let dimensionality = step1Data?.panel4?.dimensionality || 'Unidimensional';
        let step4ItemCustomIds = step4Data?.itemCustomIds || {};
    let subdimensions = step1Data?.panel5?.subdimensions || [];
    let items = step2Data?.items || [];

        const subdimCodeById = {};
        subdimensions.forEach(sd => { if (sd.code) subdimCodeById[sd.id] = String(sd.code).trim().toUpperCase(); });

        const itemIds = new Set(items.map(it => String(it.id)));
        const issues = [];
    const anyCodesDefined = Object.keys(step4ItemCustomIds).length > 0; // Step 4 already populated for at least some items

        // Rule 0 (new): Items missing a code after Step 4 started; then Rule 1,2,3
        items.forEach(it => {
            const code = step4ItemCustomIds[it.id];
            const hasValidSubdim = !!(it.subdimensionId && subdimCodeById[it.subdimensionId]);
            if (!code) {
                // Only flag missing code if Step 4 already has codes AND this item is tied to a valid subdimension (so a prefix expectation exists)
                if (anyCodesDefined && hasValidSubdim) {
                    issues.push({ type: 'MISSING_CODE', itemId: it.id, message: 'Item assigned to a subdimension lacks a code while other items are already coded in Step 4.' });
                }
                return; // skip further checks for this item
            }
            const codePrefixMatch = String(code).match(/^[A-Za-z]+/);
            const codePrefix = codePrefixMatch ? codePrefixMatch[0].toUpperCase() : null;
            if (dimensionality === 'Multidimensional' && (!it.subdimensionId || !subdimCodeById[it.subdimensionId])) {
                // Unassigned item has code (and multidimensional) => issue
                if (!it.subdimensionId) {
                    issues.push({ type: 'UNASSIGNED_WITH_CODE', itemId: it.id, itemCode: code, message: 'Item has a code but no subdimension assignment in a multidimensional construct.' });
                }
                return; // can't further validate without a subdimension code
            }
            if (it.subdimensionId) {
                const expected = subdimCodeById[it.subdimensionId];
                if (expected && codePrefix && codePrefix !== expected.toUpperCase()) {
                    issues.push({ type: 'MISMATCH_PREFIX', itemId: it.id, itemCode: code, codePrefix, expectedPrefix: expected, message: `Item code prefix ${codePrefix} does not match subdimension code ${expected}.` });
                }
            }
        });

        // Rule 4: orphan codes present in Step 4 but missing in Step 2 items
        Object.entries(step4ItemCustomIds).forEach(([id, code]) => {
            if (!itemIds.has(String(id))) {
                issues.push({ type: 'ORPHAN_CODE', itemId: id, itemCode: code, message: 'Item code exists in Step 4 metadata but item is missing in Step 2.' });
            }
        });

        const hasIssues = issues.length > 0;
        // Persist global flag + details merged into existing step2 data (non-destructive for other keys)
        window.dataStorage.getData('data_flags').then(current => {
            const updated = { ...(current || {}), codeConsistency: { hasIssues, issues, checkedAt: Date.now() } };
            window.dataStorage.storeData('data_flags', updated, false);
        });
        // Expose flag & issues globally (optional quick access)
        window.itemCodeConsistencyFlag = hasIssues;
        window.codeConsistencyIssues = issues; // store full issue objects

        // Update Model Specification navigation marker
        updateModelSpecIssueMarker(issues);
        // If step2 item rows exist, attempt to mark them (function defined in step2.js)
        if (typeof window.applyCodeConsistencyMarkers === 'function') {
            // Defer to next microtask to allow any pending DOM updates
            setTimeout(() => window.applyCodeConsistencyMarkers(), 0);
        }
        if (hasIssues) {
            console.warn('[CodeConsistency] Issues detected:', issues);
        } else {
            console.debug('[CodeConsistency] All item codes consistent with subdimension assignments.');
        }
    } catch (e) {
        console.error('checkItemCodeConsistency failed:', e);
    }
}
window.checkItemCodeConsistency = checkItemCodeConsistency;

// ====================================================================
// Visual marker (yellow) on Model Specification nav link if issues
// ====================================================================
const MODEL_SPEC_SELECTOR = 'a.nav-link[href="/step/4"]';

function updateModelSpecIssueMarker(issues = []) {
    const link = document.querySelector(MODEL_SPEC_SELECTOR);
    if (!link) return; // nav not present yet

    link.classList.add('position-relative');

    // Remove existing marker if any
    const existing = link.querySelector('.model-spec-issue-marker');
    if (existing) {
        const t = bootstrap.Tooltip.getInstance(existing);
        if (t) t.dispose();
        existing.remove();
    }

    if (!issues.length) return; // nothing to show

    // Summarize issue types
    const counts = issues.reduce((acc, it) => { acc[it.type] = (acc[it.type] || 0) + 1; return acc; }, {});
    const summary = Object.entries(counts).map(([k,v]) => `${k}: ${v}`).join(' | ');
    const title = `Code consistency issues: ${issues.length}\n${summary} <br> Please review Step 4.`;

    const dot = document.createElement('span');
    dot.className = 'model-spec-issue-marker position-absolute top-0 start-100 translate-middle p-1 bg-warning border border-light rounded-circle';
    dot.style.width = '12px';
    dot.style.height = '12px';
    dot.style.zIndex = '10';
    dot.setAttribute('data-bs-toggle', 'tooltip');
    dot.setAttribute('data-bs-html', 'true');
    dot.setAttribute('data-bs-placement', 'right');
    dot.setAttribute('title', title);
    link.appendChild(dot);
    // Initialize tooltip immediately (since added after DOMContentLoaded)
    new bootstrap.Tooltip(dot);
}
window.updateModelSpecIssueMarker = updateModelSpecIssueMarker;


// Run code-consistency detection on initial load and after each sync.
(function () {
    function runDetection() {
        if (typeof window.checkItemCodeConsistency === 'function') {
            window.checkItemCodeConsistency();
        }
    }

    // Initial run after DOM ready (slight delay to allow initial data retrieval).
    function scheduleInitialDetection(){
        console.log('[CodeConsistency] scheduling initial detection');
        setTimeout(runDetection, 300);
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', scheduleInitialDetection, { once: true });
    } else {
        // DOM already ready (e.g., fast load, script injected later)
        scheduleInitialDetection();
    }

    // getSyncFunc removed; code consistency detection now runs on load and visibility changes only.

    // Optional: re-run when tab becomes visible again (in case data changed elsewhere).
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) runDetection();
    });
})();

function shuffle(a){
  for (let i = a.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
window.shuffle = shuffle;


// Settings: user preferences (models, API key)
(function settingsModule(){
    const SETTINGS_KEY = 'user_settings';
    let settingsCache = null;

    async function loadSettings(){
        if (settingsCache) return settingsCache;
        try {
            const data = await window.dataStorage.getData(SETTINGS_KEY) || {};
            settingsCache = data;
            return data;
        } catch(e){ console.warn('Load settings failed', e); return {}; }
    }
    async function saveSettings(patch){
        settingsCache = { ...(settingsCache||{}), ...patch, updatedAt: Date.now() };
        await window.dataStorage.storeData(SETTINGS_KEY, settingsCache, false);
        return settingsCache;
    }
    window.getUserSettings = loadSettings;
    window.saveUserSettings = saveSettings;

    async function populateSettingsModal(){
        const modal = document.getElementById('settingsModal');
        if (!modal) return;
        const form = modal.querySelector('#settingsForm');
        if (!form) return;
        const status = modal.querySelector('#settingsStatus');
        status.textContent = '';
        const data = await loadSettings();
        form.querySelector('#preferredModel').value = data.preferredModel || '';
        form.querySelector('#preferredSearchModel').value = data.preferredSearchModel || '';
        // API key masked indicator
        const apiMasked = modal.querySelector('#apiKeyMasked');
        apiMasked.value = window.currentAPIKey_enc ? '********' : '';
    }

    // Open modal hook
    document.addEventListener('show.bs.modal', (e)=>{
        if (e.target && e.target.id === 'settingsModal') {
            populateSettingsModal();
        }
    });

    // Save button
    document.addEventListener('click', async (e)=>{
        if (e.target && e.target.id === 'saveSettingsBtn'){
            const modal = document.getElementById('settingsModal');
            if (!modal) return;
            const model = modal.querySelector('#preferredModel').value.trim();
            const searchModel = modal.querySelector('#preferredSearchModel').value.trim();
            await saveSettings({ preferredModel: model || undefined, preferredSearchModel: searchModel || undefined });
            window.displayInfo && window.displayInfo('success','Settings saved');
            const status = modal.querySelector('#settingsStatus');
            status.textContent = 'Saved.';
            setTimeout(()=> status.textContent='', 2000);
        }
    });

    // Reset all data
    document.addEventListener('click', async (e)=>{
        if (e.target && e.target.id === 'resetAllDataBtn'){
            const confirmed = await window.customConfirm({
                title: 'Reset all data?',
                message: 'This will delete ALL locally stored data for this app, including projects, step data, settings, and API key. This cannot be undone.',
                confirmText: 'Delete everything',
                cancelText: 'Cancel'
            });
            if (!confirmed) return;
            try {
                await window.dataStorage.clearAll();
                // Bypass beforeunload prompts and go to welcome page
                window._bypassUnloadConfirm = true;
                setTimeout(()=>{ window._bypassUnloadConfirm = false; }, 3000);
                window.location.href = '/step/0';
            } catch (err) {
                console.error('Reset all failed:', err);
                window.displayInfo && window.displayInfo('error','Failed to reset data.');
            }
        }
    });

    // Update API Key button -> reuse existing prompt & storage
    document.addEventListener('click', async (e)=>{
        if (e.target && e.target.id === 'updateApiKeyBtn'){
            const newKey = await customPrompt({ title: 'Update API Key', placeholder: 'sk-...', confirmText: 'Save', cancelText: 'Cancel' });
            if (!newKey) return;
            window.currentAPIKey_enc = await storeAPIKey(newKey, true);
            window.displayInfo && window.displayInfo('success','API key updated');
            const modal = document.getElementById('settingsModal');
            if (modal) {
                modal.querySelector('#apiKeyMasked').value = '********';
            }
        }
    });

    // Provide helpers to pick model when making requests
    window.getActiveModel = async function(type){
        const data = await loadSettings();
        if (type === 'search') return data.preferredSearchModel || undefined;
        return data.preferredModel || undefined;
    }
})();

// todo Name / Logo / Favicon
// todo MAYBE use cohort on persona generation prompt
// todo MAYBE implement full project export/import
// todo check Grammar

window.ensurePersistentWarning = function(msg){
    let c = document.getElementById('stepPersistentWarning');
    if (!c){
        c = document.createElement('div');
        c.id = 'stepPersistentWarning';
        c.className = 'alert alert-warning m-3';
        c.style.position = 'relative';
        const host = document.querySelector('main') || document.body;
        host.prepend(c);
    }
    c.innerHTML = `<div class="d-flex justify-content-between align-items-start"><div>${msg}</div><button type="button" class="btn-close" aria-label="Close"></button></div>`;
    c.querySelector('.btn-close').onclick = ()=> c.remove();
}