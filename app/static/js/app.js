import { initAPIKey,deleteAPIKey,storeAPIKey } from './handleAPIKey.js';
window.delKey = deleteAPIKey

function displayInfo(type = 'info', message = '') {
    // Show success message
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.style.position = 'fixed';
    alertDiv.style.bottom = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '1050'; // Ensure it appears above other content
    alertDiv.innerHTML = `
    <strong>Success!</strong> 
    ${document.createTextNode(message).textContent}
    <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.appendChild(alertDiv);

    // Auto-remove alert after 5 seconds
    setTimeout(() => {
        if (alertDiv.parentNode) {
            alertDiv.remove();
        }
    }, 5000);
}


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

window.currentAPIKey_enc = await initAPIKey();

async function sendChat(input) {
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
    body: JSON.stringify({ prompt: promptText, keyCipher: cipher })
    });
    if (resp.ok) {
        const { reply } = await resp.json();
        return reply; // Return the reply for further processing
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
            sendChat(input); // Retry with new key
        }
    }
}
window.sendChat = sendChat;


window.test = storeAPIKey
