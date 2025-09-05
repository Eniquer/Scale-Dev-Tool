// Step 6 Data Handling: load simulated or uploaded data, manage reverse scoring
(function(){
  document.addEventListener('DOMContentLoaded', init);
  let rawData = []; // current working data (may be reversed)
  let originalData = []; // pristine original load (simulated or uploaded)
  let reversedData = []; // last reversed version stored
  let columns = []; // item codes
  let reverseSet = new Set();
  let source = 'simulated';
  let scaleMin = 1, scaleMax = 5;
  let viewMode = 'original'; // 'original' | 'reversed'
  let userAdjustedScale = false; // track if user manually changed scale inputs
  let persistedUserAdjusted = false; // persisted flag
  let lavaanEdited = ''; // stored edited lavaan syntax
  let lavaanOriginalSnapshot = ''; // last loaded auto-generated spec from step4

  async function init(){
    bindUI();
    await restorePersisted();
    // Only auto-load simulated if simulated source currently selected
    if (source === 'simulated' && !rawData.length) await loadSimulated();
    // Ensure correct UI visibility for upload block after restore
    switchSource(source);
  await initLavaanEditor();
    updateViewButtons();
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
    id('clearReverseSelectionBtn')?.addEventListener('click', ()=>{ reverseSet.clear(); renderColumns(); });
  id('scaleMinInput')?.addEventListener('input', e=>{ scaleMin = parseNumber(e.target.value,1); userAdjustedScale = true; persistState(); });
  id('scaleMaxInput')?.addEventListener('input', e=>{ scaleMax = parseNumber(e.target.value,5); userAdjustedScale = true; persistState(); });
  id('showOriginalBtn')?.addEventListener('click', ()=>{ viewMode='original'; rawData = clone(originalData); setStatus('Showing original data.'); updateViewButtons(); renderTable(); });
  id('showReversedBtn')?.addEventListener('click', ()=>{ if (!reversedData.length){ setStatus('No reversed version stored yet.'); return; } viewMode='reversed'; rawData = clone(reversedData); setStatus('Showing reversed data.'); updateViewButtons(); renderTable(); });
    // Lavaan editor handlers
    const lavaTA = id('lavaanStep6Textarea');
    const saveBtn = id('btnSaveEditedLavaan');
    const reloadBtn = id('btnReloadLavaanFromStep4');
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
      await persistState();
      if (saveBtn) saveBtn.disabled = true;
      const status = id('lavaanStep6Status');
      if (status) status.textContent = 'Saved';
      window.displayInfo?.('success','Lavaan specification saved for Step 6.');
    });
    reloadBtn?.addEventListener('click', async ()=>{
      const proceed = await (window.customConfirm ? window.customConfirm({
        title:'Reload lavaan',
        message:'Discard current edits and reload auto-generated spec from Step 4?',
        confirmText:'Reload',
        cancelText:'Cancel'
      }) : Promise.resolve(confirm('Reload from Step 4?')));
      if (!proceed) return;
      await loadLavaanFromStep4(true);
      window.displayInfo?.('info','Reloaded model specification from Step 4.');
    });
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
        if (reverseSet.size){
          // recompute reversedData from new original
          const min = Number(scaleMin); const max = Number(scaleMax);
          reversedData = originalData.map(r=>{ const o={...r}; reverseSet.forEach(col=>{ const val=o[col]; if (val==null||val==='') return; const num=Number(val); if (!isFinite(num)) return; o[col]=(min+max)-num; }); return o; });
        } else {
          reversedData = [];
        }
        viewMode = preserveView ? prevView : 'original';
        rawData = clone(viewMode==='reversed' && reversedData.length ? reversedData : originalData);
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
    const newReversed = originalData.map(r=>{ const o={...r}; reverseSet.forEach(col=>{ const val=o[col]; if (val==null||val==='') return; const num=Number(val); if (!isFinite(num)) return; o[col]=(min+max)-num; }); return o; });
    reversedData = newReversed; rawData = clone(viewMode==='reversed'? reversedData : originalData);
    if (reverseSet.size){
      setStatus(`Applied reverse scoring to ${reverseSet.size} columns. Stored reversed version.`);
    } else {
      setStatus('No columns selected—reversed version now matches original (effectively unreversed).');
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
  lavaanEdited
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
      viewMode = stored.viewMode || viewMode;
      reverseSet = new Set(stored.reverseColumns||[]);
      columns = stored.columns || [];
      originalData = Array.isArray(stored.originalData)? stored.originalData : [];
      reversedData = Array.isArray(stored.reversedData)? stored.reversedData : [];
      rawData = clone(viewMode==='reversed' && reversedData.length? reversedData : originalData);
      id('scaleMinInput') && (id('scaleMinInput').value = scaleMin);
      id('scaleMaxInput') && (id('scaleMaxInput').value = scaleMax);
  lavaanEdited = stored.lavaanEdited || '';
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
    } catch(e){ console.warn('[Step6] restorePersisted failed', e); }
  }

  function updateViewButtons(){
    const origBtn = id('showOriginalBtn');
    const revBtn = id('showReversedBtn');
    const label = id('viewModeLabel');
    const hasReversed = reversedData.length>0;
    if (origBtn){ origBtn.disabled = !originalData.length || viewMode==='original'; }
    if (revBtn){ revBtn.disabled = !hasReversed || viewMode==='reversed'; }
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
    if (!ta) return; // card not present
    if (!lavaanEdited){
      await loadLavaanFromStep4(false);
    } else {
      ta.value = lavaanEdited;
      const status = id('lavaanStep6Status');
      if (status) status.textContent = 'Saved (edited)';
      id('btnSaveEditedLavaan') && (id('btnSaveEditedLavaan').disabled = true);
    }
  }

  async function loadLavaanFromStep4(forceOverwrite){
    try {
      const step4 = await window.dataStorage.getData('data_step_4') || {};
      const auto = (step4.lavaanSpec && step4.lavaanSpec.syntax) ? step4.lavaanSpec.syntax : '# No lavaan spec found in Step 4.';
      lavaanOriginalSnapshot = auto;
      if (!lavaanEdited || forceOverwrite){
        lavaanEdited = auto;
        const ta = id('lavaanStep6Textarea');
        if (ta) ta.value = lavaanEdited;
        const status = id('lavaanStep6Status');
        if (status) status.textContent = forceOverwrite ? 'Loaded (fresh)' : 'Loaded';
        id('btnSaveEditedLavaan') && (id('btnSaveEditedLavaan').disabled = true);
        await persistState();
      }
    } catch(e){
      console.warn('[Step6] loadLavaanFromStep4 failed', e);
      const ta = id('lavaanStep6Textarea');
      if (ta && !lavaanEdited) ta.value = '# Failed loading lavaan spec.';
    }
  }
})();
