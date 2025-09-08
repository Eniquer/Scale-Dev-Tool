// Step 6 Data Handling: load simulated or uploaded data, manage reverse scoring

(function(){
  document.addEventListener('DOMContentLoaded', init);
  let rawData = []; // current working data (may be reversed)
  let reversedData = []; // last reversed version stored
  let originalData = []; // pristine original load (simulated or uploaded)
  let columns = []; // item codes
  // Persisted analysis outputs (EFA and CFA/SEM)
  let lastEFAResult = null;   // raw JSON result from /api/r/efa
  let lastCFAResult = null;   // raw JSON result from /api/r/cfa
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
  // Ensure result containers have at least empty placeholders so outdated banners can attach even before first run
  if (cfaResultsEl && !cfaResultsEl.innerHTML.trim()) cfaResultsEl.innerHTML = '<div class="text-muted small">No CFA run yet.</div>';
  const efaResultsEl = id('efaResults');
  if (efaResultsEl && !efaResultsEl.innerHTML.trim()) efaResultsEl.innerHTML = '<div class="text-muted small">No EFA run yet.</div>';
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
    // CSV template download
    id('downloadTemplateBtn')?.addEventListener('click', async ()=>{
      try {
        let headerCols = [...columns];
        if (!headerCols.length){
          try {
            const step5 = await window.dataStorage.getData('data_step_5') || {};
            const qItems = Array.isArray(step5.questionnaireItems)? step5.questionnaireItems : [];
            headerCols = qItems.map(it=> it.code || it.id).filter(Boolean);
          } catch(e){}
        }
        if (!headerCols.length){ headerCols = ['ITEM1','ITEM2','ITEM3']; }
        const minLik = Number(scaleMin)||1; const maxLik = Number(scaleMax)||5;
        const midVal = Math.round((minLik + maxLik)/2) || 3;
        const clamp = v=> Math.min(maxLik, Math.max(minLik, v));
        const row1 = headerCols.map(()=> midVal);
        const row2 = headerCols.map((_,i)=> clamp(midVal + (i%2? 1 : -1)));
        const csvLines = [headerCols.join(','), row1.join(','), row2.join(',')];
        const blob = new Blob([csvLines.join('\n')+'\n'], { type:'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const ts = new Date().toISOString().replace(/[:T]/g,'-').slice(0,16);
        a.download = `scale_template_${ts}.csv`;
        document.body.appendChild(a);
        a.click();
        setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 120);
        window.displayInfo?.('success','Template downloaded.');
      } catch(err){
        console.warn('Template download failed', err);
        window.displayInfo?.('danger','Template download failed.');
      }
    });
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
  // Preserve existing lavaanEdited as-is; no force overwrite logic defined here.
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
      aiReverseSuggestion,
      lastEFAResult,
      lastCFAResult
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
      // Restore prior EFA / CFA results if any
      if (stored.lastEFAResult){
        lastEFAResult = stored.lastEFAResult;
        setTimeout(()=>{ try { renderEFAResults(lastEFAResult); } catch(e){} },0);
      }
      if (stored.lastCFAResult){
        lastCFAResult = stored.lastCFAResult;
        setTimeout(()=>{ try { renderCFAResults(lastCFAResult); } catch(e){} },0);
      }
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
  updateOutdatedNotices();
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

  // ---- Outdated detection helpers ----
  function computeDataSignature(data, cols){
    try {
      const maxRows = 30;
      const subset = (data||[]).slice(0,maxRows).map(r=>{
        const o={}; (cols||Object.keys(r||{})).forEach(c=>{ o[c]=r[c]; }); return o;
      });
      const json = JSON.stringify({ rows:(data||[]).length, cols:[...(cols||[])], sample: subset });
      let h=0; for (let i=0;i<json.length;i++){ h = (h*31 + json.charCodeAt(i)) >>> 0; }
      return h.toString(16);
    } catch(e){ return 'na'; }
  }

  function updateOutdatedNotices(){
    // EFA
    const efaOut = id('efaResults');
    if (efaOut){
      let note = efaOut.previousElementSibling && efaOut.previousElementSibling.id==='efaOutdatedNotice' ? efaOut.previousElementSibling : null;
      const currentNF = (id('efaNFactors')?.value||'').trim()||'auto';
      const currentRot = (id('efaRotation')?.value||'oblimin');
      const currentSig = computeDataSignature(rawData, columns);
      let outdated=false;
  if (lastEFAResult && lastEFAResult._meta){
        const m = lastEFAResult._meta;
        outdated = (m.nFactorsValUsed !== currentNF) || (m.rotationUsed !== currentRot) || (m.dataSig !== currentSig);
      }
      if (outdated){
        if (!note){
          note = document.createElement('div');
          note.id='efaOutdatedNotice';
          note.className='alert alert-warning py-1 px-2 small mb-1';
          note.innerHTML='EFA results may be outdated (data or parameters changed). Re-run EFA.';
          efaOut.parentNode.insertBefore(note, efaOut);
        }
      } else if (note){ note.remove(); }
    }
    // CFA
    if (cfaResultsEl){
      let banner = cfaResultsEl.previousElementSibling && cfaResultsEl.previousElementSibling.id==='cfaOutdatedNotice' ? cfaResultsEl.previousElementSibling : null;
      let outdated=false;
  if (lastCFAResult && lastCFAResult._meta){
        const meta = lastCFAResult._meta;
        const currentModel = (lavaanActiveView==='edited'? lavaanEdited : lavaanOriginalSnapshot) || '';
        const currentSig = computeDataSignature(rawData, columns);
        outdated = (meta.modelTextUsed !== currentModel) || (meta.dataSig !== currentSig);
      }
      if (outdated){
        if (!banner){
          banner = document.createElement('div');
          banner.id='cfaOutdatedNotice';
          banner.className='alert alert-warning py-1 px-2 small mb-1';
          banner.innerHTML='Results may be outdated (data or model changed). Re-run analysis.';
          cfaResultsEl.parentNode.insertBefore(banner, cfaResultsEl);
        }
      } else if (banner){ banner.remove(); }
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

  // Ensure model textarea edits flag outdated CFA without needing to save
  (function(){
    const ta = document.getElementById('lavaanStep6Textarea');
    if (ta){
      ta.addEventListener('input', ()=>{ // only mark outdated if differs from last used model
        updateOutdatedNotices();
      });
    }
  })();

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
      try {
        const dataSig = computeDataSignature(rawData, columns);
        json._meta = { dataSig, modelTextUsed: modelText, storedAt: Date.now() };
      } catch(e) { /* ignore */ }
      lastCFAResult = json;
      persistState();
      updateOutdatedNotices();
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
      try {
        const dataSig = computeDataSignature(rawData, Object.keys(inputData[0]||{}));
        json._meta = { dataSig, nFactorsValUsed: nFactorsVal, rotationUsed: rotation, storedAt: Date.now() };
      } catch(e){ /* ignore */ }
      lastEFAResult = json;
      persistState();
      updateOutdatedNotices();
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
  updateOutdatedNotices();
  }

  function numFmt(v){ if (v==null||v==='') return 'NA'; const n=Number(v); return isFinite(n)? (Math.abs(n)<1e-4||Math.abs(n)>=1e4? n.toExponential(2): n.toFixed(3)) : String(v); }

  function renderCFAResults(resp){
    if (!cfaResultsEl){ return; }
    const out = resp.output || {};
    if (resp.status && resp.status !== 'ok' && !out.fit_measures){
      cfaResultsEl.innerHTML = `<span class="text-danger">R Error (status=${resp.status}): ${escapeHtml(resp.stderr || resp.error || 'Unknown')}</span>`;
      return;
    }
    // Switch to rich HTML mode
  cfaResultsEl.classList.add('cfa-rich','fs-6');

    const step6 = out.step6 || {};
    const fm = out.fit_measures || {};
    const loadings = out.loadings || [];
    const reflConstructs = step6.reflective_constructs || [];
    const reflAlpha = (step6.reliability && step6.reliability.reflective_alpha) || [];
    const reflAlphaMap = Object.fromEntries(reflAlpha.map(r=> [r.factor, r]));
    const reflItems = step6.reflective_items || [];
    const formBlocks = step6.formative_first_order || [];
    const formWeights = step6.formative_weights || [];
    const formVifDetail = step6.formative_vif_detail || [];
    const soReflect = step6.second_order_reflective || [];
    const soReflectLoad = step6.second_order_reflective_loadings || [];
    const soForm = step6.second_order_formative || [];
    const soFormWeights = step6.second_order_formative_weights || [];
    const soFormVifDetail = step6.second_order_formative_vif_detail || [];
    const soFormUniqueR2 = step6.second_order_formative_unique_R2 || [];
    const flags = step6.flags || {};
  // New discriminant validity structure: fornell_larcker is a matrix (rows with 'construct' + construct columns)
  const flMatrix = step6.discriminant_validity && step6.discriminant_validity.fornell_larcker;
  const htmtMatrix = step6.discriminant_validity && step6.discriminant_validity.htmt;

    // Threshold helpers
    const badge = (txt, cls) => `<span class="badge ${cls} ms-1">${escapeHtml(txt)}</span>`;
    const fmt = v => formatNum(v);
    const classifyFit = () => {
      const cfi = fm.cfi, tli = fm.tli, rmsea = fm.rmsea, srmr = fm.srmr;
      if ([cfi,tli,rmsea,srmr].some(v=> v==null)) return 'Incomplete';
      if (cfi>=.95 && tli>=.95 && rmsea<=.06 && srmr<=.08) return 'Good';
      if (cfi>=.90 || tli>=.90 || rmsea<=.08 || srmr<=.10) return 'Acceptable';
      return 'Poor';
    };
    const fitClass = classifyFit();
    const fitBadge = fitClass === 'Good'? badge('Good fit','bg-success') : fitClass==='Acceptable'? badge('Acceptable','bg-info') : badge('Poor fit','bg-danger');

    const metricTooltipMap = {
      'CFI':'Comparative Fit Index – incremental fit vs independence (≥ .95 good, ≥ .90 acceptable)',
      'TLI':'Tucker–Lewis Index – non‑normed fit penalizing complexity (≥ .95 good, ≥ .90 acceptable)',
      'RMSEA':'Approximation error per df (≤ .06 good, ≤ .08 acceptable)',
      'SRMR':'Average standardized residual (≤ .08 good, ≤ .10 acceptable)',
      'Chi-Square (p)':'Overall model χ² test p-value (sensitive to N; > .05 often desired)',
      'AVE':'Average Variance Extracted – convergent validity (≥ .50)',
      'CR':'Composite Reliability – internal consistency (≥ .70)',
      'CR_2nd':'Composite Reliability (2nd-order latent, ≥ .70)',
      'Alpha':'Cronbach’s Alpha (≥ .70)',
      'Alpha (std)':'Cronbach’s Alpha standardized (≥ .70)',
      'Alpha (raw)':'Cronbach’s Alpha raw (≥ .70)',
      'R²ₐ':'Average indicator variance explained (formative redundancy proxy)',
      'Max VIF':'Maximum collinearity ( <3 ideal, <10 tolerable )',
      'VIF':'Variance Inflation Factor ( <3 ideal, <10 tolerable )',
      'Min λ':'Lowest standardized loading (want ≥ .50)',
      'Est':'Unstandardized estimate',
      'Std':'Standardized loading/weight (≥ .50 reflective)',
      'Std weight':'Standardized formative weight',
      'λ²':'Squared loading (indicator reliability, ≥ .50)',
      'z':'Wald z (>|1.96| for p<.05)',
      'p':'Two-tailed p-value',
      'MI':'Modification Index (expected χ² drop if freed; >3.84 notable, >10 strong)',
      'Unique R²':'Relative importance (lmg unique contribution)',
      '#Ind':'Number of indicators',
      '#Items':'Number of items',
      '#Subdims':'Number of first-order subdimensions',
      '#Subs':'Number of subdimensions'
    };

    function table(cols, rows, emptyMsg){
      rows = Array.isArray(rows)? rows : [];
      if (!rows.length) return `<div class="text-muted">${emptyMsg||'(none)'}\n</div>`;
      const labelRow = '<tr>'+ cols.map(c=> {
        const labelKey = c.label || c.key;
        let ttTxt = '';
        if (c.tooltip){
          ttTxt = c.tooltip;
        } else {
          const base = metricTooltipMap[labelKey] || metricTooltipMap[c.key];
          if (base){ ttTxt = base; }
          if (!ttTxt && c.desc){
            const raw = String(c.desc).trim();
            const hasThresh = /[≥≤<>]|\d/.test(raw);
            if (!hasThresh && raw === labelKey){
              // Special case: Fornell–Larcker / HTMT facet columns where desc repeats label
              ttTxt = `Facet: ${labelKey}`;
            } else {
              ttTxt = hasThresh ? `${labelKey} threshold ${raw}` : `${labelKey} ${raw}`;
            }
          }
        }
        const spanAttr = ttTxt? ` data-bs-toggle="tooltip" data-bs-placement="top" title="${escapeHtml(ttTxt)}"` : '';
        return `<th class="text-nowrap"><span class="metric-label"${spanAttr}>${escapeHtml(c.label)}</span></th>`;
      }).join('') + '</tr>';
      const head = `<thead>${labelRow}</thead>`;
      const body = '<tbody>'+ rows.map(r=> '<tr>'+ cols.map(c=> {
        let val = (typeof c.render === 'function')? c.render(r) : r[c.key];
        if (val==null || val==='') val = '<span class="text-muted">NA</span>';
        return `<td>${val}</td>`;
      }).join('') + '</tr>').join('') + '</tbody>';
      return `<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-2">${head}${body}</table></div>`;
    }

    // Build table with vertical merging (rowspan) for repeated consecutive values in mergeCols
    function mergedTable(cols, rows, mergeCols){
      rows = Array.isArray(rows)? rows : [];
      if (!rows.length) return '<div class="text-muted">(none)</div>';
      mergeCols = Array.isArray(mergeCols)? mergeCols : [];
      // Precompute spans
      const spans = {}; // spans[col][rowIndex] = rowspan or 0 (skip)
      mergeCols.forEach(col=> { spans[col] = {}; });
      mergeCols.forEach(col=>{
        for (let i=0;i<rows.length;){
          const val = rows[i][col];
            let len=1; let j=i+1; while (j<rows.length && rows[j][col]===val){ len++; j++; }
          spans[col][i] = len; // starting cell
          for (let k=i+1;k<j;k++){ spans[col][k] = 0; }
          i = j;
        }
      });
      const head = '<thead><tr>'+ cols.map(c=> `<th>${escapeHtml(c.label)}</th>`).join('') + '</tr></thead>';
      const bodyRows = rows.map((r,rowIdx)=>{
        const tds = cols.map(c=>{
          let val = (typeof c.render === 'function')? c.render(r) : r[c.key];
          if (val==null || val==='') val = '<span class="text-muted">NA</span>';
          if (mergeCols.includes(c.key)){
            const span = spans[c.key][rowIdx];
            if (!span) return ''; // skip
            const rs = span>1? ` rowspan="${span}"` : '';
            return `<td${rs}>${val}</td>`;
          }
          return `<td>${val}</td>`;
        }).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      return `<div class="table-responsive"><table class="table table-sm table-bordered align-middle mb-2">${head}<tbody>${bodyRows}</tbody></table></div>`;
    }

    function warnCell(value, rule, config){
      if (value==null || value==='') return '<span class="text-muted">NA</span>';
      const num = Number(value);
      if (!isFinite(num)) return escapeHtml(String(value));
      let status = rule(num); // 'ok' | 'warn' | 'issue'
      let cls='bg-success'; let label='OK';
      if (status==='issue'){ cls='bg-danger'; label='Issue'; }
      else if (status==='warn'){ cls='bg-warning text-dark'; label='Warn'; }
      // Build reason only for warn/issue and only if config provided
      let reasonHtml='';
      if ((status==='warn' || status==='issue') && config){
        let reason='';
        const dir = config.dir; // 'gte'|'lte'|'vif'|'z'
        if (dir==='gte'){
          if (status==='warn' && config.good!=null) reason = `Below good (${config.good})`;
          else if (status==='issue') reason = `Below ${config.accept!=null? 'acceptable': 'required'} (${config.accept!=null? config.accept: (config.single!=null? config.single: config.good)})`;
        } else if (dir==='lte'){
          if (status==='warn' && config.good!=null) reason = `Above good (${config.good})`;
          else if (status==='issue') reason = `Above ${config.accept!=null? 'acceptable': 'required'} (${config.accept!=null? config.accept: (config.single!=null? config.single: config.good)})`;
        } else if (dir==='vif'){
          if (status==='warn') reason = `Above low target (<${config.good})`;
          else if (status==='issue') reason = `High collinearity (≥${config.accept})`;
        } else if (dir==='z'){
          if (status==='issue') reason = `Not significant (≤ ${config.single})`;
        } else if (dir==='custom' && typeof config.reason === 'function'){
          reason = config.reason(num,status);
        }
        if (reason){
          const color = status==='issue'? 'text-danger' : 'text-warning';
          reasonHtml = `<div class="${color}" style="line-height:1.1;">${escapeHtml(reason)}</div>`;
        }
      }
      if (reasonHtml){
        return `<div class="d-flex flex-column align-items-start">${reasonHtml}<div>${fmt(num)} ${badge(label, cls)}</div></div>`;
      }
      return `${fmt(num)} ${badge(label, cls)}`;
    }

    // 1) Goodness of Fit
  let section1 = `<h5 class="mb-1">1) Goodness of Fit of the Measurement Model ${fitBadge}</h5>`;
    if (Object.keys(fm).length){
      section1 += table([
    { key:'metric', label:'Metric', desc:'Fit index' },
    { key:'value', label:'Value', desc:'Observed & status' },
    { key:'rule', label:'Guideline', desc:'Threshold reference' }
      ], [
    { metric:'CFI', value: warnCell(fm.cfi, v=> v>=.95? 'ok' : v>=.90? 'warn':'issue', {dir:'gte', good:.95, accept:.90}), rule:'≥ .95 good (≥ .90 acceptable)' },
    { metric:'TLI', value: warnCell(fm.tli, v=> v>=.95? 'ok' : v>=.90? 'warn':'issue', {dir:'gte', good:.95, accept:.90}), rule:'≥ .95 good (≥ .90 acceptable)' },
    { metric:'RMSEA', value: warnCell(fm.rmsea, v=> v<=.06? 'ok' : v<=.08? 'warn':'issue', {dir:'lte', good:.06, accept:.08}), rule:'≤ .06 good (≤ .08 acceptable)' },
    { metric:'SRMR', value: warnCell(fm.srmr, v=> v<=.08? 'ok' : v<=.10? 'warn':'issue', {dir:'lte', good:.08, accept:.10}), rule:'≤ .08 good (≤ .10 acceptable)' },
        { metric:'Chi-Square (p)', value: (fm.pvalue!=null? fmt(fm.pvalue):'NA'), rule:'> .05 often desired; sensitive to N' }
      ]);
    } else {
      section1 += '<div class="text-muted">No fit measures returned.</div>';
    }
    section1 += '<div class="text-secondary mb-2">Interpret with sample size & theoretical specification.</div>';

    // 2) Construct validity (AVE / CR / FL / Formative collinearity)
  let section2 = '<h5 class="mt-3 mb-1">2) Construct-Level Validity</h5>';
    if (reflConstructs.length){
      section2 += table([
    { key:'factor', label:'Construct', desc:'Latent variable' },
    { key:'AVE', label:'AVE', desc:'≥ .50', render:r=> warnCell(r.AVE, v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) },
    { key:'CR', label:'CR', desc:'≥ .70', render:r=> warnCell(r.CR, v=> v>=.70? 'ok':'issue', {dir:'gte', single:.70}) },
    { key:'Alpha', label:'Alpha', desc:'≥ .70', render:r=> { const a = reflAlphaMap[r.factor]; const val = a? (a.alpha_std ?? a.alpha_raw): null; return warnCell(val, v=> v>=.70? 'ok':'issue', {dir:'gte', single:.70}); } }
      ], reflConstructs);
    } else {
      section2 += '<div class="text-muted">No reflective constructs detected.</div>';
    }
    // Fornell-Larcker matrix rendering
    if (Array.isArray(flMatrix) && flMatrix.length && typeof flMatrix[0]==='object'){
      section2 += '<div class="fw-bold mt-2">Fornell–Larcker Matrix (diag = sqrt(AVE))</div>';
      try {
        const constructs = flMatrix.map(r=> r.construct).filter(Boolean);
        const colKeys = Object.keys(flMatrix[0]).filter(k=> k !== 'construct');
        // Dynamic columns
        const colsDyn = [{ key:'construct', label:'Construct', desc:'Row' }, ...colKeys.map(k=> ({ key:k, label:k, desc:k }))];
        section2 += table(colsDyn, flMatrix);
        // Derive pairwise pass/fail summary
        const diagMap = {};
        flMatrix.forEach(r=>{ if (r.construct && r[r.construct]!=null) diagMap[r.construct]= Number(r[r.construct]); });
        const pairIssues = [];
        for (let i=0;i<constructs.length;i++){
          for (let j=i+1;j<constructs.length;j++){
            const a = constructs[i]; const b = constructs[j];
            const rowA = flMatrix.find(r=> r.construct===a) || {};
            const r_ab = Number(rowA[b]);
            if (!isFinite(r_ab)) continue;
            const sa = diagMap[a]; const sb = diagMap[b];
            if (isFinite(sa) && isFinite(sb)){
              const pass = (sa > Math.abs(r_ab)) && (sb > Math.abs(r_ab));
              if (!pass){ pairIssues.push({ a,b, r: r_ab, sa, sb }); }
            }
          }
        }
        if (pairIssues.length){
          section2 += '<div class="text-danger small">Pairs failing FL criterion (sqrt(AVE) > |r| for both):</div>';
          section2 += '<ul class="small mb-2">'+ pairIssues.map(p=> `<li>${escapeHtml(p.a)}–${escapeHtml(p.b)}: |r|=${fmt(Math.abs(p.r))}, sqrtAVE(${escapeHtml(p.a)})=${fmt(p.sa)}, sqrtAVE(${escapeHtml(p.b)})=${fmt(p.sb)}</li>`).join('') + '</ul>';
        } else {
          section2 += '<div class="small text-success">All construct pairs satisfy Fornell–Larcker criterion.</div>';
        }
      } catch(err){ section2 += `<div class='text-warning small'>Fornell–Larcker parse error: ${escapeHtml(err.message||err)}</div>`; }
    }
    // HTMT matrix (optional)
    if (htmtMatrix && typeof htmtMatrix === 'object' && !Array.isArray(htmtMatrix)){
      const rows = Object.keys(htmtMatrix);
      if (rows.length){
        section2 += '<div class="fw-bold mt-2">HTMT (Heterotrait-Monotrait) Ratios</div>';
        try {
          const colsSet = new Set();
            rows.forEach(rn=>{ const row = htmtMatrix[rn]; if (row && typeof row==='object'){ Object.keys(row).forEach(k=> colsSet.add(k)); } });
          const colKeys = Array.from(colsSet).filter(k=> rows.includes(k));
          const htmtRows = rows.map(rn=>{ const rowObj = { construct: rn }; const row = htmtMatrix[rn] || {}; colKeys.forEach(k=>{ const v = row[k]; rowObj[k] = (v==null||rn===k)? (rn===k? 1: '') : Number(v).toFixed(3); }); return rowObj; });
          const colsDyn = [{ key:'construct', label:'Construct', desc:'Row' }, ...colKeys.map(k=> ({ key:k, label:k, desc:k }))];
          section2 += table(colsDyn, htmtRows);
          // Flag high HTMT
          const highPairs = [];
          rows.forEach(a=> rows.forEach(b=>{ if (a<b){ const val = htmtMatrix[a] && htmtMatrix[a][b]; if (isFinite(val) && val>0.85) highPairs.push({a,b,val}); } }));
          if (highPairs.length){
            section2 += '<div class="text-danger small">Pairs with HTMT > .85:</div><ul class="small mb-2">'+ highPairs.map(p=> `<li>${escapeHtml(p.a)}–${escapeHtml(p.b)}: ${fmt(p.val)}</li>`).join('') + '</ul>';
          } else {
            section2 += '<div class="small text-success">All HTMT ratios ≤ .85.</div>';
          }
        } catch(err){ section2 += `<div class='text-warning small'>HTMT parse error: ${escapeHtml(err.message||err)}</div>`; }
      }
    }
    if (formBlocks.length){
  section2 += '<div class="fw-bold mt-2">Formative Blocks (Collinearity & Variance)</div>';
      section2 += table([
    { key:'factor', label:'Composite', desc:'Formative' },
    { key:'n_indicators', label:'#Ind', desc:'Indicators' },
    { key:'R2a', label:'R²ₐ', desc:'Adj. variance' , render:r=> fmt(r.R2a) },
    { key:'VIF_max', label:'Max VIF', desc:'<3 good (<10 ok)', render:r=> warnCell(r.VIF_max, v=> v<3? 'ok' : v<10? 'warn':'issue', {dir:'vif', good:3, accept:10}) }
      ], formBlocks);
    }
    if (soReflect.length){
  section2 += '<div class="fw-bold mt-2">Second-Order Reflective</div>';
      section2 += table([
    { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
    { key:'n_first_order', label:'#Subdims', desc:'First-order' },
    { key:'AVE_2nd', label:'AVE (λ²)', desc:'≥ .50', render:r=> warnCell(r.AVE_2nd, v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) },
    { key:'min_loading', label:'Min λ', desc:'Smallest loading', render:r=> fmt(r.min_loading) }
      ], soReflect);
    }
    if (soForm.length){
  section2 += '<div class="fw-bold mt-2">Second-Order Formative</div>';
      section2 += table([
    { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
    { key:'n_subdims', label:'#Subs', desc:'Subdimensions' },
    { key:'R2a', label:'R²ₐ', desc:'Adj. variance', render:r=> fmt(r.R2a) },
    { key:'VIF_max', label:'Max VIF', desc:'<3 good (<10 ok)', render:r=> warnCell(r.VIF_max, v=> v<3? 'ok' : v<10? 'warn':'issue', {dir:'vif', good:3, accept:10}) }
      ], soForm);
    }

    // 3) Reliability
  let section3 = '<h5 class="mt-3 mb-1">3) Construct-Level Reliability</h5>';
    if (reflAlpha.length){
      section3 += table([
    { key:'factor', label:'Factor', desc:'Latent variable' },
    { key:'n_items', label:'#Items', desc:'Indicators' },
    { key:'alpha_std', label:'Alpha (std)', desc:'≥ .70', render:r=> warnCell(r.alpha_std, v=> v>=.70? 'ok':'issue', {dir:'gte', single:.70}) },
    { key:'alpha_raw', label:'Alpha (raw)', desc:'≥ .70', render:r=> warnCell(r.alpha_raw, v=> v>=.70? 'ok':'issue', {dir:'gte', single:.70}) }
      ], reflAlpha);
    } else {
      section3 += '<div class="text-muted small">No alpha values.</div>';
    }
    if (step6.reliability && step6.reliability.second_order_reflective_CR && step6.reliability.second_order_reflective_CR.length){
  section3 += '<div class="fw-bold mt-2">Second-Order CR</div>' +
        table([
      { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
      { key:'CR_2nd', label:'CR', desc:'≥ .70', render:r=> warnCell(r.CR_2nd, v=> v>=.70? 'ok':'issue', {dir:'gte', single:.70}) }
        ], step6.reliability.second_order_reflective_CR);
    }
    section3 += '<div class="small text-secondary">Alpha complements CR; low alpha with adequate CR may suggest heterogeneous but valid indicators.</div>';

    // 4) Indicator diagnostics
  let section4 = '<h5 class="mt-3 mb-1">4) Indicator / Subdimension Diagnostics</h5>';
    if (loadings.length){
  section4 += '<div class="fw-bold">Loadings (raw & std)</div>';
      section4 += table([
    { key:'latent', label:'Latent', desc:'Construct' },
    { key:'indicator', label:'Indicator', desc:'Item' },
    { key:'estimate', label:'Est', desc:'Unstd.' , render:r=> fmt(r.estimate) },
    { key:'std_all', label:'Std', desc:'≥ .50', render:r=> warnCell(r.std_all, v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) }
      ], loadings);
    }
    if (reflItems.length){
      const weak = reflItems.filter(r=> r.flag_weak);
  section4 += '<div class="fw-bold mt-2">Reflective Items</div>';
      section4 += table([
    { key:'factor', label:'Factor', desc:'Construct' },
    { key:'item', label:'Item', desc:'Indicator' },
    { key:'std.all', label:'Loading', desc:'≥ .50', render:r=> warnCell(r['std.all'], v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) },
    { key:'lambda2', label:'λ²', desc:'≥ .50', render:r=> warnCell(r.lambda2, v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) },
    { key:'z', label:'z', desc:'> 1.96', render:r=> warnCell(r.z, v=> v>1.96? 'ok':'issue', {dir:'z', single:1.96}) }
      ], reflItems);
      if (weak.length){
        section4 += `<div class="small text-danger">${weak.length} weak item(s) flagged (z ≤ 1.96 or λ² < .50).</div>`;
      }
    }
    if (formWeights.length){
  section4 += '<div class="fw-bold mt-2">Formative Weights</div>';
      section4 += table([
    { key:'factor', label:'Composite', desc:'Formative' },
    { key:'indicator', label:'Indicator', desc:'Item' },
    { key:'std.all', label:'Std weight', desc:'Loading', render:r=> fmt(r['std.all']) },
    { key:'z', label:'z', desc:'> 1.96', render:r=> warnCell(r.z, v=> v>1.96? 'ok':'issue', {dir:'z', single:1.96}) },
    { key:'pvalue', label:'p', desc:'Sig.' , render:r=> fmt(r.pvalue) }
      ], formWeights);
    }
    if (formVifDetail.length){
  section4 += '<div class="fw-bold mt-2">Formative Indicator VIF</div>';
      section4 += table([
    { key:'factor', label:'Composite', desc:'Formative' },
    { key:'indicator', label:'Indicator', desc:'Item' },
    { key:'VIF', label:'VIF', desc:'<3 good (<10 ok)', render:r=> warnCell(r.VIF, v=> v<3? 'ok' : v<10? 'warn':'issue', {dir:'vif', good:3, accept:10}) }
      ], formVifDetail);
    }
    if (soReflectLoad.length){
  section4 += '<div class="fw-bold mt-2">Second-Order Reflective Loadings</div>' + table([
    { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
    { key:'subdimension', label:'Subdimension', desc:'First-order' },
    { key:'std.all', label:'Loading', desc:'≥ .50', render:r=> warnCell(r['std.all'], v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) },
    { key:'lambda2', label:'λ²', desc:'≥ .50', render:r=> warnCell(r.lambda2, v=> v>=.50? 'ok':'issue', {dir:'gte', single:.50}) },
    { key:'z', label:'z', desc:'> 1.96', render:r=> warnCell(r.z, v=> v>1.96? 'ok':'issue', {dir:'z', single:1.96}) }
      ], soReflectLoad);
    }
    if (soFormWeights.length){
  section4 += '<div class="fw-bold mt-2">Second-Order Formative Weights</div>' + table([
    { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
    { key:'subdimension', label:'Subdimension', desc:'First-order' },
    { key:'std.all', label:'Std weight', desc:'Loading', render:r=> fmt(r['std.all']) },
    { key:'z', label:'z', desc:'> 1.96', render:r=> warnCell(r.z, v=> v>1.96? 'ok':'issue', {dir:'z', single:1.96}) },
    { key:'pvalue', label:'p', desc:'Sig.', render:r=> fmt(r.pvalue) }
      ], soFormWeights);
    }
    if (soFormVifDetail.length){
  section4 += '<div class="fw-bold mt-2">Second-Order Formative VIF</div>' + table([
    { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
    { key:'subdimension', label:'Subdimension', desc:'First-order' },
    { key:'VIF', label:'VIF', desc:'<3 good (<10 ok)', render:r=> warnCell(r.VIF, v=> v<3? 'ok' : v<10? 'warn':'issue', {dir:'vif', good:3, accept:10}) }
      ], soFormVifDetail);
    }
    if (soFormUniqueR2.length){
  section4 += '<div class="fw-bold mt-2">Second-Order Unique R² (lmg)</div>' + table([
    { key:'second_order', label:'2nd-Order', desc:'Higher-level' },
    { key:'subdimension', label:'Subdimension', desc:'First-order' },
    { key:'lmg', label:'Unique R²', desc:'Relative importance', render:r=> fmt(r.lmg) }
      ], soFormUniqueR2);
    }
    if ((flags.error_covariance_MIs||[]).length){
  section4 += '<div class="fw-bold mt-2">Error Covariance Modification Indices (MI > 3.84)</div>' + table([
    { key:'lhs', label:'lhs', desc:'Item 1' }, { key:'op', label:'op', desc:'' }, { key:'rhs', label:'rhs', desc:'Item 2' }, { key:'mi', label:'MI', desc:'>3.84', render:r=> warnCell(r.mi, v=> v>10? 'issue':'warn', {dir:'custom', reason:(num,st)=> st==='issue'? 'Very high MI (>10)': 'Suggest add cov.'}) }
      ], flags.error_covariance_MIs);
    }
    if ((flags.cross_loading_MIs||[]).length){
  section4 += '<div class="fw-bold mt-2">Cross-Loading Modification Indices (MI > 3.84)</div>' + table([
    { key:'lhs', label:'Alt Factor', desc:'Other factor' }, { key:'op', label:'op', desc:'' }, { key:'rhs', label:'Item', desc:'Indicator' }, { key:'mi', label:'MI', desc:'>3.84', render:r=> warnCell(r.mi, v=> v>10? 'issue':'warn', {dir:'custom', reason:(num,st)=> st==='issue'? 'Very high MI (>10)': 'Potential cross-load'}) }
      ], flags.cross_loading_MIs);
    }
    section4 += '<div class="small text-secondary">Consider theoretical justification before pruning flagged items; avoid overfitting by chasing MIs.</div>';

    // Flags summary
    const flagEntries = Object.entries(flags).filter(([,v])=> v && ((Array.isArray(v)&&v.length) || (typeof v==='object' && Object.keys(v).length)));
    let summary = '<h5 class="mt-3 mb-1">Flags Summary</h5>';
    if (flagEntries.length){
      summary += '<ul class="small mb-2">'+ flagEntries.map(([k,v])=> `<li><code>${escapeHtml(k)}</code>: ${(Array.isArray(v)? v.length : Object.keys(v).length)} issue(s)</li>`).join('') + '</ul>';
    } else {
      summary += '<div class="small text-success">No threshold violations detected.</div>';
    }

    // 5) Revision recommendations (MacKenzie Step 6 final)
    const revisionRows = [];
    // Helper to push unique keys
    const pushRev = (key, row) => { if (!row || !key) return; revisionRows.push(row); };
    const fmtP = v => (v==null||v==='')? 'NA' : Number(v).toFixed(3);
    // Reflective weak items
    (reflItems||[]).forEach(r=>{
      if (!r.flag_weak) return;
      const issues=[];
      if (!isFinite(r.z) || r.z <= 1.96) issues.push(`z≤1.96 (${fmt(r.z)})`);
      if (isFinite(r.lambda2) && r.lambda2 < .50) issues.push(`λ²<.50 (${fmt(r.lambda2)})`);
      // std.all < .50 is implicit; mention if so
      if (isFinite(r['std.all']) && r['std.all'] < .50) issues.push(`Loading<.50 (${fmt(r['std.all'])})`);
      const suggestion = 'Consider rewording for clarity/specificity or remove if construct domain remains covered.';
      pushRev(r.factor+':'+r.item, { type:'Reflective Item', factor:r.factor, target:r.item, issues: issues.join('; '), suggestion });
    });
    // Error covariance MIs
    (flags.error_covariance_MIs||[]).forEach(mi=>{
      const key = `ERRCOV:${mi.lhs}-${mi.rhs}`;
      const level = mi.mi>10? 'Very high' : 'High';
      const suggestion = 'Investigate shared wording/content; if theory justifies, allow correlated errors; else revise one item.';
      pushRev(key, { type:'Error Covariance', factor: mi.lhs + '↔' + mi.rhs, target:'Pair', issues:`MI=${fmt(mi.mi)} (${level})`, suggestion });
    });
    // Cross-loading MIs
    (flags.cross_loading_MIs||[]).forEach(mi=>{
      const key = `XLOAD:${mi.lhs}->${mi.rhs}`;
      const level = mi.mi>10? 'Very high' : 'High';
      const suggestion = 'Potential ambiguity; clarify wording to anchor to intended construct or consider removal.';
      pushRev(key, { type:'Cross-Loading', factor: mi.lhs, target: mi.rhs, issues:`MI=${fmt(mi.mi)} (${level})`, suggestion });
    });
    // Formative indicators: nonsignificant + high VIF
    const vifMapForm = {};
    (formVifDetail||[]).forEach(v=>{ vifMapForm[v.factor+':'+v.indicator] = v.VIF; });
    (formWeights||[]).forEach(w=>{
      const key = w.factor+':'+w.indicator;
      const vif = vifMapForm[key];
      const issues=[];
      if (w.nonsignificant || (!isFinite(w.z) || w.z <= 1.96)) issues.push(`z≤1.96 (${fmt(w.z)})`);
      if (isFinite(vif) && vif >=10) issues.push(`VIF≥10 (${fmt(vif)})`); else if (isFinite(vif) && vif >=3) issues.push(`VIF≥3 (${fmt(vif)})`);
      if (!issues.length) return;
      const suggestion = 'Assess conceptual uniqueness; drop only if redundant and domain coverage maintained.';
      pushRev('FORM:'+key, { type:'Formative Indicator', factor:w.factor, target:w.indicator, issues: issues.join('; '), suggestion });
    });
    // Second-order reflective loadings
    (soReflectLoad||[]).forEach(r=>{
      const issues=[];
      if (isFinite(r['std.all']) && r['std.all'] < .50) issues.push(`Loading<.50 (${fmt(r['std.all'])})`);
      if (isFinite(r.lambda2) && r.lambda2 < .50) issues.push(`λ²<.50 (${fmt(r.lambda2)})`);
      if (isFinite(r.z) && r.z <= 1.96) issues.push(`z≤1.96 (${fmt(r.z)})`);
      if (!issues.length) return;
      const suggestion = 'Evaluate necessity of subdimension; remove only if theoretical breadth preserved.';
      pushRev('SORE:'+(r.second_order+':'+r.subdimension), { type:'2nd-Order Reflective', factor:r.second_order, target:r.subdimension, issues: issues.join('; '), suggestion });
    });
    // Second-order formative weights
    const vifMapSOForm = {};
    (soFormVifDetail||[]).forEach(v=>{ vifMapSOForm[v.second_order+':'+v.subdimension] = v.VIF; });
    (soFormWeights||[]).forEach(w=>{
      const key = w.second_order+':'+w.subdimension;
      const vif = vifMapSOForm[key];
      const issues=[];
      if (w.nonsignificant || (!isFinite(w.z) || w.z <= 1.96)) issues.push(`z≤1.96 (${fmt(w.z)})`);
      if (isFinite(vif) && vif >=10) issues.push(`VIF≥10 (${fmt(vif)})`); else if (isFinite(vif) && vif >=3) issues.push(`VIF≥3 (${fmt(vif)})`);
      if (!issues.length) return;
      const suggestion = 'Check conceptual distinctiveness of subdimension; drop only if overlapping and coverage retained.';
      pushRev('SOFORM:'+key, { type:'2nd-Order Formative', factor:w.second_order, target:w.subdimension, issues: issues.join('; '), suggestion });
    });

    // Fornell-Larcker / HTMT issues (already flagged earlier) - add as conceptual overlap suggestions
    // Pair issues computed in FL step added to DOM already; we can include again for consolidated view if we stored them
    // (Recompute quickly if needed)
    try {
      if (Array.isArray(flMatrix) && flMatrix.length){
        const constructs = flMatrix.map(r=> r.construct).filter(Boolean);
        const diagMap = {}; flMatrix.forEach(r=>{ if (r.construct && r[r.construct]!=null) diagMap[r.construct]= Number(r[r.construct]); });
        for (let i=0;i<constructs.length;i++){
          for (let j=i+1;j<constructs.length;j++){
            const a=constructs[i], b=constructs[j];
            const rowA = flMatrix.find(r=> r.construct===a) || {}; const r_ab = Number(rowA[b]);
            if (!isFinite(r_ab)) continue; const sa=diagMap[a]; const sb=diagMap[b];
            if (isFinite(sa)&&isFinite(sb)){
              const pass = (sa > Math.abs(r_ab)) && (sb > Math.abs(r_ab));
              if (!pass){ pushRev('FLPAIR:'+a+'-'+b, { type:'Discriminant (FL)', factor: a+'–'+b, target:'Pair', issues:`|r|=${fmt(Math.abs(r_ab))} ≥ sqrtAVE for one/both`, suggestion:'Refine items to sharpen conceptual boundaries; consider merging constructs only if theory supports.' }); }
            }
          }
        }
      }
      if (htmtMatrix && typeof htmtMatrix==='object'){
        Object.keys(htmtMatrix).forEach(a=>{ Object.keys(htmtMatrix[a]||{}).forEach(b=>{ if (a<b){ const v=htmtMatrix[a][b]; if (isFinite(v) && v>0.85){ pushRev('HTMT:'+a+'-'+b, { type:'Discriminant (HTMT)', factor:a+'–'+b, target:'Pair', issues:`HTMT=${fmt(v)}`, suggestion:'Revise or remove overlapping indicators; ensure constructs are theoretically distinct.' }); } } }); });
      }
    } catch(e){ /* silent */ }

    let revisionSection = '<h5 class="mt-3 mb-1">Revision Recommendations</h5>';
    if (!revisionRows.length){
      revisionSection += '<div class="small text-success">No items currently flagged for revision under operational rules.</div>';
    } else {
      revisionSection += mergedTable([
        { key:'type', label:'Type' },
        { key:'factor', label:'Factor' },
        { key:'target', label:'Target' },
        { key:'issues', label:'Issue(s)' },
        { key:'suggestion', label:'Suggestion' }
      ], revisionRows, ['type','factor','suggestion']);
      revisionSection += '<div class="small text-secondary">Apply judgment: retain indicators essential for content validity even if flagged.</div>';
    }

    let html = section1 + section2 + section3 + section4 + summary + revisionSection;
    if (out.warning){ html = `<div class='alert alert-warning small py-1 mb-2'><strong>R Warning:</strong> ${escapeHtml(out.warning)}</div>` + html; }
    if (out.error){ html += `<div class='alert alert-danger small py-1 mt-2 mb-0'>CFA Error: ${escapeHtml(out.error)}</div>`; }
    cfaResultsEl.innerHTML = html;
    // Inject download button (once)
    let dlWrap = document.getElementById('cfaDownloadWrapper');
    if (!dlWrap){
      dlWrap = document.createElement('div');
      dlWrap.id = 'cfaDownloadWrapper';
      dlWrap.className = 'd-flex gap-2 mb-2';
      const btn = document.createElement('button');
      btn.type='button';
      btn.className='btn btn-sm btn-outline-secondary';
      btn.id='downloadCfaBundleBtn';
      btn.textContent='Download Results (.json)';
      dlWrap.appendChild(btn);
      cfaResultsEl.parentNode.insertBefore(dlWrap, cfaResultsEl);
      btn.addEventListener('click', ()=>{ try { downloadStep6Bundle(); } catch(e){ console.warn('Download bundle failed', e); window.displayInfo?.('danger','Download failed'); } });
    }
    // Init tooltips if Bootstrap available
    try {
      const ttEls = cfaResultsEl.querySelectorAll('[data-bs-toggle="tooltip"]');
      if (window.bootstrap && window.bootstrap.Tooltip){
        ttEls.forEach(el=>{ try { new window.bootstrap.Tooltip(el); } catch(e){} });
      } else if (window.$ && window.$.fn && window.$.fn.tooltip){
        window.$(ttEls).tooltip();
      }
    } catch(e){ /* silent */ }
  }

  function buildRevisionArray(){
    // Extract current revision table rows for inclusion in bundle
    const rows = [];
    if (!cfaResultsEl) return rows;
    const table = cfaResultsEl.querySelector('h5:nth-of-type(5)')?.nextElementSibling; // fragile; fallback below
    const revHeader = [...cfaResultsEl.querySelectorAll('h5')].find(h=> /Revision Recommendations/i.test(h.textContent||''));
    const revSection = revHeader ? revHeader.nextElementSibling : null;
    const revTable = revSection && revSection.querySelector && revSection.querySelector('table');
    if (revTable){
      const ths = [...revTable.querySelectorAll('thead th')].map(th=> th.textContent.trim());
      [...revTable.querySelectorAll('tbody tr')].forEach(tr=>{
        const cells = [...tr.children];
        if (!cells.length) return;
        const obj={}; let ci=0; for (let i=0;i<cells.length;i++){ const txt=cells[i].textContent.trim(); obj[ths[ci]] = txt; ci++; }
        rows.push(obj);
      });
    }
    return rows;
  }

  function downloadStep6Bundle(){
    const bundle = {
      generatedAt: new Date().toISOString(),
      dataSignature: computeDataSignature(rawData, columns),
      columns,
      viewMode,
      scale: { min: scaleMin, max: scaleMax },
      efa: lastEFAResult || null,
      cfa: lastCFAResult || null,
      revisionRecommendations: buildRevisionArray(),
      lavaan: { original: lavaanOriginalSnapshot, edited: lavaanEdited, activeView: lavaanActiveView },
      meta: { reversedColumns: Array.from(reverseSet), nRows: rawData.length }
    };
    const json = JSON.stringify(bundle,null,2);
    const blob = new Blob([json], { type:'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'step6_results_bundle.json';
    document.body.appendChild(a); a.click();
    setTimeout(()=>{ document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
    window.displayInfo?.('success','Results bundle downloaded.');
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
