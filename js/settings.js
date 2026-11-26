/* 가계부 · settings — 설정 모달 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function aiClearKey() { var f = L.aiClearKey; return f.apply(this, arguments); }
  function aiKeyOrigin() { var f = L.aiKeyOrigin; return f.apply(this, arguments); }
  function aiProvider() { var f = L.aiProvider; return f.apply(this, arguments); }
  function aiSaveKey() { var f = L.aiSaveKey; return f.apply(this, arguments); }
  function aiSetProvider() { var f = L.aiSetProvider; return f.apply(this, arguments); }
  function aiSummary() { var f = L.aiSummary; return f.apply(this, arguments); }
  function aiSyncShared() { var f = L.aiSyncShared; return f.apply(this, arguments); }
  function budgetDefaultValue() { var f = L.budgetDefaultValue; return f.apply(this, arguments); }
  function canEdit() { var f = L.canEdit; return f.apply(this, arguments); }
  function downloadText() { var f = L.downloadText; return f.apply(this, arguments); }
  function markDirty() { var f = L.markDirty; return f.apply(this, arguments); }
  function providerLabel() { var f = L.providerLabel; return f.apply(this, arguments); }
  function renderAll() { var f = L.renderAll; return f.apply(this, arguments); }
  function roleLabel() { var f = L.roleLabel; return f.apply(this, arguments); }
  function syncText() { var f = L.syncText; return f.apply(this, arguments); }
  function warnPct() { var f = L.warnPct; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var PROVIDER_ORDER = L.PROVIDER_ORDER;
  var TYPES = L.TYPES;   /* 다른 모듈 값 */
  var WARN_PCT_DEFAULT = L.WARN_PCT_DEFAULT;   /* 다른 모듈 값 */
  var catEmoji = L.catEmoji;
  var catsFor = L.catsFor;
  var cloud = L.cloud;   /* 다른 모듈 값 */
  var customCats = L.customCats;
  var esc = L.esc;
  var fieldVal = L.fieldVal;
  var showModal = L.showModal;
  var state = L.state;   /* 다른 모듈 값 */
  var toast = L.toast;
  var todayStr = L.todayStr;
  var ui = L.ui;   /* 다른 모듈 값 */

  /* ============================================================
     설정 모달
     ============================================================ */
  function aiChips(sum) {
    var out = '';
    for (var i = 0; i < PROVIDER_ORDER.length; i++) {
      var pid = PROVIDER_ORDER[i];
      var on = pid === sum.provider;
      out += '<button class="ai-chip' + (on ? ' on' : '') + '" type="button" data-act="ai-provider" data-p="' + pid + '" aria-pressed="' + (on ? 'true' : 'false') + '">' +
        esc(providerLabel(pid)) + (sum.keys[pid] ? '<span class="ai-ok" aria-hidden="true">✓</span>' : '') + '</button>';
    }
    return out;
  }
  function aiStatusLine(sum) {
    if (sum.origin) return '사용 중: ' + esc(sum.label) + ' · ' + esc(sum.originText);
    if (sum.any) return esc(sum.label) + ' 키가 없어요. 지금은 키가 있는 다른 AI로 읽어요.';
    return '키가 없어도 기록·시트 연동은 그대로 쓸 수 있어요.';
  }
  function renderSettings() {
    var body = $('settingsBody');
    if (!body) return;
    var sum = aiSummary();
    var cats = ['expense', 'fixed', 'income'];
    var catHtml = '';
    for (var i = 0; i < cats.length; i++) {
      var list = customCats(cats[i]);
      if (!list.length) continue;
      catHtml += '<div class="hint" style="margin-top:6px">' + TYPES[cats[i]].label + '</div><div class="cat-list">';
      for (var j = 0; j < list.length; j++) {
        catHtml += '<div class="cat-item">' + catEmoji(list[j]) + ' ' + esc(list[j]) +
          (ui.readOnly ? '' : '<button class="x" type="button" data-act="cat-del" data-type="' + cats[i] + '" data-cat="' + esc(list[j]) + '" aria-label="삭제">✕</button>') +
          '</div>';
      }
      catHtml += '</div>';
    }
    body.innerHTML =
      '<div class="sec" style="border-top:none;padding-top:0;margin-top:0">' +
        '<h3>📷 영수증 AI' + (sum.shared ? ' <span class="badge ok">가족과 함께 쓰는 키 ✓</span>' : '') + '</h3>' +
        '<p class="hint">영수증 사진을 읽어 금액·카테고리·상호를 채워 줘요. 고른 AI가 느리거나 한도를 넘으면 다른 AI로 자동으로 다시 시도해요.</p>' +
        '<p class="hint" style="margin-top:9px">기본으로 쓸 AI</p>' +
        '<div class="ai-chips">' + aiChips(sum) + '</div>' +
        (ui.readOnly ? '' : '<div class="key-row" style="margin-top:9px"><input id="aiKeyInput" type="password" placeholder="' + esc(sum.label) + ' 키 (새 키로 바꿀 때만 입력)" autocomplete="off" spellcheck="false">' +
          '<button class="btn sm" type="button" data-act="key-save">저장</button>' +
          (sum.keys[sum.provider] ? '<button class="btn sm ghost" type="button" data-act="key-clear">지우기</button>' : '') + '</div>') +
        '<p class="hint" style="margin-top:6px">' + aiStatusLine(sum) + '</p>' +
        (sum.photos ? '' : '<p class="hint">이 AI는 지금 사진 읽기를 지원하는 모델이 없어서, 영수증은 ' + esc(sum.photoProviders.map(providerLabel).join('·')) + '로 읽어요.</p>') +
        (sum.origin === 'shared' ? '<p class="hint">가족이 함께 쓰는 키라서 한 번만 넣으면 모든 기기에서 그대로 써요.</p>' : '') +
        (ui.setMsg ? '<p class="msg ' + (ui.setMsg.indexOf('err:') === 0 ? 'err' : '') + '">' + esc(ui.setMsg.replace(/^err:/, '')) + '</p>' : '') +
      '</div>' +
      '<div class="sec">' +
        '<h3>🏷 내 카테고리</h3>' +
        (ui.readOnly ? '<p class="hint">보기 전용 계정은 카테고리를 바꿀 수 없어요.</p>' :
          '<div class="key-row"><select id="newCatType" class="sel" style="min-height:44px"><option value="expense">지출</option><option value="fixed">고정비</option><option value="income">수입</option></select>' +
          '<input id="newCatName" type="text" maxlength="16" placeholder="새 카테고리 이름" style="flex:1 1 140px">' +
          '<button class="btn sm" type="button" data-act="cat-add">추가</button></div>') +
        (ui.catMsg ? '<p class="msg ' + (ui.catMsg.indexOf('err:') === 0 ? 'err' : '') + '">' + esc(ui.catMsg.replace(/^err:/, '')) + '</p>' : '') +
        (catHtml || '<p class="hint">기본 카테고리를 쓰고 있어요. 자주 쓰는 항목을 추가해 보세요.</p>') +
      '</div>' +
      '<div class="sec">' +
        '<h3>💰 예산 기준</h3>' +
        '<p class="hint">이번 달 예산이 정해져 있으면 그 금액을, 없으면 기본 월 예산을 써요. 기본 예산은 매달 새로 시작할 때의 값이에요.</p>' +
        '<p class="hint" style="margin-top:8px">기본 월 예산 (원)</p>' +
        '<div class="key-row"><input id="budgetDefaultInput" type="number" inputmode="numeric" min="0" step="10000" placeholder="예: 1500000" value="' + (budgetDefaultValue() || '') + '"' + (ui.readOnly ? ' disabled' : '') + '></div>' +
        '<p class="hint" style="margin-top:8px">예산 주의 기준 (%)</p>' +
        '<div class="key-row"><input id="warnPctInput" type="number" inputmode="numeric" min="1" max="100" step="5" placeholder="예: 85" value="' + warnPct() + '"' + (ui.readOnly ? ' disabled' : '') + '></div>' +
        '<p class="hint" style="margin-top:5px">예산의 ' + warnPct() + '%를 넘으면 주의(노랑), 예산을 넘기면 초과(분홍)로 보여 줘요.</p>' +
        (ui.readOnly ? '' : '<div class="modal-acts" style="margin-top:7px"><button class="btn sm" type="button" data-act="budget-default-save">저장</button><button class="btn sm ghost" type="button" data-act="budget-default-reset">기본값(예산 없음 · ' + WARN_PCT_DEFAULT + '%)으로</button></div>') +
        (ui.budMsg ? '<p class="msg ' + (ui.budMsg.indexOf('err:') === 0 ? 'err' : '') + '">' + esc(ui.budMsg.replace(/^err:/, '')) + '</p>' : '') +
      '</div>' +
      '<div class="sec">' +
        '<h3>💾 데이터</h3>' +
        '<p class="hint">' + esc(syncText()) + '</p>' +
        '<div class="modal-acts"><button class="btn sm sub" type="button" data-act="backup-json">JSON 백업</button><button class="btn sm sub" type="button" data-act="csv-all">전체 CSV</button></div>' +
        '<p class="hint" style="margin-top:6px">기록 ' + state.txns.length + '건</p>' +
      '</div>' +
      '<div class="sec">' +
        '<h3>👨‍👩‍👧 사용 권한</h3>' +
        '<p class="hint">' + (cloud.me ? esc(cloud.me.name || cloud.me.id) + ' · ' + roleLabel(cloud.me.role) + (canEdit() ? ' — 기록 추가·수정·삭제 가능' : ' — 내역 보기만 가능') : '로그인 전') + '</p>' +
        '<p class="hint">관리자·보호자는 기록을 바꿀 수 있고, 아이·보기 전용 계정은 내역만 볼 수 있어요. 권한은 가족 허브에서 바꿔요.</p>' +
      '</div>';
  }
  function openSettings() {
    ui.setMsg = '';
    ui.catMsg = '';
    ui.budMsg = '';
    renderSettings();
    showModal('settingsModal');
    aiSyncShared();
  }
  function pickProvider(pid) {
    if (PROVIDER_ORDER.indexOf(pid) < 0) return;
    aiSetProvider(pid);
    ui.setMsg = '';
    renderSettings();
    toast(providerLabel(pid) + '를 기본 AI로 정했어요');
  }
  function saveKey() {
    var pid = aiProvider();
    var label = providerLabel(pid);
    var v = fieldVal('aiKeyInput').trim();
    if (!v) { ui.setMsg = 'err:키를 입력해 주세요.'; renderSettings(); return; }
    if (!canEdit()) { ui.setMsg = 'err:보기 전용 계정은 키를 바꿀 수 없어요.'; renderSettings(); return; }
    ui.setMsg = '저장하는 중…';
    renderSettings();
    aiSaveKey(pid, v).then(function (r) {
      if (!r.ok) { ui.setMsg = 'err:' + (r.error || '저장하지 못했어요.'); renderSettings(); return; }
      ui.setMsg = r.shared ? (label + ' 키를 저장했어요. 가족 모두 함께 써요.') : (label + ' 키를 이 기기에 저장했어요.');
      toast(r.shared ? '키를 저장하고 가족과 공유했어요' : '키를 저장했어요');
      renderSettings();
    });
  }
  function clearKey() {
    var pid = aiProvider();
    var label = providerLabel(pid);
    if (aiKeyOrigin(pid) === 'shared' && canEdit()) {
      if (!window.confirm('가족 모두가 함께 쓰는 ' + label + ' 키를 지울까요? 다른 기기에서도 이 키를 쓸 수 없게 됩니다.')) return;
    }
    aiClearKey(pid).then(function (r) {
      ui.setMsg = (r.ok ? label + ' 키를 지웠어요.' : 'err:이 기기에서는 지웠지만 가족 공유는 실패했어요');
      renderSettings();
      toast(label + ' 키를 지웠어요');
    });
  }
  function addCat() {
    if (ui.readOnly) return;
    var type = fieldVal('newCatType') || 'expense';
    var name = fieldVal('newCatName').trim().slice(0, 16);
    if (!name) { ui.catMsg = 'err:이름을 넣어 주세요.'; renderSettings(); return; }
    if (catsFor(type).indexOf(name) >= 0) { ui.catMsg = 'err:이미 있는 카테고리예요.'; renderSettings(); return; }
    if (!state.settings.customCats[type]) state.settings.customCats[type] = [];
    state.settings.customCats[type].push(name);
    markDirty('settings');
    ui.catMsg = '카테고리를 추가했어요.';
    renderSettings();
    renderAll();
  }
  function delCat(type, name) {
    if (ui.readOnly) return;
    var list = state.settings.customCats[type] || [];
    var out = [];
    for (var i = 0; i < list.length; i++) if (list[i] !== name) out.push(list[i]);
    state.settings.customCats[type] = out;
    markDirty('settings');
    ui.catMsg = '카테고리를 지웠어요. (기존 내역은 그대로 남아요)';
    renderSettings();
    renderAll();
  }
  function backupJson() {
    downloadText('가계부_백업_' + todayStr() + '.json', JSON.stringify({ txns: state.txns, settings: state.settings }, null, 2), 'application/json');
    toast('JSON 백업을 내려받았어요');
  }


  /* 내보내기 */
  L.renderSettings = renderSettings;
  L.openSettings = openSettings;
  L.saveKey = saveKey;
  L.clearKey = clearKey;
  L.pickProvider = pickProvider;
  L.addCat = addCat;
  L.delCat = delCat;
  L.backupJson = backupJson;
})();
