/* 가계부 · txns — 기록 추가/수정 · 고정비 항목 모달 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function markDirty() { var f = L.markDirty; return f.apply(this, arguments); }
  function renderAll() { var f = L.renderAll; return f.apply(this, arguments); }
  function renderSettings() { var f = L.renderSettings; return f.apply(this, arguments); }
  function saveUi() { var f = L.saveUi; return f.apply(this, arguments); }
  function tplUsedInMonth() { var f = L.tplUsedInMonth; return f.apply(this, arguments); }
  function warnPct() { var f = L.warnPct; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var METHODS = L.METHODS;   /* 다른 모듈 값 */
  var TYPES = L.TYPES;   /* 다른 모듈 값 */
  var TYPE_ORDER = L.TYPE_ORDER;   /* 다른 모듈 값 */
  var WARN_PCT_DEFAULT = L.WARN_PCT_DEFAULT;   /* 다른 모듈 값 */
  var catEmoji = L.catEmoji;
  var catTypeDefault = L.catTypeDefault;
  var catsFor = L.catsFor;
  var closeModal = L.closeModal;
  var daysInMonth = L.daysInMonth;
  var esc = L.esc;
  var fieldVal = L.fieldVal;
  var isYmd = L.isYmd;
  var makeTxn = L.makeTxn;
  var monthLabel = L.monthLabel;
  var num = L.num;
  var pad2 = L.pad2;
  var shortDay = L.shortDay;
  var showModal = L.showModal;
  var state = L.state;   /* 다른 모듈 값 */
  var thisMonth = L.thisMonth;
  var toast = L.toast;
  var todayStr = L.todayStr;
  var ui = L.ui;   /* 다른 모듈 값 */
  var uid = L.uid;
  var wonW = L.wonW;
  var ymOf = L.ymOf;

  /* ============================================================
     기록 추가 / 수정 모달
     ============================================================ */
  function openTxModal(id, date) {
    if (ui.readOnly) { toast('보기 전용 계정이라 기록을 바꿀 수 없어요.', true); return; }
    var t = null;
    if (id) {
      for (var i = 0; i < state.txns.length; i++) if (state.txns[i].id === id) t = state.txns[i];
      if (!t) return;
    }
    ui.txEdit = t ? {
      id: t.id, date: t.date, type: t.type, category: t.category, title: t.title,
      amount: t.amount, method: t.method, memo: t.memo, createdAt: t.createdAt
    } : {
      id: '', date: isYmd(date) ? date : (ui.month === thisMonth() ? todayStr() : ui.month + '-01'),
      type: 'expense', category: '', title: '', amount: '', method: '신용카드', memo: '', createdAt: 0
    };
    if (!ui.txEdit.category) ui.txEdit.category = catTypeDefault(ui.txEdit.type);
    renderTxForm();
    showModal('txModal');
  }
  function renderTxForm() {
    var e = ui.txEdit;
    var body = $('txBody');
    if (!body || !e) return;
    var title = $('txTitle');
    if (title) title.textContent = e.id ? '기록 수정' : '기록 추가';
    var typeBtns = '';
    for (var i = 0; i < TYPE_ORDER.length; i++) {
      var k = TYPE_ORDER[i];
      typeBtns += '<button type="button" data-act="tx-type" data-type="' + k + '" class="' + (e.type === k ? 'on' : '') + '">' + TYPES[k].label + '</button>';
    }
    var cats = catsFor(e.type);
    if (cats.indexOf(e.category) < 0 && e.category) cats.push(e.category);
    var catOpts = '';
    for (var c = 0; c < cats.length; c++) catOpts += '<option value="' + esc(cats[c]) + '"' + (cats[c] === e.category ? ' selected' : '') + '>' + catEmoji(cats[c]) + ' ' + esc(cats[c]) + '</option>';
    var mOpts = '';
    for (var mi = 0; mi < METHODS.length; mi++) mOpts += '<option value="' + METHODS[mi] + '"' + (e.method === METHODS[mi] ? ' selected' : '') + '>' + METHODS[mi] + '</option>';

    body.innerHTML =
      '<div class="field"><label>구분</label><div class="type-seg">' + typeBtns + '</div></div>' +
      '<div class="field-row">' +
        '<div class="field"><label>날짜</label><input id="txDate" type="date" value="' + esc(e.date) + '"></div>' +
        '<div class="field"><label>금액 (원)</label><input id="txAmount" type="number" inputmode="numeric" min="0" step="100" placeholder="0" value="' + (e.amount === 0 || e.amount === '' ? '' : esc(e.amount)) + '"></div>' +
      '</div>' +
      '<div class="field"><label>카테고리</label><select id="txCat">' + catOpts + '</select></div>' +
      '<div class="field"><label>항목명 / 내용</label><input id="txName" type="text" maxlength="60" placeholder="예: 이마트 장보기, 11월 월세" value="' + esc(e.title) + '"></div>' +
      '<div class="field"><label>결제수단</label><select id="txMethod">' + mOpts + '</select></div>' +
      '<div class="field"><label>메모 (선택)</label><input id="txMemo" type="text" maxlength="200" placeholder="필요하면 적어 두세요" value="' + esc(e.memo) + '"></div>' +
      '<div class="modal-acts">' +
        '<button class="btn wide" type="button" data-act="tx-save">저장</button>' +
      '</div>' +
      '<div class="modal-acts">' +
        '<button class="btn sm sub" type="button" data-act="receipt-open">📷 영수증으로 채우기</button>' +
        (e.id ? '<button class="btn sm ghost" type="button" data-act="tx-del" data-id="' + esc(e.id) + '">삭제</button>' : '') +
      '</div>' +
      '<p class="hint">' + (e.type === 'income' ? '수입은 잔액에 더해져요.' : e.type === 'fixed' ? '고정비는 매달 같은 금액이 나가는 항목이에요. 총 지출에 포함돼요.' : '변동지출은 그때그때 쓴 돈이에요.') + '</p>';
  }
  function readTxForm() {
    var e = ui.txEdit;
    if (!e) return null;
    e.date = fieldVal('txDate');
    e.amount = num(fieldVal('txAmount'));
    e.category = fieldVal('txCat');
    e.title = fieldVal('txName');
    e.method = fieldVal('txMethod');
    e.memo = fieldVal('txMemo');
    return e;
  }
  function saveTx() {
    var e = readTxForm();
    if (!e) return;
    if (!isYmd(e.date)) { toast('날짜를 확인해 주세요.', true); return; }
    if (!(e.amount > 0)) { toast('금액을 넣어 주세요.', true); return; }
    var payload = makeTxn({
      id: e.id || '', date: e.date, type: e.type, category: e.category, title: e.title,
      amount: e.amount, method: e.method, memo: e.memo, createdAt: e.createdAt
    });
    var found = false;
    for (var i = 0; i < state.txns.length; i++) {
      if (state.txns[i].id === payload.id) { payload.tplId = state.txns[i].tplId; state.txns[i] = payload; found = true; break; }
    }
    if (!found) state.txns.push(payload);
    markDirty('txns');
    closeModal('txModal');
    if (ymOf(payload.date) !== ui.month) { ui.month = ymOf(payload.date); saveUi(); }
    renderAll();
    toast((e.id ? '수정했어요' : '기록했어요') + ' · ' + TYPES[payload.type].label + ' ' + wonW(payload.amount));
  }
  function deleteTx(id) {
    var t = null;
    for (var i = 0; i < state.txns.length; i++) if (state.txns[i].id === id) t = state.txns[i];
    if (!t) return;
    if (!window.confirm('"' + t.title + ' ' + wonW(t.amount) + '" 기록을 지울까요?')) return;
    var out = [];
    for (var j = 0; j < state.txns.length; j++) if (state.txns[j].id !== id) out.push(state.txns[j]);
    state.txns = out;
    markDirty('txns');
    closeModal('txModal');
    renderAll();
    toast('기록을 지웠어요');
  }

  /* ============================================================
     고정비 템플릿 모달
     ============================================================ */
  function openFxModal(id) {
    if (ui.readOnly) { toast('보기 전용 계정이에요.', true); return; }
    var t = null;
    if (id) {
      var list = state.settings.fixedTemplates || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) t = list[i];
      if (!t) return;
    }
    ui.fxEdit = id || '';
    var body = $('fxBody');
    if (!body) return;
    var title = $('fxTitle');
    if (title) title.textContent = id ? '고정비 항목 수정' : '고정비 항목 추가';
    var cats = catsFor('fixed');
    var catOpts = '';
    for (var c = 0; c < cats.length; c++) catOpts += '<option value="' + esc(cats[c]) + '"' + ((t ? t.category : '주거/관리비') === cats[c] ? ' selected' : '') + '>' + catEmoji(cats[c]) + ' ' + esc(cats[c]) + '</option>';
    var mOpts = '';
    for (var mi = 0; mi < METHODS.length; mi++) mOpts += '<option value="' + METHODS[mi] + '"' + ((t ? t.method : '계좌이체') === METHODS[mi] ? ' selected' : '') + '>' + METHODS[mi] + '</option>';
    body.innerHTML =
      '<div class="field"><label>항목명</label><input id="fxName" type="text" maxlength="40" placeholder="예: 월세, 관리비, 넷플릭스, 보험료" value="' + esc(t ? t.name : '') + '"></div>' +
      '<div class="field-row">' +
        '<div class="field"><label>금액 (원)</label><input id="fxAmount" type="number" inputmode="numeric" min="0" step="100" placeholder="0" value="' + (t ? t.amount : '') + '"></div>' +
        '<div class="field"><label>매월 며칠</label><input id="fxDay" type="number" inputmode="numeric" min="1" max="31" step="1" value="' + (t ? t.day : 25) + '"></div>' +
      '</div>' +
      '<div class="field"><label>카테고리</label><select id="fxCat">' + catOpts + '</select></div>' +
      '<div class="field"><label>결제수단</label><select id="fxMethod">' + mOpts + '</select></div>' +
      '<div class="modal-acts"><button class="btn wide" type="button" data-act="fx-save">저장</button></div>' +
      (id ? '<div class="modal-acts"><button class="btn sm ghost" type="button" data-act="fx-del" data-id="' + esc(id) + '">항목 삭제</button></div>' : '') +
      '<p class="hint">저장한 항목은 이번 달 고정비로 한 번에 기록할 수 있어요. 이미 기록된 달은 건너뛰어요.</p>';
    showModal('fxModal');
  }
  function saveFx() {
    var name = fieldVal('fxName').trim();
    var amount = Math.round(num(fieldVal('fxAmount')));
    var day = Math.min(31, Math.max(1, Math.round(num(fieldVal('fxDay'))) || 1));
    if (!name) { toast('항목명을 넣어 주세요.', true); return; }
    if (amount <= 0) { toast('금액을 넣어 주세요.', true); return; }
    var tpl = {
      id: ui.fxEdit || uid('fx'), name: name.slice(0, 40), category: fieldVal('fxCat') || '기타',
      amount: amount, method: fieldVal('fxMethod'), day: day, active: true
    };
    var list = state.settings.fixedTemplates || [];
    var found = false;
    for (var i = 0; i < list.length; i++) if (list[i].id === tpl.id) { list[i] = tpl; found = true; }
    if (!found) list.push(tpl);
    state.settings.fixedTemplates = list;
    markDirty('settings');
    closeModal('fxModal');
    renderAll();
    toast('고정비 항목을 저장했어요');
  }
  function deleteFx(id) {
    var list = state.settings.fixedTemplates || [];
    var t = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) t = list[i];
    if (!t) return;
    if (!window.confirm('"' + t.name + '" 고정비 항목을 지울까요? (이미 기록된 내역은 그대로 남아요)')) return;
    var out = [];
    for (var j = 0; j < list.length; j++) if (list[j].id !== id) out.push(list[j]);
    state.settings.fixedTemplates = out;
    markDirty('settings');
    closeModal('fxModal');
    renderAll();
    toast('항목을 지웠어요');
  }
  function applyTpl(tpl, m) {
    var day = Math.min(tpl.day, daysInMonth(m));
    var date = m + '-' + pad2(day);
    var t = makeTxn({
      date: date, type: 'fixed', category: tpl.category, title: tpl.name,
      amount: tpl.amount, method: tpl.method, memo: '고정비 항목에서 기록', tplId: tpl.id
    });
    state.txns.push(t);
    return t;
  }
  function applyOneTpl(id) {
    var list = state.settings.fixedTemplates || [];
    var tpl = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) tpl = list[i];
    if (!tpl) return;
    var used = tplUsedInMonth(tpl, ui.month);
    if (used && !window.confirm('이 달에 이미 "' + tpl.name + '" 기록이 있어요. 한 번 더 기록할까요?')) return;
    var t = applyTpl(tpl, ui.month);
    markDirty('txns');
    renderAll();
    toast(tpl.name + ' ' + wonW(tpl.amount) + ' 고정비로 기록했어요 (' + shortDay(t.date) + ')');
  }
  function applyAllTpl() {
    var list = state.settings.fixedTemplates || [];
    var added = 0;
    for (var i = 0; i < list.length; i++) {
      if (tplUsedInMonth(list[i], ui.month)) continue;
      applyTpl(list[i], ui.month);
      added++;
    }
    if (!added) { toast('이번 달에 채울 고정비가 없어요.'); return; }
    markDirty('txns');
    renderAll();
    toast('고정비 ' + added + '건을 ' + monthLabel(ui.month) + '에 기록했어요');
  }
  function saveBudget() {
    if (ui.readOnly) return;
    var v = Math.round(num(fieldVal('budgetInput')));
    if (v < 0) v = 0;
    if (v > 0) state.settings.budgets[ui.month] = v;
    else delete state.settings.budgets[ui.month];
    markDirty('settings');
    renderAll();
    toast(v > 0 ? monthLabel(ui.month) + ' 예산을 ' + wonW(v) + '로 저장했어요' : '이 달 예산을 지웠어요');
  }

  /* 설정 화면의 예산 기준(기본 월 예산·주의 기준 %) 저장과 기본값 되돌리기 */
  function saveBudgetDefaults() {
    if (ui.readOnly) { ui.budMsg = 'err:보기 전용 계정은 바꿀 수 없어요.'; renderSettings(); return; }
    var bd = Math.max(0, Math.round(num(fieldVal('budgetDefaultInput'))));
    var wp = Math.round(num(fieldVal('warnPctInput')));
    if (!(wp >= 1 && wp <= 100)) { ui.budMsg = 'err:주의 기준은 1~100 사이로 넣어 주세요.'; renderSettings(); return; }
    state.settings.budgetDefault = bd;
    state.settings.warnPct = wp;
    ui.budMsg = '저장했어요' + (bd > 0 ? ' · 기본 ' + wonW(bd) : ' · 기본 예산 없음') + ' · 주의 ' + wp + '%';
    markDirty('settings');
    renderAll(); renderSettings();
    toast('💰 예산 기준을 저장했어요');
  }
  function resetBudgetDefaults() {
    if (ui.readOnly) { ui.budMsg = 'err:보기 전용 계정은 바꿀 수 없어요.'; renderSettings(); return; }
    state.settings.budgetDefault = 0;
    state.settings.warnPct = WARN_PCT_DEFAULT;
    ui.budMsg = '기본값으로 되돌렸어요';
    markDirty('settings');
    renderAll(); renderSettings();
    toast('💰 예산 기준을 기본값으로 되돌렸어요');
  }


  /* 내보내기 */
  L.openTxModal = openTxModal;
  L.renderTxForm = renderTxForm;
  L.readTxForm = readTxForm;
  L.saveTx = saveTx;
  L.deleteTx = deleteTx;
  L.openFxModal = openFxModal;
  L.saveFx = saveFx;
  L.deleteFx = deleteFx;
  L.applyTpl = applyTpl;
  L.applyOneTpl = applyOneTpl;
  L.applyAllTpl = applyAllTpl;
  L.saveBudget = saveBudget;
  L.saveBudgetDefaults = saveBudgetDefaults;
  L.resetBudgetDefaults = resetBudgetDefaults;
})();
