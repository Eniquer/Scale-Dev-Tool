// Step 6 Data Handling: load simulated or uploaded data, manage reverse scoring

(function(){
  document.addEventListener('DOMContentLoaded', init);
  let rawData = []; // current working data (may be reversed)
  let reversedData = []; // last reversed version stored
  let originalData = []; // pristine original load (simulated or uploaded)
  let columns = []; // item codes
  let reverseSet = new Set();
  let source = 'simulated';
  let scaleMin = 1, scaleMax = 5;
  let viewMode = 'original'; // 'original' | 'reversed'
  let userAdjustedScale = false; // track if user manually changed scale inputs
  let persistedUserAdjusted = false; // persisted flag
   let lavaanEdited = ''; // user-edited lavaan syntax (persisted when saved)
   let lavaanOriginalSnapshot = ''; // last loaded auto-generated spec from Step 4
   let lavaanActiveView = 'original'; // 'original' | 'edited'
  let analyzeBtn = null; let cfaStatusEl = null; let cfaResultsEl = null;
  let aiReverseSuggestion = null; // persisted AI suggestion for reverse candidates

  async function init(){
    bindUI();
    await restorePersisted();
    // Only auto-load simulated if simulated source currently selected
    if (source === 'simulated' && !rawData.length) await loadSimulated();
    // Ensure correct UI visibility for upload block after restore
    switchSource(source);
  await initLavaanEditor();
    updateViewButtons();
    // Auto-set default EFA factor count to theorized subdimensions (if available) instead of 'auto'
    try {

      const step4 = await window.dataStorage.getData('data_step_4');
      const subs = Object.values(step4?.facetModes) || [];
      const distinct = Array.isArray(subs)? subs.filter(sd=> sd)?.length : 0;
      const efaInput = document.getElementById('efaNFactors');
      if(id('checkOnlyIncludeRef').checked){
        setEfaInput(true);
      }else{
        if (efaInput && (efaInput.value.trim().toLowerCase()==='auto' || !efaInput.value.trim()) && distinct>0){
          efaInput.value = String(distinct);
        }
      }
      async function setEfaInput(checked) {
        if (checked) {
          // Include only reflective columns
          const distinctRef = Array.isArray(subs)? subs.filter(sd=> sd === "reflective")?.length : 0;
          if (efaInput){
            efaInput.value = String(distinctRef);
          }
        } else {
          efaInput.value = String(distinct);
        }
      }
      id('checkOnlyIncludeRef').addEventListener('change', async (e) => {
        await setEfaInput(e.target.checked);
      });

    } catch(e){ /* silent */ }
  }

  function bindUI(){
    const srcSim = id('srcSimulated');
    const srcUp = id('srcUpload');
    srcSim?.addEventListener('change', ()=> switchSource('simulated'));
    srcUp?.addEventListener('change', ()=> switchSource('upload'));
  // Refresh simulated data WITHOUT resetting scale or reverse selections
  id('loadSimBtn')?.addEventListener('click', () => loadSimulated({ preserveReverse: true, preserveView: true, preserveScale: true }));
    // New reset button: full reset of step6 state with confirmation
    id('resetStep6Btn')?.addEventListener('click', async ()=>{
      if (!originalData.length){ setStatus('Nothing to reset.'); return; }
      const confirmed = await (window.customConfirm ? window.customConfirm({
        title: 'Reset Step 6',
        message: '<div class="text-start small">This will:<ul class="mb-2"><li>Clear reversed selections</li><li>Remove stored reversed dataset</li><li>Reset scale range to Step 5 (or infer)</li><li>Return view to original data</li><li>Reload simulated data (if using simulated source)</li></ul><strong>Continue?</strong></div>',
        confirmText: 'Reset All',
        cancelText: 'Cancel'
      }) : Promise.resolve(confirm('Reset Step 6 state?')));
      if (!confirmed) return;
      await resetAllState();
    });
    const fileInput = id('csvInput');
    fileInput?.addEventListener('change', ()=>{ id('loadCsvBtn').disabled = !fileInput.files?.length; });
    id('loadCsvBtn')?.addEventListener('click', async ()=>{ await loadCsv(fileInput.files[0]); });
  id('applyReverseBtn')?.addEventListener('click', applyReverse);
    id('selectAllReverseBtn')?.addEventListener('click', ()=>{ reverseSet = new Set(columns); renderColumns(); });
    id('clearReverseSelectionBtn')?.addEventListener('click', ()=>{ 
      reverseSet.clear(); 
      reversedData = []; // remove stored reversed dataset
      if (viewMode === 'reversed') {
        viewMode = 'original';
        rawData = clone(originalData);
        setStatus('Showing original data.');
      }
      renderColumns();
      renderTable();
      updateViewButtons();
      persistState();
    });
  // AI suggestion for reverse columns
  id('btnSuggestReverse')?.addEventListener('click', ()=>{ getReverseSuggestions(); });
  id('closeAiReverseCard')?.addEventListener('click', ()=>{ const card=id('aiReverseSuggestionCard'); card && card.classList.add('d-none'); });
  id('scaleMinInput')?.addEventListener('input', e=>{ scaleMin = parseNumber(e.target.value,1); userAdjustedScale = true; persistState(); });
  id('scaleMaxInput')?.addEventListener('input', e=>{ scaleMax = parseNumber(e.target.value,5); userAdjustedScale = true; persistState(); });
  id('showOriginalBtn')?.addEventListener('click', ()=>{ viewMode='original'; rawData = clone(originalData); setStatus('Showing original data.'); updateViewButtons(); renderTable(); });
  // todo always show reversed
  id('showReversedBtn')?.addEventListener('click', ()=>{ if (!reversedData.length){ setStatus('No reversed version stored yet.'); return; } viewMode='reversed'; rawData = clone(reversedData); setStatus('Showing reversed data.'); updateViewButtons(); renderTable(); });
    // Lavaan editor handlers
    const lavaTA = id('lavaanStep6Textarea');
    const saveBtn = id('btnSaveEditedLavaan');
  const deleteEditedBtn = id('btnDeleteEditedLavaan');
    lavaTA?.addEventListener('input', ()=>{
      if (!lavaTA) return;
      const dirty = lavaTA.value !== lavaanEdited;
      if (saveBtn) saveBtn.disabled = !dirty;
      const status = id('lavaanStep6Status');
      if (status) status.textContent = dirty ? 'Unsaved changes' : 'Saved';
    });
    saveBtn?.addEventListener('click', async ()=>{
      if (!lavaTA) return;
      lavaanEdited = lavaTA.value;
      lavaanActiveView = 'edited';
      await persistState();
      if (saveBtn) saveBtn.disabled = true;
      updateLavaanViewButtons();
      setLavaanStatus();
      window.displayInfo?.('success','Edited lavaan specification saved.');
    });
    deleteEditedBtn?.addEventListener('click', async ()=>{
      if (!lavaanEdited) return;
      const confirmDelete = await (window.customConfirm ? window.customConfirm({
        title:'Delete Edited Version',
        message:'This will remove your saved edited lavaan model and revert to the original. Continue?',
        confirmText:'Delete',
        cancelText:'Cancel'
      }) : Promise.resolve(confirm('Delete edited lavaan specification?')));
      if (!confirmDelete) return;
      lavaanEdited = '';
      lavaanActiveView = 'original';
      await persistState();
      applyLavaanView('original');
      updateLavaanViewButtons();
      setLavaanStatus();
      window.displayInfo?.('info','Edited lavaan specification deleted. Showing original.');
    });

    // Toggle view buttons
    id('btnShowOriginalLavaan')?.addEventListener('click', ()=>{ applyLavaanView('original'); });
    id('btnShowEditedLavaan')?.addEventListener('click', ()=>{ if (lavaanEdited) applyLavaanView('edited'); });

  // CFA analysis elements (may not exist if card removed)
  analyzeBtn = id('btnRunCFA');
  cfaStatusEl = id('cfaStatus');
  cfaResultsEl = id('cfaResults');
  analyzeBtn && analyzeBtn.addEventListener('click', runCFAAnalysis);

  // EFA elements
  const efaBtn = id('btnRunEFA');
  const efaStatus = id('efaStatus');
  const efaResults = id('efaResults');
  efaBtn && efaBtn.addEventListener('click', runEFA);
  }

  async function getReverseSuggestions(retry=0){
    const btn = id('btnSuggestReverse');
    const card = id('aiReverseSuggestionCard');
    const body = id('aiReverseSuggestionBody');
    if (!columns.length){ window.displayInfo?.('info','Load data first.'); return; }
    // Gather context from prior steps
    let constructName='', items=[], definitions=[];
    try {
      const step1 = await window.dataStorage.getData('data_step_1');
      const step2 = await window.dataStorage.getData('data_step_2');
      const step3 = await window.dataStorage.getData('data_step_3');
      const step4 = await window.dataStorage.getData('data_step_4');
      const step5 = await window.dataStorage.getData('data_step_5');

      constructName = step1?.panel1?.constructName || '';
      definition = step1?.panel2.savedDefinition || '';
      // Items might exist in step4 structure or items array
      const step5Items = step5?.questionnaireItems || [];
      items = Array.isArray(step5Items)? step5Items.map(it=>({ code: it.code || '' , text: it.text ||'' })) : [];
    } catch(e){}
    // Fallback: derive items from columns if missing texts
    const prompt = `You are an expert in survey methodology. Goal: identify which items are likely reverse-keyed (semantic polarity opposite) for a psychological/management construct.

Context:
Construct Name: ${constructName||'N/A'}
Construct Definition: ${definition||'N/A'}
Item Codes and Texts:
${items.map(it=>`- ${it.code}: ${it.text}`).join('\n')}

Instructions:
1. Provide an array reverseCandidates with item codes you strongly believe should be reverse-keyed.
2. Provide reasoning (≤15 words per item) in a map reasons.
3. Provide a short overall rationale (≤35 words).
4. If unsure, return empty arrays.

Output format (strict JSON):
{
  "reverseCandidates": ["ITEM_CODE", ...],
  "reasons": { "ITEM_CODE": "short reason", ... },
  "overallRationale": "text"
}`;
    btn && (btn.disabled = true);
    try {
      window.showLoading()
      const resp = await window.sendChat(prompt,[{"role":"system","content":"You are a JSON-only output assistant. Return only valid JSON in your response. No markdown, no commentary, no wrappers."}]);
      card && card.classList.remove('d-none');
      let raw = window.cleanAIRespond ? window.cleanAIRespond(resp[0]) : (resp[0]?.content || resp[0] || '');
      let parsed = null;
      try { parsed = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch(parseErr){
        if (retry < 2){ window.displayInfo?.('warning','Retrying AI reverse suggestion...'); return await getReverseSuggestions(retry+1); }
        throw parseErr;
      }
      if (!parsed || typeof parsed !== 'object'){ throw new Error('Empty AI response'); }
      const candidates = Array.isArray(parsed.reverseCandidates)? parsed.reverseCandidates.filter(c=> columns.includes(c)) : [];
      aiReverseSuggestion = { reverseCandidates: candidates, reasons: parsed.reasons||{}, overallRationale: parsed.overallRationale||'' };
      persistState();
      renderAiReverseSuggestion();
    } catch(err){
      if (retry<2){ 
        window.displayInfo?.('warning','Retrying AI reverse suggestion...');
        return await getReverseSuggestions(retry+1); } 
      console.error('AI reverse suggestion error', err);
      body && (body.innerHTML = `<span class='text-danger small'>Failed: ${escapeHtml(err.message||err)}</span>`);
      window.displayInfo?.('danger','Reverse suggestion failed.');
    } finally {
      btn && (btn.disabled = false);
      window.hideLoading()
    }
  }

  function renderAiReverseSuggestion(){
    const card = id('aiReverseSuggestionCard');
    const body = id('aiReverseSuggestionBody');
    if (!card || !body) return;
    if (!aiReverseSuggestion){ card.classList.add('d-none'); return; }
    const { reverseCandidates=[], reasons={}, overallRationale='' } = aiReverseSuggestion;
    const candidates = reverseCandidates.filter(c=> columns.includes(c));
    const htmlParts = [];
    htmlParts.push(`<div class="small mb-1"><strong>Suggested Reverse Items (${candidates.length})</strong></div>`);
    if (candidates.length){
      htmlParts.push(`<div class="mb-2 small">${candidates.map(c=>`<span class='badge bg-warning text-dark me-1'>${c}</span>`).join('')}</div>`);
    } else {
      htmlParts.push('<div class="text-muted small mb-2">No clear reverse candidates identified.</div>');
    }
    if (reasons && Object.keys(reasons).length){
      htmlParts.push('<div class="small"><strong>Reasons</strong></div>');
      htmlParts.push('<ul class="small mb-2 ps-3">'+ Object.entries(reasons).filter(([k])=> candidates.includes(k)).map(([k,v])=>`<li><code>${k}</code>: ${escapeHtml(String(v))}</li>`).join('') +'</ul>');
    }
    if (overallRationale){
      htmlParts.push(`<div class="small fst-italic text-muted">${escapeHtml(overallRationale)}</div>`);
    }
    htmlParts.push(`<div class="mt-2"><button type="button" class="btn btn-sm btn-outline-primary" id="applyAiReverseBtn">Apply Suggested</button></div>`);
    body.innerHTML = htmlParts.join('');
    card.classList.remove('d-none');
    setTimeout(()=>{ const applyBtn = id('applyAiReverseBtn'); applyBtn && applyBtn.addEventListener('click', ()=>{ reverseSet = new Set(candidates); renderColumns(); applyReverse(); window.displayInfo?.('success','Applied AI suggested reverse items.'); }); },0);
  }

  function switchSource(val){
    source = val;
    id('uploadBlock').classList.toggle('d-none', val!=='upload');
    id('loadSimBtn').disabled = (val!=='simulated');
  }

  async function loadSimulated(options = {}){
    // Backward compatibility if boolean passed
    let forceScaleReset = false;
    let preserveReverse = false;
    let preserveView = false;
    let preserveScale = false;
    if (typeof options === 'boolean') {
      forceScaleReset = options; // old signature means only scale reset request
    } else if (options && typeof options === 'object') {
      forceScaleReset = !!options.forceScaleReset;
      preserveReverse = !!options.preserveReverse;
      preserveView = !!options.preserveView;
      preserveScale = !!options.preserveScale;
    }
    try {
      const stored = await window.dataStorage.getData('data_step_5') || {};
      const likert = Array.isArray(stored.likertAnswers)? stored.likertAnswers : [];
      if (!likert.length){ setStatus('No simulated data found (Step 5).'); rawData=[]; columns=[]; renderColumns(); renderTable(); return; }
      // Auto-set (or reset) scale from Step5 stored range
      if (forceScaleReset || (!userAdjustedScale && !preserveScale)){
        let foundStored = false;
        if (typeof stored.likertScaleMin === 'number'){ scaleMin = stored.likertScaleMin; foundStored=true; }
        if (typeof stored.likertScaleMax === 'number'){ scaleMax = stored.likertScaleMax; foundStored=true; }
        if (!foundStored){
          try {
            const step4 = await window.dataStorage.getData('data_step_4') || {};
            if (typeof step4.scaleMin === 'number'){ scaleMin = step4.scaleMin; foundStored=true; }
            if (typeof step4.scaleMax === 'number'){ scaleMax = step4.scaleMax; foundStored=true; }
          } catch(e){ /* ignore */ }
        }
        if (!foundStored){ // infer from data
          const stats = inferScaleFromData(likert);
          if (stats){ scaleMin = stats.min; scaleMax = stats.max; }
        }
        const minEl = id('scaleMinInput'); const maxEl = id('scaleMaxInput');
        if (minEl) minEl.value = scaleMin; if (maxEl) maxEl.value = scaleMax;
        if (forceScaleReset){
          userAdjustedScale = false;
          persistedUserAdjusted = false;
        }
      }
      const prevReverseSet = new Set(reverseSet);
      const prevView = viewMode;
      originalData = likert.map(r=>({ ...r }));
      // If preserving reverse selections, keep set & recompute reversedData; else clear
      if (preserveReverse){
        reverseSet = prevReverseSet;
       if (forceOverwrite){
         lavaanEdited = auto; // working text resets to original
         const ta = id('lavaanStep6Textarea');
         if (ta) ta.value = auto;
         const status = id('lavaanStep6Status');
         if (status) status.textContent = 'Original';
         const saveBtn = id('btnSaveEditedLavaan');
         if (saveBtn) saveBtn.disabled = true;
       } else if (!lavaanEdited){
         lavaanEdited = auto;
         const ta = id('lavaanStep6Textarea');
         if (ta) ta.value = auto;
         const status = id('lavaanStep6Status');
         if (status) status.textContent = 'Original';
         const saveBtn = id('btnSaveEditedLavaan');
         if (saveBtn) saveBtn.disabled = true;
       }
      } else {
        rawData = clone(originalData);
        reverseSet = new Set();
        reversedData = [];
        viewMode = 'original';
      }
      columns = deriveColumns(rawData);
      if (preserveReverse){
        setStatus(`Refreshed simulated data (${rawData.length} rows). Reverse selections preserved${viewMode==='reversed' && reversedData.length? ' (viewing reversed)' : ''}.`);
      } else {
        setStatus(`Loaded ${rawData.length} simulated rows.`);
      }
      renderColumns();
      renderTable();
  updateViewButtons();
  persistState();
  id('resetStep6Btn') && (id('resetStep6Btn').disabled = false);
    } catch(e){ console.warn('[Step6] loadSimulated failed', e); setStatus('Failed to load simulated data.'); }
  }

  async function loadCsv(file){
    if (!file) return; setStatus('Parsing CSV...');
    try {
      const text = await file.text();
      const { header, rows } = parseCsv(text);
      columns = header.filter(h=>h!=='#');
  originalData = rows.map(r=>{ const obj={}; header.forEach((h,i)=>{ if (h==='#') return; const v = r[i]; obj[h]=v!==''? parseFloat(v): null; }); return obj; });
  rawData = clone(originalData);
      setStatus(`Loaded ${rawData.length} rows from CSV.`);
      renderColumns();
      renderTable();
  persistState();
  id('resetStep6Btn') && (id('resetStep6Btn').disabled = false);
    } catch(e){ console.warn('[Step6] loadCsv failed', e); setStatus('CSV parse failed.'); }
  }

  function deriveColumns(rows){
    const set = new Set();
    rows.forEach(r=> Object.keys(r).forEach(k=> set.add(k)) );
    return Array.from(set).filter(k=>k!=='_idx');
  }


  // todo get AI suggestion what to revert
  function renderColumns(){
    const host = id('columnsList');
    if (!host) return;
    if (!columns.length){ host.innerHTML = '<div class="text-muted">No data loaded.</div>'; return; }
    const html = columns.sort().map(c=>{
      const checked = reverseSet.has(c)? 'checked' : '';
      const reversedColumn = isColumnReversed(c);
      const cls = reversedColumn ? 'reversed-col' : '';
      const badge = reversedColumn ? ' <span class="badge bg-warning text-dark ms-1">R</span>' : '';
      return `<label class="d-inline-flex align-items-center me-3 mb-1 small ${cls}" style="white-space:nowrap;"><input type="checkbox" class="form-check-input me-1 rev-box" data-col="${c}" ${checked}>${c}${badge}</label>`; }).join('');
    host.innerHTML = html;
    host.querySelectorAll('.rev-box').forEach(cb=> cb.addEventListener('change', (e)=>{
      const col = e.target.getAttribute('data-col');
      if (e.target.checked) reverseSet.add(col); else reverseSet.delete(col);
      updateReverseButtons();
    }));
    updateReverseButtons();
  }

  function updateReverseButtons(){
    const any = reverseSet.size>0;
    const hasCols = columns.length>0;
    const applyBtn = id('applyReverseBtn');
    if (applyBtn){
      applyBtn.disabled = !hasCols; // keep enabled if there are columns, even if none selected (allows unreverse)
      applyBtn.textContent = any ? 'Apply / Update Reverse' : 'Apply (No Columns Reversed)';
    }
    id('clearReverseSelectionBtn').disabled = !any;
    id('selectAllReverseBtn').disabled = !hasCols;
  }

  function applyReverse(){
    const min = Number(scaleMin); const max = Number(scaleMax);
    const rangeValid = isFinite(min) && isFinite(max) && max>min;
    if (!rangeValid){ setStatus('Invalid scale range.'); return; }
    // Generate reversed dataset from ORIGINAL each time for idempotence
    if (!originalData.length){ setStatus('Original data not available.'); return; }
    if (reverseSet.size){
      const newReversed = originalData.map(r=>{ const o={...r}; reverseSet.forEach(col=>{ const val=o[col]; if (val==null||val==='') return; const num=Number(val); if (!isFinite(num)) return; o[col]=(min+max)-num; }); return o; });
      reversedData = newReversed;
      // Switch to reversed view automatically
      viewMode = 'reversed';
      rawData = clone(reversedData);
      setStatus(`Applied reverse scoring to ${reverseSet.size} column${reverseSet.size>1?'s':''}.`);
    } else {
      // Clearing reversal: drop reversedData and show original
      reversedData = [];
      viewMode = 'original';
      rawData = clone(originalData);
      setStatus('No columns selected. Showing original data.');
    }
    persistState();
    renderColumns();
    renderTable();
    updateViewButtons();
  }

  function renderTable(){
    const host = id('step6Table');
    if (!host) return;
    host.innerHTML='';
    if (!rawData.length){ host.innerHTML='<div class="text-muted small">No rows.</div>'; return; }
    const tableRows = rawData.map((r,i)=> ({ _idx: i+1, ...r }));
    const cols = ['_idx', ...columns].map(c=> ({
      title:c + (isColumnReversed(c)? ' *' : ''),
      field:c,
      hozAlign: 'center',
      frozen: c==='_idx',
      headerTooltip: isColumnReversed(c)? 'Reversed relative to original' : ''
    }));
    if (window.step6TableInstance){ try { window.step6TableInstance.destroy(); } catch(e){} }
    if (window.Tabulator){
      window.step6TableInstance = new Tabulator(host, {
        data: tableRows,
        columns: cols,
        layout: 'fitData',
        index: '_idx',
        pagination: tableRows.length>50? 'local': false,
        paginationSize: 50,
        columnDefaults: { minWidth: 70 }
      });
    } else {
      // simple fallback
      host.innerHTML = `<pre class="small" style="max-height:240px;overflow:auto;">${JSON.stringify(tableRows.slice(0,30),null,2)}${tableRows.length>30?'\n... (truncated)':''}</pre>`;
    }
  updateAnalyzeButton();
  }

  function setStatus(msg){
    const el = id('dataStatus');
    if (el) el.textContent = msg;
    // Auto classify message type
    let type = 'info';
    const lower = msg.toLowerCase();
    if (/(failed|error|invalid|not available)/i.test(msg)) type = 'error';
    else if (/^no /i.test(msg) || /nothing to reset/i.test(lower)) type = 'warning';
    else if (/(applied reverse|reset .* reloaded|reset\.|stored reversed|loaded \d+ rows|refreshed simulated data)/i.test(msg)) type = 'success';
    if (window.displayInfo) window.displayInfo(type, msg);
  }

  function isColumnReversed(col){
    if (!reversedData.length || !originalData.length) return false;
    // If column absent in either, not reversed
    if (!columns.includes(col)) return false;
    // Determine if any value differs (fast early exit)
    for (let i=0;i<Math.min(originalData.length, 30); i++){ // sample first 30 for speed
      const a = originalData[i]?.[col];
      const b = reversedData[i]?.[col];
      if (a!=null && b!=null && a!==b) return true;
    }
    return false;
  }

  async function persistState(){
    try {
    await window.dataStorage.storeData('data_step_6', {
        storedAt: new Date().toISOString(),
        columns,
        reverseColumns: Array.from(reverseSet),
        scaleMin, scaleMax,
        source,
        viewMode,
        originalData,
  reversedData,
  userAdjustedScale: userAdjustedScale || persistedUserAdjusted,
  lavaanEdited,
  aiReverseSuggestion
      }, false);
    } catch(e){ console.warn('[Step6] persistState failed', e); }
  }

  async function restorePersisted(){
    try {
      const stored = await window.dataStorage.getData('data_step_6');
      if (!stored) return;
  scaleMin = stored.scaleMin ?? scaleMin;
  scaleMax = stored.scaleMax ?? scaleMax;
  persistedUserAdjusted = !!stored.userAdjustedScale;
  userAdjustedScale = persistedUserAdjusted; // only mark as adjusted if user had changed previously
      source = stored.source || source;
      // Determine view mode: if reversed data exists prefer reversed unless stored explicitly says original
      if (stored.viewMode){
        viewMode = stored.viewMode;
      }
      reverseSet = new Set(stored.reverseColumns||[]);
      columns = stored.columns || [];
      originalData = Array.isArray(stored.originalData)? stored.originalData : [];
      reversedData = Array.isArray(stored.reversedData)? stored.reversedData : [];
      // If reversed data exists and current (stored) viewMode is original but user had reversed columns, switch to reversed by default
      if (reversedData.length && viewMode !== 'reversed'){
        viewMode = 'reversed';
      }
      rawData = clone(viewMode==='reversed' && reversedData.length? reversedData : originalData);
      id('scaleMinInput') && (id('scaleMinInput').value = scaleMin);
      id('scaleMaxInput') && (id('scaleMaxInput').value = scaleMax);
  // Restore edited model if previously saved
  if (stored.lavaanEdited) { lavaanEdited = stored.lavaanEdited; lavaanActiveView = 'edited'; }
      // Apply radio button states explicitly instead of click (ensures consistent UI)
      const rUpload = id('srcUpload');
      const rSim = id('srcSimulated');
      if (source === 'upload'){
        if (rUpload) rUpload.checked = true;
        if (rSim) rSim.checked = false;
        switchSource('upload');
      } else {
        if (rSim) rSim.checked = true;
        if (rUpload) rUpload.checked = false;
        switchSource('simulated');
      }
  renderColumns();
      renderTable();
      setStatus(`Restored prior session (${rawData.length} rows).`);
  if (stored.aiReverseSuggestion){ aiReverseSuggestion = stored.aiReverseSuggestion; renderAiReverseSuggestion(); }
    } catch(e){ console.warn('[Step6] restorePersisted failed', e); }
  updateAnalyzeButton();
  }

  function updateViewButtons(){
    const origBtn = id('showOriginalBtn');
    const revBtn = id('showReversedBtn');
    const label = id('viewModeLabel');
    const hasReversed = reversedData.length>0;
    // If no reversed available but viewMode still indicates reversed, revert to original
    if (!hasReversed && viewMode==='reversed'){
      viewMode='original';
      rawData = clone(originalData);
    }
    if (origBtn){
      const active = viewMode==='original';
      origBtn.classList.toggle('btn-primary', active);
      origBtn.classList.toggle('btn-outline-secondary', !active);
      origBtn.disabled = !originalData.length; // only disable if no data
    }
    if (revBtn){
      const active = viewMode==='reversed';
      revBtn.classList.toggle('btn-primary', active);
      revBtn.classList.toggle('btn-outline-secondary', !active);
      revBtn.disabled = !hasReversed; // disable if reversed unavailable
    }
    if (label){ label.textContent = `View: ${viewMode}${hasReversed? '' : ' (no reversed stored yet)'}`; }
    const resetBtn = id('resetStep6Btn');
    if (resetBtn){ resetBtn.disabled = !originalData.length; }
  }

  function clone(arr){ return (arr||[]).map(o=>({ ...o })); }

  function inferScaleFromData(rows){
    if (!Array.isArray(rows) || !rows.length) return null;
    let min=Infinity, max=-Infinity, count=0;
    rows.forEach(r=>{ Object.values(r).forEach(v=>{ const num = Number(v); if (isFinite(num)){ if (num<min) min=num; if (num>max) max=num; count++; } }); });
    if (!count) return null;
    // Only return if looks like small integer Likert range (1-7 etc.)
    if (Number.isInteger(min) && Number.isInteger(max) && max>min && (max-min) <= 10){ return { min, max }; }
    return null;
  }

  function parseCsv(text){
    const lines = text.split(/\r?\n/).filter(l=>l.trim().length);
    if (!lines.length) return { header: [], rows: [] };
    const header = splitCsvLine(lines[0]);
    const rows = lines.slice(1).map(l=> splitCsvLine(l));
    return { header, rows };
  }
  function splitCsvLine(line){
    const out=[]; let cur=''; let inQ=false; for (let i=0;i<line.length;i++){ const ch=line[i]; if (ch==='"'){ if (inQ && line[i+1]==='"'){ cur+='"'; i++; } else { inQ=!inQ; } } else if (ch===',' && !inQ){ out.push(cur); cur=''; } else { cur+=ch; } } out.push(cur); return out.map(s=>s.trim()); }

  function parseNumber(v, d){ const n=parseInt(v,10); return isFinite(n)? n : d; }
  function id(x){ return document.getElementById(x); }

  async function resetAllState(){
    // Clear persistent storage for step 6 then reload based on current source
    reverseSet = new Set();
    reversedData = [];
    viewMode = 'original';
    userAdjustedScale = false;
    persistedUserAdjusted = false;
    scaleMin = 1; scaleMax = 5; // provisional until re-derived
    try { await window.dataStorage.storeData('data_step_6', { clearedAt: new Date().toISOString() }, false); } catch(e){}
    if (source === 'simulated'){
      await loadSimulated({ forceScaleReset: true }); // force reset scale from step5 or infer
      setStatus('Step 6 reset and simulated data reloaded.');
    } else {
      columns = [];
      originalData = [];
      rawData = [];
      renderColumns();
      renderTable();
      updateViewButtons();
      const minEl = id('scaleMinInput'); const maxEl = id('scaleMaxInput');
      if (minEl) minEl.value = scaleMin; if (maxEl) maxEl.value = scaleMax;
      setStatus('Step 6 reset. Load new data to continue.');
    }
    persistState();
  }

  async function initLavaanEditor(){
    const ta = id('lavaanStep6Textarea');
    if (!ta) return;
    await loadLavaanFromStep4(true);
    // If we have an edited version persisted, show edited view; else original
    if (lavaanEdited){
      applyLavaanView('edited');
    } else {
      applyLavaanView('original');
    }
    updateLavaanViewButtons();
    setLavaanStatus();
    updateAnalyzeButton();
  }

  async function loadLavaanFromStep4(forceOverwrite){
    try {
      const step4 = await window.dataStorage.getData('data_step_4') || {};
      const auto = (step4.lavaanSpec && step4.lavaanSpec.syntax) ? step4.lavaanSpec.syntax : '# No lavaan spec found in Step 4.';
      lavaanOriginalSnapshot = auto;
      if (forceOverwrite){
        // Refresh only the original snapshot, keep edited separate
        const activeWasOriginal = lavaanActiveView === 'original';
        if (activeWasOriginal){ applyLavaanView('original', auto); }
      } else if (!lavaanOriginalSnapshot){
        applyLavaanView('original', auto);
      }
    } catch(e){
      console.warn('[Step6] loadLavaanFromStep4 failed', e);
      const ta = id('lavaanStep6Textarea');
      if (ta && !lavaanEdited) ta.value = '# Failed loading lavaan spec.';
    }
    updateAnalyzeButton();
  }

  function applyLavaanView(mode, overrideOriginalText){
    const ta = id('lavaanStep6Textarea');
    if (!ta) return;
    if (mode === 'original'){
      lavaanActiveView = 'original';
      const text = overrideOriginalText != null ? overrideOriginalText : lavaanOriginalSnapshot;
      if (text != null) ta.value = text;
      id('btnSaveEditedLavaan') && (id('btnSaveEditedLavaan').disabled = true);
    } else if (mode === 'edited'){
      lavaanActiveView = 'edited';
      ta.value = lavaanEdited || lavaanOriginalSnapshot;
      // Enable save only when textarea diverges (handled by input listener)
    }
    updateLavaanViewButtons();
    setLavaanStatus();
  updateAnalyzeButton();
  }

  function updateLavaanViewButtons(){
    const origBtn = id('btnShowOriginalLavaan');
    const editBtn = id('btnShowEditedLavaan');
    const deleteBtn = id('btnDeleteEditedLavaan');
    const hasEdited = !!lavaanEdited;
    if (origBtn){
      origBtn.classList.toggle('btn-primary', lavaanActiveView==='original');
      origBtn.classList.toggle('btn-outline-secondary', lavaanActiveView!=='original');
    }
    if (editBtn){
      editBtn.disabled = !hasEdited;
      editBtn.classList.toggle('btn-primary', lavaanActiveView==='edited');
      editBtn.classList.toggle('btn-outline-secondary', lavaanActiveView!=='edited');
    }
    if (deleteBtn){
      deleteBtn.disabled = !hasEdited;
    }
  }

  function setLavaanStatus(){
    const status = id('lavaanStep6Status');
    if (!status) return;
    if (lavaanActiveView === 'original'){
      status.textContent = 'Viewing Original';
    } else {
      status.textContent = lavaanEdited ? 'Viewing Edited (saved)' : 'Edited (unsaved)';
    }
  }

  function updateAnalyzeButton(){
    if (!analyzeBtn) return;
    const hasData = Array.isArray(rawData) && rawData.length>0;
  const activeModel = (lavaanActiveView==='edited' ? lavaanEdited : lavaanOriginalSnapshot) || '';
  const modelText = activeModel.trim();
    analyzeBtn.disabled = !(hasData && modelText);
    if (cfaStatusEl){
      if (analyzeBtn.disabled){
        cfaStatusEl.textContent = hasData ? 'Provide model syntax.' : 'Load data first.';
      } else {
        cfaStatusEl.textContent = 'Ready';
      }
    }
  // EFA enable
  const efaBtn = id('btnRunEFA');
  if (efaBtn) efaBtn.disabled = !hasData;
  }

  async function runCFAAnalysis(){
    if (!analyzeBtn || analyzeBtn.disabled) return;
  const activeModel = (lavaanActiveView==='edited' ? lavaanEdited : lavaanOriginalSnapshot) || '';
  const modelText = activeModel.trim();
    if (!modelText){ return; }
    analyzeBtn.disabled = true;
    if (cfaStatusEl) cfaStatusEl.textContent = 'Running…';
    if (cfaResultsEl) cfaResultsEl.innerHTML = '<span class="text-muted">Submitting to backend…</span>';
    try {
      // Use current view (rawData) so user sees exactly what is analyzed
      const payload = { data: rawData, model: modelText };
      const res = await fetch('/api/r/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json().catch(()=>({ status:'client_parse_error'}));
      if (!res.ok){
        throw new Error(json.detail || `HTTP ${res.status}`);
      }
      renderCFAResults(json);
      if (cfaStatusEl) cfaStatusEl.textContent = 'Done';
    } catch(err){
      if (cfaResultsEl) cfaResultsEl.innerHTML = `<span class="text-danger">Error: ${escapeHtml(err.message||err)}</span>`;
      if (cfaStatusEl) cfaStatusEl.textContent = 'Error';
    } finally {
      analyzeBtn.disabled = false;
    }
  }



  async function runEFA(){
    const btn = id('btnRunEFA');
    const statusEl = id('efaStatus');
    const outEl = id('efaResults');
    if (!btn || btn.disabled) return;
    if (!Array.isArray(rawData) || !rawData.length){ return; }
    let inputData = [...rawData]; // shallow copy to avoid mutation

    const onlyIncludeRef = id("checkOnlyIncludeRef");

    if (onlyIncludeRef && onlyIncludeRef.checked){
      const step4 = await dataStorage.getData("data_step_4")
      const reflectiveItems = step4.indicators.filter(i=>i.direction=="out").map(i=>i.itemId)
      const refWithoutGlobals = reflectiveItems.map(i=>step4.itemCustomIds[i]).filter(i=>i!=undefined) 

      let colToDel = []
      if(inputData.length>0){
        colToDel = Object.keys(inputData[0]).filter(col => !refWithoutGlobals.includes(col))
      }

      console.log("columns removed, because not reflective:", colToDel);

      const delFrom = (arr,col) => {
        if (!Array.isArray(arr)) return;
        for (const row of arr){
          if (row && Object.prototype.hasOwnProperty.call(row,col)){
            delete row[col];
          }
        }
      };

      if(colToDel.length>0){
        colToDel.forEach(col => {
          delFrom(inputData,col);
        });
      }

    }

    const nFactorsVal = (id('efaNFactors')?.value || 'auto').trim() || 'auto';
    const rotation = (id('efaRotation')?.value || 'oblimin');
    btn.disabled = true;
    statusEl && (statusEl.textContent = 'Running…');
    outEl && (outEl.innerHTML = '<span class="text-muted">Submitting...</span>');
    try {
      const res = await fetch('/api/r/efa', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ data: inputData, n_factors: nFactorsVal, rotation })
      });
      const json = await res.json().catch(()=>({status:'client_parse_error'}));
      if (!res.ok){ throw new Error(json.detail || ('HTTP '+res.status)); }
      renderEFAResults(json);
      statusEl && (statusEl.textContent = 'Done');
    } catch(err){
      outEl && (outEl.innerHTML = `<span class='text-danger'>Error: ${escapeHtml(err.message||err)}</span>`);
      statusEl && (statusEl.textContent = 'Error');
    } finally {
      btn.disabled = false;
    }
  }

  function renderEFAResults(resp){
    const outEl = id('efaResults');
    if (!outEl) return;
    const out = resp.output || {};
    const efa = out.efa || {};
    if (!efa.n_factors_selected){ outEl.innerHTML = '<span class="text-muted">No EFA output.</span>'; return; }
    const lines = [];
    lines.push(`Selected factors: ${efa.n_factors_selected}`);
    if (Array.isArray(efa.eigenvalues)){
      lines.push('Eigenvalues: '+ efa.eigenvalues.map(v=>Number(v).toFixed(3)).join(', '));
    }
    const variance = efa.variance || [];
    if (Array.isArray(variance) && variance.length){
      lines.push('\nVariance Explained:');
      variance.forEach(v=>{ lines.push(`  ${v.factor}: SS=${numFmt(v.SS_loadings)} prop=${numFmt(v.Proportion)} cum=${numFmt(v.Cumulative)}`); });
    }
  // (Removed previous per-item list of loadings to avoid duplication; matrix shown below.)
    const Phi = efa.factor_correlation;
    if (Phi && typeof Phi === 'object'){
      const keys = Object.keys(Phi);
      if (keys.length){
        lines.push('\nFactor Correlations:');
        keys.forEach(rn=>{
          const row = Phi[rn];
            if (row && typeof row === 'object'){
              lines.push('  '+rn+': '+ Object.entries(row).map(([k,v])=> `${k}=${numFmt(v)}`).join(' '));
            }
        });
      }
    }

    // Matrix style like print(efa_result$loadings, cutoff=0.3)
    const lm = efa.loadings_matrix || [];
    if (Array.isArray(lm) && lm.length){
      const cutoff = 0.30;
      // Sort items alphabetically (case-insensitive) before formatting
      const sortedLm = [...lm].sort((a,b)=> (a.item||'').localeCompare(b.item||'', undefined, {sensitivity:'base'}));
      const factorNames = Object.keys(sortedLm[0]).filter(k=> k !== 'item');
      if (factorNames.length){
        const widths = { item: Math.max(4, ...sortedLm.map(r=> (r.item||'').length)) };
        factorNames.forEach(fn=> widths[fn] = Math.max(fn.length, 5));
        const formattedRows = sortedLm.map(r=>{
          const row = { item: r.item };
          factorNames.forEach(fn=>{
            const val = r[fn];
            if (val==null || val===''){ row[fn]=''; return; }
            const num = Number(val);
            if (!isFinite(num) || Math.abs(num) < cutoff){ row[fn]=''; return; }
            const txt = num.toFixed(2);
            row[fn] = txt;
            widths[fn] = Math.max(widths[fn], txt.length);
          });
          widths.item = Math.max(widths.item, (r.item||'').length);
          return row;
        });
        const pad = (s,w)=>{ s = s==null? '' : String(s); return s.length>=w? s : s + ' '.repeat(w-s.length); };
        lines.push('\nLoadings Matrix (cutoff=0.30):');
        const header = [pad('', widths.item)];
        factorNames.forEach(fn=> header.push(pad(fn, widths[fn])));
        lines.push('  '+header.join('  '));
        formattedRows.forEach(r=>{
          const rowPieces = [pad(r.item, widths.item)];
            factorNames.forEach(fn=> rowPieces.push(pad(r[fn], widths[fn])));
            lines.push('  '+rowPieces.join('  '));
        });
      }
    }
    outEl.textContent = lines.join('\n');
  }

  function numFmt(v){ if (v==null||v==='') return 'NA'; const n=Number(v); return isFinite(n)? (Math.abs(n)<1e-4||Math.abs(n)>=1e4? n.toExponential(2): n.toFixed(3)) : String(v); }

  function renderCFAResults(resp){
    if (!cfaResultsEl){ return; }
    const out = resp.output || {};
    if (resp.status && resp.status !== 'ok' && !out.fit_measures){
      cfaResultsEl.innerHTML = `<span class="text-danger">R Error (status=${resp.status}): ${escapeHtml(resp.stderr || resp.error || 'Unknown')}</span>`;
      return;
    }
    const fm = out.fit_measures || {};
    const loadings = out.loadings || [];
    let lines = [];
    if (Object.keys(fm).length){
      lines.push('Fit Measures:');
      Object.entries(fm).forEach(([k,v])=>{ lines.push(`  ${k}: ${formatNum(v)}`); });
      lines.push('');
    } else {
      lines.push('No fit measures returned.');
    }
    if (loadings.length){
      lines.push('Loadings: latent -> indicator (est | std)');
      loadings.forEach(l=>{
        lines.push(`  ${l.latent} -> ${l.indicator} (${formatNum(l.estimate)} | ${formatNum(l.std_all)})`);
      });
    } else {
      lines.push('No loadings returned.');
    }
    if (out.error){
      lines.push('\nCFA Error: ' + out.error);
    }
    cfaResultsEl.textContent = lines.join('\n');
  }

  function formatNum(v){
    if (v==null || v==='') return 'NA';
    if (typeof v !== 'number') return String(v).substring(0,20);
    if (!isFinite(v)) return String(v);
    return (Math.abs(v) < 0.0001 || Math.abs(v) >= 10000) ? v.toExponential(2) : v.toFixed(4);
  }

  function escapeHtml(str){
    return String(str).replace(/[&<>'"]/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','\'':'&#39;','"':'&quot;' }[c]));
  }
})();


// todo make R results persistent

  // todo check how to handle disabled items in R

function removeColumn(col){
  if (!col) return;
  if (!columns.includes(col)) return;
  // Remove from column list
  columns = columns.filter(c=> c !== col);
  // Remove from reverse selection
  if (reverseSet.has(col)) reverseSet.delete(col);
  // Delete from all data copies
  const delFrom = arr => {
  if (!Array.isArray(arr)) return;
    for (const row of arr){
      if (row && Object.prototype.hasOwnProperty.call(row,col)){
        delete row[col];
      }
    }
  };
  delFrom(originalData);
  delFrom(reversedData);
  delFrom(rawData);
  // Re-render UI
  renderColumns();
  renderTable();
  updateViewButtons();
  persistState();
  setStatus(`Removed column ${col}.`);
}