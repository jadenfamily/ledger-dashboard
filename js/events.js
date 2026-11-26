/* 가계부 · events — 이벤트 처리 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function addCat() { var f = L.addCat; return f.apply(this, arguments); }
  function analyzeReceipt() { var f = L.analyzeReceipt; return f.apply(this, arguments); }
  function applyAllTpl() { var f = L.applyAllTpl; return f.apply(this, arguments); }
  function applyOneTpl() { var f = L.applyOneTpl; return f.apply(this, arguments); }
  function backupJson() { var f = L.backupJson; return f.apply(this, arguments); }
  function boot() { var f = L.boot; return f.apply(this, arguments); }
  function buildImportPreview() { var f = L.buildImportPreview; return f.apply(this, arguments); }
  function clearKey() { var f = L.clearKey; return f.apply(this, arguments); }
  function copyTsv() { var f = L.copyTsv; return f.apply(this, arguments); }
  function delCat() { var f = L.delCat; return f.apply(this, arguments); }
  function deleteFx() { var f = L.deleteFx; return f.apply(this, arguments); }
  function deleteTx() { var f = L.deleteTx; return f.apply(this, arguments); }
  function exportCsv() { var f = L.exportCsv; return f.apply(this, arguments); }
  function importRows() { var f = L.importRows; return f.apply(this, arguments); }
  function loadImportFile() { var f = L.loadImportFile; return f.apply(this, arguments); }
  function openFxModal() { var f = L.openFxModal; return f.apply(this, arguments); }
  function openSettings() { var f = L.openSettings; return f.apply(this, arguments); }
  function openSheet() { var f = L.openSheet; return f.apply(this, arguments); }
  function openTxModal() { var f = L.openTxModal; return f.apply(this, arguments); }
  function readTxForm() { var f = L.readTxForm; return f.apply(this, arguments); }
  function refreshList() { var f = L.refreshList; return f.apply(this, arguments); }
  function renderCalendar() { var f = L.renderCalendar; return f.apply(this, arguments); }
  function renderList() { var f = L.renderList; return f.apply(this, arguments); }
  function renderReceipt() { var f = L.renderReceipt; return f.apply(this, arguments); }
  function renderSheet() { var f = L.renderSheet; return f.apply(this, arguments); }
  function renderTabs() { var f = L.renderTabs; return f.apply(this, arguments); }
  function renderTxForm() { var f = L.renderTxForm; return f.apply(this, arguments); }
  function renderView() { var f = L.renderView; return f.apply(this, arguments); }
  function resetBudgetDefaults() { var f = L.resetBudgetDefaults; return f.apply(this, arguments); }
  function saveBudget() { var f = L.saveBudget; return f.apply(this, arguments); }
  function saveBudgetDefaults() { var f = L.saveBudgetDefaults; return f.apply(this, arguments); }
  function saveFx() { var f = L.saveFx; return f.apply(this, arguments); }
  function saveKey() { var f = L.saveKey; return f.apply(this, arguments); }
  function saveReceipt() { var f = L.saveReceipt; return f.apply(this, arguments); }
  function saveTx() { var f = L.saveTx; return f.apply(this, arguments); }
  function saveUi() { var f = L.saveUi; return f.apply(this, arguments); }
  function setMonth() { var f = L.setMonth; return f.apply(this, arguments); }
  function setTab() { var f = L.setTab; return f.apply(this, arguments); }
  function pickProvider() { var f = L.pickProvider; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var DEVICE_KEY = L.DEVICE_KEY;   /* 다른 모듈 값 */
  var addMonths = L.addMonths;
  var catTypeDefault = L.catTypeDefault;
  var catsFor = L.catsFor;
  var closeModal = L.closeModal;
  var cloud = L.cloud;   /* 다른 모듈 값 */
  var fieldVal = L.fieldVal;
  var loadDevice = L.loadDevice;
  var lsSet = L.lsSet;
  var showModal = L.showModal;
  var syncBodyScrollLock = L.syncBodyScrollLock;
  var thisMonth = L.thisMonth;
  var ui = L.ui;   /* 다른 모듈 값 */

  /* ============================================================
     이벤트
     ============================================================ */
  document.addEventListener('click', function (e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) return;
    var act = el.getAttribute('data-act');
    var id = el.getAttribute('data-id') || '';

    if (act === 'modal-close') { closeModal(el.getAttribute('data-m') || ''); return; }
    if (act === 'tab-set') { setTab(el.getAttribute('data-tab') || 'list'); return; }
    if (act === 'month-prev') { setMonth(addMonths(ui.month, -1)); return; }
    if (act === 'month-next') { setMonth(addMonths(ui.month, 1)); return; }
    if (act === 'month-now') { setMonth(thisMonth()); return; }
    if (act === 'type-set') { ui.typeFilter = el.getAttribute('data-type') || 'all'; ui.cats = {}; saveUi(); renderTabs(); renderView(); return; }
    if (act === 'cat-toggle') {
      var c = el.getAttribute('data-cat') || '';
      if (ui.cats[c]) delete ui.cats[c]; else ui.cats[c] = 1;
      saveUi(); renderView(); return;
    }
    if (act === 'cat-clear') { ui.cats = {}; saveUi(); renderView(); return; }
    if (act === 'tx-add') { openTxModal('', el.getAttribute('data-date') || ''); return; }
    if (act === 'tx-edit') { openTxModal(id, ''); return; }
    if (act === 'tx-save') { saveTx(); return; }
    if (act === 'tx-del') { deleteTx(id); return; }
    if (act === 'tx-type') {
      if (!ui.txEdit) return;
      var keep = readTxForm();
      var t2 = el.getAttribute('data-type') || 'expense';
      ui.txEdit.type = t2;
      var cats = catsFor(t2);
      if (cats.indexOf(ui.txEdit.category) < 0) ui.txEdit.category = catTypeDefault(t2);
      renderTxForm();
      if (keep) { /* 값은 DOM에서 다시 읽었어요 */ }
      return;
    }
    if (act === 'receipt-open') {
      if (ui.txEdit) readTxForm();
      ui.rec = { step: 'idle', thumb: '', error: '', data: null };
      renderReceipt();
      showModal('receiptModal');
      return;
    }
    if (act === 'rec-retry') { ui.rec = { step: 'idle', thumb: '', error: '', data: null }; renderReceipt(); return; }
    if (act === 'rec-save') { saveReceipt(); return; }
    if (act === 'cal-day') {
      ui.calSel = el.getAttribute('data-date') || '';
      renderCalendar();
      return;
    }
    if (act === 'fx-new') { openFxModal(''); return; }
    if (act === 'fx-edit') { openFxModal(id); return; }
    if (act === 'fx-save') { saveFx(); return; }
    if (act === 'fx-del') { deleteFx(id); return; }
    if (act === 'fx-apply') { applyOneTpl(id); return; }
    if (act === 'fx-fill') { applyAllTpl(); return; }
    if (act === 'budget-save') { saveBudget(); return; }
    if (act === 'budget-default-save') { saveBudgetDefaults(); return; }
    if (act === 'budget-default-reset') { resetBudgetDefaults(); return; }
    if (act === 'budget-edit') {
      setTab('fixed');
      window.setTimeout(function () { var el2 = $('budgetInput'); if (el2) { try { el2.focus(); el2.select(); } catch (er) { /* 무시 */ } } }, 120);
      return;
    }
    if (act === 'sheet-open') { openSheet(); return; }
    if (act === 'csv-month') { exportCsv('month'); return; }
    if (act === 'csv-all') { exportCsv('all'); return; }
    if (act === 'tsv-copy') { copyTsv(); return; }
    if (act === 'imp-apply') { importRows(); return; }
    if (act === 'settings-open') { openSettings(); return; }
    if (act === 'key-save') { saveKey(); return; }
    if (act === 'ai-provider') { pickProvider(el.getAttribute('data-p') || ''); return; }
    if (act === 'key-clear') { clearKey(); return; }
    if (act === 'cat-add') { addCat(); return; }
    if (act === 'cat-del') { delCat(el.getAttribute('data-type'), el.getAttribute('data-cat')); return; }
    if (act === 'backup-json') { backupJson(); return; }
    if (act === 'gate-connect') {
      var f = $('gateForm');
      if (f) { f.hidden = !f.hidden; if (!f.hidden) { try { $('gToken').focus(); } catch (er) { /* 무시 */ } } }
      return;
    }
  });

  document.addEventListener('input', function (e) {
    var t = e.target;
    if (!t || !t.id) return;
    if (t.id === 'searchInput') {
      ui.q = String(t.value || '');
      saveUi();
      refreshList();
    }
    if (t.id === 'map_date' || t.id === 'map_type' || t.id === 'map_category' || t.id === 'map_title' || t.id === 'map_amount' || t.id === 'map_method' || t.id === 'map_memo') {
      if (ui.sheet.step === 'map') { buildImportPreview(); renderSheet(); }
    }
  });

  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t) return;
    if (t.id === 'methodSel') { ui.method = t.value; saveUi(); renderList(); return; }
    if (t.id === 'sortSel') { ui.sort = t.value; saveUi(); renderList(); return; }
    if (t.id === 'impFile') { loadImportFile(t.files && t.files[0]); return; }
    if (t.id === 'recFile') { var f = t.files && t.files[0]; if (f) analyzeReceipt(f); return; }
    if (t.id && t.id.indexOf('map_') === 0 && ui.sheet.step === 'map') { buildImportPreview(); renderSheet(); }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var ids = ['txModal', 'fxModal', 'receiptModal', 'sheetModal', 'settingsModal'];
      for (var i = 0; i < ids.length; i++) { var m = $(ids[i]); if (m && !m.hidden) { m.hidden = true; } }
      syncBodyScrollLock();
    }
    if (e.key === 'Enter' && e.target && e.target.tagName === 'INPUT' && e.target.closest && e.target.closest('.sheet')) {
      var b = e.target.closest('.sheet-body');
      if (b) {
        var saveBtn = b.querySelector('[data-act="tx-save"],[data-act="fx-save"],[data-act="rec-save"]');
        if (saveBtn) { e.preventDefault(); saveBtn.click(); }
      }
    }
  });

  document.addEventListener('click', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('sheet')) {
      var id = e.target.id;
      if (id === 'txModal' || id === 'fxModal' || id === 'receiptModal' || id === 'sheetModal' || id === 'settingsModal') { e.target.hidden = true; syncBodyScrollLock(); }
    }
  });

  var gateForm = $('gateForm');
  if (gateForm) {
    gateForm.addEventListener('submit', function (ev) {
      ev.preventDefault();
      var owner = fieldVal('gOwner').trim();
      var repo = fieldVal('gRepo').trim();
      var token = fieldVal('gToken').trim();
      var msg = $('gMsg');
      if (!owner || !repo || !token) { if (msg) msg.textContent = '세 항목을 모두 채워 주세요.'; return; }
      lsSet(DEVICE_KEY, JSON.stringify({ owner: owner, repo: repo, token: token, branch: 'main', at: Date.now() }));
      cloud.conn = loadDevice();
      if (msg) msg.textContent = '연결했어요. 불러오는 중…';
      boot();
    });
  }


  /* 내보내기 */
  L.gateForm = gateForm;
})();
