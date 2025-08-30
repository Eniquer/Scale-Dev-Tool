// Step 4 initialization: load construct name, saved definition, subdimensions, and items

// Module-level variables (prefixed to avoid collisions)
let constructName = '';
let savedDefinition = '';
let subdimensions = [];
let dimensionality = '';
let items = [];
let overallCode = '';
// Track disabled (excluded) items per facet id (including 'unidim')
let facetDisabledItems = {};
// Stored facet measurement modes and indicator directions
let facetModes = {}; // { facetId: 'reflective' | 'formative' }
// indicators: [{facetId, itemId, direction, global?}] direction: 'out' (reflective) or 'in' (formative)
let indicators = [];
// Scaling rules per facet: { facetId: { method: 'fix_loading', refItemId } | { method: 'fix_variance' } }
let facetScaling = {}; 
// Second-order (overall) construct configuration
let secondOrder = { type: null, scaling: { method: 'fix_loading', refFacetId: null } }; // type: 'reflective' | 'formative' | null
// Global reflective items (two optional) per formative facet: { facetId: [ { id, text }, { id, text } ] }
let globalReflective = {};

// Raw source objects (optional for debugging / further use)
let step1Raw = null;
let step2Raw = null;

async function init() {
	try {
		step1Raw = await window.dataStorage.getData('data_step_1') || {};
		step2Raw = await window.dataStorage.getData('data_step_2') || {};
		constructName = step1Raw?.panel1?.constructName || '';
		savedDefinition = step1Raw?.panel2?.savedDefinition || step1Raw?.panel2?.resultingDefinition || '';
		dimensionality = step1Raw?.panel4?.dimensionality;
		subdimensions = step1Raw?.panel5?.subdimensions || [];
		items = step2Raw?.items || [];
		overallCode = overallCode || deriveShortCode(constructName);
		window.step4Data = { constructName, savedDefinition, subdimensions, dimensionality, items };
		await loadStep4Model();
		if (!overallCode) overallCode = deriveShortCode(constructName);
		renderFirstOrderFacets();
		initSecondOrderPanel();
		refreshLavaanPanel();
		attachAutoSaveHandlers();
		attachLavaanPanelHandlers();
		return window.step4Data;
	} catch (err) {
		console.error('[Step4:init] Failed to load prior step data:', err);
		window.displayInfo?.('error', 'Failed to load Step 4 data.');
		return null;
	}
}
document.addEventListener('DOMContentLoaded', () => { init(); });

function renderFirstOrderFacets() {
	const list = document.getElementById('firstOrderFacetsList');
	const help = document.getElementById('firstOrderFacetsHelp');
	if (!list) return;
	list.innerHTML = '';

	if (!dimensionality || dimensionality === 'Unidimensional') {
		const panel = document.getElementById('firstOrderFacetsPanel');
		if (panel) panel.classList.remove('d-none');
		const allItems = (items || []).slice().sort((a,b)=>a.id-b.id);
		const disabledSet = new Set((facetDisabledItems['unidim']||[]).map(String));
		const activeItems = allItems.filter(it => !disabledSet.has(String(it.id)));
		const pseudoId = 'unidim';
		ensureScalingDefaults(pseudoId, activeItems);
		const itemsHtml = allItems.length
			? `<div class="mm-item-grid"><div class="small text-muted w-100 mb-1">Click an item to ${disabledSet.size? 'toggle include/exclude':'exclude it from the facet'}.</div>${allItems.map(it => { const t = escapeHtml(it.text); const long = t.length>80? ' long' : ''; const inactive = disabledSet.has(String(it.id)) ? ' inactive' : ''; return `<span class="mm-item-tag${long}${inactive}" data-facet="${pseudoId}" data-item-id="${it.id}" title="${t} (click to ${inactive? 'include':'exclude'})" role="button" tabindex="0">${t}</span>`; }).join('')}</div>`
			: '<div class="text-muted small mb-2">No items added in Step 2.</div>';
		const scale = facetScaling[pseudoId] || {};
		const method = scale.method || 'fix_loading';
		const refItemId = scale.refItemId;
		const refSelect = allItems.length ? `<select class="form-select form-select-sm mt-1 facet-ref-item" data-facet="${pseudoId}">${allItems.map(it=>`<option value="${it.id}" ${it.id===refItemId?'selected':''}>${escapeHtml(shorten(it.text,40))}</option>`).join('')}</select>` : '<div class="small text-muted mt-1">No items to reference</div>';
		const col = document.createElement('div');
		col.className = 'col-12';
		col.innerHTML = `
			<div class="facet-card h-100 d-flex flex-column" data-facet="${pseudoId}">
				<h5 class="mb-1">All Items <span class="small text-muted">(${activeItems.length}${activeItems.length!==allItems.length? '/'+allItems.length:''})</span></h5>
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
		const shortCode = (sd.code || '').trim();
		const col = document.createElement('div');
		col.className = 'col-12 col-md-6 col-lg-4';
		const facetItems = (items || []).filter(it => it.subdimensionId === sd.id).sort((a,b)=>a.id-b.id);
		const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
		const activeFacetItems = facetItems.filter(it => !disabledSet.has(String(it.id)));
		const currentMode = facetModes[sd.id] || '';
		if (currentMode === 'formative') ensureGlobalReflectiveDefaults(sd.id);
		ensureScalingDefaults(sd.id, activeFacetItems);
		const itemsHtml = facetItems.length
			? `<div class="mm-item-grid"><div class="small text-muted w-100 mb-1">Click an item to ${disabledSet.size? 'toggle include/exclude':'exclude it from the facet'}.</div>${facetItems.map(it => { const t = escapeHtml(it.text); const long = t.length>80? ' long' : ''; const inactive = disabledSet.has(String(it.id)) ? ' inactive' : ''; return `<span class="mm-item-tag${long}${inactive}" data-facet="${sd.id}" data-item-id="${it.id}" title="${t} (click to ${inactive? 'include':'exclude'})" role="button" tabindex="0">${t}</span>`; }).join('')}</div>`
			: '<div class="text-muted small mb-2">No items assigned</div>';
		const scale = facetScaling[sd.id] || {};
		const method = scale.method || 'fix_loading';
		const refItemId = scale.refItemId;
		const reflectiveCandidates = currentMode === 'formative'
			? (globalReflective[sd.id]||[]).filter(g => (g.text||'').trim())
			: facetItems;
		let refSelect;
		if (currentMode === 'formative') {
			// Always render a select so it can be dynamically populated when user types globals (needs 2 globals)
			refSelect = `<select class="form-select form-select-sm mt-1 facet-ref-item" data-facet="${sd.id}" ${reflectiveCandidates.length>=2? '' : ''}>${reflectiveCandidates.map(it=>`<option value="${it.id}" ${it.id===refItemId?'selected':''}>${escapeHtml(shorten(it.text,40))}</option>`).join('')}</select>` + (reflectiveCandidates.length>=2? '' : '<div class="small text-muted mt-1">Add two global reflective items above to enable fixing a loading.</div>');
		} else {
			refSelect = reflectiveCandidates.length ? `<select class="form-select form-select-sm mt-1 facet-ref-item" data-facet="${sd.id}">${reflectiveCandidates.map(it=>`<option value="${it.id}" ${it.id===refItemId?'selected':''}>${escapeHtml(shorten(it.text,40))}</option>`).join('')}</select>` : '<div class="small text-muted mt-1">No items to reference</div>';
		}
		col.innerHTML = `
			<div class="facet-card h-100 d-flex flex-column" data-facet="${sd.id}" data-facet-code="${escapeHtml(shortCode)}">
				<h4 class="mb-1">${shortCode ? `<span class="badge bg-info me-1">${escapeHtml(shortCode)}</span>` : ''}${escapeHtml(sd.name || '(Unnamed)')}</h4>
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
				${currentMode==='formative' ? `
				<div class="mb-2 formative-globals" data-facet="${sd.id}">
					<div class="small fw-bold mb-1">Global Reflective Items (for identification)</div>
					<div class="form-text small mb-1">Provide up to two global reflective items (leave blank if not used).</div>
					${(globalReflective[sd.id]||[]).map((g,i)=>`<input type="text" class="form-control form-control-sm mb-1 global-reflective-input" data-facet="${sd.id}" data-idx="${i}" placeholder="Global reflective item ${i+1}" value="${escapeHtml(g.text)}">`).join('')}
				</div>` : ''}
				<div class="mb-2">
					<div class="small fw-bold mb-1">Scaling Rule</div>
					<div class="form-check form-check-inline small">
						<input class="form-check-input facet-scale-radio" type="radio" name="facet-scale-${sd.id}" id="scale-${sd.id}-fixload" value="fix_loading" ${method==='fix_loading'?'checked':''} data-facet="${sd.id}" ${(currentMode==='formative'? (reflectiveCandidates.length>=2) : facetItems.length)? '' : 'disabled'}>
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
				<hr>
				<button class="btn mb-1 collapse-btn collapsed" type="button" style="width:fit-content" data-bs-toggle="collapse" data-bs-target="#collapse-${sd.id}" aria-expanded="true" aria-controls="collapse-${sd.id}">
					<div class="small fw-bold"><i class="bi bi-chevron-up"></i> Items (${activeFacetItems.length}${activeFacetItems.length!==facetItems.length? '/'+facetItems.length:''})</div>
				</button>
				<div class="collapse" id="collapse-${sd.id}">
					<div class="flex-grow-1 d-flex flex-column mb-1" style="max-height:160px; overflow:auto;">${itemsHtml}</div>
				</div>
			</div>`;
		list.appendChild(col);
	});
		updateValidationMessages();
}

async function loadStep4Model(){
	const stored = await window.dataStorage.getData('data_step_4') || {};
	facetModes = stored.facetModes || {};
	indicators = stored.indicators || [];
	facetScaling = stored.facetScaling || {};
	globalReflective = stored.globalReflective || {};
	secondOrder = stored.secondOrder || secondOrder;
	facetDisabledItems = stored.facetDisabledItems || {};
	overallCode = stored.overallCode || overallCode || deriveShortCode(constructName);
	// Backward compatibility: ensure scaling object shape and global reflective defaults for second-order
	if (!secondOrder.scaling) secondOrder.scaling = { method: 'fix_loading', refFacetId: null };
	if (secondOrder.type === 'formative' && !secondOrder.globalReflective) {
		secondOrder.globalReflective = [
			{ id: 'g_second_1', text: '' },
			{ id: 'g_second_2', text: '' }
		];
	}
	if (stored.facets) {
		delete stored.facets;
		await window.dataStorage.storeData('data_step_4', stored, false);
	}
	if (!indicators.length && Object.keys(facetModes).length){
		indicators = buildIndicatorsFromModes();
	}
}

function attachAutoSaveHandlers(){
	document.addEventListener('change', e => {
		if (e.target && e.target.id === 'overallCodeInput') {
			overallCode = sanitizeShortCodeInput(e.target.value, true);
			e.target.value = overallCode;
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('input[type="radio"][name^="facet-mode-"]')) {
			const facetId = e.target.name.replace('facet-mode-','');
			facetModes[facetId] = e.target.value;
			if (e.target.value === 'formative') ensureGlobalReflectiveDefaults(facetId);
			renderFirstOrderFacets();
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('input.facet-scale-radio')) {
			handleScaleRadioChange(e.target);
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('select.facet-ref-item')) {
			const facetId = e.target.getAttribute('data-facet');
			if (facetScaling[facetId]) facetScaling[facetId].refItemId = e.target.value;
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('input.second-order-type')) {
			secondOrder.type = (e.target.value === 'none') ? null : e.target.value;
			// Initialize global reflective placeholders if formative
			if (secondOrder.type === 'formative' && !secondOrder.globalReflective) {
				secondOrder.globalReflective = [
					{ id: 'g_second_1', text: '' },
					{ id: 'g_second_2', text: '' }
				];
			}
			if (!secondOrder.type) {
				secondOrder.scaling = { method: 'fix_loading', refFacetId: null };
				secondOrder.globalReflective = null;
			}
			ensureSecondOrderScalingDefaults();
			updateSecondOrderUI();
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('input.second-order-scale')) {
			secondOrder.scaling.method = e.target.value;
			if (secondOrder.scaling.method === 'fix_loading') ensureSecondOrderScalingDefaults(); else { secondOrder.scaling.refFacetId = null; secondOrder.scaling.refItemId = null; }
			updateSecondOrderUI();
			scheduleAutoSave();
		}
		if (e.target && e.target.id === 'secondOrderRefFacet') {
			secondOrder.scaling.refFacetId = e.target.value || null;
			scheduleAutoSave();
		}
		if (e.target && e.target.id === 'secondOrderRefItem') {
			secondOrder.scaling.refItemId = e.target.value || null;
			scheduleAutoSave();
		}
		if (e.target && e.target.matches('input.second-order-global-reflective')) {
			const idx = Number(e.target.getAttribute('data-idx'));
			if (!secondOrder.globalReflective) return;
			secondOrder.globalReflective[idx].text = e.target.value;
			refreshSecondOrderFormativeScalingUI();
			scheduleAutoSave();
		}
	});
	document.addEventListener('input', e => {
		if (e.target && e.target.matches('input.global-reflective-input')) {
			const facetId = e.target.getAttribute('data-facet');
			const idx = Number(e.target.getAttribute('data-idx'));
			ensureGlobalReflectiveDefaults(facetId);
			globalReflective[facetId][idx].text = e.target.value;
			refreshFormativeScalingUI(facetId);
			scheduleAutoSave();
		}
	});
	// Click to toggle include/exclude items
	document.addEventListener('click', e => {
		const tag = e.target.closest('.mm-item-tag[data-item-id]');
		if (!tag) return;
		// Preserve currently open collapses
		const openFacets = Array.from(document.querySelectorAll('.collapse.show')).map(c=>c.id);
		const facetId = tag.getAttribute('data-facet') || 'unidim';
		const itemId = tag.getAttribute('data-item-id');
		if (!facetDisabledItems[facetId]) facetDisabledItems[facetId] = [];
		const arr = facetDisabledItems[facetId].map(String);
		const idx = arr.indexOf(String(itemId));
		if (idx >= 0) { // currently disabled -> enable
			arr.splice(idx,1);
			tag.classList.remove('inactive');
		} else { // disable
			arr.push(String(itemId));
			tag.classList.add('inactive');
		}
		facetDisabledItems[facetId] = arr;
		renderFirstOrderFacets(); // rebuild UI with new counts and states
		// Restore previously open collapses
		openFacets.forEach(id => {
			const el = document.getElementById(id);
			if (el) { el.classList.add('show'); const btn = document.querySelector(`[data-bs-target="#${id}"]`); if (btn) btn.classList.remove('collapsed'); }
		});
		refreshLavaanPanel();
		scheduleAutoSave();
	});
}

let autoSaveTimer = null;
function scheduleAutoSave(){
	if (autoSaveTimer) clearTimeout(autoSaveTimer);
	autoSaveTimer = setTimeout(() => { saveFacetModes(true); }, 400);
}

function saveFacetModes(isAuto=false){
	collectScalingSelections();
	ensureSecondOrderScalingDefaults();
	indicators = buildIndicatorsFromModes();
	persistStep4();
	updateValidationMessages();
	if (!isAuto) window.displayInfo?.('success', 'Facet measurement types saved.');
}

function buildIndicatorsFromModes(){
	const result = [];
	subdimensions.forEach(sd => {
		const mode = facetModes[sd.id];
		if (!mode) return;
		const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
		const facetItems = (items || []).filter(it => it.subdimensionId === sd.id && !disabledSet.has(String(it.id)));
		if (mode === 'reflective') {
			facetItems.forEach(it => result.push({ facetId: sd.id, itemId: it.id, direction: 'out' }));
		} else {
			facetItems.forEach(it => result.push({ facetId: sd.id, itemId: it.id, direction: 'in' }));
			(globalReflective[sd.id]||[]).filter(g => (g.text||'').trim()).forEach(g => result.push({ facetId: sd.id, itemId: g.id, direction: 'out', global: true }));
		}
	});
	// Second-order formative: treat first-order facets as causal 'in' indicators, globals as 'out'
	if (secondOrder.type === 'formative') {
		subdimensions.forEach(sd => result.push({ facetId: 'secondOrder', itemId: 'facet_'+sd.id, direction: 'in', secondOrder: true }));
		(secondOrder.globalReflective||[]).filter(g => (g.text||'').trim()).forEach(g => result.push({ facetId: 'secondOrder', itemId: g.id, direction: 'out', global: true, secondOrder: true }));
	}
	return result;
}

async function persistStep4(){
	const existing = await window.dataStorage.getData('data_step_4') || {};
	if (existing.facets) delete existing.facets;
	const lavaanSpec = generateLavaanSpec();
	const payload = { facetModes, indicators, facetScaling, globalReflective, secondOrder, lavaanSpec, overallCode, facetDisabledItems, updatedAt: new Date().toISOString() };
	await window.dataStorage.storeData('data_step_4', payload, false);
}

function ensureScalingDefaults(facetId, facetItems){
	const mode = facetModes[facetId];
	let candidateRefItems = facetItems;
	if (mode === 'formative') {
		ensureGlobalReflectiveDefaults(facetId);
		candidateRefItems = (globalReflective[facetId]||[]).filter(g => (g.text||'').trim());
	}
	if (!facetScaling[facetId]) {
		if (candidateRefItems.length >= 2) {
			const ref = candidateRefItems.slice().sort((a,b)=>a.text.length - b.text.length)[0];
			facetScaling[facetId] = { method: 'fix_loading', refItemId: ref.id };
		} else {
			facetScaling[facetId] = { method: 'fix_variance' };
		}
	} else if (facetScaling[facetId].method === 'fix_loading') {
		if (mode === 'formative' && candidateRefItems.length < 2) {
			facetScaling[facetId] = { method: 'fix_variance' };
		} else if (!candidateRefItems.find(it => it.id === facetScaling[facetId].refItemId)) {
			if (candidateRefItems.length) facetScaling[facetId].refItemId = candidateRefItems[0].id; else facetScaling[facetId] = { method: 'fix_variance' };
		}
	}
}

function ensureGlobalReflectiveDefaults(facetId){
	if (!globalReflective[facetId]) {
		globalReflective[facetId] = [
			{ id: 'g_'+facetId+'_1', text: '' },
			{ id: 'g_'+facetId+'_2', text: '' }
		];
	}
}

// -------- Lavaan Specification Generation ---------
function generateLavaanSpec(){
	try {
		// Helper sanitizers
		const sanitize = (name) => String(name || '').replace(/[^A-Za-z0-9_]/g,'_').replace(/^([0-9])/, '_$1') || 'X';
		const itemVar = (itemId) => sanitize('i'+itemId); // prefix to avoid clashes
		const facetVar = (sd) => sanitize(sd.code || sd.name || ('F_'+sd.id));
		const overallVar = sanitize(overallCode || constructName || 'Overall');
		const globalItemVar = (facetId, idx) => {
			const sd = subdimensions.find(s => s.id === facetId);
			const base = sd ? (sd.code || sd.name || ('F'+facetId.slice(0,4))) : ('G'+facetId.slice(0,4));
			return sanitize('g'+base+'_'+(idx+1));
		};
		const secondGlobalItemVar = (idx) => sanitize('gOVERALL_'+(idx+1));

		const lines = [];
		const notes = [];
		const mapping = [];

		// Build item id -> variable mapping
		(items||[]).forEach(it => {
			const facetId = (!subdimensions.length || dimensionality==='Unidimensional') ? 'unidim' : (it.subdimensionId || '');
			const disabled = (facetDisabledItems[facetId]||[]).map(String).includes(String(it.id));
			mapping.push(`# ${disabled? '(excluded) ':''}${itemVar(it.id)} = item ${it.id}: ${shorten(it.text||'',70)}`);
		});
		Object.keys(globalReflective||{}).forEach(fid => {
			(globalReflective[fid]||[]).forEach((g,i) => mapping.push(`# ${globalItemVar(fid,i)} = global (${fid}) ${shorten(g.text||'',70)}`));
		});
		(secondOrder.globalReflective||[]).forEach((g,i) => mapping.push(`# ${secondGlobalItemVar(i)} = higher-order global: ${shorten(g.text||'',70)}`));
		subdimensions.forEach(sd => { if (sd.code) mapping.push(`# Facet ${facetVar(sd)} code: ${sd.code}`); });
		if (overallCode) mapping.push(`# Overall code: ${overallCode}`);

		// Unidimensional shortcut
		if (!subdimensions.length || dimensionality === 'Unidimensional') {
			const pseudoId = 'unidim';
			const scale = facetScaling[pseudoId] || {};
			const varName = overallVar;
			const disabledSet = new Set((facetDisabledItems['unidim']||[]).map(String));
			const facetItems = (items||[]).filter(it => !disabledSet.has(String(it.id)));
			if (facetItems.length){
				const refId = (scale.method === 'fix_loading') ? scale.refItemId : null;
				const parts = facetItems.map(it => (refId && it.id === refId ? '1*'+itemVar(it.id) : itemVar(it.id)));
				lines.push(`${varName} =~ ${parts.join(' + ')}`);
				if (scale.method === 'fix_variance') lines.push(`${varName} ~~ 1*${varName}`);
			}
			return { syntax: lines.concat(['','## Mapping','#',...mapping]).join('\n'), generatedAt: new Date().toISOString() };
		}

		// First-order facets
		subdimensions.forEach(sd => {
			const mode = facetModes[sd.id];
			if (!mode) return;
			const fVar = facetVar(sd);
			const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
			const facetItems = (items||[]).filter(it => it.subdimensionId === sd.id && !disabledSet.has(String(it.id)));
			const scale = facetScaling[sd.id] || {};
			if (mode === 'reflective') {
				if (facetItems.length){
					const refId = (scale.method === 'fix_loading') ? scale.refItemId : null;
					const parts = facetItems.map(it => (refId && it.id === refId ? '1*'+itemVar(it.id) : itemVar(it.id)));
					lines.push(`${fVar} =~ ${parts.join(' + ')}`);
					if (scale.method === 'fix_variance') lines.push(`${fVar} ~~ 1*${fVar}`);
				}
			} else if (mode === 'formative') {
				// Causal indicators (items cause latent)
				if (facetItems.length){
					const causal = facetItems.map(it => itemVar(it.id));
					lines.push(`${fVar} <~ ${causal.join(' + ')}`);
				}
				const globals = (globalReflective[sd.id]||[]).filter(g => (g.text||'').trim());
				if (globals.length){
					const refId = (scale.method === 'fix_loading') ? scale.refItemId : null;
					const parts = globals.map((g,i) => {
						const gv = globalItemVar(sd.id,i);
						return (refId && g.id === refId ? '1*'+gv : gv);
					});
					lines.push(`${fVar} =~ ${parts.join(' + ')}`);
					if (scale.method === 'fix_variance') lines.push(`${fVar} ~~ 1*${fVar}`);
				} else {
					// Fallback variance if no globals (already enforced by UI, but defensive)
					lines.push(`# ${fVar} formative: variance scaling assumed`);
					lines.push(`${fVar} ~~ 1*${fVar}`);
				}
			}
		});

		// Second-order
		if (secondOrder.type) {
			if (secondOrder.type === 'reflective') {
				const refFacet = (secondOrder.scaling?.method === 'fix_loading') ? secondOrder.scaling.refFacetId : null;
				const parts = subdimensions.map(sd => {
					const v = facetVar(sd);
					return (refFacet && sd.id === refFacet ? '1*'+v : v);
				});
				lines.push(`${overallVar} =~ ${parts.join(' + ')}`);
				if (secondOrder.scaling?.method === 'fix_variance') lines.push(`${overallVar} ~~ 1*${overallVar}`);
			} else if (secondOrder.type === 'formative') {
				// Facets cause the higher order
				const facetVars = subdimensions.map(sd => facetVar(sd));
				if (facetVars.length) lines.push(`${overallVar} <~ ${facetVars.join(' + ')}`);
				const globals = (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim());
				if (globals.length){
					const refId = (secondOrder.scaling?.method === 'fix_loading') ? secondOrder.scaling.refItemId : null;
					const parts = globals.map((g,i) => {
						const gv = secondGlobalItemVar(i);
						return (refId && g.id === refId ? '1*'+gv : gv);
					});
					lines.push(`${overallVar} =~ ${parts.join(' + ')}`);
					if (secondOrder.scaling?.method === 'fix_variance') lines.push(`${overallVar} ~~ 1*${overallVar}`);
				} else if (facetVars.length) {
					lines.push(`${overallVar} ~~ 1*${overallVar}`); // variance scaling fallback
				}
			}
		}

		// Combine
		const syntax = [
			'# --- Auto-generated lavaan specification (internal) ---',
			...lines,
			'',
			'## Mapping (IDs to variable names)',
			...mapping
		].join('\n');
		return { syntax, generatedAt: new Date().toISOString() };
	} catch (err){
		return { syntax: '# Generation failed: '+err.message, generatedAt: new Date().toISOString(), error: true };
	}
}

function refreshFormativeScalingUI(facetId){
	const card = document.querySelector(`.facet-card[data-facet="${facetId}"]`);
	if (!card) return;
	if (facetModes[facetId] !== 'formative') return;
	const reflectiveItems = (globalReflective[facetId]||[]).filter(g => (g.text||'').trim());
	const select = card.querySelector('select.facet-ref-item');
	if (select) {
		select.innerHTML = reflectiveItems.map(g => `<option value="${g.id}" ${facetScaling[facetId]?.refItemId===g.id?'selected':''}>${escapeHtml(shorten(g.text,40))}</option>`).join('');
		// Enable select if items now exist
		select.disabled = !reflectiveItems.length;
		if (facetScaling[facetId]?.method === 'fix_loading') {
			if (!reflectiveItems.find(r => r.id === facetScaling[facetId].refItemId)) {
				if (reflectiveItems.length) facetScaling[facetId].refItemId = reflectiveItems[0].id; else facetScaling[facetId] = { method: 'fix_variance' };
			}
		}
	}
	const fixLoadRadio = card.querySelector(`input.facet-scale-radio[value="fix_loading"][data-facet="${facetId}"]`);
	const fixVarRadio = card.querySelector(`input.facet-scale-radio[value="fix_variance"][data-facet="${facetId}"]`);
	const refWrapper = card.querySelector(`.facet-ref-wrapper[data-facet="${facetId}"]`);
	if (fixLoadRadio) {
		if (reflectiveItems.length < 2) {
			fixLoadRadio.disabled = true;
			if (fixLoadRadio.checked) {
				if (fixVarRadio) { fixVarRadio.checked = true; }
				facetScaling[facetId] = { method: 'fix_variance' };
			}
			// Hide reference wrapper when no reflective items
			if (refWrapper) refWrapper.classList.add('d-none');
		} else {
			fixLoadRadio.disabled = false;
			// Show wrapper only if method is fix_loading
			if (facetScaling[facetId]?.method === 'fix_loading') {
				if (refWrapper) refWrapper.classList.remove('d-none');
			} else if (refWrapper) {
				refWrapper.classList.add('d-none');
			}
		}
	}
}

// ---------- Second-Order Panel Logic ----------
function initSecondOrderPanel(){
	const panel = document.getElementById('secondOrderPanel');
	if (!panel) return;
	if (!subdimensions.length || dimensionality === 'Unidimensional') { panel.classList.add('d-none'); return; }
	panel.classList.remove('d-none');
	document.getElementById('secondOrderTitle').textContent = constructName || 'Overall Construct';
	document.getElementById('secondOrderDefinition').textContent = savedDefinition || '';

	// Insert Overall Short ID input directly below the second order title
	const titleEl = document.getElementById('secondOrderTitle');
	if (titleEl && !document.getElementById('overallCodeInput')) {
		const codeDiv = document.createElement('div');
		codeDiv.className = 'mb-2';
		codeDiv.innerHTML = `<label class="small fw-bold me-2">Overall Short ID</label><input type="text" id="overallCodeInput" class="form-control form-control-sm d-inline-block" style="max-width:160px" maxlength="10" placeholder="Code" value="${escapeHtml(overallCode || deriveShortCode(constructName))}"> <div class="form-text small">Used in model syntax.</div>`;
		titleEl.insertAdjacentElement('afterend', codeDiv);
	} else if (document.getElementById('overallCodeInput')) {
		const oc = document.getElementById('overallCodeInput');
		if (oc && !oc.value) oc.value = overallCode || deriveShortCode(constructName);
	}
	if (secondOrder.type === 'reflective') { const r = document.getElementById('secondOrderTypeReflective'); if (r) r.checked = true; }
	else if (secondOrder.type === 'formative') { const r = document.getElementById('secondOrderTypeFormative'); if (r) r.checked = true; }
	else { const n = document.getElementById('secondOrderTypeNone'); if (n) n.checked = true; }
	// Ensure global reflective placeholders if formative
	if (secondOrder.type === 'formative' && !secondOrder.globalReflective) {
		secondOrder.globalReflective = [
			{ id: 'g_second_1', text: '' },
			{ id: 'g_second_2', text: '' }
		];
	}
	ensureSecondOrderScalingDefaults();
	updateSecondOrderUI();
}

function ensureSecondOrderScalingDefaults(){
	if (!secondOrder.type) return;
	if (!secondOrder.scaling) secondOrder.scaling = { method: 'fix_loading', refFacetId: null };
	if (secondOrder.type === 'reflective') {
		// facet-based scaling
		if (secondOrder.scaling.method === 'fix_loading') {
			if (!secondOrder.scaling.refFacetId && subdimensions.length) {
				const pref = subdimensions.find(sd => facetModes[sd.id] === 'reflective') || subdimensions[0];
				secondOrder.scaling.refFacetId = pref?.id || null;
			}
		} else secondOrder.scaling.refFacetId = null;
		secondOrder.scaling.refItemId = null; // not used
	} else if (secondOrder.type === 'formative') {
		// item-based scaling using global reflective items
		if (!secondOrder.globalReflective) secondOrder.globalReflective = [ { id: 'g_second_1', text: '' }, { id: 'g_second_2', text: '' } ];
		const globals = (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim());
		if (secondOrder.scaling.method === 'fix_loading') {
			if (globals.length < 2) {
				secondOrder.scaling.method = 'fix_variance';
				secondOrder.scaling.refItemId = null;
			} else {
				if (!globals.find(g => g.id === secondOrder.scaling.refItemId)) {
					secondOrder.scaling.refItemId = globals[0].id;
				}
			}
		} else {
			secondOrder.scaling.refItemId = null;
		}
		secondOrder.scaling.refFacetId = null; // not used here
	}
}

function updateSecondOrderUI(){
	const scalingWrapper = document.getElementById('secondOrderScalingWrapper');
	if (!scalingWrapper) return;
	// Ensure placeholder elements exist INSIDE scaling box (idempotent)
	if (!document.getElementById('secondOrderFormativeGlobals')) {
		const container = document.createElement('div');
		container.id = 'secondOrderFormativeGlobals';
		container.className = 'mt-3 d-none';
		container.innerHTML = `
			<div class="small fw-bold mb-1">Global Reflective Items (for identification)</div>
			<div class="form-text small mb-1">Provide up to two global reflective items (leave blank if not used).</div>
			<div id="secondOrderGlobalsInputs"></div>`;
		scalingWrapper.appendChild(container);
	}
	if (!document.getElementById('secondOrderRefItemWrapper')) {
		const refDiv = document.createElement('div');
		refDiv.id = 'secondOrderRefItemWrapper';
		refDiv.className = 'mt-3 d-none';
		refDiv.innerHTML = `
			<label class="small mb-1">Reference Global Item</label>
			<select id="secondOrderRefItem" class="form-select form-select-sm"></select>`;
		scalingWrapper.appendChild(refDiv);
	}
	if (!secondOrder.type) { scalingWrapper.classList.add('d-none'); return; }
	scalingWrapper.classList.remove('d-none');
	const fixLoad = document.getElementById('secondOrderScaleFixLoad');
	const fixVar = document.getElementById('secondOrderScaleFixVar');
	if (secondOrder.scaling.method === 'fix_loading') { if (fixLoad) fixLoad.checked = true; }
	else if (secondOrder.scaling.method === 'fix_variance') { if (fixVar) fixVar.checked = true; }
	const refWrapper = document.getElementById('secondOrderRefFacetWrapper');
	const globalWrapper = document.getElementById('secondOrderFormativeGlobals');
	const refItemWrapper = document.getElementById('secondOrderRefItemWrapper');
	if (secondOrder.type === 'reflective') {
		// facet-based scaling
		if (secondOrder.scaling.method === 'fix_loading') {
			refWrapper.classList.remove('d-none');
			populateSecondOrderRefSelect();
		} else {
			refWrapper.classList.add('d-none');
		}
		if (globalWrapper) globalWrapper.classList.add('d-none');
		if (refItemWrapper) refItemWrapper.classList.add('d-none');
	} else if (secondOrder.type === 'formative') {
		// item-based scaling
		refWrapper.classList.add('d-none');
		if (globalWrapper) globalWrapper.classList.remove('d-none');
		// Render inputs for globals
		const inputsHost = document.getElementById('secondOrderGlobalsInputs');
		if (inputsHost) {
			inputsHost.innerHTML = (secondOrder.globalReflective||[]).map((g,i)=>`<input type="text" class="form-control form-control-sm mb-1 second-order-global-reflective" data-idx="${i}" placeholder="Global reflective item ${i+1}" value="${escapeHtml(g.text)}">`).join('');
		}
		if (refItemWrapper) {
			const globals = (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim());
			if (secondOrder.scaling.method === 'fix_loading' && globals.length) {
				refItemWrapper.classList.remove('d-none');
				populateSecondOrderRefItemSelect();
			} else {
				refItemWrapper.classList.add('d-none');
			}
		}
	}
	refreshSecondOrderFormativeScalingUI();
	updateValidationMessages();
}

function populateSecondOrderRefSelect(){
	const sel = document.getElementById('secondOrderRefFacet');
	if (!sel) return;
	sel.innerHTML = '';
	if (secondOrder.scaling.method !== 'fix_loading') return;
	subdimensions.forEach(sd => {
		const opt = document.createElement('option');
		opt.value = sd.id;
		opt.textContent = (sd.code ? '['+sd.code+'] ' : '') + (sd.name || '(Unnamed)');
		if (sd.id === secondOrder.scaling.refFacetId) opt.selected = true;
		sel.appendChild(opt);
	});
	if (!secondOrder.scaling.refFacetId && subdimensions.length) {
		sel.value = subdimensions[0].id;
		secondOrder.scaling.refFacetId = subdimensions[0].id;
	}
}

function populateSecondOrderRefItemSelect(){
	const sel = document.getElementById('secondOrderRefItem');
	if (!sel) return;
	sel.innerHTML = '';
	if (secondOrder.type !== 'formative' || secondOrder.scaling.method !== 'fix_loading') return;
	const globals = (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim());
	globals.forEach(g => {
		const opt = document.createElement('option');
		opt.value = g.id;
		opt.textContent = shorten(g.text,40);
		if (g.id === secondOrder.scaling.refItemId) opt.selected = true;
		sel.appendChild(opt);
	});
	if (!secondOrder.scaling.refItemId && globals.length) {
		secondOrder.scaling.refItemId = globals[0].id;
		sel.value = globals[0].id;
	}
}

function refreshSecondOrderFormativeScalingUI(){
	if (secondOrder.type !== 'formative') return;
	const globals = (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim());
	const fixLoad = document.getElementById('secondOrderScaleFixLoad');
	const fixVar = document.getElementById('secondOrderScaleFixVar');
	const refItemWrapper = document.getElementById('secondOrderRefItemWrapper');
	if (fixLoad) {
		if (globals.length < 2) {
			fixLoad.disabled = true;
			if (fixLoad.checked) {
				if (fixVar) fixVar.checked = true;
				secondOrder.scaling.method = 'fix_variance';
			}
		} else {
			fixLoad.disabled = false;
		}
	}
	if (secondOrder.scaling.method === 'fix_loading' && globals.length >=2) {
		populateSecondOrderRefItemSelect();
		if (refItemWrapper) refItemWrapper.classList.remove('d-none');
	} else {
		if (refItemWrapper) refItemWrapper.classList.add('d-none');
	}
}

// ---- Short code helpers ----
function deriveShortCode(name){
	if (!name) return '';
	const words = String(name).trim().split(/\s+/).filter(Boolean);
	if (!words.length) return '';
	if (words.length === 1) return words[0].slice(0,2).toUpperCase();
	return (words[0][0] + words[1][0]).toUpperCase();
}
function sanitizeShortCodeInput(val, allowEmpty=false){
	val = (val||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
	if (!val && !allowEmpty) return deriveShortCode(constructName);
	return val;
}

function collectScalingSelections(){
	const radios = document.querySelectorAll('input.facet-scale-radio');
	radios.forEach(r => {
		if (r.checked) {
			const facetId = r.getAttribute('data-facet');
			const method = r.value;
			if (method === 'fix_loading') {
				const sel = document.querySelector(`select.facet-ref-item[data-facet="${facetId}"]`);
				const refItemId = sel ? sel.value : null;
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
		if (!facetScaling[facetId] || facetScaling[facetId].method !== 'fix_loading') {
			const sel = wrapper?.querySelector('select.facet-ref-item');
			const refItemId = sel ? sel.value : null;
			facetScaling[facetId] = { method: 'fix_loading', refItemId };
		}
	} else {
		if (wrapper) wrapper.classList.add('d-none');
		facetScaling[facetId] = { method: 'fix_variance' };
	}
}

function shorten(str,len){ return !str ? '' : (str.length > len ? str.slice(0,len-1)+'…' : str); }
function escapeHtml(str){ if (str == null) return ''; return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }

// -------- Validation ---------
function computeValidation(){
	const errors = [];
	const warnings = [];
	const itemsByFacet = {};
	subdimensions.forEach(sd => {
		const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
		itemsByFacet[sd.id] = (items||[]).filter(it => it.subdimensionId === sd.id && !disabledSet.has(String(it.id)));
	});
	subdimensions.forEach(sd => {
		if (!facetScaling[sd.id]) {
			errors.push(`Facet "${sd.name || sd.id}" has no scaling rule selected.`);
			return;
		}
		const sc = facetScaling[sd.id];
		if (sc.method === 'fix_loading' && !sc.refItemId) errors.push(`Facet "${sd.name || sd.id}" set to fix a loading but no reference item chosen.`);
	});
	if (secondOrder.type) {
		if (!secondOrder.scaling) errors.push('Higher-order latent has no scaling configuration.');
		else if (secondOrder.type === 'reflective') {
			if (secondOrder.scaling.method === 'fix_loading' && !secondOrder.scaling.refFacetId) errors.push('Higher-order reflective latent requires a reference facet for fixed loading scaling.');
		} else if (secondOrder.type === 'formative') {
			if (secondOrder.scaling.method === 'fix_loading' && !secondOrder.scaling.refItemId) errors.push('Higher-order formative latent requires a reference global item when fixing a loading.');
		}
	}
	subdimensions.forEach(sd => {
		if (facetModes[sd.id] === 'reflective') {
			const count = itemsByFacet[sd.id].length;
			if (count < 2) errors.push(`Reflective facet "${sd.name || sd.id}" must have at least 2 included items (has ${count}).`);
			else if (count === 2) warnings.push(`Reflective facet "${sd.name || sd.id}" has only 2 included items.`);
		}
	});
	// Unidimensional case: ensure at least 2 active items if reflective-like interpretation
	if (!subdimensions.length || dimensionality === 'Unidimensional') {
		const disabledSet = new Set((facetDisabledItems['unidim']||[]).map(String));
		const active = (items||[]).filter(it => !disabledSet.has(String(it.id)));
		if (active.length < 2) errors.push(`At least 2 items must remain included for a unidimensional reflective model (has ${active.length}).`);
		else if (active.length === 2) warnings.push('Only 2 items remain included for the unidimensional construct.');
	}
	subdimensions.forEach(sd => {
		if (facetModes[sd.id] === 'formative') {
			const globals = (globalReflective[sd.id]||[]).filter(g => (g.text||'').trim());
			if (globals.length < 2) errors.push(`Formative facet "${sd.name || sd.id}" requires two global reflective items (has ${globals.length}).`);
		}
	});
	if (secondOrder.type === 'formative') {
		const globals = (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim());
		if (globals.length < 2) errors.push(`Higher-order formative latent requires two global reflective items (has ${globals.length}).`);
	}
	if (secondOrder.type && (!subdimensions.length || dimensionality === 'Unidimensional')) {
		errors.push('Higher-order latent specified but there are no first-order facets.');
	}
	return { errors, warnings };
}

function updateValidationMessages(){
	const host = document.getElementById('validationMessages');
	if (!host) return;
	const { errors, warnings } = computeValidation();
	if (!errors.length && !warnings.length) { host.innerHTML = '<div class="alert alert-success py-2 px-3 small mb-0">No validation issues detected.</div>'; return; }
	let html = '';
	if (errors.length) html += `<div class=\"alert alert-danger py-2 px-3 small mb-2\"><strong>Blocking Errors:</strong><ul class=\"mb-0 small\">${errors.map(e=>`<li>${escapeHtml(e)}</li>`).join('')}</ul></div>`;
	if (warnings.length) html += `<div class=\"alert alert-warning py-2 px-3 small mb-0\"><strong>Warnings:</strong><ul class=\"mb-0 small\">${warnings.map(w=>`<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`;
	host.innerHTML = html;
}

// -------- Lavaan Panel Helpers --------
function refreshLavaanPanel(){
	const host = document.getElementById('lavaanSpecCode');
	if (!host) return; // panel might not exist in some contexts
	try {
		const spec = generateLavaanSpec();
		host.textContent = spec.syntax || '(no syntax)';
		const ts = document.getElementById('lavaanSpecTimestamp');
		if (ts) ts.textContent = 'Generated: '+ new Date(spec.generatedAt || Date.now()).toLocaleString();
	} catch (err){
		host.textContent = '# Failed to generate: '+err.message;
	}
}
function attachLavaanPanelHandlers(){
	const refreshBtn = document.getElementById('btnRefreshLavaan');
	const copyBtn = document.getElementById('btnCopyLavaan');
	const dlBtn = document.getElementById('btnDownloadLavaan');
	if (refreshBtn) refreshBtn.addEventListener('click', () => { refreshLavaanPanel(); window.displayInfo?.('info','Lavaan spec refreshed.'); });
	if (copyBtn) copyBtn.addEventListener('click', async () => {
		const text = document.getElementById('lavaanSpecCode')?.textContent || '';
		try { await navigator.clipboard.writeText(text); window.displayInfo?.('success','Copied lavaan syntax to clipboard.'); } catch { window.displayInfo?.('error','Copy failed.'); }
	});
	if (dlBtn) dlBtn.addEventListener('click', () => {
		const text = document.getElementById('lavaanSpecCode')?.textContent || '';
		const blob = new Blob([text], { type:'text/plain' });
		const a = document.createElement('a');
		a.href = URL.createObjectURL(blob);
		const base = (overallCode || constructName || 'model').replace(/[^A-Za-z0-9_\-]/g,'_');
		a.download = base + '_lavaan.txt';
		document.body.appendChild(a); a.click(); setTimeout(()=>{ URL.revokeObjectURL(a.href); a.remove(); }, 100);
	});
}

// Ensure lavaan panel updates after each save
const originalPersist = persistStep4;
persistStep4 = async function(){
	await originalPersist();
	refreshLavaanPanel();
};


// todo validation error add if nothing selected. warning
    // - option to deselect items
    // use custom id for items like OO1