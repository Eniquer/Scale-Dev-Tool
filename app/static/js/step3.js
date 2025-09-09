let items = [];
let subdimensions = [];
let ratings = {}; // current rater ratings
let ratingTable;
let raters = []; // [{id, name, ratings}]
let activeRaterId = null;
let step1Data = null;
let step2Data = null;
let aiPersonas = [];
let aiGenInProgress = false;
let aiGenAbortRequested = false;
// Persisted group description for AI rater persona generation
let persistedGroupDescription = 'a pool of experts with occupations as professors, PHD candidates, experts in the field and researchers.';

function ensureAbortGenerationButton() {
    const overlay = document.getElementById('loadingOverlay');
    if (!overlay) return;
    if (document.getElementById('abortGenerationBtn')) return; // already added
    const btn = document.createElement('button');
    btn.id = 'abortGenerationBtn';
    btn.type = 'button';
    btn.textContent = 'Abort';
    btn.className = 'btn btn-sm btn-warning mt-3 d-none';
    // Center below spinner: ensure overlay is a column flex container
    if (!overlay.classList.contains('flex-column')) {
        overlay.classList.add('flex-column');
    }
    overlay.style.flexDirection = 'column';
    overlay.style.gap = '0.75rem';
    btn.onclick = async () => {
        if (!aiGenInProgress) return;
        aiGenAbortRequested = true;
        window.displayInfo && window.displayInfo('warning', 'Abort requested. Finishing current request...');
    };
    overlay.style.position = overlay.style.position || 'fixed';
    overlay.appendChild(btn);
}

function showAbortButton() {
    const btn = document.getElementById('abortGenerationBtn');
    if (btn) btn.classList.remove('d-none');
}
function hideAbortButton() {
    const btn = document.getElementById('abortGenerationBtn');
    if (btn) btn.classList.add('d-none');
}

// =============== AI Rater Generation Modal (count + group description) ==================
async function ensureAIRaterGenModal() {
        if (document.getElementById('aiRaterGenModal')) return;
        const step1Data = await window.dataStorage.getData('data_step_1');
        constructDefinition = step1Data?.panel2?.savedDefinition || "";
        constructName = step1Data?.panel1?.constructName || "";

            generalExpertPrompt = `a pool of Experts in ${constructName}:${constructDefinition}
With occupations as professors, PHD candidates, experts in the field and researchers.`
        const wrapper = document.createElement('div');
        wrapper.innerHTML = `
        <div class="modal fade" id="aiRaterGenModal" tabindex="-1" aria-hidden="true" data-bs-backdrop="static">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Generate AI Raters</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="mb-3">
                            <label for="aiRaterCountInput" class="form-label small mb-1">Number of raters (1-30)</label>
                            <input type="number" class="form-control" id="aiRaterCountInput" min="1" max="30" value="5" />
                        </div>
                        <div class="mb-2">
                            <label for="aiRaterGroupDesc" class="form-label small mb-1">Additional context (optional)</label>
                            <textarea class="form-control small" id="aiRaterGroupDesc" rows="3" placeholder="${generalExpertPrompt}">${generalExpertPrompt}</textarea>
                        </div>
                        <div class="form-text small text-secondary">Context can shape persona style (e.g., senior clinical psychologists focused on ethics).</div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal" id="aiRaterGenCancel">Cancel</button>
                        <button type="button" class="btn btn-primary" id="aiRaterGenConfirm" disabled>Generate</button>
                    </div>
                </div>
            </div>
        </div>`;
        document.body.appendChild(wrapper);
        return generalExpertPrompt
}

async function showAIRaterGenModal() {
        let generalPrompt = await ensureAIRaterGenModal();
        return new Promise(resolve => {
                const modalEl = document.getElementById('aiRaterGenModal');
                const countInput = document.getElementById('aiRaterCountInput');
                const descInput = document.getElementById('aiRaterGroupDesc');
                const confirmBtn = document.getElementById('aiRaterGenConfirm');
                const cancelBtn = document.getElementById('aiRaterGenCancel');
                const bsModal = new bootstrap.Modal(modalEl);

                if (!descInput.value && generalPrompt) {
                    // Pre-fill description with general prompt
                    descInput.value = generalPrompt;
                }
                if (descInput && persistedGroupDescription) {
                    descInput.value = persistedGroupDescription;
                }

                function validate() {
                        const v = parseInt(countInput.value, 10);
                        confirmBtn.disabled = !(Number.isInteger(v) && v >= 1 && v <= 30);
                }
                validate();
                countInput.addEventListener('input', validate);

                const cleanup = () => {
                        countInput.removeEventListener('input', validate);
                        confirmBtn.onclick = null;
                        cancelBtn.onclick = null;
                        modalEl.removeEventListener('hidden.bs.modal', onHidden);
                };
                const onHidden = () => {
                        cleanup();
                        resolve(null); // resolve null if dismissed via backdrop/close
                };
                modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });

                confirmBtn.onclick = () => {
                    const cnt = parseInt(countInput.value, 10);
                    if (!(Number.isInteger(cnt) && cnt >= 1 && cnt <= 30)) return;
                    const desc = (descInput.value || '').trim();
                    // Update persisted value and save immediately
                    persistedGroupDescription = desc || persistedGroupDescription;
                    // Fire and forget persistence
                    saveStep3Data();
                    cleanup();
                    bsModal.hide();
                        resolve({ count: cnt, groupDescription: desc });
                };
                cancelBtn.onclick = () => {
                        cleanup();
                        bsModal.hide();
                        resolve(null);
                };
                bsModal.show();
                setTimeout(() => countInput?.focus(), 120);
        });
}

init()

// todo handle unidimensional
// todo no reflective selectionn on step4 when unidimensional

async function init(){
    step1Data = await window.dataStorage.getData('data_step_1');
    step2Data = await window.dataStorage.getData('data_step_2');
    const step3Data = await window.dataStorage.getData('data_step_3') || {};

    subdimensions = step1Data?.panel5?.subdimensions || [];
    items = step2Data?.items || [];
    raters = step3Data?.raters || [];
    activeRaterId = step3Data?.activeRaterId || (raters[0]?.id ?? null);
    ratings = (raters.find(r => r.id === activeRaterId)?.ratings) || {};
    if (typeof step3Data?.aiRaterGroupDescription === 'string' && step3Data?.aiRaterGroupDescription.trim()) {
        persistedGroupDescription = step3Data?.aiRaterGroupDescription;
    }

    wireRaterUI();
    renderRatingTable();

    // Inject analysis panel UI and wire actions
    wireAnalysisUI();

    // Auto-load saved ANOVA results if present
    loadSavedAnovaResults();

    // Prerequisite: items from Step 2
    if (!Array.isArray(step2Data?.items) || step2Data.items.length === 0) {
        window.ensurePersistentWarning('⚠️ Please complete Step 2 first: add items before rating them here.');
    }


}

// Persist raters, activeRaterId, and ratings
async function saveStep3Data() {
    // update current rater's ratings in raters array
    const idx = raters.findIndex(r => r.id === activeRaterId);
    if (idx !== -1) raters[idx].ratings = ratings;
    const stored = await window.dataStorage.getData('data_step_3') || {};
    const merged = { ...stored, raters, activeRaterId, aiRaterGroupDescription: persistedGroupDescription };
    return window.dataStorage.storeData('data_step_3', merged, false);
}

function buildRows() {
    return items.map(it => {
        const row = { id: it.id, Item: it.text };
        subdimensions.forEach(sd => {
            const key = sd.id; // internal key is id
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

            // Migrate any name-keyed ratings to id-keyed ratings on import
            const nameToId = Object.fromEntries(subdimensions.map(sd => [sd.name, sd.id]));
            raters = merged.map(r => {
                const newRatings = {};
                for (const [itemId, perItem] of Object.entries(r.ratings || {})) {
                    if (!perItem || typeof perItem !== 'object') continue;
                    newRatings[itemId] = {};
                    for (const [k, v] of Object.entries(perItem)) {
                        const sid = nameToId[k] || k;
                        newRatings[itemId][sid] = v;
                    }
                }
                return { ...r, ratings: newRatings };
            });
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
                subdimensionId: it.subdimensionId || null
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
        // Open modal for count + optional context
        const params = await showAIRaterGenModal();
        if (!params) return; // cancelled
        const { count, groupDescription } = params;

        // Persist current rater before generating
        const currentIdx = raters.findIndex(rr => rr.id === activeRaterId);
        if (currentIdx !== -1) {
            raters[currentIdx].ratings = ratings;
        }
        try {
            window.showLoading && window.showLoading();
            ensureAbortGenerationButton();
            showAbortButton();
            aiGenInProgress = true;
            aiGenAbortRequested = false;
            window.displayInfo && window.displayInfo('info', `Generating ${count} AI rater(s)...`);
            let successCount = 0;
            // Determine starting index: one higher than highest existing "AI Rater N"
            const getMaxAIRaterNum = () => {
                let max = 0;
                for (const r of raters) {
                    const m = /^AI rater\s*(\d+)$/i.exec(r.name || '');
                    if (m) {
                        const n = parseInt(m[1], 10);
                        if (!Number.isNaN(n) && n > max) max = n;
                    }
                }
                return max;
            };
            const baseNum = getMaxAIRaterNum() + 1;
            if (count && aiPersonas.length < 1) {
                await generatePersonas(count, groupDescription || '');
            }
            for (let i = 1; i <= count; i++) {
                if (aiGenAbortRequested) {
                    window.displayInfo && window.displayInfo('info', `Abort acknowledged. Stopping at ${i-1}/${count}.`);
                    break;
                }
                    
                try {


                    // Build prompt history with items & subdimensions in random order (user request: "in random order")
                    function shuffle(arr){
                        for(let i = arr.length - 1; i > 0; i--){
                            const j = Math.floor(Math.random() * (i + 1));
                            [arr[i], arr[j]] = [arr[j], arr[i]];
                        }
                        return arr;
                    }

                    // Shuffled copies (do not mutate originals)
                    const shuffledSubdimensions = shuffle([...subdimensions]);
                    const shuffledItems = shuffle([...items]);

                    // Simple escaper for double quotes inside item text
                    const esc = s => String(s).replace(/"/g, '\\"');
                    let personaDesc = getPersona(i-1) || 'Experienced subject-matter expert';
                    if (groupDescription) personaDesc += ` | Cohort context: ${groupDescription}`
                    let prompt = `
                    You are generating synthetic expert ratings for content validation following MacKenzie et al. (2011) Step 3 logic (content adequacy).
                            You will role‑play a single expert rater (the Persona) and rate how well each item reflects each subdimension of the construct. First answer in one short in-character line, then ONLY JSON as specified.
Persona (short description): ${personaDesc}

Inputs (randomized order):

    Subdimensions (with concise descriptions):
    ${shuffledSubdimensions.map(sd => `Dimensionname: ${sd.name}, Definition: ${sd.definition}`).join(';\n ')}

    Items (array of objects with id and text):
    ${shuffledItems.map(it => `{"id": "${it.id}", "text": "${esc(it.text)}"}`).join(',\n')}

Rating scale (integers 1-5):
1 = not representative / off‑target
2 = weak representation
3 = moderate / ambiguous
4 = strong representation
5 = very strong / essential

Generation rules:
- Rate each item against every subdimension definition.
- Discriminate: avoid uniformly high scores unless clearly warranted.
- Penalize vague / broad wording (1-2). Reward precise alignment (4-5).
- If item is clearly specific to one subdimension, keep others near midpoint or below unless justified.
- No missing keys: every item must include every subdimension as a key.

Persona influence (apply consistently):
- Strict/skeptical → slight downward shift, tighter variance.
- Enthusiastic/lenient → slight upward shift, occasional 5s.
- High domain expertise → more extremes (1-2 & 4-5), fewer 3s.
- Values clarity → penalize vague items further.

Quality checks (MUST PASS):
- Return valid JSON only.
- Include every item id from input (even though randomized in prompt).
- Include every subdimension name under each item.
- All ratings are integers 1-5.


Output schema (JSON only, no extra text, no markdown):
{
  "ratings": {
    "ITEM-ID": {
      "SUBDIMENSION_NAME_1": ITEMRATING_NUMBER,
      "SUBDIMENSION_NAME_2": ITEMRATING_NUMBER
    }
  }
}

`

                    const resp = await window.sendChat(prompt,[{
                            role: "system",
                            content: "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."
                        }]);
                    
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
                        const name = `AI rater ${seqNum}`;
                        const rawRatings = (parsed.ratings && typeof parsed.ratings === 'object') ? parsed.ratings : {};
                        // Transform name-keyed ratings => id-keyed ratings
                        const nameToId = Object.fromEntries(subdimensions.map(sd => [sd.name, sd.id]));
                        const transformed = {};
                        for (const [itemId, subObj] of Object.entries(rawRatings)) {
                            if (!subObj || typeof subObj !== 'object') continue;
                            transformed[itemId] = {};
                            for (const [subName, val] of Object.entries(subObj)) {
                                const sid = nameToId[subName] || subName; // fallback keep original key
                                transformed[itemId][sid] = val;
                            }
                        }
                        rater = { id, name, ratings: transformed };
                    } else if (Array.isArray(parsed) && parsed.length) {
                        const first = parsed[0];
                        const name = (first && typeof first.name === 'string' && first.name.trim()) ? first.name.trim() : `AI rater ${seqNum}`;
                        rater = { id: newId(), name, ratings: {} };
                    } else {
                        rater = { id: newId(), name: `AI rater ${seqNum}`, ratings: {} };
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
            if (aiGenAbortRequested) {
                // Persist partial progress
                await saveStep3Data();
                window.displayInfo && window.displayInfo('warning', `Generation aborted. Created ${successCount}/${count}.`);
            } else {
                window.displayInfo && window.displayInfo('info', `AI rater generation complete. Created ${successCount}/${count}.`);
            }
        } catch (err) {
            console.error('Generate AI raters error', err);
            window.displayInfo && window.displayInfo('danger', 'Could not generate AI raters.');
        } finally {
            aiGenInProgress = false;
            aiGenAbortRequested = false;
            hideAbortButton();
            await saveStep3Data(); // ensure all progress is stored
            window.hideLoading && window.hideLoading();
        }
    };
})();

function getPersona(id){
    const len = aiPersonas.length;
    const wrapped = ((id % len) + len) % len;
    return aiPersonas[wrapped] || null;
}

async function generatePersonas(targetCount,groupDescription){
    let maxIterations = 10
    let iteration = 0;
    let currentPersonas = [];
    try {
        while (iteration < maxIterations && currentPersonas.length < targetCount) {
            const amount = Math.min(targetCount - currentPersonas.length, 20);
            const batch = await window.genPersonaPool({ generatedPersonas: currentPersonas, groupDescription, amount });
            if (Array.isArray(batch) && batch.length){
                // Merge unique (avoid duplicates just in case)
                for (const p of batch){
                    if (currentPersonas.length >= targetCount) break;
                    if (!currentPersonas.includes(p)) currentPersonas.push(p);
                }
            }
            displayInfo('info', `Generated ${currentPersonas.length}/${targetCount}`);
            iteration++;
        }
        if (currentPersonas.length >= targetCount){
            displayInfo('success', `Successfully generated ${currentPersonas.length} personas.`);
        } else if (iteration === maxIterations){
            displayInfo('warning', `Stopped after ${iteration} iterations with ${currentPersonas.length}/${targetCount}.`);
        }
    } catch(err){
        console.error(err);
        displayInfo('error', 'Error generating personas.');
    } finally {
        aiPersonas = aiPersonas.concat(currentPersonas)
    }
}

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
            field: sd.id,
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
    const field = cell.getField(); // this is subdimension id now
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
                const v = perItem[sd.id];
        rows.push({
            item: String(it.id),
            rater: String(rId),
                        facet: sd.name, // keep human-readable name for analysis export
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
    // intendedMap must use the same facet identifiers as the long dataset.
    // longData rows currently use human-readable facet names (sd.name) in the 'facet' field,
    // so we translate each item's subdimensionId to its name here. This keeps the backend
    // analyzer happy (it matches intended_facet against observed facet values).
    // If we later switch longData facets to use sd.id instead, also switch this to ids
    // (and adapt display mapping after analysis).
    const subdimensionNameById = new Map(subdimensions.map(sd => [sd.id, sd.name]));
    const intendedMap = Object.fromEntries(
        items.map(it => [String(it.id), (subdimensionNameById.get(it.subdimensionId) || null)])
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
                const v = ((rRatings[it.id] || {})[sd.id]);
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
                <button type="button" id="bulkDeleteItemsBtn" class="btn btn-sm btn-danger ms-2">
                    <i class="bi bi-trash"></i> Delete items
                </button>
            </div>
        </div>
        <div class="d-flex justify-content-center">
        <div  style="max-width:100%">
        <div id="anova-summary" class="small text-secondary mb-2"></div>
        <div id="anova-results-table"></div>
        </div>
        </div>
    `;
    container.appendChild(panel);

    // Ensure bulk delete modal exists in DOM
    setupBulkDeleteItemsModal();

    document.getElementById('runAnovaBtn').onclick = async () => {
        try {
            window.showLoading && window.showLoading();
            const resp = await analyzeAnova({});
            const records = Array.isArray(resp?.result) ? resp.result : [];
            lastAnovaResults = records;
            renderAnovaResults(records);
            document.getElementById('exportAnovaBtn').disabled = (records.length === 0);
            // Persist analysis results within data_step_3 for auto-load on next visit
            persistAnovaResults(records);
            window.displayInfo && window.displayInfo('success', `Analysis complete (${records.length} item(s)).`);
        } catch (err) {
            console.error('ANOVA failed', err);
            window.displayInfo && window.displayInfo('danger', String(err?.message || err));
        } finally {
            window.hideLoading && window.hideLoading();
        }
    };

    document.getElementById('exportAnovaBtn').onclick = () => exportAnovaCSV(lastAnovaResults);

    // Open modal with items flagged as delete
    const bulkBtn = document.getElementById('bulkDeleteItemsBtn');
    bulkBtn.onclick = () => {
        if (!Array.isArray(lastAnovaResults) || lastAnovaResults.length === 0) {
            window.displayInfo && window.displayInfo('warning', 'Run analysis first to identify deletable items.');
            return;
        }
        populateBulkDeleteItemsList();
        const modalEl = document.getElementById('bulkDeleteItemsModal');
        const bsModal = new bootstrap.Modal(modalEl);
        bsModal.show();
    };
}

// Load saved ANOVA results (if any) and render on page load
async function loadSavedAnovaResults() {
    try {
        const step3 = await window.dataStorage.getData('data_step_3');
        let rows = Array.isArray(step3?.anovaResults?.rows) ? step3.anovaResults.rows : [];
        const noItems = !Array.isArray(items) || items.length === 0;
        if (rows.length > 0 && !noItems) {
            lastAnovaResults = rows;
            renderAnovaResults(rows);
            const btn = document.getElementById('exportAnovaBtn');
            if (btn) btn.disabled = false;
        } else {
             lastAnovaResults = [];
            if (anovaTable) {
                try { anovaTable.destroy(); } catch {}
            }
            const btn = document.getElementById('exportAnovaBtn');
            if (btn) btn.disabled = true;
            const summaryEl = document.getElementById('anova-summary');
            if (summaryEl) summaryEl.textContent = '';
        }
    } catch (e) {
        console.warn('No saved ANOVA results to load or failed to load.', e);
    }
}

// Helper: persist ANOVA results inside data_step_3 while preserving other fields
async function persistAnovaResults(records) {
    try {
        const step3 = await window.dataStorage.getData('data_step_3') || {};
        step3.anovaResults = { rows: Array.isArray(records) ? records : [], ts: new Date().toISOString() };
        await window.dataStorage.storeData('data_step_3', step3, false);
    } catch (e) {
        console.warn('Failed to persist ANOVA results inside data_step_3', e);
    }
}

// Create (if needed) the modal for bulk deleting items
function setupBulkDeleteItemsModal() {
    if (document.getElementById('bulkDeleteItemsModal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'bulkDeleteItemsModal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `
      <div class="modal-dialog modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title">Delete Items</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="form-check mb-2">
              <input class="form-check-input" type="checkbox" id="bulkDeleteItemsSelectAll">
              <label class="form-check-label" for="bulkDeleteItemsSelectAll">Select all</label>
            </div>
            <div id="bulkDeleteItemsList" class="list-group"></div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-danger" id="confirmBulkDeleteItems">Delete selected</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);

    // Wire select all toggle
    modal.addEventListener('change', (e) => {
        if (e.target && e.target.id === 'bulkDeleteItemsSelectAll') {
            const checked = e.target.checked;
            const list = document.getElementById('bulkDeleteItemsList');
            list.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checked);
        }
    });

    // Wire confirm deletion
    modal.querySelector('#confirmBulkDeleteItems').onclick = handleConfirmBulkDeleteItems;
}

// Populate the modal list with items whose action suggests deletion
function populateBulkDeleteItemsList() {
    const list = document.getElementById('bulkDeleteItemsList');
    const selectAll = document.getElementById('bulkDeleteItemsSelectAll');
    if (!list) return;
    list.innerHTML = '';
    selectAll.checked = false;

    const deletable = (lastAnovaResults || []).filter(r => {
        const a = String(r.action || '').toLowerCase();
        return a.includes('delete');
    });

    if (deletable.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'text-secondary small';
        empty.textContent = 'No items are currently flagged as delete.';
        list.appendChild(empty);
        return;
    }

    const idToName = new Map(items.map(it => [String(it.id), it.text]));
    // De-duplicate by item id
    const seen = new Set();
    for (const r of deletable) {
        const id = String(r.item);
        if (seen.has(id)) continue;
        seen.add(id);
        const label = document.createElement('label');
        label.className = 'list-group-item d-flex align-items-center justify-content-between';
        const name = idToName.get(id) || id;
        label.innerHTML = `
          <div class="d-flex align-items-center">
            <input class="form-check-input me-2" type="checkbox" value="${id}">
            <span>${name}</span>
          </div>
          <span class="badge bg-danger-subtle text-danger">${r.action}</span>
        `;
        list.appendChild(label);
    }
}

async function handleConfirmBulkDeleteItems() {
    const modalEl = document.getElementById('bulkDeleteItemsModal');
    const list = document.getElementById('bulkDeleteItemsList');
    if (!list) return;
    const selected = [...list.querySelectorAll('input[type="checkbox"]:checked')].map(cb => String(cb.value));
    if (selected.length === 0) {
        window.displayInfo && window.displayInfo('warning', 'Select at least one item to delete.');
        return;
    }

    const confirmed = await (window.customConfirm ? window.customConfirm({
        title: 'Delete Items?',
        message: `Delete ${selected.length} selected item(s)? This will remove them from the dataset and ratings.`,
        confirmText: 'Delete',
        cancelText: 'Cancel',
    }) : Promise.resolve(confirm(`Delete ${selected.length} item(s)?`)));
    if (!confirmed) return;

    const selSet = new Set(selected.map(String));

    // Remove from items list
    items = items.filter(it => !selSet.has(String(it.id)));
    // Persist to step2 data storage
    try {
        const stored = await window.dataStorage.getData('data_step_2') || {};
        stored.items = items;
        await window.dataStorage.storeData('data_step_2', stored, false);
    } catch (e) {
        console.warn('Failed to persist updated items to data_step_2', e);
    }

    // Remove ratings for deleted items for all raters (handle string/number keys)
    for (const r of raters) {
        const rr = r.ratings || {};
        for (const id of selected) {
            const numId = Number(id);
            if (rr[id] !== undefined) delete rr[id];
            if (!Number.isNaN(numId) && rr[numId] !== undefined) delete rr[numId];
        }
        r.ratings = rr;
    }
    // Update current ratings snapshot
    for (const id of selected) {
        const numId = Number(id);
        if (ratings) {
            if (ratings[id] !== undefined) delete ratings[id];
            if (!Number.isNaN(numId) && ratings[numId] !== undefined) delete ratings[numId];
        }
    }
    await saveStep3Data();

    // Filter last analysis results and persist
    if (Array.isArray(lastAnovaResults) && lastAnovaResults.length > 0) {
        lastAnovaResults = lastAnovaResults.filter(r => !selSet.has(String(r.item)));
        renderAnovaResults(lastAnovaResults);
    persistAnovaResults(lastAnovaResults);
    }

    // Refresh rating table
    renderRatingTable();

    // Close modal
    try {
        const bsModal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
        bsModal.hide();
    } catch {}

    window.displayInfo && window.displayInfo('success', `Deleted ${selected.length} item(s).`);
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
    const displayRows = (rows || []).map(r => {
        let second_highest_facet = '';
        let second_highest_facet_mean = null;
        if (r && r.all_facet_means && typeof r.all_facet_means === 'object') {
            const entries = Object.entries(r.all_facet_means)
                .filter(([, v]) => Number.isFinite(v))
                .sort((a, b) => b[1] - a[1]);
            if (entries.length >= 2) {
                second_highest_facet = entries[1][0];
                second_highest_facet_mean = entries[1][1];
            }
        }
        return {
            ...r,
            second_highest_facet,
            second_highest_facet_mean,
            second_highest_display: (second_highest_facet && Number.isFinite(second_highest_facet_mean)) ? `${second_highest_facet}:${fmtNum(second_highest_facet_mean,2)}` : '',
            highest_display: (r.highest_facet && Number.isFinite(r.highest_facet_mean)) ? `${r.highest_facet}:${fmtNum(r.highest_facet_mean,2)}` : (r.highest_facet || ''),
            item_name: idToName.get(String(r.item)) || String(r.item),
            df2_disp: (Number.isFinite(r.df2_corr) && r.df2_corr !== null) ? r.df2_corr : r.df2_uncorr,
            notes: (r.notes && String(r.notes).trim()) ? r.notes : 'sphericity=GG'
        };
    });

    const columns = [
    { title: 'Item', field: 'item', headerSort: true, headerTooltip: 'Item ID (cell shows item text; native tooltip shows ID).', tooltip: function(cell){
            const id = cell.getValue();
            return id ? `ID: ${id}` : '';
        }, formatter: cell => {
            const id = cell.getValue();
            return (new Map(items.map(it => [String(it.id), it.text]))).get(String(id)) || String(id || '');
        } },
    { title: 'Intended', field: 'intended_facet', headerSort: true, headerTooltip: 'Facet the item was designed/intended to represent.' },
    { title: 'n_raters', field: 'n_raters', hozAlign: 'right', headerTooltip: 'Number of raters with a non-missing rating for this item.' },
    { title: 'k_facets', field: 'k_facets', hozAlign: 'right', headerTooltip: 'Total number of facets (subdimensions) rated.' },
    { title: 'Intended mean', field: 'intended_mean', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Mean rating on the intended facet for this item.' },
    { title: 'Others mean', field: 'others_mean', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Average of the means of all non-intended facets.' },
    { title: 'Mean diff', field: 'mean_diff', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Intended mean minus Others mean (discriminant strength).' },
    { title: 'Item mean', field: 'item_mean', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Average rating across all facets (overall representativeness).' },
    // Highest facet with its mean value (facet:mean)
    { title: 'Highest facet', field: 'highest_display', hozAlign: 'center', headerTooltip: 'Facet with the highest mean rating (facet:mean).', sorter: (a,b,aRow,bRow) => {
            const av = aRow.getData().highest_facet_mean;
            const bv = bRow.getData().highest_facet_mean;
            const aNum = Number.isFinite(av) ? av : -Infinity;
            const bNum = Number.isFinite(bv) ? bv : -Infinity;
            return aNum - bNum;
        } },
    { title: '2nd highest', field: 'second_highest_display', sorter: (a,b,aRow,bRow) => {
            const av = aRow.getData().second_highest_facet_mean;
            const bv = bRow.getData().second_highest_facet_mean;
            const aNum = Number.isFinite(av) ? av : -Infinity;
            const bNum = Number.isFinite(bv) ? bv : -Infinity;
            return aNum - bNum;
    }, widthGrow: 1, headerTooltip: 'Second highest facet and its mean value.' },
    { title: 'p(RM-ANOVA, GG)', field: 'p_omnibus', formatter: cell => fmtP(cell.getValue()), hozAlign: 'right', headerTooltip: 'Greenhouse-Geisser corrected omnibus repeated-measures ANOVA p-value.' },
    { title: 'p(>0)', field: 'p_contrast_one_sided', formatter: cell => fmtP(cell.getValue()), hozAlign: 'right', headerTooltip: 'One-sided contrast p-value testing intended facet > average of others.' },
    { title: 'Highest?', field: 'target_is_highest', formatter: 'tickCross', hozAlign: 'center', headerTooltip: 'Tick if intended facet has the highest mean among all facets.' },
    { title: 'ηp²', field: 'eta_p2', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Partial eta squared (effect size for facet differences).' },
    { title: 'd_z', field: 'dz', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Within-subject standardized mean difference (Cohen\'s d_z) for planned contrast.' },
    { title: 'epsilon', field: 'epsilon', formatter: cell => fmtNum(cell.getValue(), 3), hozAlign: 'right', headerTooltip: 'Greenhouse-Geisser epsilon (sphericity estimate).' },
    { title: 'Action', field: 'action', headerSort: true, headerTooltip: 'Suggested decision: keep / revise / delete (heuristic rules).' },
    { title: 'Notes', field: 'notes', widthGrow: 2, headerTooltip: 'Additional notes; default indicates GG correction was applied.' }
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
        'item_name','item','intended_facet','n_raters','k_facets','F','df1','df2_uncorr','df2_corr','epsilon','p_omnibus','eta_p2',
        'intended_mean','others_mean','mean_diff','item_mean','highest_facet','highest_facet_mean','t_contrast','df_t','p_contrast_one_sided','dz',
        'target_is_highest','keep','action','all_facet_means','other_facet_means','notes'
    ];
    const csv = [headers.join(',')];
    for (const r of rows) {
        const aug = { ...r,
            item_name: idToName.get(String(r.item)) || String(r.item),
            notes: (r.notes && String(r.notes).trim()) ? r.notes : 'sphericity=GG'
        };
        const line = headers.map(h => {
            let val = aug[h];
            if ((h === 'all_facet_means' || h === 'other_facet_means') && val && typeof val === 'object') {
                try { val = JSON.stringify(val); } catch { val = ''; }
            }
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













