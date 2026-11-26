/* 가계부 · sheet — CSV/TSV 내보내기 · 시트 연동 모달 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function markDirty() { var f = L.markDirty; return f.apply(this, arguments); }
  function monthTxns() { var f = L.monthTxns; return f.apply(this, arguments); }
  function renderAll() { var f = L.renderAll; return f.apply(this, arguments); }
  function typeLabel() { var f = L.typeLabel; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var catTypeDefault = L.catTypeDefault;
  var esc = L.esc;
  var makeTxn = L.makeTxn;
  var monthLabel = L.monthLabel;
  var normMethod = L.normMethod;
  var normType = L.normType;
  var pad2 = L.pad2;
  var showModal = L.showModal;
  var state = L.state;   /* 다른 모듈 값 */
  var toast = L.toast;
  var todayStr = L.todayStr;
  var ui = L.ui;   /* 다른 모듈 값 */
  var won = L.won;

  /* ============================================================
     CSV / TSV
     ============================================================ */
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  var CSV_HEAD = ['날짜', '구분', '카테고리', '내용', '금액', '결제수단', '메모'];
  function txToRow(t) { return [t.date, typeLabel(t), t.category, t.title, t.amount, t.method, t.memo || '']; }
  function rowsToCsv(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var line = [];
      for (var j = 0; j < rows[i].length; j++) line.push(csvCell(rows[i][j]));
      out.push(line.join(','));
    }
    return out.join('\r\n');
  }
  function rowsToTsv(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      var line = [];
      for (var j = 0; j < rows[i].length; j++) line.push(String(rows[i][j] == null ? '' : rows[i][j]).replace(/\t/g, ' ').replace(/\r?\n/g, ' '));
      out.push(line.join('\t'));
    }
    return out.join('\n');
  }
  function downloadText(name, text, mime) {
    var isCsv = !mime || mime.indexOf('csv') >= 0;
    var blob = new Blob([(isCsv ? '\ufeff' : '') + text], { type: mime || 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }
  function exportCsv(scope) {
    var list = scope === 'all' ? state.txns.slice() : monthTxns(ui.month);
    if (!list.length) { toast('내보낼 내역이 없어요.', true); return; }
    list.sort(function (a, b) { return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.createdAt - b.createdAt; });
    var rows = [CSV_HEAD];
    for (var i = 0; i < list.length; i++) rows.push(txToRow(list[i]));
    var name = '가계부_' + (scope === 'all' ? '전체' : ui.month) + '_' + todayStr() + '.csv';
    downloadText(name, rowsToCsv(rows));
    toast(list.length + '건을 CSV로 내려받았어요');
  }
  function copyTsv() {
    var list = monthTxns(ui.month).slice();
    if (!list.length) {
      list = state.txns.slice();
    }
    if (!list.length) { toast('복사할 내역이 없어요.', true); return; }
    list.sort(function (a, b) { return (a.date < b.date ? -1 : a.date > b.date ? 1 : 0) || a.createdAt - b.createdAt; });
    var rows = [CSV_HEAD];
    for (var i = 0; i < list.length; i++) rows.push(txToRow(list[i]));
    var text = rowsToTsv(rows);
    var done = function () {
      ui.sheet.msg = list.length + '건을 복사했어요. Google Sheets에서 A1 셀을 골라 붙여넣기(Ctrl/⌘+V) 하세요.';
      ui.sheet.err = '';
      renderSheet();
      toast('복사했어요 · 시트에 붙여넣기');
    };
    var fail = function () {
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      if (ok) { done(); return; }
      ui.sheet.msg = '';
      ui.sheet.err = '자동 복사가 막혀 있어요. 아래 상자에서 전체 선택해 복사해 주세요.';
      var pre = $('tsvFallback');
      if (pre) { pre.hidden = false; pre.value = text; pre.select(); }
      renderSheet();
      window.setTimeout(function () { var p = $('tsvFallback'); if (p) { p.value = text; p.hidden = false; p.select(); } }, 30);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else {
      fail();
    }
  }

  /* ---------- 가져오기 ---------- */
  function detectDelim(text) {
    var line = String(text).split(/\r?\n/)[0] || '';
    var tabs = (line.match(/\t/g) || []).length;
    var commas = (line.match(/,/g) || []).length;
    return tabs > commas ? '\t' : ',';
  }
  function parseDelimited(text, delim) {
    text = String(text || '').replace(/^\ufeff/, '');
    var rows = [], row = [], cur = '', inQ = false;
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQ) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cur += '"'; i++; }
          else inQ = false;
        } else cur += ch;
      } else if (ch === '"') {
        inQ = true;
      } else if (ch === delim) {
        row.push(cur); cur = '';
      } else if (ch === '\n') {
        row.push(cur); cur = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        /* 무시 */
      } else {
        cur += ch;
      }
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    var out = [];
    for (var r = 0; r < rows.length; r++) {
      var empty = true;
      for (var c = 0; c < rows[r].length; c++) if (String(rows[r][c]).trim() !== '') { empty = false; break; }
      if (!empty) out.push(rows[r].map(function (x) { return String(x).trim(); }));
    }
    return out;
  }
  function guessMap(cols) {
    var map = { date: -1, type: -1, category: -1, title: -1, amount: -1, method: -1, memo: -1 };
    var score = function (h) {
      var s = String(h || '').replace(/\s+/g, '').toLowerCase();
      return s;
    };
    for (var i = 0; i < cols.length; i++) {
      var h = score(cols[i]);
      if (map.date < 0 && /날짜|일자|거래일|date/.test(h)) map.date = i;
      else if (map.type < 0 && /구분|유형|수입지출|type/.test(h)) map.type = i;
      else if (map.category < 0 && /카테고리|분류|category/.test(h)) map.category = i;
      else if (map.amount < 0 && /금액|amount|지출액|수입액|price/.test(h)) map.amount = i;
      else if (map.method < 0 && /결제수단|수단|method|카드/.test(h)) map.method = i;
      else if (map.memo < 0 && /메모|비고|note|적요/.test(h)) map.memo = i;
      else if (map.title < 0 && /내용|항목|적요|상호|title|desc|memo/.test(h)) map.title = i;
    }
    if (map.title < 0) {
      for (var j = 0; j < cols.length; j++) {
        if (j === map.date || j === map.type || j === map.category || j === map.amount || j === map.method || j === map.memo) continue;
        map.title = j; break;
      }
    }
    return map;
  }
  function normDateCell(v) {
    var s = String(v || '').trim();
    var m = /^(\d{4})[-./년\s]+(\d{1,2})[-./월\s]+(\d{1,2})/.exec(s);
    if (m) return m[1] + '-' + pad2(Number(m[2])) + '-' + pad2(Number(m[3]));
    m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (m) return m[1] + '-' + m[2] + '-' + m[3];
    var d = new Date(s);
    if (!isNaN(d.getTime())) return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    return '';
  }
  function normAmountCell(v) {
    var s = String(v || '').replace(/[₩원,\s]/g, '');
    var neg = /^\(.*\)$/.test(s) || /^-/.test(s);
    s = s.replace(/[()\-]/g, '');
    var n = parseFloat(s);
    if (!isFinite(n)) return 0;
    return Math.round(Math.abs(n));
  }
  function buildImportPreview(mapOverride) {
    var sh = ui.sheet;
    var map = mapOverride || readMapFromDom();
    sh.map = map;
    var out = [];
    for (var i = 1; i < sh.rows.length; i++) {
      var r = sh.rows[i];
      var date = map.date >= 0 ? normDateCell(r[map.date]) : '';
      var type = map.type >= 0 ? normType(r[map.type]) : '';
      var category = map.category >= 0 ? String(r[map.category] || '').trim() : '';
      var title = map.title >= 0 ? String(r[map.title] || '').trim() : '';
      var amount = map.amount >= 0 ? normAmountCell(r[map.amount]) : 0;
      var method = map.method >= 0 ? normMethod(r[map.method]) : '신용카드';
      var memo = map.memo >= 0 ? String(r[map.memo] || '').trim() : '';
      if (!type) {
        if (/급여|월급|이자|수입|입금|용돈/.test(title)) type = 'income';
        else if (/월세|관리비|보험|구독|통신|정기/.test(title + category)) type = 'fixed';
        else type = 'expense';
      }
      out.push({ date: date, type: type, category: category || catTypeDefault(type), title: title, amount: amount, method: method, memo: memo, ok: !!date && amount > 0 });
    }
    sh.preview = out;
    return out;
  }
  function readMapFromDom() {
    var map = {};
    var fields = ['date', 'type', 'category', 'title', 'amount', 'method', 'memo'];
    for (var i = 0; i < fields.length; i++) {
      var el = $('map_' + fields[i]);
      map[fields[i]] = el ? Number(el.value) : -1;
    }
    return map;
  }
  function importRows() {
    if (ui.readOnly) { toast('보기 전용 계정이라 가져올 수 없어요.', true); return; }
    var preview = buildImportPreview();
    var added = 0, skipped = 0, dup = 0;
    var seen = {};
    for (var i = 0; i < state.txns.length; i++) {
      var t = state.txns[i];
      seen[t.date + '|' + t.type + '|' + t.title + '|' + t.amount] = 1;
    }
    for (var j = 0; j < preview.length; j++) {
      var p = preview[j];
      if (!p.ok) { skipped++; continue; }
      var key = p.date + '|' + p.type + '|' + p.title + '|' + p.amount;
      if (seen[key]) { dup++; continue; }
      seen[key] = 1;
      state.txns.push(makeTxn(p));
      added++;
    }
    if (!added) {
      ui.sheet.err = '가져올 수 있는 행이 없어요. 날짜와 금액 열을 확인해 주세요. (잘못된 행 ' + skipped + ' · 중복 ' + dup + ')';
      ui.sheet.msg = '';
      renderSheet();
      return;
    }
    markDirty('txns');
    ui.sheet.step = 'done';
    ui.sheet.msg = added + '건을 가져왔어요' + (skipped ? ' · 잘못된 행 ' + skipped + '건 제외' : '') + (dup ? ' · 중복 ' + dup + '건 건너뜀' : '');
    ui.sheet.err = '';
    renderAll();
    renderSheet();
    toast(added + '건을 가져왔어요');
  }
  function loadImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || '');
      var delim = detectDelim(text);
      var rows = parseDelimited(text, delim);
      if (rows.length < 2) {
        ui.sheet.err = '행이 너무 적거나 형식이 맞지 않아요. 첫 줄은 제목, 그 아래에 내역이 있어야 해요.';
        ui.sheet.step = 'import';
        renderSheet();
        return;
      }
      ui.sheet.rows = rows;
      ui.sheet.cols = rows[0];
      ui.sheet.map = guessMap(rows[0]);
      ui.sheet.name = file.name || '';
      ui.sheet.err = '';
      ui.sheet.msg = '';
      ui.sheet.step = 'map';
      ui.sheet.preview = buildImportPreview(ui.sheet.map);
      renderSheet();
    };
    reader.onerror = function () {
      ui.sheet.err = '파일을 읽지 못했어요.';
      renderSheet();
    };
    reader.readAsText(file, 'utf-8');
  }

  /* ============================================================
     시트 모달
     ============================================================ */
  function renderSheet() {
    var body = $('sheetBody');
    if (!body) return;
    var sh = ui.sheet;
    var m = ui.month;
    var html = '';
    html += '<div class="sec" style="border-top:none;padding-top:0;margin-top:0">' +
      '<h3>📤 내보내기</h3>' +
      '<p class="hint">Google Sheets·Excel에서 한글이 깨지지 않도록 UTF-8 BOM으로 저장해요.</p>' +
      '<div class="modal-acts"><button class="btn sm" type="button" data-act="csv-month">📄 ' + monthLabel(m) + ' CSV</button>' +
      '<button class="btn sm sub" type="button" data-act="csv-all">🗂 전체 CSV</button></div>' +
      '<div class="modal-acts"><button class="btn sm gold" type="button" data-act="tsv-copy">📋 Google Sheets용 복사(TSV)</button></div>' +
      '<p class="hint" style="margin-top:5px">복사한 뒤 Google Sheets에서 A1 셀을 고르고 붙여넣으면 표가 바로 만들어져요.</p>' +
      '<textarea id="tsvFallback" class="hint" hidden style="width:100%;min-height:90px;border-radius:10px;border:2px solid #ece2d2;font-size:10px;font-family:monospace;padding:6px"></textarea>' +
      '</div>';
    html += '<div class="sec"><h3>📥 불러오기</h3>' +
      '<p class="hint">Google Sheets에서 <b>파일 → 다운로드 → CSV</b>(또는 TSV/탭으로 구분된 값)로 받은 파일을 올려 주세요. 열을 자동으로 맞추고 미리 보여드려요.</p>' +
      '<input id="impFile" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" style="font-size:12px;font-weight:800">' +
      (sh.name ? '<p class="msg">' + esc(sh.name) + ' · ' + Math.max(0, sh.rows.length - 1) + '행</p>' : '') +
      '</div>';
    if (sh.step === 'map' && sh.cols.length) {
      var htmlOpts = function (sel) {
        var o = '<option value="-1">— 없음 —</option>';
        for (var i = 0; i < sh.cols.length; i++) o += '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + esc(sh.cols[i] || ('열 ' + (i + 1))) + '</option>';
        return o;
      };
      html += '<div class="sec"><h3>열 맞추기</h3><div class="map-grid">' +
        '<label>날짜<select id="map_date" data-act="map-change">' + htmlOpts(sh.map.date) + '</select></label>' +
        '<label>구분<select id="map_type" data-act="map-change">' + htmlOpts(sh.map.type) + '</select></label>' +
        '<label>카테고리<select id="map_category" data-act="map-change">' + htmlOpts(sh.map.category) + '</select></label>' +
        '<label>내용<select id="map_title" data-act="map-change">' + htmlOpts(sh.map.title) + '</select></label>' +
        '<label>금액<select id="map_amount" data-act="map-change">' + htmlOpts(sh.map.amount) + '</select></label>' +
        '<label>결제수단<select id="map_method" data-act="map-change">' + htmlOpts(sh.map.method) + '</select></label>' +
        '<label>메모<select id="map_memo" data-act="map-change">' + htmlOpts(sh.map.memo) + '</select></label>' +
        '</div>';
      var prev = sh.preview || [];
      var okCount = 0, dupCount = 0;
      var seenKeys = {};
      for (var sk = 0; sk < state.txns.length; sk++) {
        var st0 = state.txns[sk];
        seenKeys[st0.date + '|' + st0.type + '|' + st0.title + '|' + st0.amount] = 1;
      }
      for (var k = 0; k < prev.length; k++) {
        if (!prev[k].ok) continue;
        okCount++;
        if (seenKeys[prev[k].date + '|' + prev[k].type + '|' + prev[k].title + '|' + prev[k].amount]) dupCount++;
      }
      var newCount = okCount - dupCount;
      html += '<p class="hint" style="margin-top:7px">' + prev.length + '행 중 <b>' + okCount + '행</b>을 읽을 수 있어요.' +
        (dupCount ? ' 이미 있는 내역 <b>' + dupCount + '건</b>은 건너뛰고 <b>' + newCount + '건</b>을 추가해요.' : '') + '</p>';
      var trows = '';
      for (var p = 0; p < prev.length && p < 5; p++) {
        var r = prev[p];
        trows += '<tr><td>' + esc(r.date || '—') + '</td><td>' + esc(typeLabel(r)) + '</td><td>' + esc(r.category) + '</td><td>' + esc(r.title) + '</td><td>' + (r.amount ? won(r.amount) : '—') + '</td><td>' + esc(r.method) + '</td></tr>';
      }
      html += '<div style="overflow:auto;margin-top:7px"><table class="prev-table"><thead><tr><th>날짜</th><th>구분</th><th>카테고리</th><th>내용</th><th>금액</th><th>결제수단</th></tr></thead><tbody>' + trows + '</tbody></table></div>' +
        '<div class="modal-acts"><button class="btn wide" type="button" data-act="imp-apply" ' + (ui.readOnly ? 'disabled' : '') + '>✓ ' + newCount + '건 가져오기</button></div>' +
        '<p class="hint">이미 있는 내역(날짜·구분·내용·금액이 같음)은 건너뛰어요.</p>' +
        '</div>';
    }
    if (sh.msg) html += '<p class="msg">' + esc(sh.msg) + '</p>';
    if (sh.err) html += '<p class="msg err">' + esc(sh.err) + '</p>';
    html += '<div class="sec"><h3>💡 스프레드시트와 함께 쓰기</h3><p class="hint">가계부에 기록하면 가족 저장소(<b>kids-dashboard-data/ledger/</b>)에 자동 저장돼요. 시트로 옮긴 뒤 정리해도 원본은 그대로 남아요. 반대로 시트에서 정리한 내역을 다시 불러올 때는 중복을 건너뛰니 안심하세요.</p></div>';
    body.innerHTML = html;
  }
  function openSheet() {
    ui.sheet = { step: '', msg: '', err: '', name: '', cols: [], rows: [], map: {}, preview: [] };
    renderSheet();
    showModal('sheetModal');
  }


  /* 내보내기 */
  L.csvCell = csvCell;
  L.CSV_HEAD = CSV_HEAD;
  L.txToRow = txToRow;
  L.rowsToCsv = rowsToCsv;
  L.rowsToTsv = rowsToTsv;
  L.downloadText = downloadText;
  L.exportCsv = exportCsv;
  L.copyTsv = copyTsv;
  L.detectDelim = detectDelim;
  L.parseDelimited = parseDelimited;
  L.guessMap = guessMap;
  L.normDateCell = normDateCell;
  L.normAmountCell = normAmountCell;
  L.buildImportPreview = buildImportPreview;
  L.readMapFromDom = readMapFromDom;
  L.importRows = importRows;
  L.loadImportFile = loadImportFile;
  L.renderSheet = renderSheet;
  L.openSheet = openSheet;
})();
