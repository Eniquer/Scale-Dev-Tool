import { initAPIKey, deleteAPIKey, storeAPIKey } from './handleAPIKey.js';
window.currentAPIKey_enc = await initAPIKey();


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


async function sendChat(input, history = []) {
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
        body: JSON.stringify({ prompt: promptText, keyCipher: cipher, history: history })
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
        // Handle invalid API key: prompt user to re-enter
        if ((resp.status === 401) && /invalid/i.test(errorDetail)) {
            const newKey = prompt('Your API key appears invalid or unauthorized. Please re-enter your key.');
            // Re-init API key and retry storing cipher
            window.currentAPIKey_enc = await storeAPIKey(newKey, false);
            return await sendChat(input, history); // Retry with new key
        }
    }
}
window.sendChat = sendChat;

// ***********************************       Export Data         ***********************************************
// Add exportSelected function for modal-based export
async function exportSelected() {
    const exportAll = document.getElementById('exportAll').checked;
    const output = {};

    if (exportAll) {
        // fetch all data keys
        for (let i = 1; i <= 8; i++) {
            const key = `data_step_${i}`;
            const data = await window.dataStorage.getData(key);
            if (data) output[key] = data;
        }
    } else {
        // fetch only checked steps
        const cbs = document.querySelectorAll('.export-step-checkbox:checked');
        for (const cb of cbs) {
            const stepNum = cb.value;
            const key = `data_step_${stepNum}`;
            const data = await window.dataStorage.getData(key);
            if (data) output[key] = data;
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
    a.download = exportAll ? 'data_all_steps.json' : 'data_selected_steps.json';
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
        for (let i = 1; i <= 8; i++) {
            const key = `data_step_${i}`;
            const has = await window.dataStorage.hasData(key);
            if (has) {
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
                populateProjectsModal();
                await window.getSyncFunc();
                setTimeout(() => {
                    bootstrap.Modal.getInstance(modalEl).hide();
                }, 500);
            };
            btnDiv.appendChild(selectBtn);
        }

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
                populateProjectsModal();
                await window.getSyncFunc();
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
            populateProjectsModal();
            await window.getSyncFunc();
            setTimeout(() => {
                bootstrap.Modal.getInstance(projectsModal).hide();
            }, 500);
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
    // If a customConfirm is already active, ignore and resolve false
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

        // 3) Handle button clicks
        modalEl.querySelector(`#${modalId}_confirm`).onclick = () => {
            resolve(true);
            bsModal.hide();
        };
        modalEl.querySelector(`#${modalId}_cancel`).onclick =
            modalEl.querySelector('.btn-close').onclick = () => {
                resolve(false);
                bsModal.hide();
            };

        // 4) Cleanup after hide
        modalEl.addEventListener('hidden.bs.modal', () => {
            // Reset active flag when closed
            customConfirmActive = false;
            bsModal.dispose();
            container.remove();
        });

        // 5) Show it
        bsModal.show();
    });
}


window.getSyncFunc = function () {
    document.querySelectorAll('[data-get-sync-function]').forEach(el => {
        const syncFunction = el.getAttribute('data-get-sync-function');
        
        if (syncFunction && typeof window[syncFunction] === "function") {
            window[syncFunction]();
        }
    })
}

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
