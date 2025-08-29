// Step 4 initialization: load construct name, saved definition, subdimensions, and items

// Module-level variables (prefixed to avoid collisions)
let constructName = '';
let savedDefinition = '';
let subdimensions = [];
let dimensionality = '';
let items = [];
// Stored facet measurement modes and indicator directions
let facetModes = {}; // { facetId: 'reflective' | 'formative' }
// indicators: [{facetId, itemId, direction}] direction: 'out' (reflective) or 'in' (formative)
let indicators = [];
// Scaling rules per facet: { facetId: { method: 'fix_loading', refItemId } | { method: 'fix_variance' } }
let facetScaling = {}; 
// Second-order (overall) construct configuration
let secondOrder = { type: null, scaling: { method: 'fix_loading', refFacetId: null } }; // type: 'reflective' | 'formative' | null

// Raw source objects (optional for debugging / further use)
let step1Raw = null;
let step2Raw = null;

/**
 * init (Step 4)
 * Fetches prior step data from IndexedDB via dataStorage and populates
 * module-level variables for use by subsequent Step 4 UI logic.
 * - Construct name: Step 1 panel1.constructName
 * - Saved definition: Step 1 panel2.savedDefinition (fallback: resultingDefinition)
 * - Subdimensions: Step 1 panel5.subdimensions (empty array if unidimensional)
 * - Items: Step 2 items array
 * Returns an object snapshot of loaded values for convenience.
 */
async function init() {
	try {
		// Load stored data for steps 1 & 2
		step1Raw = await window.dataStorage.getData('data_step_1') || {};
		step2Raw = await window.dataStorage.getData('data_step_2') || {};

		// Extract construct name
		constructName = step1Raw?.panel1?.constructName || '';

		// Extract saved (or resulting) definition
		savedDefinition = step1Raw?.panel2?.savedDefinition
			|| step1Raw?.panel2?.resultingDefinition
			|| '';

        // Extract dimensionality (fallback: infer from presence of subdimensions)
        dimensionality = step1Raw?.panel4?.dimensionality;
		
        // Extract subdimensions (only present if multidimensional)
		subdimensions = step1Raw?.panel5?.subdimensions || [];

		// Extract items from Step 2
		items = step2Raw?.items || [];

		// Optional: expose a consolidated object for debugging/inspection
		window.step4Data = {
			constructName: constructName,
			savedDefinition: savedDefinition,
			subdimensions: subdimensions,
            dimensionality: dimensionality,
			items: items
		};

		// Load any stored measurement model specifics (Step 4 data)
		await loadStep4Model();
		// Render first-order facets panel
		renderFirstOrderFacets();
		// Render/initialize second-order panel if needed
		initSecondOrderPanel();
		// Wire auto-save after initial render
		attachAutoSaveHandlers();

		return window.step4Data; // snapshot
	} catch (err) {
		console.error('[Step4:init] Failed to load prior step data:', err);
		window.displayInfo?.('error', 'Failed to load Step 4 data.');
		return null;
	}
}

// Auto-run when DOM is ready (mirrors earlier step files pattern)
document.addEventListener('DOMContentLoaded', () => { init(); });

// Render subdimensions (first-order facets) in the panel
function renderFirstOrderFacets() {
	const list = document.getElementById('firstOrderFacetsList');
	const help = document.getElementById('firstOrderFacetsHelp');
	if (!list) return;
	list.innerHTML = '';

	if (!dimensionality || dimensionality === 'Unidimensional') {
		// Show a single aggregated card with all items
		const panel = document.getElementById('firstOrderFacetsPanel');
		if (panel) panel.classList.remove('d-none');
		const allItems = (items || []).slice().sort((a,b)=>a.id-b.id);
		const pseudoId = 'unidim';
		ensureScalingDefaults(pseudoId, allItems);
		const itemsHtml = allItems.length
			? `<div class="mm-item-grid">${allItems.map(it => { const t = escapeHtml(it.text); const cls = t.length>80? 'mm-item-tag long' : 'mm-item-tag'; return `<span class=\"${cls}\" title=\"${t}\">${t}</span>`; }).join('')}</div>`
			: '<div class="text-muted small mb-2">No items added in Step 2.</div>';
		const col = document.createElement('div');
		col.className = 'col-12';
		const scale = facetScaling[pseudoId] || {};
		const method = scale.method || 'fix_loading';
		const refItemId = scale.refItemId;
		const refSelect = allItems.length ? `<select class=\"form-select form-select-sm mt-1 facet-ref-item\" data-facet=\"${pseudoId}\">${allItems.map(it=>`<option value=\"${it.id}\" ${it.id===refItemId?'selected':''}>${escapeHtml(shorten(it.text,40))}</option>`).join('')}</select>` : '<div class=\"small text-muted mt-1\">No items to reference</div>';
		col.innerHTML = `
			<div class="facet-card h-100 d-flex flex-column">
				<h5 class="mb-1">All Items</h5>
				<p class="small text-muted mb-2">Unidimensional construct (no first-order facets defined).</p>
				<div class="mb-2">
					<div class="small fw-bold mb-1">Scaling Rule</div>
					<div class="form-check form-check-inline small">
						<input class="form-check-input facet-scale-radio" type="radio" name="facet-scale-${pseudoId}" id="scale-${pseudoId}-fixload" value="fix_loading" ${method==='fix_loading'?'checked':''} data-facet="${pseudoId}">
						<label class="form-check-label" for="scale-${pseudoId}-fixload">Fix one loading to 1.0</label>
					</div>
					<div class="form-check form-check-inline small">
						<input class="form-check-input facet-scale-radio" type="radio" name="facet-scale-${pseudoId}" id="scale-${pseudoId}-fixvar" value="fix_variance" ${method==='fix_variance'?'checked':''} data-facet="${pseudoId}">
						<label class="form-check-label" for="scale-${pseudoId}-fixvar">Fix latent variance to 1.0</label>
					</div>
					<div class="facet-ref-wrapper ${method==='fix_loading'?'':'d-none'}" data-facet="${pseudoId}">
						<label class="small mt-2">Reference Item</label>
						${refSelect}
					</div>
				</div>
				<div class="mb-1 small fw-bold">Items (${allItems.length})</div>
				<div class="flex-grow-1 d-flex flex-column mb-1" style="max-height:220px; overflow:auto;">${itemsHtml}</div>
			</div>`;
		list.appendChild(col);
		return;
	}

	if (!subdimensions.length) {
		help.textContent = 'No subdimensions defined in Step 1.';
		return;
	}

	subdimensions.forEach(sd => {
		const col = document.createElement('div');
		col.className = 'col-12 col-md-6 col-lg-4';
		// Items belonging to this subdimension (IDs kept internally, not shown)
		const facetItems = (items || []).filter(it => it.subdimensionId === sd.id).sort((a,b)=>a.id-b.id);
		ensureScalingDefaults(sd.id, facetItems);
		const itemsHtml = facetItems.length
			? `<div class="mm-item-grid">${facetItems.map(it => { const t = escapeHtml(it.text); const cls = t.length>80? 'mm-item-tag long' : 'mm-item-tag'; return `<span class="${cls}" title="${t}">${t}</span>`; }).join('')}</div>`
			: '<div class="text-muted small mb-2">No items assigned</div>';
		const scale = facetScaling[sd.id] || {};
		const method = scale.method || 'fix_loading';
		const refItemId = scale.refItemId;
		const refSelect = facetItems.length ? `<select class=\"form-select form-select-sm mt-1 facet-ref-item\" data-facet=\"${sd.id}\">${facetItems.map(it=>`<option value=\"${it.id}\" ${it.id===refItemId?'selected':''}>${escapeHtml(shorten(it.text,40))}</option>`).join('')}</select>` : '<div class=\"small text-muted mt-1\">No items to reference</div>';

		const currentMode = facetModes[sd.id] || '';
		col.innerHTML = `
			<div class="facet-card h-100 d-flex flex-column">
				<h5 class="mb-1">${escapeHtml(sd.name || '(Unnamed)')}</h5>
				<p class="small text-muted mb-2" style="white-space:pre-wrap;">${escapeHtml(sd.definition || '')}</p>
				<div class="mb-2">
					<div class="small fw-bold mb-1">Measurement Type</div>
					<div class="btn-group btn-group-sm" role="group" aria-label="Measurement Type">
						<input type="radio" class="btn-check" name="facet-mode-${sd.id}" id="facet-${sd.id}-refl" value="reflective" ${currentMode==='reflective' ? 'checked' : ''}>
						<label class="btn btn-outline-info" for="facet-${sd.id}-refl" title="Items are effects (interchangeable)">Reflective</label>
						<input type="radio" class="btn-check" name="facet-mode-${sd.id}" id="facet-${sd.id}-form" value="formative" ${currentMode==='formative' ? 'checked' : ''}>
						<label class="btn btn-outline-info" for="facet-${sd.id}-form" title="Items are causes (non-interchangeable)">Formative</label>
					</div>
				</div>
				<div class="mb-2">
					<div class="small fw-bold mb-1">Scaling Rule</div>
					<div class="form-check form-check-inline small">
						<input class="form-check-input facet-scale-radio" type="radio" name="facet-scale-${sd.id}" id="scale-${sd.id}-fixload" value="fix_loading" ${method==='fix_loading'?'checked':''} data-facet="${sd.id}" ${facetItems.length? '' : 'disabled'}>
						<label class="form-check-label" for="scale-${sd.id}-fixload">Fix one loading</label>
					</div>
					<div class="form-check form-check-inline small">
						<input class="form-check-input facet-scale-radio" type="radio" name="facet-scale-${sd.id}" id="scale-${sd.id}-fixvar" value="fix_variance" ${method==='fix_variance'?'checked':''} data-facet="${sd.id}">
						<label class="form-check-label" for="scale-${sd.id}-fixvar">Fix variance</label>
					</div>
					<div class="facet-ref-wrapper ${method==='fix_loading'?'':'d-none'}" data-facet="${sd.id}">
						<label class="small mt-2">Reference Item</label>
						${refSelect}
					</div>
				</div>
                
				
                <button class="btn me-3 collapse-btn collapsed" type="button"
                    data-bs-toggle="collapse" data-bs-target="#collapse-${sd.id}"
                    aria-expanded="true" aria-controls="collapse-${sd.id}">
                    <div class="mb-1 small fw-bold">
                    <i class="bi bi-chevron-up"></i>
                    Items (${facetItems.length})</div>
                    </button>
                <div class="collapse" id="collapse-${sd.id}">
				<div class="flex-grow-1 d-flex flex-column mb-1" style="max-height:160px; overflow:auto;">${itemsHtml}</div>
                </div>
			</div>`;
		list.appendChild(col);
	});
}

// Load existing step4 measurement model if present
async function loadStep4Model(){
	const stored = await window.dataStorage.getData('data_step_4') || {};
	facetModes = stored.facetModes || {};
	indicators = stored.indicators || [];
	facetScaling = stored.facetScaling || {};
	secondOrder = stored.secondOrder || secondOrder;
	// If legacy facets array exists from earlier implementation, drop it (subdimensions live only in Step 1)
	if (stored.facets) {
		delete stored.facets; // remove redundant source
		await window.dataStorage.storeData('data_step_4', stored, false);
	}
	// Rebuild indicators from facetModes + items if missing
	if (!indicators.length && Object.keys(facetModes).length){
		indicators = buildIndicatorsFromModes();
	}
}

function attachAutoSaveHandlers(){
	// Delegate: listen for changes on any facet mode radio
	document.addEventListener('change', e => {
		if (e.target && e.target.matches('input[type="radio"][name^="facet-mode-"]')) {
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('input.facet-scale-radio')) {
			handleScaleRadioChange(e.target);
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('select.facet-ref-item')) {
			const facetId = e.target.getAttribute('data-facet');
			if (facetScaling[facetId]) {
				facetScaling[facetId].refItemId = Number(e.target.value);
			}
			scheduleAutoSave();
		}
		// Second-order type change
		if (e.target && e.target.matches('input.second-order-type')) {
			secondOrder.type = e.target.value; // reflective | formative
			ensureSecondOrderScalingDefaults();
			updateSecondOrderUI();
			scheduleAutoSave();
		}
		// Second-order scaling method
		if (e.target && e.target.matches('input.second-order-scale')) {
			secondOrder.scaling.method = e.target.value;
			if (secondOrder.scaling.method === 'fix_loading') {
				ensureSecondOrderScalingDefaults();
			} else {
				secondOrder.scaling.refFacetId = null;
			}
			updateSecondOrderUI();
			scheduleAutoSave();
		}
		// Second-order reference facet selection
		if (e.target && e.target.id === 'secondOrderRefFacet') {
			secondOrder.scaling.refFacetId = e.target.value || null;
			scheduleAutoSave();
		}
	});
}

let autoSaveTimer = null;
function scheduleAutoSave(){
	if (autoSaveTimer) clearTimeout(autoSaveTimer);
	autoSaveTimer = setTimeout(() => {
		saveFacetModes(true);
	}, 400); // debounce 400ms
}

function saveFacetModes(isAuto=false){
	// Collect current selections
	if (subdimensions.length){
		subdimensions.forEach(sd => {
			const refl = document.getElementById(`facet-${sd.id}-refl`);
			const form = document.getElementById(`facet-${sd.id}-form`);
			if (refl?.checked) facetModes[sd.id] = 'reflective';
			else if (form?.checked) facetModes[sd.id] = 'formative';
		});
	}
	// Collect scaling selections (including unidim pseudo facet if present)
	collectScalingSelections();
	// Rebuild indicators array
	indicators = buildIndicatorsFromModes();
	// No second-order indicators yet (kept conceptual)
	persistStep4();
	if (!isAuto) {
		window.displayInfo?.('success', 'Facet measurement types saved.');
	}
}

function buildIndicatorsFromModes(){
	const result = [];
	subdimensions.forEach(sd => {
		const mode = facetModes[sd.id];
		if (!mode) return;
		const dir = mode === 'reflective' ? 'out' : 'in';
		// items belonging to facet
		const facetItems = (items || []).filter(it => it.subdimensionId === sd.id);
		facetItems.forEach(it => {
			result.push({ facetId: sd.id, itemId: it.id, direction: dir });
		});
	});
	return result;
}

async function persistStep4(){
	const existing = await window.dataStorage.getData('data_step_4') || {};
	// Remove any legacy facets key to avoid duplicate truth
	if (existing.facets) delete existing.facets;
	const payload = { facetModes, indicators, facetScaling, secondOrder, updatedAt: new Date().toISOString() };
	await window.dataStorage.storeData('data_step_4', payload, false);
}

function ensureScalingDefaults(facetId, facetItems){
	if (!facetScaling[facetId]) {
		if (facetItems.length) {
			// choose clearest item: shortest text length
			const ref = facetItems.slice().sort((a,b)=>a.text.length - b.text.length)[0];
			facetScaling[facetId] = { method: 'fix_loading', refItemId: ref.id };
		} else {
			facetScaling[facetId] = { method: 'fix_variance' };
		}
	} else if (facetScaling[facetId].method === 'fix_loading') {
		// Ensure reference item still exists
		if (!facetItems.find(it => it.id === facetScaling[facetId].refItemId)) {
			if (facetItems.length) {
				facetScaling[facetId].refItemId = facetItems[0].id;
			} else {
				facetScaling[facetId] = { method: 'fix_variance' };
			}
		}
	}
}

// ---------- Second-Order Panel Logic ----------
function initSecondOrderPanel(){
	const panel = document.getElementById('secondOrderPanel');
	if (!panel) return;
	if (!subdimensions.length || dimensionality === 'Unidimensional') {
		// keep hidden
		panel.classList.add('d-none');
		return;
	}
	// Show panel
	panel.classList.remove('d-none');
	// Populate title & definition
	document.getElementById('secondOrderTitle').textContent = constructName || 'Overall Construct';
	document.getElementById('secondOrderDefinition').textContent = savedDefinition || '';
	// Restore radio selection
	if (secondOrder.type === 'reflective') {
		const r = document.getElementById('secondOrderTypeReflective'); if (r) r.checked = true;
	} else if (secondOrder.type === 'formative') {
		const r = document.getElementById('secondOrderTypeFormative'); if (r) r.checked = true;
	} else {
		// default none (keep both unchecked)
	}
	ensureSecondOrderScalingDefaults();
	updateSecondOrderUI();
}

function ensureSecondOrderScalingDefaults(){
	if (!secondOrder.type) return;
	if (!secondOrder.scaling) secondOrder.scaling = { method: 'fix_loading', refFacetId: null };
	if (secondOrder.scaling.method === 'fix_loading') {
		if (!secondOrder.scaling.refFacetId && subdimensions.length) {
			// Prefer a reflective first-order facet if overall type is reflective; else first facet
			const pref = subdimensions.find(sd => facetModes[sd.id] === 'reflective') || subdimensions[0];
			secondOrder.scaling.refFacetId = pref?.id || null;
		}
	} else {
		secondOrder.scaling.refFacetId = null;
	}
}

function updateSecondOrderUI(){
	const scalingWrapper = document.getElementById('secondOrderScalingWrapper');
	if (!scalingWrapper) return;
	if (!secondOrder.type) {
		scalingWrapper.classList.add('d-none');
		return;
	}
	scalingWrapper.classList.remove('d-none');
	// Set method radios
	const fixLoad = document.getElementById('secondOrderScaleFixLoad');
	const fixVar = document.getElementById('secondOrderScaleFixVar');
	if (secondOrder.scaling.method === 'fix_loading') { if (fixLoad) fixLoad.checked = true; }
	else if (secondOrder.scaling.method === 'fix_variance') { if (fixVar) fixVar.checked = true; }
	const refWrapper = document.getElementById('secondOrderRefFacetWrapper');
	if (secondOrder.scaling.method === 'fix_loading') refWrapper.classList.remove('d-none'); else refWrapper.classList.add('d-none');
	populateSecondOrderRefSelect();
}

function populateSecondOrderRefSelect(){
	const sel = document.getElementById('secondOrderRefFacet');
	if (!sel) return;
	sel.innerHTML = '';
	if (secondOrder.scaling.method !== 'fix_loading') return;
	subdimensions.forEach(sd => {
		const opt = document.createElement('option');
		opt.value = sd.id;
		opt.textContent = sd.name || '(Unnamed)';
		if (sd.id === secondOrder.scaling.refFacetId) opt.selected = true;
		sel.appendChild(opt);
	});
	if (!secondOrder.scaling.refFacetId && subdimensions.length) {
		sel.value = subdimensions[0].id;
		secondOrder.scaling.refFacetId = subdimensions[0].id;
	}
}

function collectScalingSelections(){
	// For each facet scaling radios
	const radios = document.querySelectorAll('input.facet-scale-radio');
	radios.forEach(r => {
		if (r.checked) {
			const facetId = r.getAttribute('data-facet');
			const method = r.value;
			if (method === 'fix_loading') {
				const sel = document.querySelector(`select.facet-ref-item[data-facet="${facetId}"]`);
				const refItemId = sel ? Number(sel.value) : null;
				facetScaling[facetId] = { method, refItemId };
			} else {
				facetScaling[facetId] = { method: 'fix_variance' };
			}
		}
	});
}

function handleScaleRadioChange(radio){
	const facetId = radio.getAttribute('data-facet');
	const method = radio.value;
	const wrapper = document.querySelector(`.facet-ref-wrapper[data-facet="${facetId}"]`);
	if (method === 'fix_loading') {
		if (wrapper) wrapper.classList.remove('d-none');
		// If switching to fix_loading and no ref yet, pick first option
		if (!facetScaling[facetId] || facetScaling[facetId].method !== 'fix_loading') {
			const sel = wrapper?.querySelector('select.facet-ref-item');
			const refItemId = sel ? Number(sel.value) : null;
			facetScaling[facetId] = { method: 'fix_loading', refItemId };
		}
	} else { // fix_variance
		if (wrapper) wrapper.classList.add('d-none');
		facetScaling[facetId] = { method: 'fix_variance' };
	}
}

function shorten(str,len){
	if (!str) return '';
	return str.length > len ? str.slice(0,len-1)+'…' : str;
}

function escapeHtml(str){
	if (str == null) return '';
	return String(str)
		.replace(/&/g,'&amp;')
		.replace(/</g,'&lt;')
		.replace(/>/g,'&gt;')
		.replace(/"/g,'&quot;')
		.replace(/'/g,'&#39;');
}

