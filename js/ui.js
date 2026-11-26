/* 가계부 · ui — 화면 그리기 (탭 · 내역 · 달력 · 통계 · 고정비/예산) */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function applyUserUi() { var f = L.applyUserUi; return f.apply(this, arguments); }
  function budgetFor() { var f = L.budgetFor; return f.apply(this, arguments); }
  function budgetPct() { var f = L.budgetPct; return f.apply(this, arguments); }
  function catBreakdown() { var f = L.catBreakdown; return f.apply(this, arguments); }
  function filteredList() { var f = L.filteredList; return f.apply(this, arguments); }
  function lastMonths() { var f = L.lastMonths; return f.apply(this, arguments); }
  function methodBreakdown() { var f = L.methodBreakdown; return f.apply(this, arguments); }
  function monthTotals() { var f = L.monthTotals; return f.apply(this, arguments); }
  function monthTxns() { var f = L.monthTxns; return f.apply(this, arguments); }
  function renderSyncPill() { var f = L.renderSyncPill; return f.apply(this, arguments); }
  function warnPct() { var f = L.warnPct; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var METHODS = L.METHODS;   /* 다른 모듈 값 */
  var TYPES = L.TYPES;   /* 다른 모듈 값 */
  var UI_KEY = L.UI_KEY;   /* 다른 모듈 값 */
  var allCatsForFilters = L.allCatsForFilters;
  var catEmoji = L.catEmoji;
  var dayLabel = L.dayLabel;
  var daysInMonth = L.daysInMonth;
  var esc = L.esc;
  var firstDow = L.firstDow;
  var icoOf = L.icoOf;
  var lsGet = L.lsGet;
  var lsSet = L.lsSet;
  var monthLabel = L.monthLabel;
  var num = L.num;
  var pad2 = L.pad2;
  var state = L.state;   /* 다른 모듈 값 */
  var thisMonth = L.thisMonth;
  var todayLine = L.todayLine;
  var todayStr = L.todayStr;
  var ui = L.ui;   /* 다른 모듈 값 */
  var won = L.won;
  var wonW = L.wonW;
  var ymOf = L.ymOf;

  /* ============================================================
     그리기: 공통
     ============================================================ */
  function renderSyncPill2() { renderSyncPill(); }

  function renderHeader() {
    var tl = $('todayLine'); if (tl) tl.textContent = todayLine();
    var ml = $('monthLine');
    if (ml) {
      var tot = monthTotals(thisMonth());
      ml.textContent = '이번 달 ' + tot.count + '건 · ' + wonW(tot.expense) + ' 지출';
    }
  }

  function renderTabs() {
    var bar = $('tabBar');
    if (!bar) return;
    var cnt = monthTxns(ui.month).length;
    var defs = [
      { k: 'list', n: '내역', badge: cnt },
      { k: 'cal', n: '달력' },
      { k: 'stats', n: '통계' },
      { k: 'fixed', n: '고정비/예산' }
    ];
    var html = '';
    for (var i = 0; i < defs.length; i++) {
      var d = defs[i];
      html += '<button class="tab' + (ui.tab === d.k ? ' on' : '') + '" type="button" data-act="tab-set" data-tab="' + d.k + '" aria-pressed="' + (ui.tab === d.k) + '">' +
        d.n + (d.badge ? '<b>' + d.badge + '</b>' : '') + '</button>';
    }
    bar.innerHTML = html;
  }

  function renderSummary() {
    var card = $('sumCard');
    if (!card) return;
    var m = ui.month;
    var t = monthTotals(m);
    var budget = budgetFor(m);
    var pct = budgetPct(t.expense, budget);
    var fillCls = pct > 100 ? ' over' : pct >= warnPct() ? ' warn' : '';
    var netCls = t.net < 0 ? 'neg' : 'pos';
    var isThis = m === thisMonth();
    var remain = budget > 0 ? budget - t.expense : 0;
    card.innerHTML =
      '<div class="sum-top">' +
        '<button class="mnav" type="button" data-act="month-prev" aria-label="이전 달">‹</button>' +
        '<div class="mnow"><b>' + monthLabel(m) + '</b><span class="' + (isThis ? '' : 'muted') + '">' + (isThis ? '이번 달' : '지난 기록') + '</span></div>' +
        '<button class="mnav" type="button" data-act="month-next" aria-label="다음 달">›</button>' +
        '<button class="mtoday" type="button" data-act="month-now">오늘</button>' +
      '</div>' +
      '<div class="sum-grid">' +
        '<div class="sum-box in"><small>수입</small><strong class="num">' + won(t.income) + '</strong></div>' +
        '<div class="sum-box out"><small>지출</small><strong class="num">' + won(t.expense) + '</strong>' + (t.fixed ? '<em>고정 ' + won(t.fixed) + '</em>' : '') + '</div>' +
        '<div class="sum-box net"><small>잔액</small><strong class="num ' + netCls + '">' + (t.net < 0 ? '-' : '') + won(Math.abs(t.net)) + '</strong></div>' +
        '<div class="sum-box bud"><small>예산 사용</small><strong class="num">' + (budget > 0 ? pct + '%' : '예산 없음') + '</strong></div>' +
      '</div>' +
      '<div class="budbar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.min(100, Math.max(0, pct)) + '"><div class="budfill' + fillCls + '" style="width:' + Math.min(100, Math.max(0, pct)) + '%"></div></div>' +
      '<div class="budfoot">' +
        (budget > 0
          ? '예산 <b>' + wonW(budget) + '</b> 중 <b>' + wonW(t.expense) + '</b> 사용' + (remain >= 0 ? ' · <b>' + wonW(remain) + '</b> 남음' : ' · <b>' + wonW(-remain) + '</b> 초과')
          : '이번 달 예산을 정해두면 사용률을 볼 수 있어요') +
        (ui.readOnly ? '' : '<button class="link-btn grow" type="button" data-act="budget-edit">예산 바꾸기</button>') +
      '</div>';
  }

  /* ============================================================
     그리기: 내역
     ============================================================ */
  function typeLabel(t) { return (TYPES[t.type] && TYPES[t.type].label) || '지출'; }
  function amountText(t) {
    var sign = t.type === 'income' ? '+' : '-';
    return sign + won(t.amount);
  }
  function txRowHtml(t) {
    var cls = ui.readOnly ? 'tx ro' : 'tx';
    var act = ui.readOnly ? '' : ' data-act="tx-edit" data-id="' + esc(t.id) + '"';
    var tag = t.type === 'fixed' ? '<span class="tx-tag">고정</span>' : '';
    var memo = t.memo ? ' · ' + esc(t.memo.slice(0, 24)) : '';
    return '<div class="' + cls + '"' + act + ' role="button" tabindex="' + (ui.readOnly ? '-1' : '0') + '">' +
      '<span class="tx-ico" aria-hidden="true">' + catEmoji(t.category) + '</span>' +
      '<span class="tx-body"><b>' + esc(t.title) + tag + '</b><span class="tx-meta">' + esc(t.category) + ' · ' + esc(t.method) + memo + '</span></span>' +
      '<span class="tx-amt num ' + (t.type === 'income' ? 'in' : 'out') + '">' + amountText(t) + '</span>' +
      '</div>';
  }
  function listParts() {
    var list = filteredList();
    var totalOut = 0, totalIn = 0;
    for (var z = 0; z < list.length; z++) {
      if (list[z].type === 'income') totalIn += list[z].amount; else totalOut += list[z].amount;
    }
    var body = '';
    if (!list.length) {
      body = '<div class="empty">' + (monthTxns(ui.month).length ? '조건에 맞는 내역이 없어요.<br>필터를 바꿔 보세요.' : '이 달에 기록한 내역이 없어요.<br>' + (ui.readOnly ? '보기 전용 계정이에요.' : '아래 <b>＋ 기록</b>으로 첫 기록을 남겨 보세요.')) + '</div>';
    } else if (ui.sort === 'new') {
      var lastDate = '';
      for (var i = 0; i < list.length; i++) {
        var t = list[i];
        if (t.date !== lastDate) {
          var dayList = [];
          for (var j = i; j < list.length; j++) { if (list[j].date === t.date) dayList.push(list[j]); else break; }
          var dIn = 0, dOut = 0;
          for (var k = 0; k < dayList.length; k++) { if (dayList[k].type === 'income') dIn += dayList[k].amount; else dOut += dayList[k].amount; }
          body += '<div class="day-head"><b>' + dayLabel(t.date) + '</b>' +
            (dIn ? '<i>+' + won(dIn) + '</i>' : '') +
            (dOut ? '<em>-' + won(dOut) + '</em>' : '') +
            (t.date === todayStr() ? '<span class="wk">오늘</span>' : '') + '</div>';
          lastDate = t.date;
        }
        body += txRowHtml(t);
      }
    } else {
      for (var n = 0; n < list.length; n++) body += txRowHtml(list[n]);
    }
    return { list: list, body: body, totalIn: totalIn, totalOut: totalOut };
  }

  function listNoteHtml(p) {
    return '<span>합계 <b>- ' + won(p.totalOut) + '</b></span>' + (p.totalIn ? '<span>· <b>+ ' + won(p.totalIn) + '</b></span>' : '') +
      '<span style="margin-left:auto">' + p.list.length + '건</span>';
  }

  function renderList() {
    var host = $('viewList');
    if (!host) return;
    var cats = allCatsForFilters(ui.typeFilter);
    var present = monthTxns(ui.month);
    for (var p = 0; p < present.length; p++) {
      if (ui.typeFilter !== 'all' && present[p].type !== ui.typeFilter) continue;
      if (cats.indexOf(present[p].category) < 0) cats.push(present[p].category);
    }
    var chips = '<div class="chips" aria-label="카테고리 필터">';
    chips += '<button class="chip' + (Object.keys(ui.cats).length ? '' : ' on') + '" type="button" data-act="cat-clear">전체</button>';
    for (var c = 0; c < cats.length; c++) {
      var on = !!ui.cats[cats[c]];
      chips += '<button class="chip' + (on ? ' on' : '') + '" type="button" data-act="cat-toggle" data-cat="' + esc(cats[c]) + '">' + catEmoji(cats[c]) + ' ' + esc(cats[c]) + '</button>';
    }
    chips += '</div>';

    var seg = '<div class="seg" role="group" aria-label="구분 필터">';
    var types = [{ k: 'all', n: '전체' }, { k: 'expense', n: '지출' }, { k: 'fixed', n: '고정비' }, { k: 'income', n: '수입' }];
    for (var s = 0; s < types.length; s++) {
      seg += '<button type="button" class="' + (ui.typeFilter === types[s].k ? 'on' : '') + '" data-act="type-set" data-type="' + types[s].k + '">' + types[s].n + '</button>';
    }
    seg += '</div>';

    var methodSel = '<select class="sel" id="methodSel" aria-label="결제수단 필터"><option value="all">결제수단 전체</option>';
    for (var mi = 0; mi < METHODS.length; mi++) methodSel += '<option value="' + METHODS[mi] + '"' + (ui.method === METHODS[mi] ? ' selected' : '') + '>' + METHODS[mi] + '</option>';
    methodSel += '</select>';

    var sortSel = '<select class="sel" id="sortSel" aria-label="정렬">' +
      '<option value="new"' + (ui.sort === 'new' ? ' selected' : '') + '>최신순</option>' +
      '<option value="big"' + (ui.sort === 'big' ? ' selected' : '') + '>금액 큰 순</option>' +
      '<option value="small"' + (ui.sort === 'small' ? ' selected' : '') + '>금액 작은 순</option>' +
      '</select>';

    var lp = listParts();
    host.innerHTML = '<section class="card">' +
      '<div class="card-head"><h2>내역 <span class="count" id="listCount">' + lp.list.length + '</span><span class="sub">' + monthLabel(ui.month) + '</span></h2>' +
      '<span class="head-note">' + (ui.readOnly ? '👀 보기 전용' : '행을 누르면 수정할 수 있어요') + '</span></div>' +
      '<div class="filters">' +
        '<div class="frow"><input class="search" id="searchInput" type="search" placeholder="🔍 내용·카테고리·결제수단 검색" value="' + esc(ui.q) + '" autocomplete="off" aria-label="검색">' + sortSel + '</div>' +
        '<div class="frow">' + seg + methodSel + '</div>' +
        chips +
      '</div>' +
      '<div class="tx-list" id="txBodyWrap">' + lp.body + '</div>' +
      '<div class="list-note" id="listNote">' + listNoteHtml(lp) + '</div>' +
      '</section>';
  }

  function refreshList() {
    var wrap = $('txBodyWrap');
    if (!wrap) { renderList(); return; }
    var lp = listParts();
    wrap.innerHTML = lp.body;
    var cnt = $('listCount'); if (cnt) cnt.textContent = lp.list.length;
    var note = $('listNote'); if (note) note.innerHTML = listNoteHtml(lp);
  }

  /* ============================================================
     그리기: 달력
     ============================================================ */
  function dayTotals(m, day) {
    var ds = m + '-' + pad2(day);
    var inSum = 0, outSum = 0;
    for (var i = 0; i < state.txns.length; i++) {
      var t = state.txns[i];
      if (t.date !== ds) continue;
      if (t.type === 'income') inSum += t.amount; else outSum += t.amount;
    }
    return { date: ds, inSum: inSum, outSum: outSum };
  }
  function renderCalendar() {
    var host = $('viewCal');
    if (!host) return;
    var m = ui.month;
    var dim = daysInMonth(m);
    var first = firstDow(m);
    var today = todayStr();
    var cells = '';
    for (var e = 0; e < first; e++) cells += '<div class="cday empty" aria-hidden="true"></div>';
    for (var d = 1; d <= dim; d++) {
      var ds = m + '-' + pad2(d);
      var dt = dayTotals(m, d);
      var dow = (first + d - 1) % 7;
      var cls = 'cday' + (ds === today ? ' today' : '') + (ds === ui.calSel ? ' sel' : '');
      cells += '<button class="' + cls + '" type="button" data-act="cal-day" data-date="' + ds + '" aria-label="' + dayLabel(ds) + '">' +
        '<span class="d" style="' + (ds !== today && dow === 0 ? 'color:#d9536a' : '') + (ds !== today && dow === 6 ? 'color:#3d7fc4' : '') + '">' + d + '</span>' +
        (dt.inSum ? '<span class="ci">+' + won(dt.inSum) + '</span>' : '') +
        (dt.outSum ? '<span class="co">-' + won(dt.outSum) + '</span>' : '') +
        '</button>';
    }
    var tot = monthTotals(m);
    var selHtml = '';
    if (ui.calSel && ymOf(ui.calSel) === m) {
      var dayList = [];
      for (var i = 0; i < state.txns.length; i++) if (state.txns[i].date === ui.calSel) dayList.push(state.txns[i]);
      dayList.sort(function (a, b) { return b.createdAt - a.createdAt; });
      var rows = '';
      for (var j = 0; j < dayList.length; j++) rows += txRowHtml(dayList[j]);
      selHtml = '<section class="card" style="margin-top:10px">' +
        '<div class="card-head"><h2>' + dayLabel(ui.calSel) + ' <span class="count">' + dayList.length + '</span></h2>' +
        (ui.readOnly ? '' : '<button class="btn xs sub" type="button" data-act="tx-add" data-date="' + esc(ui.calSel) + '" style="margin-left:auto">＋ 이 날짜에 추가</button>') +
        '</div>' +
        '<div class="tx-list">' + (rows || '<div class="empty">이 날은 기록이 없어요.</div>') + '</div>' +
        '</section>';
    } else {
      selHtml = '<p class="hint" style="margin-top:9px">날짜를 누르면 그날 내역을 볼 수 있어요.</p>';
    }
    host.innerHTML = '<section class="card">' +
      '<div class="cal-head">' +
        '<button class="mnav" type="button" data-act="month-prev" aria-label="이전 달">‹</button>' +
        '<div class="mnow"><b>' + monthLabel(m) + '</b><span class="' + (m === thisMonth() ? '' : 'muted') + '">' + (m === thisMonth() ? '이번 달' : '지난 기록') + '</span></div>' +
        '<button class="mnav" type="button" data-act="month-next" aria-label="다음 달">›</button>' +
      '</div>' +
      '<div class="cal-dow"><span class="sun">일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span class="sat">토</span></div>' +
      '<div class="cal-grid">' + cells + '</div>' +
      '<div class="cal-sum"><span>수입 <b class="in">' + won(tot.income) + '</b></span><span>지출 <b class="out">' + won(tot.expense) + '</b></span><span>잔액 <b>' + (tot.net < 0 ? '-' : '') + won(Math.abs(tot.net)) + '</b></span></div>' +
      '</section>' + selHtml;
  }

  /* ============================================================
     그리기: 통계
     ============================================================ */
  function barRows(items, total, unit) {
    if (!items.length) return '<div class="empty">이 달에는 해당 내역이 없어요.</div>';
    var html = '';
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      var pct = total > 0 ? Math.round(it.amount / total * 100) : 0;
      html += '<div class="bar-row"><span class="bar-name">' + icoOf(it.name) + ' ' + esc(it.name) + '</span>' +
        '<span class="bar-track"><i style="width:' + Math.max(2, pct) + '%"></i></span>' +
        '<span class="bar-val num">' + won(it.amount) + '<small> · ' + pct + '%</small></span></div>';
    }
    return html;
  }
  function renderStats() {
    var host = $('viewStats');
    if (!host) return;
    var m = ui.month;
    var list = monthTxns(m);
    var tot = monthTotals(m);
    var cats = catBreakdown(list, ['expense', 'fixed']);
    var methods = methodBreakdown(list, ['expense', 'fixed']);
    var varShareNum = tot.expense > 0 ? Math.round(tot.variable / tot.expense * 100) : 0;
    var fixShareNum = 100 - varShareNum;

    var months = lastMonths(m, 6);
    var series = [];
    var maxV = 1;
    for (var i = 0; i < months.length; i++) {
      var t = monthTotals(months[i]);
      series.push({ m: months[i], income: t.income, expense: t.expense });
      if (t.income > maxV) maxV = t.income;
      if (t.expense > maxV) maxV = t.expense;
    }
    var chart = '<div class="chart">';
    for (var j = 0; j < series.length; j++) {
      var s = series[j];
      var hi = s.income > 0 ? Math.max(3, Math.round(s.income / maxV * 100)) : 0;
      var ho = s.expense > 0 ? Math.max(3, Math.round(s.expense / maxV * 100)) : 0;
      chart += '<div class="ch-col" title="' + monthLabel(s.m) + ' 수입 ' + won(s.income) + ' / 지출 ' + won(s.expense) + '">' +
        '<div class="ch-bars"><i class="ch-in" style="height:' + hi + '%"></i><i class="ch-out" style="height:' + ho + '%"></i></div>' +
        '<span class="ch-lab">' + Number(s.m.slice(5, 7)) + '월</span>' +
        '<span class="ch-val">' + (s.income || s.expense ? (Math.round(s.income / 10000) + '/' + Math.round(s.expense / 10000)) : '·') + '</span>' +
        '</div>';
    }
    chart += '</div>';

    var avgIn = 0, avgOut = 0, nMon = 0;
    for (var k = 0; k < series.length; k++) { if (series[k].income || series[k].expense) { avgIn += series[k].income; avgOut += series[k].expense; nMon++; } }
    if (nMon) { avgIn = Math.round(avgIn / nMon); avgOut = Math.round(avgOut / nMon); }

    host.innerHTML = '<div class="stats-wrap">' +
      '<section class="card">' +
        '<div class="card-head"><h2>📊 ' + monthLabel(m) + ' 통계</h2><span class="head-note">' + tot.count + '건</span></div>' +
        '<div class="stat-pair">' +
          '<div class="stat-box"><small>총 수입</small><strong style="color:#0b7a52">' + wonW(tot.income) + '</strong></div>' +
          '<div class="stat-box"><small>총 지출</small><strong style="color:#c33f57">' + wonW(tot.expense) + '</strong></div>' +
          '<div class="stat-box"><small>고정비</small><strong>' + wonW(tot.fixed) + '</strong></div>' +
          '<div class="stat-box"><small>변동지출</small><strong>' + wonW(tot.variable) + '</strong></div>' +
        '</div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><h2>🍚 카테고리별 지출</h2><span class="head-note">고정비 포함</span></div>' +
        barRows(cats, tot.expense) +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><h2>💳 결제수단별 지출</h2></div>' +
        barRows(methods, tot.expense) +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><h2>📐 고정비와 변동지출</h2><span class="head-note">' + wonW(tot.expense) + '</span></div>' +
        (tot.expense > 0
          ? '<div class="ratio"><i class="fx" style="width:' + fixShareNum + '%"></i><i class="vr" style="width:' + varShareNum + '%"></i></div>' +
            '<div class="legend" style="margin-top:8px"><span><i class="fx"></i>고정비 ' + wonW(tot.fixed) + ' · ' + fixShareNum + '%</span><span><i class="vr"></i>변동지출 ' + wonW(tot.variable) + ' · ' + varShareNum + '%</span></div>'
          : '<div class="empty">이 달 지출이 없어요.</div>') +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><h2>📅 최근 6개월 수입 vs 지출</h2><span class="head-note">단위: 만원</span></div>' +
        '<div class="legend" style="margin-bottom:6px"><span><i class="ch-in" style="width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:4px"></i>수입</span><span><i class="ch-out" style="width:9px;height:9px;border-radius:3px;display:inline-block;margin-right:4px"></i>지출</span></div>' +
        chart +
        (nMon ? '<p class="hint" style="margin-top:6px">월평균 수입 ' + wonW(avgIn) + ' · 지출 ' + wonW(avgOut) + ' · 잔액 ' + (avgIn - avgOut < 0 ? '-' : '') + wonW(Math.abs(avgIn - avgOut)) + '</p>' : '') +
      '</section>' +
      '</div>';
  }

  /* ============================================================
     그리기: 고정비 / 예산
     ============================================================ */
  function tplUsedInMonth(tpl, m) {
    for (var i = 0; i < state.txns.length; i++) {
      var t = state.txns[i];
      if (t.tplId === tpl.id && ymOf(t.date) === m) return t;
    }
    return null;
  }
  function renderFixed() {
    var host = $('viewFixed');
    if (!host) return;
    var m = ui.month;
    var budget = budgetFor(m);
    var tot = monthTotals(m);
    var pct = budgetPct(tot.expense, budget);
    var tpl = state.settings.fixedTemplates || [];
    var rows = '';
    var usedCount = 0;
    var tplTotal = 0;
    for (var i = 0; i < tpl.length; i++) {
      var t = tpl[i];
      tplTotal += t.amount;
      var used = tplUsedInMonth(t, m);
      if (used) usedCount++;
      rows += '<div class="fx-row">' +
        '<span class="tx-ico" aria-hidden="true">' + catEmoji(t.category) + '</span>' +
        '<span class="fx-body"><b>' + esc(t.name) + (used ? ' <span class="fx-done">기록됨</span>' : '') + '</b>' +
        '<span>매월 ' + t.day + '일 · ' + esc(t.category) + ' · ' + esc(t.method) + '</span></span>' +
        '<span class="fx-amt num">' + wonW(t.amount) + '</span>' +
        '<span class="fx-acts">' +
          (ui.readOnly ? '' : '<button class="btn xs ' + (used ? 'ghost' : 'sub') + '" type="button" data-act="fx-apply" data-id="' + esc(t.id) + '">' + (used ? '다시 기록' : '기록') + '</button>') +
          (ui.readOnly ? '' : '<button class="btn xs ghost" type="button" data-act="fx-edit" data-id="' + esc(t.id) + '" aria-label="수정">✏️</button>') +
        '</span>' +
        '</div>';
    }
    var remainTpl = tpl.length - usedCount;

    host.innerHTML = '<div class="stats-wrap">' +
      '<section class="card">' +
        '<div class="card-head"><h2>💰 ' + monthLabel(m) + ' 예산</h2><span class="head-note">사용률 ' + (budget > 0 ? pct + '%' : '-') + '</span></div>' +
        '<div class="bud-edit">' +
          '<input id="budgetInput" type="number" inputmode="numeric" min="0" step="10000" placeholder="월 예산 (원)" value="' + (budget || '') + '" aria-label="월 예산" ' + (ui.readOnly ? 'disabled' : '') + '>' +
          (ui.readOnly ? '' : '<button class="btn sm" type="button" data-act="budget-save">저장</button>') +
        '</div>' +
        '<p class="hint" style="margin-top:7px">' + (budget > 0
          ? '이번 달 지출 <b>' + wonW(tot.expense) + '</b> / 예산 <b>' + wonW(budget) + '</b> · ' + (budget >= tot.expense ? '<b>' + wonW(budget - tot.expense) + '</b> 남았어요' : '<b style="color:#c33f57">' + wonW(tot.expense - budget) + '</b> 넘었어요')
          : '예산을 넣으면 요약 카드에 사용률이 표시돼요.') + '</p>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><h2>🔁 고정비 항목 <span class="count">' + tpl.length + '</span></h2>' +
          (ui.readOnly ? '' : '<span style="margin-left:auto;display:flex;gap:5px"><button class="btn xs sub" type="button" data-act="fx-new">＋ 항목</button><button class="btn xs gold" type="button" data-act="fx-fill">이번 달 채우기' + (remainTpl > 0 ? ' (' + remainTpl + ')' : '') + '</button></span>') +
        '</div>' +
        '<p class="hint" style="margin:0 0 8px">매달 같은 금액으로 나가는 항목을 저장해 두고, 한 번에 이번 달 고정비로 기록해요.' + (tplTotal ? ' 월 합계 <b>' + wonW(tplTotal) + '</b>.' : '') + '</p>' +
        '<div class="tx-list">' + (rows || '<div class="empty">고정비 항목이 없어요.<br>' + (ui.readOnly ? '' : '＋ 항목으로 월세·구독·보험료를 추가해 보세요.') + '</div>') + '</div>' +
      '</section>' +
      '<section class="card">' +
        '<div class="card-head"><h2>📌 이번 달 고정비</h2><span class="head-note">' + wonW(tot.fixed) + '</span></div>' +
        '<div class="tx-list">' + (function () {
          var list = monthTxns(m).filter(function (t) { return t.type === 'fixed'; });
          list.sort(function (a, b) { return (a.date < b.date ? 1 : -1) || b.createdAt - a.createdAt; });
          var h = '';
          for (var q = 0; q < list.length; q++) h += txRowHtml(list[q]);
          return h || '<div class="empty">이 달에 기록된 고정비가 없어요.</div>';
        })() + '</div>' +
      '</section>' +
      '</div>';
  }

  function renderView() {
    var views = { list: $('viewList'), cal: $('viewCal'), stats: $('viewStats'), fixed: $('viewFixed') };
    for (var k in views) {
      if (!views[k]) continue;
      views[k].hidden = (k !== ui.tab);
    }
    if (ui.tab === 'list') renderList();
    else if (ui.tab === 'cal') renderCalendar();
    else if (ui.tab === 'stats') renderStats();
    else renderFixed();
  }

  function renderAll() {
    renderHeader();
    renderTabs();
    renderSummary();
    renderView();
    renderSyncPill();
    applyUserUi();
  }

  function setTab(k) {
    if (!k) return;
    ui.tab = k;
    saveUi();
    renderTabs();
    renderView();
    try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { /* 무시 */ }
  }
  function setMonth(m) {
    if (!/^\d{4}-\d{2}$/.test(m)) return;
    ui.month = m;
    ui.calSel = '';
    saveUi();
    renderAll();
  }

  function saveUi() {
    lsSet(UI_KEY, JSON.stringify({ tab: ui.tab, month: ui.month, typeFilter: ui.typeFilter, cats: ui.cats, method: ui.method, q: ui.q, sort: ui.sort }));
  }
  function loadUi() {
    var raw = lsGet(UI_KEY);
    if (!raw) return;
    try {
      var j = JSON.parse(raw);
      if (j && typeof j === 'object') {
        if (j.tab) ui.tab = j.tab;
        if (j.month && /^\d{4}-\d{2}$/.test(j.month)) ui.month = j.month;
        if (j.typeFilter) ui.typeFilter = j.typeFilter;
        if (j.cats && typeof j.cats === 'object') ui.cats = j.cats;
        if (j.method) ui.method = j.method;
        if (typeof j.q === 'string') ui.q = j.q;
        if (j.sort) ui.sort = j.sort;
      }
    } catch (e) { /* 무시 */ }
  }


  /* 내보내기 */
  L.renderSyncPill2 = renderSyncPill2;
  L.renderHeader = renderHeader;
  L.renderTabs = renderTabs;
  L.renderSummary = renderSummary;
  L.typeLabel = typeLabel;
  L.amountText = amountText;
  L.txRowHtml = txRowHtml;
  L.listParts = listParts;
  L.listNoteHtml = listNoteHtml;
  L.renderList = renderList;
  L.refreshList = refreshList;
  L.dayTotals = dayTotals;
  L.renderCalendar = renderCalendar;
  L.barRows = barRows;
  L.renderStats = renderStats;
  L.tplUsedInMonth = tplUsedInMonth;
  L.renderFixed = renderFixed;
  L.renderView = renderView;
  L.renderAll = renderAll;
  L.setTab = setTab;
  L.setMonth = setMonth;
  L.saveUi = saveUi;
  L.loadUi = loadUi;
})();
