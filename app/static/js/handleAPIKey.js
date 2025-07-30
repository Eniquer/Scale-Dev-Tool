// chatgpt_api.js

async function storeAPIKey(apiKeyPlain, showWarning = true) {
    if (apiKeyPlain === undefined || apiKeyPlain === null || apiKeyPlain.trim() === '') {
        throw new Error('API key cannot be empty');
        
    }
    // send raw key to server to encrypt
    const resp = await fetch('/api/encrypt-key', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: apiKeyPlain })
    });
    if (!resp.ok) throw new Error('Failed to encrypt key');
    const { cipher } = await resp.json();
    return await window.dataStorage.storeData('chatgpt_api_key_enc', cipher, showWarning);
}

async function getAPIKey() {
    // return stored cipher only
    return await window.dataStorage.getData('chatgpt_api_key_enc');
}

async function deleteAPIKey() {
    await window.dataStorage.deleteData('chatgpt_api_key_enc');
}

async function hasAPIKey() {
    return await window.dataStorage.hasData('chatgpt_api_key_enc');
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

export { initAPIKey, getAPIKey, deleteAPIKey, storeAPIKey };
