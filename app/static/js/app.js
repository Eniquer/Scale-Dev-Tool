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
window.splitInstance = Split(['#navbar', '#content'], {
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
            window.splitInstance.setSizes([20, 80]);
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

// Simple encryption/decryption utilities (basic obfuscation)
function simpleEncrypt(text, key = 'thesis-tool-secret') {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        result += String.fromCharCode(text.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return btoa(result); // Base64 encode
}

function simpleDecrypt(encryptedText, key = 'thesis-tool-secret') {
    const decoded = atob(encryptedText); // Base64 decode
    let result = '';
    for (let i = 0; i < decoded.length; i++) {
        result += String.fromCharCode(decoded.charCodeAt(i) ^ key.charCodeAt(i % key.length));
    }
    return result;
}

async function getAPIKey() {
    try {
        const encryptedKey = await window.csvStorage.getData('chatgpt_api_key_enc');
        if (encryptedKey) {
            const apiKey = simpleDecrypt(encryptedKey);
            console.log('Retrieved API key from storage: ****' + apiKey.slice(-4));
            return apiKey;
        }
        console.warn('No API key found in storage');
        return null;
    } catch (error) {
        console.error('Error retrieving API key:', error);
        return null;
    }
}

async function storeAPIKey(apiKey) {
    try {
        // Basic validation
        if (!apiKey || typeof apiKey !== 'string') {
            throw new Error('Invalid API key format');
        }
        
        if (!apiKey.startsWith('sk-') || apiKey.length < 20) {
            throw new Error('API key should start with "sk-" and be at least 20 characters long');
        }
        
        const encryptedKey = simpleEncrypt(apiKey);
        await window.csvStorage.storeData('chatgpt_api_key_enc', encryptedKey, false);
        console.log('API key stored securely: ****' + apiKey.slice(-4));
        return true;
    } catch (error) {
        console.error('Error storing API key:', error);
        throw error;
    }
}

async function deleteAPIKey() {
    try {
        await window.csvStorage.deleteData('chatgpt_api_key_enc');
        console.log('API key deleted from storage');
        return true;
    } catch (error) {
        console.error('Error deleting API key:', error);
        throw error;
    }
}

async function hasAPIKey() {
    try {
        return await window.csvStorage.hasData('chatgpt_api_key_enc');
    } catch (error) {
        console.error('Error checking API key:', error);
        return false;
    }
}

async function initAPIKey() {
    try {
        const hasKey = await hasAPIKey();
        if (hasKey) {
            const apiKey = await getAPIKey();
            if (apiKey) {
                console.log('API key initialized successfully');
                return apiKey;
            } else {
                console.warn('No valid API key found, prompting user');
            }
        } else {
            console.log('No API key stored, prompting user');
        }
        
        // Prompt user for API key
        const userApiKey = prompt('Please enter your OpenAI API key:');
        if (userApiKey) {
            await storeAPIKey(userApiKey);
            console.log('API key stored successfully');
            return userApiKey;
        } else {
            console.warn('No API key provided by user');
            return null;
        }
    } catch (error) {
        console.error('Error initializing API key:', error);
        return null;
    }
}
