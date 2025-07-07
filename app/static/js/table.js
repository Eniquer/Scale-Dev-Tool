// CSV Table functionality using Tabulator
if (!window.CSVTable) {
    class CSVTable {
        constructor(containerId, tableId) {
            this.containerId = containerId;
            this.tableId = tableId;
            this.table = null;
            this.originalHeaders = [];
            this.currentHeaders = [];
            this.hiddenColumns = new Set();
        }

        parseCSV(csvText) {
            // Add type checking and conversion
            console.log('parseCSV received:', typeof csvText, csvText);
            
            // Ensure csvText is a string
            if (typeof csvText !== 'string') {
                if (csvText && typeof csvText.toString === 'function') {
                    csvText = csvText.toString();
                } else {
                    console.error('Invalid CSV data type:', typeof csvText, csvText);
                    return { headers: [], data: [] };
                }
            }
            
            const lines = csvText.trim().split('\n');
            const headers = lines[0].split(',').map(h => h.trim());
            const data = lines.slice(1).map(line => {
                const values = line.split(',');
                return headers.reduce((obj, header, index) => {
                    obj[header] = values[index]?.trim() || '';
                    return obj;
                }, {});
            });
            
            return { headers, data };
        }

        createColumns(headers) {
            const columns = [
                {
                    title: "#",
                    field: "rowIndex",
                    sorter: "number",
                    editor: false,
                    width: 50,
                    maxWidth: 50,
                    minWidth: 50,
                    frozen: true,
                    headerSort: false,
                    resizable: false,
                    formatter: function(cell, formatterParams, onRendered) {
                        return cell.getRow().getPosition();
                    }
                }
            ];

            // Add data columns (only if not hidden)
            headers.forEach(header => {
                if (!this.hiddenColumns.has(header)) {
                    columns.push({
                        title: header,
                        field: header,
                        sorter: "string",
                        editor: false,
                        headerContextMenu: this.createHeaderContextMenu(header)
                    });
                }
            });

            return columns;
        }

        createHeaderContextMenu(originalHeader) {
            return [
                {
                    label: "Rename Column",
                    action: (e, column) => {
                        this.renameColumn(originalHeader, column);
                    }
                },
                {
                    separator: true
                },
                {
                    label: "Hide Column",
                    action: (e, column) => {
                        this.hideColumn(originalHeader);
                    }
                }
            ];
        }

        renameColumn(originalHeader, column) {
            const newName = prompt(`Rename column "${column.getDefinition().title}":`, column.getDefinition().title);
            if (newName && newName.trim() && newName !== column.getDefinition().title) {
                // Update column title
                column.updateDefinition({title: newName.trim()});
                
                // Update our tracking
                const index = this.currentHeaders.indexOf(originalHeader);
                if (index !== -1) {
                    this.currentHeaders[index] = newName.trim();
                }
                
                console.log(`Column renamed from "${originalHeader}" to "${newName.trim()}"`);
                this.updateColumnManager();
            }
        }

        hideColumn(originalHeader) {
            this.hiddenColumns.add(originalHeader);
            this.table.deleteColumn(originalHeader);
            console.log(`Column "${originalHeader}" hidden`);
            this.updateColumnManager();
        }

        showColumn(originalHeader) {
            this.hiddenColumns.delete(originalHeader);
            // Rebuild the table to show the column
            this.rebuildTable();
            console.log(`Column "${originalHeader}" shown`);
        }

        rebuildTable() {
            if (this.table && this.lastCsvText) {
                this.displayTable(this.lastCsvText);
            }
        }

        updateColumnManager() {
            const managerDiv = document.getElementById('column-manager');
            if (!managerDiv) return;

            let html = '<h6 class="text-light mb-2">Column Management</h6>';
            
            // Hidden columns
            if (this.hiddenColumns.size > 0) {
                html += '<div class="mb-2"><small class="text-muted">Hidden columns:</small><br>';
                this.hiddenColumns.forEach(header => {
                    html += `<span class="badge bg-secondary me-1 mb-1">
                        ${header} 
                        <button type="button" class="btn-close btn-close-white ms-1" aria-label="Show" 
                                onclick="window.csvTable.showColumn('${header}')" style="font-size: 0.6em;"></button>
                    </span>`;
                });
                html += '</div>';
            }

            // Current column names
            html += '<div><small class="text-muted">Current columns:</small><br>';
            this.currentHeaders.forEach(header => {
                if (!this.hiddenColumns.has(this.originalHeaders[this.currentHeaders.indexOf(header)])) {
                    html += `<span class="badge bg-primary me-1 mb-1">${header}</span>`;
                }
            });
            html += '</div>';

            managerDiv.innerHTML = html;
        }

        displayTable(csvText) {
            console.log('displayTable called with:', typeof csvText, csvText ? csvText.length : 0, 'characters');
            
            this.lastCsvText = csvText;
            const { headers, data } = this.parseCSV(csvText);
            
            console.log('Parsed CSV - Headers:', headers.length, 'Data rows:', data.length);
            
            // Initialize headers tracking on first load
            if (this.originalHeaders.length === 0) {
                this.originalHeaders = [...headers];
                this.currentHeaders = [...headers];
            }
            
            // Destroy existing table if it exists
            if (this.table) {
                console.log('Destroying existing table');
                this.table.destroy();
                this.table = null;
            }
            
            const columns = this.createColumns(headers);
            console.log('Created columns:', columns.length);

            // Initialize Tabulator table
            try {
                this.table = new Tabulator(this.tableId, {
                    data: data,
                    columns: columns,
                    layout: "fitDataFill",
                    height: "500px",
                    maxHeight: "70vh",
                    virtualDomHoz: true,
                    pagination: false,
                    headerFilter: true,
                    headerFilterPlaceholder: "Filter...",
                    responsiveLayout: false,
                    columnDefaults: {
                        headerSort: true,
                        resizable: true,
                        minWidth: 100
                    },
                    scrollToColumnPosition: "center",
                    scrollToRowPosition: "center"
                });
                
                console.log('Tabulator table created successfully');
            } catch (error) {
                console.error('Error creating Tabulator table:', error);
                return;
            }

            // Show the table container
            const container = document.getElementById(this.containerId);
            if (container) {
                container.style.display = 'block';
                console.log('Table container made visible');
            } else {
                console.error('Table container not found:', this.containerId);
            }
            
            // Update column manager
            this.updateColumnManager();
            
            console.log(`Successfully displayed CSV table: ${data.length} rows, ${headers.length} columns`);
        }

        hide() {
            document.getElementById(this.containerId).style.display = 'none';
        }

        resetColumns() {
            this.hiddenColumns.clear();
            this.currentHeaders = [...this.originalHeaders];
            this.rebuildTable();
        }
    }

    window.CSVTable = CSVTable;
    
    // Global instance
    if (!window.csvTable) {
        window.csvTable = new CSVTable('csv-table-container', '#csv-table');
    }
}
