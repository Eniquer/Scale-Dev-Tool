let items = [];
let subdimensions = [];
let ratings = {}; // current rater ratings
let ratingTable;
let raters = []; // [{id, name, ratings}]
let activeRaterId = null;
let step1Data = null;
let step2Data = null;

init()

async function init(){
    step1Data = await window.dataStorage.getData('data_step_1');
    step2Data = await window.dataStorage.getData('data_step_2');
    const step3Data = await window.dataStorage.getData('data_step_3') || {};
    subdimensions = step1Data?.panel5?.subdimensions || [];
    items = step2Data.items || [];
    raters = step3Data.raters || [];
    activeRaterId = step3Data.activeRaterId || (raters[0]?.id ?? null);
    ratings = (raters.find(r => r.id === activeRaterId)?.ratings) || {};

    wireRaterUI();
    renderRatingTable();

    // Inject analysis panel UI and wire actions
    wireAnalysisUI();

    // Auto-load saved ANOVA results if present
    loadSavedAnovaResults();


}

// Persist raters, activeRaterId, and ratings
async function saveStep3Data() {
    // update current rater's ratings in raters array
    const idx = raters.findIndex(r => r.id === activeRaterId);
    if (idx !== -1) raters[idx].ratings = ratings;
    const stored = await window.dataStorage.getData('data_step_3') || {};
    const merged = { ...stored, raters, activeRaterId };
    return window.dataStorage.storeData('data_step_3', merged, false);
}

function buildRows() {
    return items.map(it => {
        const row = { id: it.id, Item: it.text };
        subdimensions.forEach(sd => {
            const key = sd.name; // use subdimension name as column key
            const raw = (ratings[it.id] && ratings[it.id][key] !== undefined) ? ratings[it.id][key] : null;
            row[key] = (raw === '' || raw === null || raw === undefined) ? null : Number(raw);
        });
        return row;
    });
}

function wireRaterUI() {
    const tabs = document.getElementById('raterTabs');
    const addBtn = document.getElementById('addRaterBtn');
    if (!tabs || !addBtn) return;
    // render tabs
    tabs.innerHTML = '';
    raters.forEach(r => {
        const li = document.createElement('li');
        li.className = 'nav-item me-1';

        // Tab button
        const a = document.createElement('button');
        a.type = 'button';
        a.className = 'nav-link' + (r.id === activeRaterId ? ' active' : '');
        a.textContent = r.name;
        a.onclick = async (e) => {
            // Persist current active rater's ratings before switching
            const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
            if (currentIdx !== -1) {
                raters[currentIdx].ratings = ratings;
            }

            // Switch active rater
            activeRaterId = r.id;
            ratings = r.ratings || {};

            await saveStep3Data();

            // update active class
            tabs.querySelectorAll('.nav-link').forEach(n => n.classList.remove('active'));
            a.classList.add('active');
            renderRatingTable();
        };
    li.appendChild(a);
        tabs.appendChild(li);
    });
    // add rater button
    addBtn.onclick = async () => {
        const name = await window.customPrompt({title: 'Rater name'});
        if (!name) return;
        const newRater = { id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, ratings: {} };
        raters.push(newRater);
        activeRaterId = newRater.id;
        ratings = newRater.ratings;
        await saveStep3Data();
        wireRaterUI();
        renderRatingTable();
    };
    // When no raters, ensure activeRaterId is null and table is non-interactive
    if (raters.length === 0) {
        activeRaterId = null;
        ratings = {};
        saveStep3Data();
        // No tabs to mark active; table render will disable editors
    }
}

// Bulk delete UI wiring
(function wireBulkDeleteControls() {
    const btn = document.getElementById('deleteRatersBtn');
    const modalEl = document.getElementById('bulkDeleteRatersModal');
    if (!btn || !modalEl) return;
    const list = document.getElementById('bulkDeleteRatersList');
    const selectAll = document.getElementById('bulkDeleteSelectAll');
    const confirmBtn = document.getElementById('confirmBulkDeleteRaters');
    const bsModal = new bootstrap.Modal(modalEl);

    const populateList = () => {
        list.innerHTML = '';
        raters.forEach(r => {
            const id = `delr_${r.id}`;
            const item = document.createElement('label');
            item.className = 'list-group-item d-flex align-items-center';
            item.innerHTML = `
              <input class="form-check-input me-2" type="checkbox" value="${r.id}" id="${id}">
              <span>${r.name}</span>
            `;
            list.appendChild(item);
        });
        selectAll.checked = false;
    };

    btn.onclick = () => {
        populateList();
        bsModal.show();
    };

    selectAll.onchange = () => {
        const boxes = list.querySelectorAll('input[type="checkbox"]');
        boxes.forEach(cb => cb.checked = selectAll.checked);
    };

    list.addEventListener('change', () => {
        const boxes = [...list.querySelectorAll('input[type="checkbox"]')];
        selectAll.checked = boxes.length > 0 && boxes.every(cb => cb.checked);
    });

    confirmBtn.onclick = async () => {
        const selected = [...list.querySelectorAll('input[type="checkbox"]:checked')]
            .map(cb => cb.value);
        if (selected.length === 0) {
            window.displayInfo && window.displayInfo('warning', 'Select at least one rater to delete.');
            return;
        }

        const confirmed = await window.customConfirm({
            title: 'Delete Raters?',
            message: `Delete ${selected.length} selected rater(s)?`,
            confirmText: 'Delete',
            cancelText: 'Cancel'
        });
        if (!confirmed) return;

        // Persist current active rater's ratings before deletion
        const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
        if (currentIdx !== -1) {
            raters[currentIdx].ratings = ratings;
        }

        // Remove selected raters
        raters = raters.filter(r => !selected.includes(r.id));

        // Adjust active rater if it was deleted
        if (!raters.find(r => r.id === activeRaterId)) {
            activeRaterId = raters[0]?.id ?? null;
            ratings = activeRaterId ? (raters.find(r => r.id === activeRaterId)?.ratings || {}) : {};
        }

        await saveStep3Data();
        wireRaterUI();
        renderRatingTable();
        bsModal.hide();
        window.displayInfo && window.displayInfo('success', 'Selected raters deleted.');
    };
})();

// Import raters from JSON
(function wireImportRaters() {
    const importBtn = document.getElementById('importRatersBtn');
    const fileInput = document.getElementById('importRatersFile');
    if (!importBtn || !fileInput) return;

    importBtn.onclick = () => fileInput.click();

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        try {
            const text = await file.text();
            const json = JSON.parse(text);
            // Accept either { raters, activeRaterId } or a plain array of raters
            const incomingRaters = Array.isArray(json) ? json : (Array.isArray(json.raters) ? json.raters : []);
            if (!Array.isArray(incomingRaters) || incomingRaters.length === 0) {
                window.displayInfo && window.displayInfo('warning', 'No raters found in file.');
                fileInput.value = '';
                return;
            }

            // Normalize and validate
            const toId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));
            const cleaned = incomingRaters.map(r => {
                const id = (typeof r.id === 'string' && r.id.trim()) ? r.id : toId();
                const name = (typeof r.name === 'string' && r.name.trim()) ? r.name.trim() : 'Rater';
                const rat = (r && typeof r.ratings === 'object' && r.ratings) ? r.ratings : {};
                return { id, name, ratings: rat };
            });

            // Merge: keep existing raters, add new ones; avoid id collisions by remapping duplicates
            const existingIds = new Set(raters.map(r => r.id));
            const merged = [...raters];
            for (const r of cleaned) {
                let newId = r.id;
                if (existingIds.has(newId)) {
                    newId = toId();
                }
                existingIds.add(newId);
                merged.push({ ...r, id: newId });
            }

            raters = merged;
            // Keep current active if still present; else set to first imported or null
            if (!raters.find(r => r.id === activeRaterId)) {
                activeRaterId = raters[0]?.id ?? null;
                ratings = activeRaterId ? (raters.find(r => r.id === activeRaterId)?.ratings || {}) : {};
            }

            await saveStep3Data();
            wireRaterUI();
            renderRatingTable();
            window.displayInfo && window.displayInfo('success', `Imported ${cleaned.length} rater(s).`);
        } catch (err) {
            console.error('Import raters failed', err);
            window.displayInfo && window.displayInfo('danger', 'Failed to import raters. Ensure it is valid JSON.');
        } finally {
            // reset input so same file can be re-imported if needed
            fileInput.value = '';
        }
    });
})();

// Export raters to JSON
(function wireExportRaters() {
    const btn = document.getElementById('exportRatersBtn');
    if (!btn) return;
    btn.onclick = async () => {
        try {
            // Ensure current state is saved
            const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
            if (currentIdx !== -1) {
                raters[currentIdx].ratings = ratings;
            }
            await saveStep3Data();

            // Load current items from storage to determine valid IDs
            const step2Data = await window.dataStorage.getData('data_step_2') || {};
            const currentItems = Array.isArray(step2Data.items) ? step2Data.items : [];
            const allowedIds = new Set(currentItems.map(it => String(it.id)));

            // Filter each rater's ratings to only include current item IDs
            const filteredRaters = raters.map(r => {
                const rr = r.ratings || {};
                const filtered = {};
                for (const [itemId, val] of Object.entries(rr)) {
                    if (allowedIds.has(String(itemId))) {
                        filtered[itemId] = val;
                    }
                }
                return { ...r, ratings: filtered };
            });

            const exportItems = currentItems.map(it => ({
                id: it.id,
                text: it.text,
                subdimension: it.subdimension ?? null,
            }));
            const payload = { items: exportItems, raters: filteredRaters, activeRaterId };
            const json = JSON.stringify(payload, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const ts = new Date().toISOString().replace(/[:.]/g, '-');
            a.download = `raters-export-${ts}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            window.displayInfo && window.displayInfo('success', 'Raters exported.');
        } catch (err) {
            console.error('Export raters failed', err);
            window.displayInfo && window.displayInfo('danger', 'Failed to export raters.');
        }
    };
})();

// Generate AI raters using the chat API with an empty prompt
(function wireGenerateAIRaters() {
    
    const btn = document.getElementById('generateAIRatersBtn');
    if (!btn) return;

    const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()));

    btn.onclick = async () => {
        // Ask how many raters to generate (1–10)
        const countStr = await window.customPrompt({
            title: 'Generate AI Raters',
            message: 'How many AI raters would you like to generate? (1–10)',
            placeholder: '5',
            confirmText: 'Generate'
        });
        if (countStr === null) return; // cancelled
        const count = parseInt(String(countStr).trim(), 10);
        if (Number.isNaN(count) || count < 1 || count > 10) {
            window.displayInfo && window.displayInfo('warning', 'Please enter a valid number between 1 and 10.');
            return;
        }

        // Persist current rater before generating
        const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
        if (currentIdx !== -1) {
            raters[currentIdx].ratings = ratings;
        }
        try {
            window.showLoading && window.showLoading();
            window.displayInfo && window.displayInfo('info', `Generating ${count} AI rater(s)...`);
            let successCount = 0;
            // Determine starting index: one higher than highest existing "AI Rater N"
            const getMaxAIRaterNum = () => {
                let max = 0;
                for (const r of raters) {
                    const m = /^AI Rater\s*(\d+)$/i.exec(r.name || '');
                    if (m) {
                        const n = parseInt(m[1], 10);
                        if (!Number.isNaN(n) && n > max) max = n;
                    }
                }
                return max;
            };
            const baseNum = getMaxAIRaterNum() + 1;
            for (let i = 1; i <= count; i++) {
                try {


                    let history = [
                {
                    "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers.",
                    "role": "system"
                },
                {
                    "content": `
        You are generating synthetic expert ratings for content validation following MacKenzie et al. (2011) Step 3 logic (content adequacy).

Inputs:

    Subdimensions (with concise descriptions):
    ${subdimensions.map(sd => `Dimensionname: ${sd.name}, Definition: ${sd.definition}`).join('; \n ')}

    Items (array of objects with id and name):
    ${items.map(it => `{"id": ${it.id}, "text": "${it.text}"}`).join(',\n')}

   


Output schema (JSON only, no extra text, no markdown):
{
"ratings": {
"ITEM-ID": {
"SUBDIMENSION_NAME_1": ITEMRATING_NUMBER,
"SUBDIMENSION_NAME_2": ITEMRATING_NUMBER,
...
},
...
}
}

Rating scale:

    Use integers from 1–5.

    Semantics (for 1–5):
    1 = not representative / off‑target
    2 = weak representation
    3 = moderate/ambiguous
    4 = strong representation
    5 = very strong/essential

Generation rules:

    Content adequacy focus: Rate each item separately against every subdimension’s definition.

    Within an item, you may give high scores to more than one subdimension if warranted, but be discriminating: avoid giving all high scores unless the wording clearly spans multiple subdimensions.

    Penalize off‑construct or overly broad language (likely 1–2).

    Reward precise, essential attributes of the subdimension (likely 4–5).

    If an item is clearly specific to one subdimension, keep others near the midpoint or below unless justified by wording.

    No missing keys: every item must include every subdimension as a key.


Persona influence (apply consistently across all ratings):

    Interpret item wording through the Persona’s lens.

    If the Persona is strict/skeptical → slight downward shift and lower variance.

    If the Persona is enthusiastic/lenient → slight upward shift and occasional 5s.

    Domain familiarity → sharper discrimination (more 1–2 and 4–5; fewer 3s).

    If the Persona values clarity/behavioral specificity, penalize vague items harder.

Quality checks (must pass):

    Return valid JSON only.

    Include every item id from the input.

    Include every subdimension name as keys under each item.

    Ratings are integers in the specified range
    
    `,
                    "role": "system"
                }
            ]

                    let prompt = `You will role‑play a single expert rater (the Persona) and rate how well each item reflects each subdimension of the construct. First answer in Sentences like the persona would and after that put your output into the requested format.
 Persona (short description):
    "${await getRandomPersona()}
    They are an Expert in ${step1Data.panel1.constructName}.`
                   //todo viel gleiche antworten. maybe gen whole batch
                    
                    const resp = await window.sendChat(prompt,history);
                    const aiText = Array.isArray(resp) ? resp[0] : resp;
                    let parsed = null;
                    try {
                        parsed = window.cleanAIRespond(String(aiText ?? ''));
                    } catch {
                        parsed = null;
                    }

                    let rater;
                    const seqNum = baseNum + (i - 1);
                    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
                        const id = newId();
                        const name = `AI Rater ${seqNum}`;
                        const rat = (parsed.ratings && typeof parsed.ratings === 'object') ? parsed.ratings : {};
                        rater = { id, name, ratings: rat };
                    } else if (Array.isArray(parsed) && parsed.length) {
                        const first = parsed[0];
                        const name = (first && typeof first.name === 'string' && first.name.trim()) ? first.name.trim() : `AI Rater ${seqNum}`;
                        rater = { id: newId(), name, ratings: {} };
                    } else {
                        rater = { id: newId(), name: `AI Rater ${seqNum}`, ratings: {} };
                    }

                    // Ensure unique ID
                    if (raters.some(r => r.id === rater.id)) rater.id = newId();
                    raters.push(rater);
                    if (!activeRaterId) {
                        activeRaterId = rater.id;
                        ratings = rater.ratings || {};
                    }
                    await saveStep3Data();
                    wireRaterUI();
                    renderRatingTable();
                    successCount++;
                    window.displayInfo && window.displayInfo('success', `Generated ${i}/${count}: ${rater.name}`);
                } catch (iterErr) {
                    console.error('AI rater generation failed', iterErr);
                    window.displayInfo && window.displayInfo('danger', `Failed on ${i}/${count}`);
                }
            }
            window.displayInfo && window.displayInfo('info', `AI rater generation complete. Created ${successCount}/${count}.`);
        } catch (err) {
            console.error('Generate AI raters error', err);
            window.displayInfo && window.displayInfo('danger', 'Could not generate AI raters.');
        } finally {
            window.hideLoading && window.hideLoading();
        }
    };
})();

function renderRatingTable() {
    const container = document.getElementById('item-rating-table');
    if (!container) return;

    // Define columns: first frozen Item column, then one per subdimension
    const columns = [
        {
            title: 'Item', field: 'Item', headerSort: false, frozen: true,
            // Fix the left column width so other columns share remaining space
            widthGrow: 0, minWidth: 320,
            tooltip: true
        },
        ...subdimensions.map(sd => ({
            title: sd.name,
            field: sd.name,
            headerTooltip: sd.definition || sd.name,
            hozAlign: 'center', headerSort: false,
            editor: (activeRaterId ? 'select' : false),
            editorParams: { values: [1, 2, 3, 4, 5] },
            validator: ["integer", "min:1", "max:5"],
            // Equal grow so all subdimension columns share remaining width
            widthGrow: 1
        }))
    ];

    const data = buildRows();

    if (ratingTable) {
        ratingTable.setColumns(columns);
        ratingTable.replaceData(data);
        return;
    }

    ratingTable = new Tabulator('#item-rating-table', {
        data,
        columns,
        index: 'id',
        // Make columns fill the table width; subdimension cols share remaining width
        layout: 'fitColumns',
        reactiveData: true,
        resizableColumns: true,
        movableColumns: true,
        placeholder: 'No items available',
        rowHeight: 40,
        // Modern dark appearance is handled by midnight theme from base.html
    });

    ratingTable.on('cellEdited', async (cell) => {
        if (!activeRaterId) return; // no raters -> ignore edits
        const field = cell.getField();
        if (field === 'Item') return; // do not edit item text here
        const row = cell.getRow().getData();
    const value = cell.getValue();
        if (!ratings[row.id]) ratings[row.id] = {};
        // Normalize empty selection to null (allow clearing)
    ratings[row.id][field] = (value === '' || value === undefined || value === null) ? null : Number(value);
        try {
            await saveStep3Data();
        } catch (e) {
            console.error('Failed to save ratings', e);
            window.displayInfo && window.displayInfo('danger', 'Failed to save rating');
        }
    });
}


async function getRandomPersona() {
  try {
    // Load the JSON file (relative path or absolute URL)
    const response = await fetch('/static/data/personas.json');
    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const personas = await response.json();

    if (!Array.isArray(personas?.generic) || personas?.generic?.length === 0) {
      throw new Error('Persona list is empty or not an array.');
    }

    // Pick a random one
    const randomIndex = Math.floor(Math.random() * personas.generic.length);
    return personas.generic[randomIndex];
  } catch (error) {
    console.error('Error loading personas:', error);
    return null;
  }
}

/**
 * Build a long-format dataset for repeated-measures ANOVA.
 * Rows: one observation per (rater, subdimension, item).
 * { rater, subdimension, itemId, rating }
 */
function buildAnovaLongDataset() {
  // ensure current rater snapshot is included
  const ratersSnapshot = raters.map(r =>
    r.id === activeRaterId ? { ...r, ratings: ratings || {} } : r
  );

  const rows = [];
  for (const r of ratersSnapshot) {
    const rId = r.id;
    const rRatings = r.ratings || {};
    for (const it of items) {
      const perItem = rRatings[it.id] || {};
      for (const sd of subdimensions) {
        const v = perItem[sd.name];
        rows.push({
            item: String(it.id),
            rater: String(rId),
            facet: sd.name,
            rating: v === '' || v === undefined || v === null ? null : Number(v)
        });
      }
    }
  }
  return {
    meta: {
      constructName: step1Data?.panel1?.constructName || null,
      generatedAt: new Date().toISOString()
    },
    rows
  };
}


// Replace analyzeAnova to call backend with long data
async function analyzeAnova(extraParams = {}) {
  // Optional: persist in-memory ratings of active rater
  const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
  if (currentIdx !== -1) raters[currentIdx].ratings = ratings;
  await saveStep3Data();

  const longData = buildAnovaLongDataset();
  const intendedMap = Object.fromEntries(
    items.map(it => [String(it.id), it.subdimension ?? null])
  );

  const payload = {
    data: longData.rows,           // [{rater, subdimension, itemId, rating}]
    intendedMap,                   // optional: intended subdimension per item
    options: {
      padjust: extraParams.padjust || 'holm',
      effectSize: extraParams.effectSize || 'np2',
      dropIncomplete: extraParams.dropIncomplete ?? true
    }
  };

  const resp = await fetch('/api/analyze-anova', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(text || `ANOVA request failed (${resp.status})`);
  }
  return await resp.json();
}



/**
 * Keep your table JSON builder (for display/exports).
 */
function buildMackenzieTableJSON() {
  const ratersSnapshot = raters.map(r =>
    r.id === activeRaterId ? { ...r, ratings: ratings || {} } : r
  );
  const itemColumns = items.map((it, idx) => ({
    key: `item_${it.id}`,
    label: `Item #${idx + 1}`,
    itemId: it.id,
    text: it.text
  }));
  const columns = [
    { key: 'rater', label: 'Rater Number' },
    { key: 'subdimension', label: 'Aspects of Trustworthiness' },
    ...itemColumns
  ];
  const rows = [];
  for (const r of ratersSnapshot) {
    const rRatings = r.ratings || {};
    subdimensions.forEach((sd) => {
      const row = { rater: r.name || r.id, subdimension: sd.name };
      for (const it of items) {
        const v = ((rRatings[it.id] || {})[sd.name]);
        row[`item_${it.id}`] = v === '' || v === undefined || v === null ? null : Number(v);
      }
      rows.push(row);
    });
  }
  return {
    meta: {
      constructName: step1Data?.panel1?.constructName || null,
      generatedAt: new Date().toISOString()
    },
    columns,
    rows
  };
}

// ============ Analysis UI and rendering ============
let anovaTable = null;
let lastAnovaResults = [];

function wireAnalysisUI() {
    // Create a panel below the item table if it doesn't exist
    const container = document.querySelector('#itemPanel .card-body');
    if (!container) return;
    if (document.getElementById('anova-panel')) return; // already wired

    const panel = document.createElement('div');
    panel.id = 'anova-panel';
    panel.className = 'mt-4';
    panel.innerHTML = `
        <div class="d-flex align-items-center justify-content-between mb-2">
            <h5 class="mb-0">Content Adequacy Analysis</h5>
            <div>
                <button type="button" id="runAnovaBtn" class="btn btn-sm btn-primary me-2">
                    <i class="bi bi-graph-up"></i> Analyze
                </button>
                <button type="button" id="exportAnovaBtn" class="btn btn-sm btn-outline-secondary" disabled>
                    <i class="bi bi-download"></i> Export CSV
                </button>
            </div>
        </div>
        <div class="d-flex justify-content-center">
        <div>
        <div id="anova-summary" class="small text-secondary mb-2"></div>
        <div id="anova-results-table"></div>
        </div>
        </div>
    `;
    container.appendChild(panel);

    document.getElementById('runAnovaBtn').onclick = async () => {
        try {
            window.showLoading && window.showLoading();
            const resp = await analyzeAnova({});
            const records = Array.isArray(resp?.result) ? resp.result : [];
            lastAnovaResults = records;
            renderAnovaResults(records);
            document.getElementById('exportAnovaBtn').disabled = (records.length === 0);
            // Persist analysis results for auto-load on next visit
            try {
                await window.dataStorage.storeData('anova_results_step3', { rows: records, ts: new Date().toISOString() }, false);
            } catch (e) {
                console.warn('Failed to persist ANOVA results', e);
            }
            window.displayInfo && window.displayInfo('success', `Analysis complete (${records.length} item(s)).`);
        } catch (err) {
            console.error('ANOVA failed', err);
            window.displayInfo && window.displayInfo('danger', String(err?.message || err));
        } finally {
            window.hideLoading && window.hideLoading();
        }
    };

    document.getElementById('exportAnovaBtn').onclick = () => exportAnovaCSV(lastAnovaResults);
}

// Load saved ANOVA results (if any) and render on page load
async function loadSavedAnovaResults() {
    try {
        const saved = await window.dataStorage.getData('anova_results_step3');
        const rows = Array.isArray(saved?.rows) ? saved.rows : [];
        if (rows.length > 0) {
            lastAnovaResults = rows;
            renderAnovaResults(rows);
            const btn = document.getElementById('exportAnovaBtn');
            if (btn) btn.disabled = false;
        }
    } catch (e) {
        console.warn('No saved ANOVA results to load or failed to load.', e);
    }
}

function renderAnovaResults(rows) {
    const summaryEl = document.getElementById('anova-summary');
    if (summaryEl) {
        const keep = rows.filter(r => r.action === 'keep').length;
        const revise = rows.filter(r => r.action === 'revise').length;
        const del = rows.filter(r => r.action === 'delete' || r.action === 'revise/delete').length;
        summaryEl.textContent = `Keep: ${keep} • Revise: ${revise} • Delete: ${del}`;
    }

    // Build item id -> item name map and project display rows with item_name
    const idToName = new Map(items.map(it => [String(it.id), it.text]));
    const displayRows = (rows || []).map(r => ({
        ...r,
        item_name: idToName.get(String(r.item)) || String(r.item),
        // Display df2 prefers corrected if available, else uncorrected
        df2_disp: (Number.isFinite(r.df2_corr) && r.df2_corr !== null) ? r.df2_corr : r.df2_uncorr,
        // Fallback note so the column isn't empty in UI
        notes: (r.notes && String(r.notes).trim()) ? r.notes : 'sphericity=GG'
    }));

    const columns = [
        { title: 'Item', field: 'item', headerSort: true, tooltip: function(cell){
            const id = cell.getValue();
            return id ? `ID: ${id}` : '';
        }, formatter: cell => {
            const id = cell.getValue();
            return (new Map(items.map(it => [String(it.id), it.text]))).get(String(id)) || String(id || '');
        } },
        { title: 'Intended', field: 'intended_facet', headerSort: true },
        { title: 'n_raters', field: 'n_raters', hozAlign: 'right' },
        { title: 'k_facets', field: 'k_facets', hozAlign: 'right' },
        { title: 'Intended mean', field: 'intended_mean', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right' },
        { title: 'Others mean', field: 'others_mean', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right' },
        { title: 'Mean diff', field: 'mean_diff', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right' },
        { title: 'p(RM-ANOVA, GG)', field: 'p_omnibus', formatter: cell => fmtP(cell.getValue()), hozAlign: 'right' },
        { title: 'p(>0)', field: 'p_contrast_one_sided', formatter: cell => fmtP(cell.getValue()), hozAlign: 'right' },
        { title: 'Highest?', field: 'target_is_highest', formatter: 'tickCross', hozAlign: 'center' },
        { title: 'ηp²', field: 'eta_p2', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right' },
        { title: 'd_z', field: 'dz', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right' },
        { title: 'epsilon', field: 'epsilon', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right' },
        { title: 'Action', field: 'action', headerSort: true },
        { title: 'Notes', field: 'notes', widthGrow: 2 }
    ];

    // Apply row coloring based on action
    const rowFormatter = function (row) {
        const action = row.getData()?.action;
        if (action === 'keep') {
            row.getElement().style.backgroundColor = 'rgba(25,135,84,0.15)';
        } else if (action === 'revise') {
            row.getElement().style.backgroundColor = 'rgba(255,193,7,0.12)';
        } else if (action === 'delete' || action === 'revise/delete') {
            row.getElement().style.backgroundColor = 'rgba(220,53,69,0.12)';
        } else {
            row.getElement().style.backgroundColor = '';
        }
    };

    if (anovaTable) {
        anovaTable.setColumns(columns);
        anovaTable.replaceData(displayRows);
        // Update rowFormatter on existing instance and force redraw
        if (anovaTable && anovaTable.options) {
            anovaTable.options.rowFormatter = rowFormatter;
        }
        if (typeof anovaTable.redraw === 'function') {
            anovaTable.redraw(true);
        }
    } else {
        anovaTable = new Tabulator('#anova-results-table', {
            data: displayRows,
            columns,
            layout: 'fitDataTable',
            placeholder: 'Run analysis to see results',
            rowFormatter,
            resizableColumns: true,
            movableColumns: true,
            reactiveData: true,
            rowHeight: 40,

        });
    }
}

function fmtNum(v, d = 3) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    const num = Number(v);
    if (!Number.isFinite(num)) return '';
    return num.toFixed(d);
}

function fmtP(v) {
    if (v === null || v === undefined || Number.isNaN(v)) return '-';
    const num = Number(v);
    if (!Number.isFinite(num)) return '';
    if (num < 0.001) return '<0.001';
    return num.toFixed(3);
}

function exportAnovaCSV(rows) {
    if (!Array.isArray(rows) || rows.length === 0) return;
    const idToName = new Map(items.map(it => [String(it.id), it.text]));
    const headers = [
    'item_name','item','intended_facet','n_raters','k_facets','F','df1','df2_uncorr','df2_corr','epsilon','p_omnibus','eta_p2','intended_mean','others_mean','mean_diff','t_contrast','df_t','p_contrast_one_sided','dz','target_is_highest','keep','action','notes'
    ];
    const csv = [headers.join(',')];
    for (const r of rows) {
        const aug = { ...r,
            item_name: idToName.get(String(r.item)) || String(r.item),
            notes: (r.notes && String(r.notes).trim()) ? r.notes : 'sphericity=GG'
        };
        const line = headers.map(h => {
            const val = aug[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'number') return String(val);
            const s = String(val).replaceAll('"', '""');
            return /[,"]/.test(s) ? `"${s}"` : s;
        }).join(',');
        csv.push(line);
    }
    const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `anova-results-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}