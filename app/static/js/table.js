function displayTable(jsonData, tableId) {
    // Add index property to each row
    const indexedData = jsonData.map((row, index) => ({
        ...row,
        _index: index + 1  // Add 1-based index to each row
    }));

    // Create row number column first
    const rowNumberColumn = {
        title: "#",
        field: "_index",
        width: 30,
        headerSort: true,  // Allow sorting by index
        resizable: false,
        frozen: true,  // Keep this column visible when scrolling horizontally
        sorter: "number", // Ensure it sorts as numbers, not strings
    };

    // Create columns from data
    const dataColumns = Object.keys(jsonData[0] || {}).map((field) => ({
        title: field.charAt(0).toUpperCase() + field.slice(1), // pretty title
        field: field,
        editor: "input",        // double-click to rename header value
    }));

    // Combine row number column with data columns
    const allColumns = [rowNumberColumn, ...dataColumns];

    new Tabulator(tableId, {
        data: indexedData,  // Use the data with added indices
        height: "100%",    // Set max height of the table
        layout: "fitDataStretch",  // stretch columns to fill width
        columns: allColumns,
        movableColumns: true,      // drag headers to reorder
        resizableColumns: true,    // resize by dragging edges
        placeholder: "No data to display",
        cssClass: "tabulator-midnight", // Apply midnight theme class
    })

}