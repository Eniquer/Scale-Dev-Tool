// Step 5 ultra-minimal display per user request.
// Shows only:
// Items: x
// Ratio rule (3:1-10:1): x*3 - x*10
// Absolute heuristic range: 100 - 500
// Decided range: <stored or suggested>
// Plus stability message if construct not stable over time (from Step 1 Panel 4).
(function(){
	document.addEventListener('DOMContentLoaded', init);
	let items = [];
	let decidedLower = null;
	let decidedUpper = null;
	let questionnaireItemList = []; // holds the final items included in questionnaire (id, code, text, subdimension)
	let extraItems = []; // user-added additional items (code,text)
	let questionnaireMismatch = false; // flag if stored answers hash differs
	// Expose for external checks (e.g., append mode logic outside IIFE scope expectations)
	Object.defineProperty(window,'step5QuestionnaireMismatch',{ get: ()=>questionnaireMismatch, set: v=>{ questionnaireMismatch=!!v; try { window.dispatchEvent(new CustomEvent('step5:mismatchChanged',{ detail:{ value: questionnaireMismatch }})); } catch(e){} }, configurable:true });
	async function init(){
		try {
			const [step2, step1, step5, step4] = await Promise.all([
				window.dataStorage.getData('data_step_2'),
				window.dataStorage.getData('data_step_1'),
				window.dataStorage.getData('data_step_5'),
				window.dataStorage.getData('data_step_4')
			]);
			items = step2?.items || [];
			decidedLower = (typeof step5?.decidedLower === 'number') ? step5.decidedLower : null;
			decidedUpper = (typeof step5?.decidedUpper === 'number') ? step5.decidedUpper : null;
			extraItems = Array.isArray(step5?.extraItems)? step5.extraItems : [];
			renderSampleSize();
			renderStability(step1?.panel4);
			generateQuestionnaire(step1?.panel4, step1?.panel5, step4);
			renderExtraItemsList();
			attachExtraItemHandlers();
		} catch(err){ console.error('[Step5] init failed', err); }
	}


	async function downloadLikertCsv(){
		try {
			const step5 = await window.dataStorage.getData('data_step_5')||{};
			const rows = step5.likertAnswers || [];
			if (!rows.length){ window.displayInfo && window.displayInfo('info','No likert answers to export.'); return; }
			// Determine header from union of keys
			const headerSet = new Set();
			rows.forEach(r=> Object.keys(r||{}).forEach(k=> headerSet.add(k)));
			const header = Array.from(headerSet);
			const esc = v => {
				if (v==null) return '';
				const s = String(v);
				return /[",\n]/.test(s) ? '"'+s.replace(/"/g,'""')+'"' : s;
			};
			const lines = [header.join(',')];
			rows.forEach(r=>{
				lines.push(header.map(h=> esc(r[h])).join(','));
			});
			const csv = lines.join('\n');
			const blob = new Blob([csv+'\n'], { type:'text/csv;charset=utf-8;' });
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url; a.download = 'likert_responses.csv';
			document.body.appendChild(a); a.click();
			setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },150);
			window.displayInfo && window.displayInfo('success','Likert table downloaded.');
		} catch(e){ console.warn('[Step5] download CSV failed', e); window.displayInfo && window.displayInfo('danger','Download failed'); }
	}

	function renderSampleSize(){
		const host = document.getElementById('sampleSizeGuidance');
		if (!host) return;
		const n = items.length;
		const ratioMin = 3 * n;
		const ratioMax = 10 * n;
		const absMin = 100;
		const absMax = 500;
		if (decidedLower == null || decidedUpper == null){
			// default decided range = max(absMin, ratioMin) to max(absMax, ratioMax)
			const dL = Math.max(absMin, ratioMin);
			const dU = Math.max(absMax, ratioMax);
			decidedLower = dL;
			decidedUpper = dU;
		}
		host.innerHTML = [
			`<div class="small">Items: ${n}</div>`,
			`<div class="small">Ratio rule (3:1-10:1): ${ratioMin} - ${ratioMax}</div>`,
			`<div class="small">Absolute heuristic range: ${absMin} - ${absMax}</div>`,
			`<div class="small">Decided range: ${decidedLower} - ${decidedUpper}</div>`
		].join('');
	}

	function renderStability(panel4){
		const host = document.getElementById('stabilityGuidance');
		if (!host) return;
		const time = panel4?.stabilityTime || '';
		const situation = panel4?.stabilitySituation || '';
		const cases = panel4?.stabilityCases || '';
		const timeStable = time === 'Stable (trait-like)';
		const situationStable = situation === 'Generalizable';
		const casesStable = cases === 'Broadly applicable';
		const notStable = !timeStable || !situationStable || !casesStable; // any dimension unstable triggers note
		host.innerHTML = notStable ? `<div class="small text-warning">Construct not fully stable across assessed dimensions - plan <strong>multiple waves of data</strong> (e.g., test-retest) to evaluate temporal / situational consistency.</div>` : '';
	}

	function scheduleSave(){ /* retained for future use; currently no interactive edits */ }
	async function persist(){
		try {
			const existing = await window.dataStorage.getData('data_step_5') || {};
			await window.dataStorage.storeData('data_step_5', { ...existing, decidedLower, decidedUpper, updatedAt: new Date().toISOString() }, false);
		} catch(err){ console.error('[Step5] persist failed', err); }
	}

	function generateQuestionnaire(panel4, panel5, step4){
        // todo add optional columns like demographics
		const ta = document.getElementById('questionnairePreview');
		if (!ta) return;
		if (!items.length){ ta.value = 'No items available.'; return; }
		// Determine dimensionality
		const dimensionality = panel4?.dimensionality || 'Unidimensional';
		// Step 4 exclusions
		const facetDisabled = step4?.facetDisabledItems || {};
		const itemCodes = step4?.itemCustomIds || {};
		const facetModes = step4?.facetModes || {}; // for detecting formative facets
		const globalReflective = step4?.globalReflective || {}; // { facetId: [ {id, text}, ... ] }
		const secondOrderData = step4?.secondOrder || {};
		const overallCode = (step4?.overallCode || '').trim();
		const secondOrderGlobals = (secondOrderData.type === 'formative' ? (secondOrderData.globalReflective||[]) : []).filter(g => (g?.text||'').trim()); // [ {id,text}, ... ]
		// Facet modes maybe used later if formative etc; here just grouping
		const subdimensions = panel5?.subdimensions || [];
		// Build active items list (exclude those flagged in step4)
		const activeItems = items.filter(it => {
			if (!subdimensions.length || dimensionality === 'Unidimensional') {
				const dis = new Set((facetDisabled['unidim']||[]).map(String));
				return !dis.has(String(it.id));
			}
			// multidimensional: exclusion per facet id
			const fid = it.subdimensionId;
			const dis = new Set((facetDisabled[fid]||[]).map(String));
			return !dis.has(String(it.id));
		});
		if (!activeItems.length){ ta.value = 'All items are currently excluded in Step 4.'; return; }

		// Filter to only items with a valid (non-empty) code
		const validCodeRegex = /^[A-Za-z]+[A-Za-z0-9]*$/; // simple definition of valid code
		const codedItems = activeItems.filter(it => {
			const code = itemCodes[it.id];
			return typeof code === 'string' && code.trim() && validCodeRegex.test(code.trim());
		});
		if (!codedItems.length){
			ta.value = 'No coded items available (add codes in Step 4 to generate questionnaire).';
			questionnaireItemList = [];
			window.step5QuestionnaireItems = questionnaireItemList;
			return;
		}
		// Prepare map of facet (subdimension) codes
		const facetCodeById = Object.fromEntries((subdimensions||[]).map(sd=>[sd.id, (sd.code||'').trim()]));
		// Gather global reflective items (only for formative facets or second-order if present)
		const globalItems = [];
		// Facet-level globals
		Object.entries(globalReflective).forEach(([fid, arr])=>{
			if (!Array.isArray(arr) || !arr.length) return;
			if (facetModes[fid] !== 'formative') return; // only include for formative facets
			arr.forEach((g,idx)=>{
				const txt = (g?.text||'').trim();
				if (!txt) return;
				const existingCode = itemCodes[g.id];
				// Pattern: facetcodeGnumber (lowercase facet code) e.g., teG1. Fallback: f<fid>G<number>
				let baseCode = existingCode || (facetCodeById[fid] ? `${facetCodeById[fid].toLowerCase()}G${idx+1}` : `f${fid}G${idx+1}`);
				baseCode = baseCode.toString();
				globalItems.push({ id: g.id || `global_${fid}_${idx+1}`, code: baseCode, text: clean(txt), subdimensionId: fid, isGlobal: true });
			});
		});
		// Second-order globals (if any)
		if (Array.isArray(secondOrderGlobals) && secondOrderGlobals.length){
			secondOrderGlobals.forEach((g,idx)=>{
				const txt = (g?.text||'').trim(); if (!txt) return;
				const existingCode = itemCodes[g.id];
				// Higher-order pattern: overallcodeGnumber (lowercase overall code) e.g., teG1
				const oc = (overallCode || 'ho').toLowerCase();
				let baseCode = existingCode || `${oc}G${idx+1}`;
				globalItems.push({ id: g.id || `so_global_${idx+1}`, code: baseCode.toString(), text: clean(txt), subdimensionId: null, isGlobal: true, secondOrder: true, higherOrder: true });
			});
		}
		// Ensure uniqueness of codes (avoid collision with item codes)
		const usedCodes = new Set(codedItems.map(it=> (itemCodes[it.id]||'').toString()));
		globalItems.forEach(g=>{
			let c = g.code; let n=2;
			while (usedCodes.has(c)) { c = `${g.code}_${n++}`; }
			g.code = c; usedCodes.add(c);
		});
		// Sort codedItems (stable) then we'll merge when rendering
		codedItems.sort((a,b)=>{
			const sdA = a.subdimensionId || '';
			const sdB = b.subdimensionId || '';
			if (sdA === sdB) {
				const cA = (itemCodes[a.id]||'').toString();
				const cB = (itemCodes[b.id]||'').toString();
				return cA.localeCompare(cB, undefined, { numeric: true, sensitivity: 'base' });
			}
			return sdA.localeCompare(sdB);
		});
		let lines = [];
		lines.push('# Questionnaire Draft');
		lines.push(`# Generated: ${new Date().toISOString()}`);
		lines.push(`# Items included: ${codedItems.length} coded (of ${items.length} total; ${activeItems.length - codedItems.length} uncoded active items skipped) + ${globalItems.length} global `);
		lines.push('');
		// Build the exported questionnaire item list (lightweight objects)
		questionnaireItemList = [
			...globalItems.map(g=>({ id: g.id, code: g.code, text: g.text, subdimensionId: g.subdimensionId, isGlobal: true, secondOrder: !!g.secondOrder })),
			...codedItems.map(it => ({ id: it.id, code: (itemCodes[it.id]||'').toString(), text: clean(it.text), subdimensionId: it.subdimensionId || null }))
		];
		// Append extra items (flagged but INCLUDED in simulation)
		const sanitizedExtras = extraItems.filter(e => e && e.code && e.text).map(e => ({ id: e.code, code: e.code, text: clean(e.text), subdimensionId: null, isExtra: true, responseType: e.type||'likert' }));
		questionnaireItemList.push(...sanitizedExtras);
		window.step5QuestionnaireItems = questionnaireItemList; // expose globally for simulation or export
		if (dimensionality === 'Multidimensional' && subdimensions.length){
			// Output higher-order globals (root level) first if any
			const rootGlobals = globalItems.filter(g=>g.subdimensionId==null);
			if (rootGlobals.length){
				lines.push('## Higher-Order Global Items');
				rootGlobals.forEach(g=> lines.push(`${g.code}: ${g.text}`));
				lines.push('');
			}
			for (const sd of subdimensions){
				const groupItems = codedItems.filter(it => it.subdimensionId === sd.id);
				const facetGlobals = globalItems.filter(g=>g.subdimensionId === sd.id);
				if (!groupItems.length && !facetGlobals.length) continue;
				lines.push(`## ${sd.name || 'Subdimension'}${sd.code? ' ['+sd.code+']':''}`);
				if (sd.definition) lines.push(`// ${sd.definition.replace(/\n+/g,' ')}`);
				// Global reflective items first (if any)
				facetGlobals.forEach(g=>{
					lines.push(`${g.code}. ${g.text}`);
				});
				groupItems.forEach((it)=>{
					const code = (itemCodes[it.id]||'').toString();
					lines.push(`${code}. ${clean(it.text)}`);
				});
				lines.push('');
			}
			if (sanitizedExtras.length){
				lines.push('## Additional Items');
				sanitizedExtras.forEach(ex => { lines.push(`${ex.code}: ${ex.text}`); });
			}
		} else {
			// Unidimensional: prepend any second-order/global items (subdimensionId null)
			const rootGlobals = globalItems.filter(g=>g.subdimensionId==null);
			rootGlobals.forEach(g=> lines.push(`${g.code}. ${g.text}`));
			codedItems.forEach(it => {
				const code = (itemCodes[it.id]||'').toString();
				lines.push(`${code}. ${clean(it.text)}`);
			});
			if (sanitizedExtras.length){
				lines.push('');
				lines.push('## Additional Items');
				sanitizedExtras.forEach(ex => { lines.push(`${ex.code}: ${ex.text}`); });
			}
		}
		// Basic response instruction placeholder
		ta.value = lines.join('\n');
		// Persist questionnaire list alongside any existing step 5 data (non-destructive merge)
		(async ()=>{
			try {
				const existing = await window.dataStorage.getData('data_step_5') || {};
				await window.dataStorage.storeData('data_step_5', { ...existing, questionnaireItems: questionnaireItemList, questionnaireGeneratedAt: new Date().toISOString() }, false);
			} catch(e){ console.warn('[Step5] Failed to persist questionnaire items', e); }
		})();

		// Re-evaluate mismatch warning whenever questionnaire definition changes (e.g., extra item add/remove)
		reEvalQuestionnaireMismatch();
	}

	async function reEvalQuestionnaireMismatch(){
		try {
			const stored = await window.dataStorage.getData('data_step_5') || {};
			// Recompute current questionnaire hash (duplicate of computeQuestionnaireHash logic)
			const currentHash = (()=>{
				try { return 'q'+(function(str){ let h=0; for (let i=0;i<str.length;i++){ h=((h<<5)-h)+str.charCodeAt(i); h|=0; } return h; })( (questionnaireItemList||[]).map(i=>`${i.code}|${i.responseType||'likert'}`).sort().join('||') ); } catch(e){ return 'q0'; }
			})();
			const storedHash = stored.likertAnswersQuestionnaireHash;
			const hasAnswers = Array.isArray(stored.likertAnswers) && stored.likertAnswers.length>0;
			const mismatch = !!storedHash && storedHash !== currentHash && hasAnswers;
			window.step5QuestionnaireMismatch = mismatch; // triggers event listener for append eligibility
			const host = document.getElementById('answersTable');
			if (host){
				let warn = document.getElementById('likertMismatchWarning');
				if (mismatch){
					if (!warn){
						warn = document.createElement('div');
						warn.id = 'likertMismatchWarning';
						warn.className = 'alert alert-warning py-1 px-2 small mt-2';
						warn.style.width = 'fit-content';
						warn.innerHTML = '<strong>Warning:</strong> The questionnaire structure changed after these responses were stored. Item codes may be misaligned.';
						const container = host.parentNode ? host.parentNode : host;
						container.insertBefore(warn, container.firstChild);
					}
				} else if (warn){
					warn.remove();
				}
			}
		} catch(e){ console.warn('[Step5] reEvalQuestionnaireMismatch failed', e); }
	}
	function clean(t){
		return String(t||'').replace(/\s+/g,' ').trim();
	}

	function escapeHtml(str){
		return String(str||'')
			.replace(/&/g,'&amp;')
			.replace(/</g,'&lt;')
			.replace(/>/g,'&gt;')
			.replace(/"/g,'&quot;')
			.replace(/'/g,'&#39;');
	}

	function attachExtraItemHandlers(){
		const form = document.getElementById('extraItemForm');
		if (!form) return;
		form.addEventListener('submit', async (e)=>{
			e.preventDefault();
			const codeEl = document.getElementById('extraItemCode');
			const textEl = document.getElementById('extraItemText');
			const typeEl = document.getElementById('extraItemType');
			let code = (codeEl.value||'').trim();
			const text = (textEl.value||'').trim();
			const type = (typeEl.value||'likert');
			const validCode = /^[A-Za-z][A-Za-z0-9_]{1,24}$/;
			if (!code || !validCode.test(code)) { window.displayInfo?.('warning','Invalid code format.'); return; }
			if (!text) { window.displayInfo?.('warning','Text required.'); return; }
			// Prevent duplicate codes with existing questionnaire codes
			const existingCodes = new Set(questionnaireItemList.map(i=>i.code));
			if (existingCodes.has(code)) { window.displayInfo?.('warning','Code already used.'); return; }
			extraItems.push({ code, text, type });
			await persistExtraItems();
			generateQuestionnaire(panel4Cache, panel5Cache, step4Cache);
			renderExtraItemsList();
			codeEl.value=''; textEl.value=''; typeEl.value='likert';
		});
	}

	async function persistExtraItems(){
		try {
			const existing = await window.dataStorage.getData('data_step_5') || {};
			await window.dataStorage.storeData('data_step_5', { ...existing, extraItems, extraItemsUpdatedAt: new Date().toISOString() }, false);
		} catch(e){ console.warn('[Step5] Failed to persist extra items', e); }
	}

	function renderExtraItemsList(){
		const host = document.getElementById('extraItemsList');
		if (!host) return;
		if (!extraItems.length){ host.innerHTML = '<div class="small text-muted">No additional items added.</div>'; return; }
		host.innerHTML = '<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th style="width:110px;">Code</th><th>Text</th><th style="width:90px;">Type</th><th style="width:40px;"></th></tr></thead><tbody>' +
			extraItems.map((e,i)=>`<tr data-idx="${i}"><td><code>${e.code}</code></td><td>${escapeHtml(e.text)}</td><td><span class="badge bg-${e.type==='likert'?'info':'secondary'}">${e.type}</span></td><td><button type="button" class="btn btn-sm btn-outline-danger remove-extra-item" data-idx="${i}" title="Remove">&times;</button></td></tr>`).join('') + '</tbody></table></div>';
		host.querySelectorAll('.remove-extra-item').forEach(btn=>{
			btn.addEventListener('click', async () => {
				const idx = parseInt(btn.getAttribute('data-idx'),10);
				if (isNaN(idx)) return;
				extraItems.splice(idx,1);
				await persistExtraItems();
				generateQuestionnaire(panel4Cache, panel5Cache, step4Cache);
				renderExtraItemsList();
			});
		});
	}

	// Cache last panel data for regeneration after adding/removing extras
	let panel4Cache = null, panel5Cache = null, step4Cache = null;
	const origGenerate = generateQuestionnaire;
	generateQuestionnaire = function(p4,p5,s4){ panel4Cache=p4; panel5Cache=p5; step4Cache=s4; return origGenerate(p4,p5,s4); };
})();


let personas = [];

// Attach click handler to "Generate Participants" button and fill textarea.
(function(){
	const STORAGE_KEY = 'data_step_5';

	async function loadStoredPersonas(){
		try {
			const stored = await window.dataStorage.getData(STORAGE_KEY);
			if (stored && Array.isArray(stored.personas)) {
				personas = stored.personas.slice();
			}
		} catch(e){ console.warn('[Step5] Failed to load stored personas', e); }
	}

	async function savePersonas(){
		try {
			const existing = await window.dataStorage.getData(STORAGE_KEY) || {};
			await window.dataStorage.storeData(STORAGE_KEY, { ...existing, personas, personasUpdatedAt: new Date().toISOString() }, false);
		} catch(e){ console.warn('[Step5] Failed to save personas', e); }
	}

	async function saveLikertAnswers(tableData){
		try {
			const existing = await window.dataStorage.getData(STORAGE_KEY) || {};
			const qHash = computeQuestionnaireHash();
			await window.dataStorage.storeData(STORAGE_KEY, { ...existing, likertAnswers: tableData, likertAnswersUpdatedAt: new Date().toISOString(), likertAnswersQuestionnaireHash: qHash }, false);
		} catch(e){ console.warn('[Step5] Failed to save likert answers', e); }
	}

	// Expose so external render / handlers can persist edits
	window.saveLikertAnswers = saveLikertAnswers;

	async function loadLikertAnswers(){
		try {
			const existing = await window.dataStorage.getData(STORAGE_KEY) || {};
			if (!Array.isArray(existing.likertAnswers)) return null;
			const currentHash = computeQuestionnaireHash();
			if (existing.likertAnswersQuestionnaireHash && existing.likertAnswersQuestionnaireHash !== currentHash) {
				window.step5QuestionnaireMismatch = true; // keep answers but mark mismatch
				console.info('[Step5] Questionnaire definition changed; keeping stored likert answers with warning.');
			}
			return existing.likertAnswers;	
		} catch(e){ console.warn('[Step5] Failed to load likert answers', e); return null; }
	}

	function computeQuestionnaireHash(){
		try {
			const items = (window.step5QuestionnaireItems||[]).map(i=>`${i.code}|${i.responseType||'likert'}`).sort().join('||');
			let hash = 0; for (let i=0;i<items.length;i++){ const c = items.charCodeAt(i); hash = ((hash<<5)-hash)+c; hash|=0; }
			return 'q'+hash;
		} catch(e){ return 'q0'; }
	}


	async function setup(){
        // todo warning if to many questionaire items. maybe break output
		const btn = document.getElementById('genPersonasBtn');
		const likertSimBtn = document.getElementById('likertSimBtn');
		// Create / locate cancel button for likert simulation
		let likertCancelBtn = document.getElementById('likertSimCancelBtn');
		let likertCancelOriginalParent = null;
		let likertCancelOriginalNext = null;
		if (!likertCancelBtn && likertSimBtn) {
			likertCancelBtn = document.createElement('button');
			likertCancelBtn.type = 'button';
			likertCancelBtn.id = 'likertSimCancelBtn';
			likertCancelBtn.className = 'btn btn-sm btn-outline-warning ms-2 d-none';
			likertCancelBtn.textContent = 'Stop Early';
			likertSimBtn.parentNode && likertSimBtn.parentNode.insertBefore(likertCancelBtn, likertSimBtn.nextSibling);
		}

		function positionLikertCancelButton(){
			if (!likertCancelBtn) return;
			const area = document.getElementById('areaone');
			if (!area) { // fallback: just ensure high z-index in current flow layout
				likertCancelBtn.style.zIndex = '99999';
				return;
			}
			// store original location for later restore once
			if (!likertCancelOriginalParent){
				likertCancelOriginalParent = likertCancelBtn.parentNode;
				likertCancelOriginalNext = likertCancelBtn.nextSibling;
			}
			const rect = area.getBoundingClientRect();
			Object.assign(likertCancelBtn.style, {
				position: 'fixed',
				left: (rect.right - 90) + 'px', // a bit inset from right edge
				top: (rect.top + 12) + 'px',
				zIndex: '99999',
				pointerEvents: 'auto'
			});
			document.body.appendChild(likertCancelBtn);
		}

		function restoreLikertCancelButton(){
			if (!likertCancelBtn) return;
			if (likertCancelOriginalParent){
				likertCancelBtn.removeAttribute('style');
				if (likertCancelOriginalNext){
					likertCancelOriginalParent.insertBefore(likertCancelBtn, likertCancelOriginalNext);
				} else {
					likertCancelOriginalParent.appendChild(likertCancelBtn);
				}
			}
		}
		const addon = document.getElementById('promptAddon');
		const out = document.getElementById('participantsDisplay');
		const numInput = document.getElementById('numPersonas');
		const appendCheckbox = document.getElementById('appendPersonasCheckbox');
		const likertSim = document.getElementById('likertSim')
		const minLikertScale = document.getElementById('minLikertScale')
		const maxLikertScale = document.getElementById('maxLikertScale')
		const numLikertRows = document.getElementById('numLikertRows');
		const appendLikertRowsWrapper = document.getElementById('appendLikertRowsWrapper');
		const appendLikertRowsCheckbox = document.getElementById('appendLikertRowsCheckbox');
		const maxIterations = 10;

		function enforceAppendEligibility(){
			const mismatch = !!window.step5QuestionnaireMismatch || !!document.getElementById('likertMismatchWarning');
			if (!appendLikertRowsWrapper || !appendLikertRowsCheckbox) return;
			if (mismatch){
				appendLikertRowsCheckbox.checked = false;
				appendLikertRowsCheckbox.disabled = true;
				appendLikertRowsWrapper.classList.add('opacity-50');
				appendLikertRowsWrapper.title = 'Disabled: questionnaire structure changed.';
			} else {
				appendLikertRowsCheckbox.disabled = false;
				appendLikertRowsWrapper.classList.remove('opacity-50');
				appendLikertRowsWrapper.title = '';
			}
		}
		window.addEventListener('step5:mismatchChanged', enforceAppendEligibility);

		await loadStoredPersonas();
		const storedLikert = await loadLikertAnswers();
		// Load existing prompt addon & likert scale if stored
		try {
			const existingAll = await window.dataStorage.getData(STORAGE_KEY) || {};
			if (existingAll.promptAddon && typeof existingAll.promptAddon === 'string') {
				addon.value = existingAll.promptAddon;
			}
			if (typeof existingAll.likertScaleMin === 'number') minLikertScale.value = existingAll.likertScaleMin;
			if (typeof existingAll.likertScaleMax === 'number') maxLikertScale.value = existingAll.likertScaleMax;
		} catch(e){ console.warn('[Step5] Failed to load stored prompt addon', e); }

		// If we already have personas, show them immediately
		if (personas.length){
			const lines = personas.map((p,i)=> `${i+1}. ${String(p)}`);
			out.classList.remove('d-none');
			likertSim.classList.remove('d-none');
			out.value = lines.join('\n');
		}

		// If we have stored likert answers, render table immediately
		if (storedLikert && storedLikert.length){
			try {
				renderLikertTable(storedLikert, true);
			} catch(e){ console.warn('[Step5] Failed to render stored likert answers', e); }
			// Show append option if no mismatch warning
			setTimeout(()=>{ if (!document.getElementById('likertMismatchWarning') && appendLikertRowsWrapper){ appendLikertRowsWrapper.classList.remove('d-none'); } }, 50);
		}
		if (window.step5QuestionnaireMismatch) {
			showQuestionnaireMismatchWarning();
			window.displayInfo && window.displayInfo('warning','Questionnaire changed since responses were saved. Review item alignment.');
		}
		enforceAppendEligibility();
	function showQuestionnaireMismatchWarning(){
		const host = document.getElementById('answersTable');
		if (!host) return;
		let warn = document.getElementById('likertMismatchWarning');
		if (!warn) {
			warn = document.createElement('div');
			warn.id = 'likertMismatchWarning';
			warn.className = 'alert alert-warning py-1 px-2 small mt-2';
			warn.style.width = 'fit-content';
			warn.innerHTML = '<strong>Warning:</strong> The questionnaire structure changed after these responses were stored. Item codes may be misaligned.';
			const container = host.parentNode && host.parentNode.parentNode ? host.parentNode.parentNode : host.parentNode || host;
			container.insertBefore(warn, container.firstChild);
		}
	}


		// Sanitize & clamp user input
		numInput.addEventListener('input', () => {
			let raw = numInput.value;
			raw = raw.replace(/\D+/g,'');
			if (!raw) { numInput.value = ''; return; }
			let v = parseInt(raw,10);
			if (isNaN(v)) { numInput.value=''; return; }
			if (v < 1) v = 1;
			if (v > 500) v = 500; // clamp to stated max
			numInput.value = v;
		});

		// Persist prompt addon (debounced)
		let promptSaveTimer = null;
		let scaleSaveTimer = null;
		async function savePromptAddon(val){
			try {
				const existing = await window.dataStorage.getData(STORAGE_KEY) || {};
				await window.dataStorage.storeData(STORAGE_KEY, { ...existing, promptAddon: val, promptAddonUpdatedAt: new Date().toISOString() }, false);
			} catch(e){ console.warn('[Step5] Failed to save prompt addon', e); }
		}
		addon.addEventListener('input', () => {
			const val = addon.value;
			clearTimeout(promptSaveTimer);
			promptSaveTimer = setTimeout(()=> savePromptAddon(val), 400);
		});
		addon.addEventListener('blur', () => {
			if (promptSaveTimer) { clearTimeout(promptSaveTimer); }
			savePromptAddon(addon.value);
		});

		async function saveScaleRange(){
			try {
				const existing = await window.dataStorage.getData(STORAGE_KEY) || {};
				await window.dataStorage.storeData(STORAGE_KEY, { ...existing, likertScaleMin: Number(minLikertScale.value), likertScaleMax: Number(maxLikertScale.value), likertScaleUpdatedAt: new Date().toISOString() }, false);
			} catch(e){ console.warn('[Step5] Failed to save likert scale range', e); }
		}
		[minLikertScale, maxLikertScale].forEach(inp => {
			inp.addEventListener('input', () => {
				clearTimeout(scaleSaveTimer);
				scaleSaveTimer = setTimeout(()=> saveScaleRange(), 300);
			});
			inp.addEventListener('blur', () => { clearTimeout(scaleSaveTimer); saveScaleRange(); });
		});

		btn.addEventListener('click', async () => {
			let iteration = 0;
            let currentPersonas = [];
			if (!appendCheckbox.checked){
                if (personas.length){
                    const confirmed = await window.customConfirm({
                        title: 'Start new?',
                        message: `This will delete ${personas.length} generated participants.`,
                        confirmText: 'Delete',
                        cancelText: 'Cancel'
                    });
                    if (!confirmed) return;
                }
                personas = []; // start fresh if not appending
            } 
			const targetCount = parseInt(numInput.value,10) || 1;
			const groupDescription = addon.value.trim();
			out.classList.remove('d-none');
			likertSim.classList.remove('d-none');

			try {
                showLoading()
				while (iteration < maxIterations && currentPersonas.length < targetCount) {
					const batch = await window.genPersonaPool({ generatedPersonas: currentPersonas, groupDescription });
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
                hideLoading()
                personas = personas.concat(currentPersonas)
                await savePersonas();
				const lines = personas.map((p,i)=> `${i+1}. ${String(p)}`);
				out.value = lines.join('\n');
			}
		});
		likertSimBtn.addEventListener('click', async () => {
			// If existing simulated data present, confirm before proceeding
			try {
				const existingCount = (window.answersTable && typeof window.answersTable.getData === 'function') ? window.answersTable.getData().length : 0;
				const appendMode = appendLikertRowsCheckbox && appendLikertRowsCheckbox.checked && !document.getElementById('likertMismatchWarning') && !window.step5QuestionnaireMismatch;
				if (existingCount > 0 && !window._likertSimRunning && !appendMode) {
					const proceed = await (window.customConfirm ? window.customConfirm({
						title: 'Simulated data exists',
						message: `There are already ${existingCount} simulated response rows. Run another simulation? (New simulation replaces table view but previously stored data will be updated.)`,
						confirmText: 'Simulate',
						cancelText: 'Cancel'
					}) : Promise.resolve(confirm('Existing simulated data detected. Run simulation again?')));
					if (!proceed) return;
				}
			} catch(e){ console.warn('[Step5] pre-sim confirm failed', e); }
			// Simulate Likert scale responses
			if (window._likertSimRunning) { return; }
			window._likertSimCancelled = false; // reset cancel flag
			window._likertSimRunning = true;
			// UI state adjustments
			likertSimBtn.disabled = true;
			if (likertCancelBtn){ likertCancelBtn.classList.remove('d-none'); likertCancelBtn.disabled = false; }
			// Position above overlay so it's always clickable
			positionLikertCancelButton();
			// Pre-build code map for simulation & incremental persistence
			const codeById = Object.fromEntries((window.step5QuestionnaireItems || []).map(it => [String(it.id), it.code]));
			const requestedRows = Math.max(1, Math.min(2000, parseInt(numLikertRows?.value,10) || personas.length || 1));
			const existingCount = (window.answersTable && typeof window.answersTable.getData === 'function') ? window.answersTable.getData().length : 0;
			const appendMode = appendLikertRowsCheckbox && appendLikertRowsCheckbox.checked && !appendLikertRowsCheckbox.disabled && !document.getElementById('likertMismatchWarning') && !window.step5QuestionnaireMismatch;
			const startOffset = appendMode ? (personas.length ? (existingCount % personas.length) : 0) : 0;
			// Capture existing rows (raw) before simulation for append persistence
			let existingRawRows = [];
			if (appendMode && window.answersTable && typeof window.answersTable.getData === 'function') {
				try { existingRawRows = window.answersTable.getData().map(r=>{ const { _idx, ...rest } = r; return rest; }); } catch(e){ existingRawRows=[]; }
			}
			const answers = await likertSimulation(minLikertScale.value,maxLikertScale.value, codeById, requestedRows, startOffset, existingRawRows, appendMode);
			// answers already ID-keyed; convert once more defensively
			const newData = (answers || []).map(row => { const conv={}; Object.entries(row).forEach(([id,val])=>{ const c=codeById[id]||id; conv[c]=val; }); return conv; });
			let tableData = newData;
			if (appendMode && window.answersTable){
				try { const oldData = window.answersTable.getData().map(r=>{ const { _idx, ...rest } = r; return rest; }); tableData = oldData.concat(newData); } catch(e){ console.warn('[Step5] append merge failed', e); }
			}

			// Build Tabulator columns dynamically from union of keys
			const allKeys = new Set();
			tableData.forEach(row => Object.keys(row).forEach(k => allKeys.add(k)));
			const columns = Array.from(allKeys).sort().map(k => ({ title: k, field: k, hozAlign: 'center' }));
			columns.unshift({ title: '#', field: '_idx', width: 50, frozen: true });
			const tabData = tableData.map((r,i)=>({_idx: i+1, ...r}));

			const targetDiv = document.getElementById('answersTable');
			targetDiv.classList.remove('d-none');
			targetDiv.innerHTML = '';

			if (window.answersTable) {
				try { window.answersTable.destroy(); } catch(e) { /* ignore */ }
			}
			if (window.Tabulator){
				renderLikertTable(tableData, false);
				saveLikertAnswers(tableData).catch(()=>{});
				// Persist chosen scale range for Step 6 auto-detection
				(async ()=>{ try { const existing = await window.dataStorage.getData(STORAGE_KEY)||{}; await window.dataStorage.storeData(STORAGE_KEY,{...existing, likertScaleMin: Number(minLikertScale.value), likertScaleMax: Number(maxLikertScale.value)}, false);} catch(e){ console.warn('[Step5] Failed to store likert scale range', e); } })();
			} else {
				targetDiv.textContent = 'Tabulator library not loaded.';
			}
			// Restore buttons state
			likertSimBtn.disabled = false;
			if (likertCancelBtn){ likertCancelBtn.classList.add('d-none'); }
			window._likertSimRunning = false;
			restoreLikertCancelButton();

		});

		// Attach cancel handler
		if (likertCancelBtn){
			likertCancelBtn.addEventListener('click', ()=>{
				if (!window._likertSimRunning) return;
				window._likertSimCancelled = true;
				likertCancelBtn.disabled = true;
				window.displayInfo && window.displayInfo('warning','Stopping early after current persona...');
			});
		}
	}

	if (document.readyState === 'loading') {
		document.addEventListener('DOMContentLoaded', setup);
	} else {
		setup();
	}
})();


async function likertSimulation(min=1,max=5, codeMap, requestedRows=0, startOffset=0, existingRowsBefore=[], appendMode=false) {
	if (min == max) { displayInfo("info",`Only one point scale selected: ${min}.`); return }
	if (min > max) { const tmp = max; max = min; min = tmp; }
	const generatedPersonas = personas || [];
	if (!generatedPersonas.length && (!requestedRows || requestedRows < 1)) { displayInfo('warning','No personas available to simulate.'); return []; }
	const likerRange = max - min + 1;
	const questionnaire = (window.step5QuestionnaireItems||[]).map(item => ({ id: item.id, text: item.text, responseType: item.responseType||'likert' }));
	const randomizedQuestionaire = shuffle(questionnaire);
	const simulationItems = randomizedQuestionaire.filter(q => q.responseType !== 'open').map(q=>({id:q.id,text:q.text}));
	const openItems = randomizedQuestionaire.filter(q => q.responseType === 'open').map(q=>({id:q.id,text:q.text}));
	const totalRows = requestedRows && requestedRows>0 ? requestedRows : generatedPersonas.length;
	const results = [];
	try {
		window.showLoading && window.showLoading();
		let rowCount=0; let personaIndex=startOffset||0;
		while (rowCount < totalRows) {
			const persona = generatedPersonas.length ? generatedPersonas[personaIndex % generatedPersonas.length] : `Participant ${personaIndex+1}`;
			if (window._likertSimCancelled) {
				displayInfo('warning', `Cancelled. Generated ${results.length}/${totalRows} so far.`);
				try {
					if (codeMap){
						const mappedNew = mapResultsToCodes(results, codeMap);
						const toStore = appendMode ? (existingRowsBefore.concat(mappedNew)) : mappedNew;
						await (window.saveLikertAnswers && window.saveLikertAnswers(toStore));
					}
				} catch(e){ console.warn('[Step5] Incremental save (cancel) failed', e); }
				break;
			}
			const messages = [
				{ role: 'system', content: 'You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers.' },
				{ role: 'system', content: `This is a persona: ${persona}. From now on, act fully in character.` }
			];
			const openItemsPrompt = openItems.length ? `Also, answer these open questions briefly in character: ${JSON.stringify(openItems)}.` : '';
			const prompt = `Answer each of the following statements: ${JSON.stringify(simulationItems)}.\nUse ONLY a ${likerRange}-point scale: ${min}=Very Inaccurate ... ${max}=Very Accurate.\n${openItemsPrompt}\nReturn JSON ONLY as {"ITEM-ID": answer, ...}`;
			const allAnswers = await window.sendChat(prompt, messages);
			const data = cleanAIRespond(allAnswers[0]);
			results.push(data);
			try {
				if (results.length === 1 || results.length % 3 === 0){
					if (codeMap){
						const mappedNew = mapResultsToCodes(results, codeMap); // all new rows so far (new only)
						const toStore = appendMode ? (existingRowsBefore.concat(mappedNew)) : mappedNew;
						await (window.saveLikertAnswers && window.saveLikertAnswers(toStore));
					}
				}
			} catch(e){ console.warn('[Step5] Incremental save failed', e); }
			if (!window._likertSimCancelled && (results.length === 1 || (results.length % 5 === 0 && results.length < totalRows))) {
					displayInfo('info', `Simulated ${results.length}/${totalRows} rows...`);
			}
			rowCount++; personaIndex++;
		}
		if (!window._likertSimCancelled) {
			displayInfo('success', `Simulated ${results.length} rows.`);
		}
	} catch(err) {
		console.error('Generate AI responses error', err);
		window.displayInfo && window.displayInfo('danger', 'Could not generate AI responses.');
	} finally {
		window.hideLoading && window.hideLoading();
		try {
			if (codeMap){
				const mappedNew = mapResultsToCodes(results, codeMap);
				const toStore = appendMode ? (existingRowsBefore.concat(mappedNew)) : mappedNew;
				await (window.saveLikertAnswers && window.saveLikertAnswers(toStore));
			}
		} catch(e){ console.warn('[Step5] Final save failed', e); }
	}
	return results;
}

function mapResultsToCodes(resultRows, codeMap){
	return (resultRows||[]).map(r=>{ const obj={}; Object.entries(r).forEach(([id,val])=>{ const c=codeMap[id]||id; obj[c]=val; }); return obj; });
}

// Reintroduced after relocation of button: exports stored likert answers to CSV
async function downloadLikertCsv(){
	try {
		const step5 = await window.dataStorage.getData('data_step_5')||{};
		const rows = step5.likertAnswers || [];
		if (!rows.length){ window.displayInfo && window.displayInfo('info','No likert answers to export.'); return; }
		const headerSet = new Set(); rows.forEach(r=> Object.keys(r||{}).forEach(k=> headerSet.add(k)));
		const header = Array.from(headerSet);
		const esc = v => { if (v==null) return ''; const s=String(v); return /[",\n]/.test(s)? '"'+s.replace(/"/g,'""')+'"': s; };
		const lines = [header.join(',')];
		rows.forEach(r=> lines.push(header.map(h=> esc(r[h])).join(',')));
		const csv = lines.join('\n');
		const blob = new Blob([csv+'\n'], { type:'text/csv;charset=utf-8;' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a'); a.href=url; a.download='likert_responses.csv'; document.body.appendChild(a); a.click();
		setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); },150);
		window.displayInfo && window.displayInfo('success','Likert table downloaded.');
	} catch(e){ console.warn('[Step5] download CSV failed', e); window.displayInfo && window.displayInfo('danger','Download failed'); }
}

// Shared renderer for Likert Tabulator ensuring consistent column min width
function renderLikertTable(rawRows, fromStorage){
	try {
		const targetDiv = document.getElementById('answersTable');
		if (!targetDiv) return;
		// Ensure download button wrapper exists just above the table container
		if (targetDiv.parentNode){
			let wrap = document.getElementById('likertDownloadWrapper');
			if (!wrap){
				wrap = document.createElement('div');
				wrap.id='likertDownloadWrapper';
				wrap.className='my-2';
				const btn = document.createElement('button');
				btn.type='button';
				btn.className='btn btn-sm btn-outline-secondary';
				btn.textContent='Download Likert Table (.csv)';
				btn.addEventListener('click', downloadLikertCsv);
				wrap.appendChild(btn);
				targetDiv.parentNode.insertBefore(wrap, targetDiv);
			}
		}
		// Lightweight local debounce fallback (non-interfering) if none present
		if (typeof window.debounce !== 'function') {
			window.debounce = function(fn, delay=300){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a), delay); }; };
		}
		const codeById = Object.fromEntries((window.step5QuestionnaireItems||[]).map(it=>[String(it.id), it.code]));
		// Detect if rows are code keyed already (non numeric keys)
		const sample = rawRows[0]||{};
		const looksCodeKeyed = Object.keys(sample).every(k => isNaN(Number(k)));
		let tableData = rawRows;
		if (!looksCodeKeyed){
			tableData = rawRows.map(row => {
				const conv = {}; for (const [id,val] of Object.entries(row)){ const c = codeById[id]||id; conv[c]=val; } return conv;
			});
		}
		const allKeys = new Set();
		tableData.forEach(r=>Object.keys(r).forEach(k=>allKeys.add(k)));
		const columns = Array.from(allKeys).sort().map(k=>({ title:k, field:k, hozAlign:'center' }));
		columns.unshift({ title:'#', field:'_idx', width:50, frozen:true });
		const tabData = tableData.map((r,i)=>({_idx:i+1, ...r}));
		targetDiv.classList.remove('d-none');
		targetDiv.innerHTML='';
		if (window.answersTable){ try { window.answersTable.destroy(); } catch(e){} }
		window.answersTable = new Tabulator(targetDiv, {
			data: tabData,
				columns: columns.map(col => {
					if (col.field === '_idx') return col; // index column not editable
					return { ...col, editor: 'input' };
				}),
			layout: 'fitData',
			reactiveData: true,
			resizableColumns: true,
			movableColumns: true,
			placeholder: 'No items available',
			columnDefaults: { minWidth: 70 },
			index: '_idx',
				cellEdited: debounce(async function(){
					try {
						// Reconstruct raw table data without the index column
						const current = window.answersTable.getData().map(r => {
							const { _idx, ...rest } = r; return rest; });
						await (window.saveLikertAnswers && window.saveLikertAnswers(current));
						window.displayInfo && window.displayInfo('success','Saved table edits');
					} catch(e){ console.warn('[Step5] Failed to persist edited likert answers', e); }
				}, 500)
		});
		// Force redraw to normalize column widths (addresses discrepancy after reload)
		setTimeout(()=>{ try { window.answersTable.redraw(true); } catch(e){} }, 0);
	} catch(e){ console.warn('[Step5] renderLikertTable failed', e); }
}



