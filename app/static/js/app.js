// Main application logic for CSV upload and handling
if (!window.CSVApp) {
    class CSVApp {
        constructor() {
            this.pendingCSV = null;
            this.init();
        }

        async init() {
            // Wait for dependencies to be available
            while (!window.csvStorage || !window.csvTable) {
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            
            // Wait for storage to be ready
            await window.csvStorage.init();
            
            // Try to load existing CSV data if available
            try {
                const csvText = await window.csvStorage.getCSV();
                console.log('Found existing CSV data:', csvText.length, 'characters');
                window.csvTable.displayTable(csvText);
            } catch (err) {
                console.log('No existing CSV data found');
            }

            this.setupEventListeners();
        }

        setupEventListeners() {
            // Capture CSV text on button click
            const uploadButton = document.getElementById('csvInputButton');
            console.log('Upload button found:', !!uploadButton);
            
            if (uploadButton) {
                uploadButton.addEventListener('click', async (e) => {
                    console.log('Upload button clicked');
                    const fileInput = document.getElementById('csvInput');
                    console.log('File input found:', !!fileInput);
                    console.log('Files selected:', fileInput?.files?.length || 0);
                    
                    const file = fileInput?.files[0];
                    if (file) {
                        console.log('File details:', file.name, file.size, 'bytes');
                        try {
                            this.pendingCSV = await file.text();
                            console.log('CSV text captured successfully, length:', this.pendingCSV.length);
                            console.log('First 100 chars:', this.pendingCSV.substring(0, 100));
                        } catch (error) {
                            console.error('Error reading file:', error);
                        }
                    } else {
                        console.warn('No file selected');
                    }
                });
            } else {
                console.error('Upload button not found');
            }

            // Alternative: Capture CSV on form submit (more reliable with HTMX)
            const form = document.querySelector('form[hx-post="/analyze"]');
            console.log('Form found:', !!form);
            
            if (form) {
                form.addEventListener('submit', async (e) => {
                    console.log('Form submit event triggered');
                    const fileInput = document.getElementById('csvInput');
                    const file = fileInput?.files[0];
                    
                    if (file && !this.pendingCSV) {
                        console.log('Capturing CSV on form submit');
                        try {
                            this.pendingCSV = await file.text();
                            console.log('CSV captured on submit, length:', this.pendingCSV.length);
                        } catch (error) {
                            console.error('Error reading file on submit:', error);
                        }
                    }
                });
            }

            // Also listen for htmx:beforeRequest to ensure CSV is captured
            document.addEventListener('htmx:beforeRequest', async (evt) => {
                if (evt.detail.pathInfo?.requestPath?.includes('/analyze')) {
                    console.log('HTMX beforeRequest for /analyze');
                    const fileInput = document.getElementById('csvInput');
                    const file = fileInput?.files[0];
                    
                    if (file && !this.pendingCSV) {
                        console.log('Last chance: capturing CSV before HTMX request');
                        try {
                            this.pendingCSV = await file.text();
                            console.log('CSV captured before request, length:', this.pendingCSV.length);
                        } catch (error) {
                            console.error('Error reading file before request:', error);
                        }
                    }
                    
                    console.log('Pending CSV status before request:', !!this.pendingCSV);
                }
            });

            // Listen for successful analyze requests
            document.addEventListener('htmx:afterRequest', async (evt) => {
                console.log('HTMX afterRequest event triggered');
                const requestPath = evt.detail.pathInfo?.finalRequestPath || evt.detail.pathInfo?.requestPath || '';
                console.log('Request path:', requestPath);
                console.log('Status:', evt.detail.xhr.status);
                console.log('Has pending CSV:', !!this.pendingCSV);
                
                if (requestPath.includes('/analyze') && 
                    evt.detail.xhr.status >= 200 && evt.detail.xhr.status < 300 &&
                    this.pendingCSV) {
                    
                    console.log('Processing successful analyze request');
                    try {
                        // Ensure dependencies are available
                        if (!window.csvStorage || !window.csvTable) {
                            console.error('Dependencies not available - csvStorage:', !!window.csvStorage, 'csvTable:', !!window.csvTable);
                            return;
                        }
                        
                        console.log('Storing CSV in IndexedDB...');
                        await window.csvStorage.storeCSV(this.pendingCSV);
                        console.log('CSV stored successfully');
                        
                        this.pendingCSV = null; // Clear pending data
                        
                        // Display the newly uploaded CSV
                        console.log('Retrieving and displaying CSV...');
                        const csvText = await window.csvStorage.getCSV();
                        console.log('Retrieved CSV, calling displayTable...');
                        window.csvTable.displayTable(csvText);
                        console.log('displayTable call completed');
                    } catch (error) {
                        console.error('Error in CSV processing:', error);
                    }
                } else {
                    console.log('Not processing - conditions not met');
                }
            });
        }

        async checkStoredCSV() {
            try {
                const csvText = await window.csvStorage.getCSV();
                const lines = csvText.split('\n');
                const rows = lines.length - 1; // minus header
                console.log(`CSV loaded: ${rows} rows, ${lines[0].split(',').length} columns`);
                
                // Update UI to show "Data loaded" status
                
                const messageDiv = document.querySelector('.alert');
                if (messageDiv) {
                    console.log('CSV data ready:', rows, 'rows');
                    messageDiv.innerHTML = `CSV data ready: ${rows} rows`;
                    messageDiv.className = 'alert alert-success mt-3';
                }
            } catch (err) {
                console.log('No CSV data available yet');
            }
        }
    }

    window.CSVApp = CSVApp;
    
    // Initialize app when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.csvApp) {
            window.csvApp = new CSVApp();
        }
    });
}
