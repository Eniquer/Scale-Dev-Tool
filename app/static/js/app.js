window.csvStorage.hasCSV().then((hasCSV) => {
    if (hasCSV) {
        window.csvStorage.getCSV().then((csvData) => {
            window.csvData = csvData; // Store the data in a global variable
            displayTable(csvData, "#json-table"); // Call the function to display the table
            populateColumnCheckboxes();
            console.log("CSV data retrieved from IndexedDB:", csvData);
            
        }).catch((error) => {
            console.error("Error retrieving CSV data:", error);
            document.getElementById("tableContent").innerHTML = `<div class="alert alert-danger">Error storing CSV data: ${error.message}</div>`;

        });
    } else {
        console.log("No CSV data found in IndexedDB.");
        document.getElementById("tableContent").innerHTML = `<div class="alert alert-info">No CSV data found. Upload to get startet</div>`;

    }
});

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


// first, split the left container vertically into #area1 / #area2
if (document.getElementById('area1') && document.getElementById('area2')) {
    Split(['#area1', '#area2'], {
        direction: 'vertical',
        sizes: [50, 50],      // start 50% / 50%
        minSize: 100,         // px minimum
        gutterSize: 6,
        cursor: 'row-resize'
    });
}

// then split the outer container horizontally into #left / #sidebar
Split(['#navbar','#content'], {
    direction: 'horizontal',
    sizes: [20, 80],      // 70% left, 30% sidebar
    minSize: [100, 200],  // px minimum for each
    gutterSize: 6,
    cursor: 'col-resize'
});

