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
// Auto-generated custom per-item identifiers { itemId: customId }
let itemCustomIds = {};
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
		ensureUniqueOverallCode();
		// Generate / refresh custom item IDs (depends on loaded subdimensions & items)
		generateItemCustomIds();
		if (!overallCode) overallCode = deriveShortCode(constructName);
		renderFirstOrderFacets();
		initSecondOrderPanel();
		refreshLavaanPanel();
		// If AI suggestions were previously stored, show them
		if (lastAISuggestions) {
			renderAISuggestions(lastAISuggestions);
			const actions = document.getElementById('aiSuggestionsActions');
			if (actions) actions.classList.remove('d-none');
		}
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
// Inject minimal styling for excluded reference options
document.addEventListener('DOMContentLoaded', () => {
	if (!document.getElementById('step4-excluded-style')) {
		const style = document.createElement('style');
		style.id = 'step4-excluded-style';
		style.textContent = `select.facet-ref-item option[data-excluded="1"] { color: #b1b1b1ff; font-style: italic; }`;
		document.head.appendChild(style);
	}
});

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
		const scale = facetScaling[pseudoId] || {};
		const method = scale.method || 'fix_loading';
		const refItemId = scale.refItemId;
		const itemsHtml = allItems.length
			? `<div class="mm-item-grid"><div class="small text-muted w-100 mb-1">Click an item to ${disabledSet.size? 'toggle include/exclude':'exclude it from the facet'}.</div>${allItems.map(it => { const t = escapeHtml(it.text); const long = t.length>80? ' long' : ''; const inactive = disabledSet.has(String(it.id)) ? ' inactive' : ''; const cid = escapeHtml(itemCustomIds[it.id] || ''); const refMark = (method==='fix_loading' && String(scale.refItemId)===String(it.id)) ? ' ref-item' : ''; return `<span class="mm-item-tag${long}${inactive}${refMark}" data-facet="${pseudoId}" data-item-id="${it.id}" title="${cid? '['+cid+'] ' : ''}${t} (click to ${inactive? 'include':'exclude'})" role="button" tabindex="0">${cid? `<span class="badge bg-secondary me-1">${cid}</span>`:''}${t}${refMark? ' <i class="bi bi-asterisk text-warning"></i>':''}</span>`; }).join('')}</div>`
			: '<div class="text-muted small mb-2">No items added in Step 2.</div>';
		const refSelect = allItems.length ? `<select class="form-select form-select-sm mt-1 facet-ref-item" data-facet="${pseudoId}">${allItems.map(it=>{ const excluded = disabledSet.has(String(it.id)); return `<option value="${it.id}" ${String(it.id)===String(refItemId)?'selected':''} ${excluded? 'data-excluded="1"':''}>${escapeHtml(shorten(it.text,40))}${excluded? ' (excluded)':''}</option>`; }).join('')}</select>` : '<div class="small text-muted mt-1">No items to reference</div>';
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
		col.className = 'col-12 col-md-6';
		const facetItems = (items || []).filter(it => it.subdimensionId === sd.id).sort((a,b)=>a.id-b.id);
		const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
		const activeFacetItems = facetItems.filter(it => !disabledSet.has(String(it.id)));
		const currentMode = facetModes[sd.id] || '';
		if (currentMode === 'formative') ensureGlobalReflectiveDefaults(sd.id);
		ensureScalingDefaults(sd.id, activeFacetItems);
		const scale = facetScaling[sd.id] || {};
		const method = scale.method || 'fix_loading';
		const refItemId = scale.refItemId;
		const itemsHtml = facetItems.length
			? `<div class="mm-item-grid"><div class="small text-muted w-100 mb-1">Click an item to ${disabledSet.size? 'toggle include/exclude':'exclude it from the facet'}.</div>${facetItems.map(it => { const t = escapeHtml(it.text); const long = t.length>80? ' long' : ''; const inactive = disabledSet.has(String(it.id)) ? ' inactive' : ''; const cid = escapeHtml(itemCustomIds[it.id] || ''); const refMark = (method==='fix_loading' && String(scale.refItemId)===String(it.id)) ? ' ref-item' : ''; return `<span class="mm-item-tag${long}${inactive}${refMark}" data-facet="${sd.id}" data-item-id="${it.id}" title="${cid? '['+cid+'] ' : ''}${t} (click to ${inactive? 'include':'exclude'})" role="button" tabindex="0">${cid? `<span class=\"badge bg-secondary me-1\">${cid}</span>`:''}${t}${refMark? ' <i class=\"bi bi-asterisk text-warning\"></i>':''}</span>`; }).join('')}</div>`
			: '<div class="text-muted small mb-2">No items assigned</div>';
		const reflectiveCandidates = currentMode === 'formative'
			? (globalReflective[sd.id]||[]).filter(g => (g.text||'').trim())
			: facetItems;
		let refSelect;
		if (currentMode === 'formative') {
			// Always render a select so it can be dynamically populated when user types globals (needs 2 globals)
			refSelect = `<select class="form-select form-select-sm mt-1 facet-ref-item" data-facet="${sd.id}" ${reflectiveCandidates.length>=2? '' : ''}>${reflectiveCandidates.map(it=>`<option value="${it.id}" ${String(it.id)===String(refItemId)?'selected':''}>${escapeHtml(shorten(it.text,40))}</option>`).join('')}</select>` + (reflectiveCandidates.length>=2? '' : '<div class="small text-muted mt-1">Add two global reflective items above to enable fixing a loading.</div>');
		} else {
			refSelect = reflectiveCandidates.length ? `<select class="form-select form-select-sm mt-1 facet-ref-item" data-facet="${sd.id}">${reflectiveCandidates.map(it=>{ const excluded = disabledSet.has(String(it.id)); return `<option value="${it.id}" ${String(it.id)===String(refItemId)?'selected':''} ${excluded? 'data-excluded="1"':''}>${escapeHtml(shorten(it.text,40))}${excluded? ' (excluded)':''}</option>`; }).join('')}</select>` : '<div class="small text-muted mt-1">No items to reference</div>';
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
					<div class="form-text small mb-1">Provide up to two global reflective items. <div>
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
	itemCustomIds = stored.itemCustomIds || {};
	// Load any previously saved AI suggestions
	if (stored.aiSuggestions) {
		lastAISuggestions = stored.aiSuggestions; // legacy key
	} else if (stored.lastAISuggestions) { // future-proof if name changes
		lastAISuggestions = stored.lastAISuggestions;
	}
	overallCode = stored.overallCode || overallCode || deriveShortCode(constructName);
	// Normalize ref ids (convert numeric-like strings to numbers) to avoid equality mismatches after reload
	Object.keys(facetScaling).forEach(fid => {
		const sc = facetScaling[fid];
		if (sc && sc.method === 'fix_loading' && sc.refItemId != null && /^\d+$/.test(String(sc.refItemId))) {
			sc.refItemId = Number(sc.refItemId);
		}
	});
	if (secondOrder?.scaling) {
		if (secondOrder.scaling.refFacetId != null && /^\d+$/.test(String(secondOrder.scaling.refFacetId))) secondOrder.scaling.refFacetId = Number(secondOrder.scaling.refFacetId);
		if (secondOrder.scaling.refItemId != null && /^\d+$/.test(String(secondOrder.scaling.refItemId))) secondOrder.scaling.refItemId = Number(secondOrder.scaling.refItemId);
	}
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
			ensureUniqueOverallCode();
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
				// Normalize numeric ids so strict comparisons in code work (item ids are numbers)
				if (facetScaling[facetId]) {
					const raw = e.target.value;
					const maybeNum = raw !== undefined && raw !== null && /^\d+$/.test(raw) ? Number(raw) : raw; // keep globals (string ids) intact
					facetScaling[facetId].refItemId = maybeNum;
				}
				refreshLavaanPanel();
					updateRefItemVisual(facetId);
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
	// Regenerate custom IDs in case facet codes or overall code changed
	generateItemCustomIds();
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
	const payload = { facetModes, indicators, facetScaling, globalReflective, secondOrder, lavaanSpec, overallCode, facetDisabledItems, itemCustomIds, lastAISuggestions, updatedAt: new Date().toISOString() };
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
		// Do NOT auto-change the reference if it is no longer in active items (user disabled it). Leave as-is for user to resolve.
		// Only downgrade to variance if absolutely no candidates exist for identification (e.g., zero globals for formative with <2 entries & user cleared them all).
		if (mode === 'formative' && candidateRefItems.length < 2) {
			// Keep method if user intentionally keeps ref; switch only if zero candidate reflective globals.
			if (candidateRefItems.length === 0) facetScaling[facetId] = { method: 'fix_variance' };
		} else if (!candidateRefItems.length) {
			facetScaling[facetId] = { method: 'fix_variance' };
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
		const itemVar = (itemId) => {
			const cid = itemCustomIds[itemId];
			return cid ? sanitize(cid) : sanitize('i'+itemId);
		};
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
			const cid = itemCustomIds[it.id];
			mapping.push(`# ${disabled? '(excluded) ':''}${itemVar(it.id)} = item ${it.id}: ${shorten(it.text||'',70)}`);
		});
		Object.keys(globalReflective||{}).forEach(fid => {
			// Only include globals for formative facets currently set to formative
			if (facetModes[fid] !== 'formative') return;
			const sd = subdimensions.find(s => s.id === fid);
			(globalReflective[fid]||[]).filter(g => (g.text||'').trim()).forEach((g,i) => mapping.push(`# ${globalItemVar(fid,i)} = global (${sd ? (sd.name||fid) : fid}) ${shorten(g.text||'',70)}`));
		});
		if (secondOrder.type === 'formative') {
			(secondOrder.globalReflective||[]).filter(g => (g.text||'').trim()).forEach((g,i) => mapping.push(`# ${secondGlobalItemVar(i)} = higher-order global: ${shorten(g.text||'',70)}`));
		}
		subdimensions.forEach(sd => { if (sd.code) mapping.push(`# Code ${sd.code}: Facet ${sd.name} `); });
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
				const parts = facetItems.map(it => (refId != null && String(it.id) === String(refId) ? '1*'+itemVar(it.id) : itemVar(it.id)));
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
					const parts = facetItems.map(it => (refId != null && String(it.id) === String(refId) ? '1*'+itemVar(it.id) : itemVar(it.id)));
					lines.push(`${fVar} =~ ${parts.join(' + ')}`);
					if (scale.method === 'fix_variance') lines.push(`${fVar} ~~ 1*${fVar}`);
				}
			} else if (mode === 'formative') {
				// Causal indicators (items cause latent)
				if (facetItems.length){
					const causal = facetItems.map(it => itemVar(it.id));
					lines.push(`${fVar} <~ ${causal.join(' + ')}`);
				}
				const globals = (facetModes[sd.id]==='formative' ? (globalReflective[sd.id]||[]).filter(g => (g.text||'').trim()) : []);
				if (globals.length){
					const refId = (scale.method === 'fix_loading') ? scale.refItemId : null;
					const parts = globals.map((g,i) => {
						const gv = globalItemVar(sd.id,i);
						return (refId != null && String(g.id) === String(refId) ? '1*'+gv : gv);
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
					return (refFacet != null && String(sd.id) === String(refFacet) ? '1*'+v : v);
				});
				lines.push(`${overallVar} =~ ${parts.join(' + ')}`);
				if (secondOrder.scaling?.method === 'fix_variance') lines.push(`${overallVar} ~~ 1*${overallVar}`);
			} else if (secondOrder.type === 'formative') {
				// Facets cause the higher order
				const facetVars = subdimensions.map(sd => facetVar(sd));
				if (facetVars.length) lines.push(`${overallVar} <~ ${facetVars.join(' + ')}`);
				const globals = (secondOrder.type==='formative' ? (secondOrder.globalReflective||[]).filter(g => (g.text||'').trim()) : []);
				if (globals.length){
					const refId = (secondOrder.scaling?.method === 'fix_loading') ? secondOrder.scaling.refItemId : null;
					const parts = globals.map((g,i) => {
						const gv = secondGlobalItemVar(i);
						return (refId != null && String(g.id) === String(refId) ? '1*'+gv : gv);
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
		// Do not auto-change ref if missing; let validation flag it.
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
	// Refresh visual reference markers
	if (!dimensionality || dimensionality === 'Unidimensional') {
		updateRefItemVisual('unidim');
	} else {
		subdimensions.forEach(sd => updateRefItemVisual(sd.id));
	}
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

function ensureUniqueOverallCode(){
	if (!overallCode) return;
	const facetCodes = new Set(subdimensions.map(sd => (sd.code||'').trim().toUpperCase()).filter(Boolean));
	if (!facetCodes.has(overallCode)) return; // already unique
	// If clash, append a numeric suffix not used yet (1..99)
	let base = overallCode.replace(/\d+$/,'');
	if (!base) base = deriveShortCode(constructName) || 'OV';
	let n = 1;
	while (facetCodes.has((base + n).toUpperCase()) && n < 100) n++;
	const newCode = (base + n).toUpperCase();
	overallCode = newCode;
	const input = document.getElementById('overallCodeInput');
	if (input) input.value = overallCode;
	window.displayInfo?.('info', 'Overall Short ID adjusted to avoid clash with facet code.');
}

function collectScalingSelections(){
	const radios = document.querySelectorAll('input.facet-scale-radio');
	radios.forEach(r => {
		if (r.checked) {
			const facetId = r.getAttribute('data-facet');
			const method = r.value;
			if (method === 'fix_loading') {
				const sel = document.querySelector(`select.facet-ref-item[data-facet="${facetId}"]`);
				let refItemId = sel ? sel.value : null;
				if (refItemId != null && /^\d+$/.test(String(refItemId))) refItemId = Number(refItemId);
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
			let refItemId = sel ? sel.value : null;
			if (refItemId != null && /^\d+$/.test(String(refItemId))) refItemId = Number(refItemId);
			facetScaling[facetId] = { method: 'fix_loading', refItemId };
		}
	} else {
		if (wrapper) wrapper.classList.add('d-none');
		facetScaling[facetId] = { method: 'fix_variance' };
	}
	updateRefItemVisual(facetId);
}

// Visually mark reference item without full re-render
function updateRefItemVisual(facetId){
	const scale = facetScaling[facetId];
	// Clear previous marks
	document.querySelectorAll(`.mm-item-tag[data-facet="${facetId}"]`).forEach(tag => {
		tag.classList.remove('ref-item');
		const icon = tag.querySelector('i.bi.bi-asterisk');
		if (icon) icon.remove();
	});
	if (!scale || scale.method !== 'fix_loading' || scale.refItemId == null) return;
	const refTag = document.querySelector(`.mm-item-tag[data-facet="${facetId}"][data-item-id="${scale.refItemId}"]`);
	if (refTag) {
		refTag.classList.add('ref-item');
		// Append icon at end if not present
		if (!refTag.querySelector('i.bi.bi-asterisk')) {
			refTag.insertAdjacentHTML('beforeend',' <i class="bi bi-asterisk text-warning"></i>');
		}
	}
}

// ---- Custom Item Identifier Generation ----
function generateItemCustomIds(){
	if (!items || !items.length) { itemCustomIds = {}; return; }
	const byFacet = {};
	const isUnidim = !subdimensions.length || dimensionality === 'Unidimensional';
	// Build lookup for facet codes
	const facetCodeMap = {};
	subdimensions.forEach(sd => { facetCodeMap[sd.id] = (sd.code || deriveShortCode(sd.name || 'F')).toUpperCase(); });
	const overall = (overallCode || deriveShortCode(constructName) || 'IT').toUpperCase();
	items.sort((a,b)=>a.id-b.id).forEach(it => {
		const facetId = isUnidim ? 'unidim' : it.subdimensionId;
		if (!byFacet[facetId]) byFacet[facetId] = 0;
		byFacet[facetId] += 1;
		const seq = byFacet[facetId];
		let prefix;
		if (isUnidim) prefix = overall;
		else prefix = (facetCodeMap[facetId] || overall);
		// Lowercase per request but keep consistent a-z0-9 only
		const base = (prefix || 'IT').toLowerCase();
		itemCustomIds[it.id] = base + seq; // e.g., ab1
	});
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
		// Measurement type must be chosen
		if (!facetModes[sd.id]) {
			errors.push(`Facet "${sd.name || sd.id}" has no measurement type selected (choose Reflective or Formative).`);
			return; // Skip further checks for this facet until selected
		}
		if (!facetScaling[sd.id]) {
			errors.push(`Facet "${sd.name || sd.id}" has no scaling rule selected.`);
			return;
		}
		const sc = facetScaling[sd.id];
		if (sc.method === 'fix_loading' && !sc.refItemId) errors.push(`Facet "${sd.name || sd.id}" set to fix a loading but no reference item chosen.`);
		// Reference item disabled check
		if (sc.method === 'fix_loading' && sc.refItemId != null) {
			const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
			if (disabledSet.has(String(sc.refItemId))) errors.push(`Facet "${sd.name || sd.id}" reference item is excluded; re-include it or select another reference.`);
		}
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
		const scUni = facetScaling['unidim'];
		if (scUni && scUni.method === 'fix_loading' && scUni.refItemId != null && disabledSet.has(String(scUni.refItemId))) {
			errors.push('Unidimensional reference item is excluded; re-include it or choose another reference.');
		}
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
	// Overall code uniqueness check
	if (overallCode) {
		const dup = subdimensions.find(sd => (sd.code||'').trim().toUpperCase() === overallCode.toUpperCase());
		if (dup) errors.push(`Overall Short ID "${overallCode}" duplicates facet code "${dup.code}". Choose a different Overall Short ID.`);
	}
	return { errors, warnings };
}

function updateValidationMessages(){
	const host = document.getElementById('validationMessages');
	if (!host) return;
	const { errors, warnings } = computeValidation();
	const continueBtn = document.getElementById('continueStep4Btn');
	if (!errors.length && !warnings.length) {
		host.innerHTML = '<div class="alert alert-success py-2 px-3 small mb-0">No validation issues detected.</div>';
		if (continueBtn) continueBtn.classList.remove('d-none');
		return;
	}
	if (continueBtn) continueBtn.classList.add('d-none');
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
	generateItemCustomIds();
	await originalPersist();
	refreshLavaanPanel();
};

// ------------------------ smart assistant -------------------
// ---------- AI Suggestions Integration ----------
let lastAISuggestions = null; // cached object

function initAISuggestionsUI(){
	const fetchBtn = document.getElementById('btnFetchAISuggestions');
	const applyAllBtn = document.getElementById('btnApplyAllAISuggestions');
	if (fetchBtn) fetchBtn.addEventListener('click', async () => { await fetchAndRenderAISuggestions(); });
	if (applyAllBtn) applyAllBtn.addEventListener('click', () => { applyAISuggestions(null, true); });
}

async function fetchAndRenderAISuggestions(){
	try {
		const host = document.getElementById('aiSuggestionsContent');
		const raw = await getSpecificationSuggestions();
		let obj = null;
		try { obj = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(parseErr){
			window.displayInfo?.('error','AI suggestions JSON parse failed.');
			if (host) host.textContent = 'Failed to parse suggestions.';
			return;
		}
		lastAISuggestions = obj;
		renderAISuggestions(obj);
		// persist suggestions so they survive reloads
		persistStep4();
		window.displayInfo?.('success','AI suggestions loaded.');
	} catch(err){
		console.error('[AI Suggestions] fetch failed', err);
		window.displayInfo?.('error','Failed to fetch AI suggestions.');
	}
}

function renderAISuggestions(data){
	const host = document.getElementById('aiSuggestionsContent');
	if (!host){ return; }
	if (!data){ host.textContent = 'No suggestions.'; return; }
	const higher = data.higherOrderFacet;
	const firstOrder = data.firstOrderFacets || {};
	const rows = [];
	if (higher) {
		let globalsList = '';
		if (higher.spec === 'formative' && Array.isArray(higher.globalReflectiveItems)) {
			const items = higher.globalReflectiveItems.slice(0,2).filter(t => (t||'').trim());
			if (items.length) globalsList = `<ul class="small ms-3 mt-1 mb-0">${items.map(t=>`<li>${escapeHtml(shorten(t,80))}</li>`).join('')}</ul>`;
		}
		rows.push(`<div class="mb-2"><div class="fw-bold">Higher-Order: <span class="badge bg-secondary">${escapeHtml(higher.spec||'')}</span></div><div class="small text-muted">${escapeHtml(higher.justification||'')}</div>${globalsList}</div>`);
	}
	const facetMap = {}; subdimensions.forEach(sd => facetMap[sd.id] = sd);
	Object.keys(firstOrder).forEach(fid => {
		const sug = firstOrder[fid];
		const sd = facetMap[fid];
		if (!sd) return;
		let globalsList = '';
		if (sug.spec === 'formative' && Array.isArray(sug.globalReflectiveItems)) {
			const items = sug.globalReflectiveItems.slice(0,2).filter(t => (t||'').trim());
			if (items.length) globalsList = `<ul class="small ms-3 mt-1 mb-0">${items.map(t=>`<li>${escapeHtml(shorten(t,80))}</li>`).join('')}</ul>`;
		}
		rows.push(`<div class="mb-2" data-ai-facet="${fid}"><div class="fw-bold">${escapeHtml(sd.name||fid)} <span class="badge bg-secondary">${escapeHtml(sug.spec||'')}</span></div><div class="small text-muted">${escapeHtml(sug.justification||'')}</div>${globalsList}</div>`);
	});
	host.innerHTML = rows.join('') || 'No facet suggestions.';
	const actions = document.getElementById('aiSuggestionsActions');
	if (actions) actions.classList.remove('d-none');
}

function applyAISuggestions(_, applyAll=false){
	if (!lastAISuggestions) return;
	const data = lastAISuggestions;
	const firstOrder = data.firstOrderFacets || {};
	// Always treat as apply all (only button present)
	if (data.higherOrderFacet && data.higherOrderFacet.spec) {
		secondOrder.type = data.higherOrderFacet.spec === 'none' ? null : data.higherOrderFacet.spec;
		// Apply higher-order global reflective items if formative and provided
		if (secondOrder.type === 'formative') {
			const globals = (data.higherOrderFacet.globalReflectiveItems || []).slice(0,2);
			if (!secondOrder.globalReflective) {
				secondOrder.globalReflective = [ { id: 'g_second_1', text: '' }, { id: 'g_second_2', text: '' } ];
			}
			globals.forEach((txt,i) => { if (secondOrder.globalReflective[i]) secondOrder.globalReflective[i].text = txt || ''; });
		}
	}
	Object.keys(firstOrder).forEach(fid => {
		const sug = firstOrder[fid];
		if (sug.spec) facetModes[fid] = sug.spec;
		if (sug.spec === 'formative' && Array.isArray(sug.globalReflectiveItems)) {
			ensureGlobalReflectiveDefaults(fid);
			const globals = sug.globalReflectiveItems.slice(0,2);
			globals.forEach((txt,i) => { if (globalReflective[fid][i]) globalReflective[fid][i].text = txt || ''; });
		}
	});
	// Recompute scaling defaults as new globals may enable loading-fix scaling
	if (!dimensionality || dimensionality === 'Unidimensional') {
		const allItems = (items || []).filter(it => true); // unchanged
		ensureScalingDefaults('unidim', allItems);
	} else {
		subdimensions.forEach(sd => {
			const disabledSet = new Set((facetDisabledItems[sd.id]||[]).map(String));
			const facetItems = (items||[]).filter(it => it.subdimensionId === sd.id && !disabledSet.has(String(it.id)));
			ensureScalingDefaults(sd.id, facetItems);
		});
	}
	renderFirstOrderFacets();
	initSecondOrderPanel();
	refreshLavaanPanel();
	scheduleAutoSave();
	window.displayInfo?.('success','Applied AI suggestions.');
}

// Initialize AI suggestions UI after DOM load
document.addEventListener('DOMContentLoaded', initAISuggestionsUI);



async function getSpecificationSuggestions(tries = 0) {
    if(dimensionality == "Unidimensional") {
		displayInfo('info', 'The construct is unidimensional. No subdimensions available for suggestions.');
		return;
    }
	const prompt = `
	You are an expert in measurement model specification following MacKenzie et al. (2011). 
	Task: Recommend how to specify a latent variable measurement model in lavaan, given facets (first-order constructs), items, and optional higher-order structure.

	Context:
	Construct name: "${constructName}"
	Overall definition: "${savedDefinition}"
	Dimensionality: ${dimensionality}

	Facets (first-order):
	${subdimensions.map(sd => `Dimensionname: ${sd.name}, Definition: ${sd.definition}, id: ${sd.id}, code: ${sd.code}, Their items: ${items.filter(item => item.subdimensionId === sd.id).map(item => item.text).join(', ')}`).join(';\n')}

Goals:
1. Decide if higher-order latent is needed.
2. For each latent (first or higher order): recommend reflective vs formative with a concise justification (≤25 words).
3. If formative propose two global reflective item phrasings.

Output format (strict JSON, no markdown or commentary):


{
	"higherOrderFacet": { "spec": "do not model"|"reflective"|"formative", "justification": "≤25 WORDS HERE" ,"globalReflectiveItems": ["text1","text2"] (if formative, else omit)},
	"firstOrderFacets": {
		"FACET-ID HERE": {"spec": "reflective"|"formative", "justification": "≤25 WORDS HERE", "globalReflectiveItems": ["text1","text2"] (if formative, else omit)},
		"FACET-ID HERE": {"spec": "reflective"|"formative", "justification": "≤25 WORDS HERE", "globalReflectiveItems": ["text1","text2"] (if formative, else omit)},
		......
	}
}
    ` 

    // Send prompt to chat API and retrieve JSON text
    try {
        showLoading();
		let response = await window.sendChat(prompt,[{"role": "system", "content": "You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}]);
        AIResponse = window.cleanAIRespond(response[0]); // Get the reply text from the response
		

    } catch (err) {
        if (tries < 2) {
            console.error('Error processing AI response:', err);
            window.displayInfo('info', 'AI suggestion format is invalid. Trying again...');
            return await getSpecificationSuggestions(tries + 1);
        }
        console.error('Error fetching suggestions:', err);
        window.displayInfo('danger', 'Failed to retrieve suggestions. Please try again.');
        return;
    }finally {
        hideLoading();
        
    }
   
    // Parse JSON response
    if (AIResponse.length === 0) {
        window.displayInfo('info', 'Empty return Try again!');
        return
    }
	return AIResponse

}