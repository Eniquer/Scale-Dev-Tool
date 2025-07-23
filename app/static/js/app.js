import { initAPIKey,deleteAPIKey,storeAPIKey } from './handleAPIKey.js';
window.currentAPIKey_enc = await initAPIKey();


function displayInfo(type = 'info', message = '') {
    // Show success message
    const alertDiv = document.createElement('div');
    let messageStart = type
    if (type == "error") {
        type = "danger"; // Use 'danger' for error messages
    }

    alertDiv.className = `alert alert-${type} alert-dismissible fade show my-3 ms-auto`;
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


// TODO maybe: wenn neu page geladen wird alle elemente aus dem Storage laden die schon existoeren mit id und json aus der DB?
// todo Speicher für Verschiedene Construct definitions einbauen


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
            window.currentAPIKey_enc = await storeAPIKey(newKey,false);
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