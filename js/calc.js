/* 가계부 · calc — 계산 (월 합계 · 예산) */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 공통 상태·도구 */
  var WARN_PCT_DEFAULT = L.WARN_PCT_DEFAULT;   /* 다른 모듈 값 */
  var addMonths = L.addMonths;
  var num = L.num;
  var state = L.state;   /* 다른 모듈 값 */
  var ui = L.ui;   /* 다른 모듈 값 */
  var won = L.won;
  var ymOf = L.ymOf;

  /* ============================================================
     계산
     ============================================================ */
  function monthTxns(m) {
    var out = [];
    for (var i = 0; i < state.txns.length; i++) if (ymOf(state.txns[i].date) === m) out.push(state.txns[i]);
    return out;
  }
  function sumType(list, type) {
    var s = 0;
    for (var i = 0; i < list.length; i++) if (list[i].type === type) s += list[i].amount;
    return s;
  }
  function monthTotals(m) {
    var list = monthTxns(m);
    var income = sumType(list, 'income');
    var fixed = sumType(list, 'fixed');
    var variable = sumType(list, 'expense');
    return { list: list, income: income, fixed: fixed, variable: variable, expense: fixed + variable, net: income - fixed - variable, count: list.length };
  }
  function budgetFor(m) {
    var b = state.settings.budgets || {};
    if (b[m]) return b[m];
    return state.settings.budgetDefault || 0;
  }
  /* 설정 화면에서 바꾸는 예산 기준 — state.settings에 저장되고 가족 기기와 함께 동기화된다. */
  function warnPct() {
    var v = Math.round(num(state.settings && state.settings.warnPct));
    return (v >= 1 && v <= 100) ? v : WARN_PCT_DEFAULT;
  }
  function budgetDefaultValue() { var v = Math.round(num(state.settings && state.settings.budgetDefault)); return v > 0 ? v : 0; }
  function budgetPct(used, budget) { return budget > 0 ? Math.round(used / budget * 100) : 0; }

  function filteredList() {
    var list = monthTxns(ui.month);
    var picked = [];
    var catKeys = Object.keys(ui.cats || {});
    var q = String(ui.q || '').trim().toLowerCase();
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (ui.typeFilter !== 'all' && t.type !== ui.typeFilter) continue;
      if (catKeys.length && !ui.cats[t.category]) continue;
      if (ui.method !== 'all' && t.method !== ui.method) continue;
      if (q) {
        var hay = (t.title + ' ' + t.category + ' ' + t.memo + ' ' + t.method + ' ' + won(t.amount)).toLowerCase();
        if (hay.indexOf(q) < 0) continue;
      }
      picked.push(t);
    }
    picked.sort(function (a, b) {
      if (ui.sort === 'big') return b.amount - a.amount || (a.date < b.date ? 1 : -1);
      if (ui.sort === 'small') return a.amount - b.amount || (a.date < b.date ? 1 : -1);
      return (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) || (b.createdAt - a.createdAt);
    });
    return picked;
  }

  function catBreakdown(list, types) {
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (types && types.indexOf(t.type) < 0) continue;
      if (!map[t.category]) map[t.category] = 0;
      map[t.category] += t.amount;
    }
    var out = [];
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) out.push({ name: k, amount: map[k] });
    out.sort(function (a, b) { return b.amount - a.amount; });
    return out;
  }
  function methodBreakdown(list, types) {
    var map = {};
    for (var i = 0; i < list.length; i++) {
      var t = list[i];
      if (types && types.indexOf(t.type) < 0) continue;
      if (!map[t.method]) map[t.method] = 0;
      map[t.method] += t.amount;
    }
    var out = [];
    for (var k in map) if (Object.prototype.hasOwnProperty.call(map, k)) out.push({ name: k, amount: map[k] });
    out.sort(function (a, b) { return b.amount - a.amount; });
    return out;
  }
  function lastMonths(m, n) {
    var arr = [];
    for (var i = n - 1; i >= 0; i--) arr.push(addMonths(m, -i));
    return arr;
  }


  /* 내보내기 */
  L.monthTxns = monthTxns;
  L.sumType = sumType;
  L.monthTotals = monthTotals;
  L.budgetFor = budgetFor;
  L.warnPct = warnPct;
  L.budgetDefaultValue = budgetDefaultValue;
  L.budgetPct = budgetPct;
  L.filteredList = filteredList;
  L.catBreakdown = catBreakdown;
  L.methodBreakdown = methodBreakdown;
  L.lastMonths = lastMonths;
})();
