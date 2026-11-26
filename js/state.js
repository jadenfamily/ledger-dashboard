/* 가계부 · state — 상수 · 상태 · 공통 도구 · 날짜 · 카테고리 · 정규화 · 기기/세션 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  var API_BASE = 'https://api.github.com';
  var DEVICE_KEY = 'kidsDashboard.device.v1';
  var SESSION_KEY = 'kidsDashboard.session.v1';
  var USERS_CACHE_KEY = 'kidsDashboard.users.v1';
  var HUB_LAST_KEY = 'kidsDashboard.hub.last';

  var LOCAL_KEY = 'ledgerDashboard.v1';
  var SHA_KEY = 'ledgerDashboard.sha.v1';
  var UI_KEY = 'ledgerDashboard.ui.v1';

  var PATH_TX = 'ledger/transactions.json';
  var PATH_SET = 'ledger/settings.json';

  var WARN_PCT_DEFAULT = 85;   /* 예산 주의 표시 기준(%) */
  var BOOT_WAIT_MS = 6000;     /* 첫 로딩에서 원격 데이터를 기다리는 최대 시간 */

  var ROLES = {
    admin: { label: '관리자', edit: 1 },
    parent: { label: '보호자', edit: 1 },
    child: { label: '아이' },
    viewer: { label: '보기 전용' }
  };

  var TYPES = {
    expense: { label: '지출', short: '지출' },
    fixed: { label: '고정비', short: '고정비' },
    income: { label: '수입', short: '수입' }
  };
  var TYPE_ORDER = ['expense', 'fixed', 'income'];

  var DEF_CATS = {
    expense: ['식비', '생활용품', '육아/교육', '교통/차량', '주거/관리비', '의료/건강', '여가/외식', '기타'],
    fixed: ['주거/관리비', '식비', '교통/차량', '육아/교육', '의료/건강', '기타'],
    income: ['급여/부수입', '기타']
  };
  var CAT_EMOJI = {
    '식비': '🍚', '생활용품': '🧴', '육아/교육': '🎒', '교통/차량': '🚗', '주거/관리비': '🏠',
    '의료/건강': '💊', '여가/외식': '🎬', '급여/부수입': '💰', '기타': '📌'
  };
  var METHODS = ['신용카드', '체크카드', '현금', '계좌이체'];
  var METHOD_EMOJI = { '신용카드': '💳', '체크카드': '💳', '현금': '💵', '계좌이체': '🏦' };
  function icoOf(name) { return CAT_EMOJI[name] || METHOD_EMOJI[name] || '🏷️'; }
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  var WEEKS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  /* ============================================================
     상태
     ============================================================ */
  function emptySettings() {
    return { version: 1, updatedAt: '', budgetDefault: 0, warnPct: WARN_PCT_DEFAULT, budgets: {}, fixedTemplates: [], customCats: { expense: [], fixed: [], income: [] }, aiProvider: '' };
  }
  var state = { txns: [], settings: emptySettings() };

  var cloud = {
    conn: null, me: null, users: null,
    status: 'idle', statusAt: 0, sha: {},
    dirty: { txns: false, settings: false },
    timer: 0, saving: false
  };

  var ui = {
    tab: 'list', month: '', typeFilter: 'all', cats: {}, method: 'all', q: '', sort: 'new',
    calSel: '', readOnly: false, txEdit: null, fxEdit: '',
    sheet: { step: '', msg: '', err: '', name: '', cols: [], rows: [], map: {}, preview: [] },
    rec: { step: 'idle', thumb: '', error: '', data: null },
    setMsg: '', catMsg: '', busy: false
  };

  /* ============================================================
     작은 도구
     ============================================================ */
  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid(p) { return (p || 'tx') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function num(v) { var n = parseFloat(String(v == null ? '' : v).replace(/[,\s]/g, '')); return isFinite(n) ? n : 0; }
  function nowIso() { return new Date().toISOString(); }
  function todayStr() { var d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
  function parseYmd(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
  }
  function isYmd(s) { return !!parseYmd(s); }
  function won(n) { return Number(num(n)).toLocaleString('ko-KR'); }
  function wonW(n) { return won(n) + '원'; }
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { window.localStorage.setItem(k, v); return true; } catch (e) { return false; } }
  function lsDel(k) { try { window.localStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function ssDel(k) { try { window.sessionStorage.removeItem(k); } catch (e) { /* 무시 */ } }
  function fieldVal(id) { var el = $(id); return el ? String(el.value == null ? '' : el.value) : ''; }
  function toast(msg, isErr) {
    var t = $('toast');
    if (!t) return;
    t.textContent = msg;
    t.className = 'toast show' + (isErr ? ' err' : '');
    t.hidden = false;
    if (t._timer) window.clearTimeout(t._timer);
    t._timer = window.setTimeout(function () { t.className = 'toast'; t.hidden = true; }, 2600);
  }
  /* ---------- iOS Safari 배경 스크롤 잠금 ----------
     모달이 열려 있는 동안 body를 fixed로 고정해 뒷페이지가 스크롤되지 않게 한다.
     닫을 때 원래 스크롤 위치로 돌아간다. */
  var scrollLock = { on: false, y: 0 };
  var MODAL_SEL = '.sheet:not([hidden])';
  function lockBodyScroll() {
    if (scrollLock.on) return;
    scrollLock.y = window.scrollY || window.pageYOffset || 0;
    var b = document.body, h = document.documentElement;
    b.style.position = 'fixed';
    b.style.top = '-' + scrollLock.y + 'px';
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
    b.style.overflow = 'hidden';
    h.style.overflow = 'hidden';
    scrollLock.on = true;
  }
  function unlockBodyScroll() {
    if (!scrollLock.on) return;
    var b = document.body, h = document.documentElement;
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.width = '';
    b.style.overflow = '';
    h.style.overflow = '';
    scrollLock.on = false;
    window.scrollTo(0, scrollLock.y);
  }
  function syncBodyScrollLock() {
    if (document.querySelector(MODAL_SEL)) { if (!scrollLock.on) lockBodyScroll(); }
    else if (scrollLock.on) unlockBodyScroll();
  }
  function showModal(id) { var m = $(id); if (m) { m.hidden = false; syncBodyScrollLock(); } }
  function closeModal(id) { var m = $(id); if (m) m.hidden = true; syncBodyScrollLock(); }

  /* ============================================================
     날짜 도우미
     ============================================================ */
  function ymOf(dstr) { return String(dstr || '').slice(0, 7); }
  function thisMonth() { return todayStr().slice(0, 7); }
  function monthLabel(m) { return m.slice(0, 4) + '년 ' + Number(m.slice(5, 7)) + '월'; }
  function addMonths(m, delta) {
    var y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1 + delta;
    y += Math.floor(mo / 12);
    mo = ((mo % 12) + 12) % 12;
    return y + '-' + pad2(mo + 1);
  }
  function daysInMonth(m) { var y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); return new Date(y, mo, 0).getDate(); }
  function firstDow(m) { var y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)); return new Date(y, mo - 1, 1).getDay(); }
  function dayLabel(dstr) {
    var d = parseYmd(dstr);
    if (!d) return dstr;
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 (' + DOW[d.getDay()] + ')';
  }
  function shortDay(dstr) {
    var d = parseYmd(dstr);
    if (!d) return dstr;
    return (d.getMonth() + 1) + '/' + d.getDate();
  }
  function todayLine() {
    try {
      var d = new Date();
      return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + WEEKS[d.getDay()];
    } catch (e) { return todayStr(); }
  }

  /* ============================================================
     카테고리
     ============================================================ */
  function customCats(type) {
    var cc = state.settings.customCats || {};
    return (cc[type] || []).slice();
  }
  function catsFor(type) {
    var base = DEF_CATS[type] || [];
    var out = base.slice();
    var extra = customCats(type);
    for (var i = 0; i < extra.length; i++) if (out.indexOf(extra[i]) < 0) out.push(extra[i]);
    return out;
  }
  function allCatsForFilters(type) {
    var out = [];
    var types = type === 'all' ? TYPE_ORDER : [type];
    for (var i = 0; i < types.length; i++) {
      var list = catsFor(types[i]);
      for (var j = 0; j < list.length; j++) if (out.indexOf(list[j]) < 0) out.push(list[j]);
    }
    return out;
  }
  function catEmoji(c) { return CAT_EMOJI[c] || '🏷️'; }
  function catTypeDefault(type) {
    if (type === 'income') return '급여/부수입';
    if (type === 'fixed') return '주거/관리비';
    return '식비';
  }

  /* ============================================================
     정규화
     ============================================================ */
  function normMethod(v) {
    var s = String(v || '').trim();
    if (METHODS.indexOf(s) >= 0) return s;
    if (/현금/.test(s)) return '현금';
    if (/체크/.test(s)) return '체크카드';
    if (/이체|계좌|송금/.test(s)) return '계좌이체';
    if (/카드|신용/.test(s)) return '신용카드';
    return '신용카드';
  }
  function normType(v) {
    var s = String(v || '').trim();
    if (/수입|입금|수령/.test(s)) return 'income';
    if (/고정/.test(s)) return 'fixed';
    if (/지출|변동|출금|결제/.test(s)) return 'expense';
    if (s === 'income' || s === 'fixed' || s === 'expense') return s;
    return '';
  }
  function makeTxn(o) {
    o = o || {};
    var type = TYPES[o.type] ? o.type : 'expense';
    var amount = Math.round(Math.abs(num(o.amount)));
    var date = isYmd(o.date) ? o.date : todayStr();
    var title = String(o.title || '').trim().slice(0, 60);
    var category = String(o.category || '').trim().slice(0, 20);
    if (!category) category = catTypeDefault(type);
    if (!title) title = category;
    return {
      id: o.id || uid('tx'),
      date: date,
      type: type,
      category: category,
      title: title,
      amount: amount,
      method: normMethod(o.method),
      memo: String(o.memo || '').slice(0, 200),
      tplId: String(o.tplId || ''),
      createdAt: num(o.createdAt) || Date.now(),
      updatedAt: num(o.updatedAt) || Date.now()
    };
  }
  function normalizeTxns(raw) {
    var list = (raw && raw.items) || (Object.prototype.toString.call(raw) === '[object Array]' ? raw : []);
    var out = [];
    for (var i = 0; i < list.length && i < 20000; i++) {
      var t = makeTxn(list[i]);
      if (!t.amount) continue;
      out.push(t);
    }
    return out;
  }
  function normalizeSettings(raw) {
    raw = raw || {};
    var out = emptySettings();
    out.budgetDefault = Math.max(0, Math.round(num(raw.budgetDefault)));
    var wp = Math.round(num(raw.warnPct));
    out.warnPct = (wp >= 1 && wp <= 100) ? wp : WARN_PCT_DEFAULT;
    var b = raw.budgets || {};
    for (var k in b) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) continue;
      if (!/^\d{4}-\d{2}$/.test(k)) continue;
      var v = Math.round(num(b[k]));
      if (v > 0) out.budgets[k] = v;
    }
    var tpl = raw.fixedTemplates || [];
    for (var i = 0; i < tpl.length && i < 100; i++) {
      var t = tpl[i] || {};
      var name = String(t.name || '').trim().slice(0, 40);
      var amt = Math.round(num(t.amount));
      if (!name || amt <= 0) continue;
      out.fixedTemplates.push({
        id: t.id || uid('fx'),
        name: name,
        category: String(t.category || '기타').trim().slice(0, 20),
        amount: amt,
        method: normMethod(t.method),
        day: Math.min(31, Math.max(1, Math.round(num(t.day)) || 1)),
        active: t.active === false ? false : true
      });
    }
    var cc = raw.customCats || {};
    var keys = ['expense', 'fixed', 'income'];
    for (var ki = 0; ki < keys.length; ki++) {
      var kk = keys[ki], arr = cc[kk] || [];
      for (var j = 0; j < arr.length && j < 30; j++) {
        var c = String(arr[j] || '').trim().slice(0, 16);
        if (!c) continue;
        if (DEF_CATS[kk].indexOf(c) >= 0) continue;
        if (out.customCats[kk].indexOf(c) >= 0) continue;
        out.customCats[kk].push(c);
      }
    }
    out.updatedAt = raw.updatedAt || '';
    out.aiProvider = (raw.aiProvider === 'gemini' || raw.aiProvider === 'openrouter' || raw.aiProvider === 'groq') ? raw.aiProvider : '';
    return out;
  }

  /* ============================================================
     로컬 캐시
     ============================================================ */
  function saveLocal() {
    try {
      lsSet(LOCAL_KEY, JSON.stringify({
        txns: state.txns, settings: state.settings, dirty: cloud.dirty, savedAt: Date.now()
      }));
    } catch (e) { /* 용량 초과는 무시 */ }
  }
  function loadLocal() {
    var raw = lsGet(LOCAL_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (e) { return null; }
  }
  function hydrateLocal(l) {
    if (!l) return;
    if (l.txns || l.items) state.txns = normalizeTxns(l.txns || l.items);
    if (l.settings) state.settings = normalizeSettings(l.settings);
    if (l.dirty && typeof l.dirty === 'object') {
      cloud.dirty.txns = !!l.dirty.txns;
      cloud.dirty.settings = !!l.dirty.settings;
    }
  }

  /* ============================================================
     기기 / 세션
     ============================================================ */
  function loadDevice() {
    try {
      var j = JSON.parse(lsGet(DEVICE_KEY) || 'null');
      if (j && j.owner && j.repo && j.token) return { owner: j.owner, repo: j.repo, token: j.token, branch: j.branch || 'main', at: j.at || 0 };
    } catch (e) { /* 무시 */ }
    return null;
  }
  function loadSession() {
    var raw = lsGet(SESSION_KEY), store = 'local';
    if (!raw) { raw = ssGet(SESSION_KEY); store = 'session'; }
    if (!raw) return null;
    var j = null;
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (!j || !j.id) return null;
    var exp = Number(j.expiresAt) || 0;
    if (store === 'local' && (!exp || exp <= Date.now())) { lsDel(SESSION_KEY); return null; }
    return { id: String(j.id), name: String(j.name || j.id), role: ROLES[j.role] ? j.role : 'viewer', dashboards: Object.prototype.toString.call(j.dashboards) === '[object Array]' ? j.dashboards : null, store: store, expiresAt: exp };
  }
  function cachedUsers() {
    try {
      var j = JSON.parse(lsGet(USERS_CACHE_KEY) || 'null');
      if (j && j.users && Object.prototype.toString.call(j.users) === '[object Array]') return j;
    } catch (e) { /* 무시 */ }
    return null;
  }
  function findIn(users, id) {
    var key = String(id || '').toLowerCase();
    for (var i = 0; i < users.length; i++) if (String(users[i].id).toLowerCase() === key) return users[i];
    return null;
  }
  function findUser(id) { return findIn((cloud.users && cloud.users.users) || [], id); }

  /* 내보내기 */
  L.API_BASE = API_BASE;
  L.DEVICE_KEY = DEVICE_KEY;
  L.SESSION_KEY = SESSION_KEY;
  L.USERS_CACHE_KEY = USERS_CACHE_KEY;
  L.HUB_LAST_KEY = HUB_LAST_KEY;
  L.LOCAL_KEY = LOCAL_KEY;
  L.SHA_KEY = SHA_KEY;
  L.UI_KEY = UI_KEY;
  L.PATH_TX = PATH_TX;
  L.PATH_SET = PATH_SET;
  L.WARN_PCT_DEFAULT = WARN_PCT_DEFAULT;
  L.BOOT_WAIT_MS = BOOT_WAIT_MS;
  L.ROLES = ROLES;
  L.TYPES = TYPES;
  L.TYPE_ORDER = TYPE_ORDER;
  L.DEF_CATS = DEF_CATS;
  L.CAT_EMOJI = CAT_EMOJI;
  L.METHODS = METHODS;
  L.METHOD_EMOJI = METHOD_EMOJI;
  L.icoOf = icoOf;
  L.DOW = DOW;
  L.WEEKS = WEEKS;
  L.emptySettings = emptySettings;
  L.state = state;
  L.cloud = cloud;
  L.ui = ui;
  L.$ = $;
  L.esc = esc;
  L.uid = uid;
  L.pad2 = pad2;
  L.num = num;
  L.nowIso = nowIso;
  L.todayStr = todayStr;
  L.parseYmd = parseYmd;
  L.isYmd = isYmd;
  L.won = won;
  L.wonW = wonW;
  L.lsGet = lsGet;
  L.lsSet = lsSet;
  L.lsDel = lsDel;
  L.ssGet = ssGet;
  L.ssDel = ssDel;
  L.fieldVal = fieldVal;
  L.toast = toast;
  L.scrollLock = scrollLock;
  L.MODAL_SEL = MODAL_SEL;
  L.lockBodyScroll = lockBodyScroll;
  L.unlockBodyScroll = unlockBodyScroll;
  L.syncBodyScrollLock = syncBodyScrollLock;
  L.showModal = showModal;
  L.closeModal = closeModal;
  L.ymOf = ymOf;
  L.thisMonth = thisMonth;
  L.monthLabel = monthLabel;
  L.addMonths = addMonths;
  L.daysInMonth = daysInMonth;
  L.firstDow = firstDow;
  L.dayLabel = dayLabel;
  L.shortDay = shortDay;
  L.todayLine = todayLine;
  L.customCats = customCats;
  L.catsFor = catsFor;
  L.allCatsForFilters = allCatsForFilters;
  L.catEmoji = catEmoji;
  L.catTypeDefault = catTypeDefault;
  L.normMethod = normMethod;
  L.normType = normType;
  L.makeTxn = makeTxn;
  L.normalizeTxns = normalizeTxns;
  L.normalizeSettings = normalizeSettings;
  L.saveLocal = saveLocal;
  L.loadLocal = loadLocal;
  L.hydrateLocal = hydrateLocal;
  L.loadDevice = loadDevice;
  L.loadSession = loadSession;
  L.cachedUsers = cachedUsers;
  L.findIn = findIn;
  L.findUser = findUser;
})();
