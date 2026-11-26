/* 가계부 · boot — 부팅 · 게이트 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function aiSyncShared() { var f = L.aiSyncShared; return f.apply(this, arguments); }
  function anyDirty() { var f = L.anyDirty; return f.apply(this, arguments); }
  function applyUserUi() { var f = L.applyUserUi; return f.apply(this, arguments); }
  function ghGet() { var f = L.ghGet; return f.apply(this, arguments); }
  function loadUi() { var f = L.loadUi; return f.apply(this, arguments); }
  function renderAll() { var f = L.renderAll; return f.apply(this, arguments); }
  function renderSyncPill() { var f = L.renderSyncPill; return f.apply(this, arguments); }
  function scheduleSync() { var f = L.scheduleSync; return f.apply(this, arguments); }
  function setSync() { var f = L.setSync; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var BOOT_WAIT_MS = L.BOOT_WAIT_MS;   /* 다른 모듈 값 */
  var HUB_LAST_KEY = L.HUB_LAST_KEY;   /* 다른 모듈 값 */
  var PATH_SET = L.PATH_SET;   /* 다른 모듈 값 */
  var PATH_TX = L.PATH_TX;   /* 다른 모듈 값 */
  var ROLES = L.ROLES;   /* 다른 모듈 값 */
  var SESSION_KEY = L.SESSION_KEY;   /* 다른 모듈 값 */
  var SHA_KEY = L.SHA_KEY;   /* 다른 모듈 값 */
  var USERS_CACHE_KEY = L.USERS_CACHE_KEY;   /* 다른 모듈 값 */
  var cachedUsers = L.cachedUsers;
  var cloud = L.cloud;   /* 다른 모듈 값 */
  var findIn = L.findIn;
  var findUser = L.findUser;
  var hydrateLocal = L.hydrateLocal;
  var loadDevice = L.loadDevice;
  var loadLocal = L.loadLocal;
  var loadSession = L.loadSession;
  var lsDel = L.lsDel;
  var lsGet = L.lsGet;
  var lsSet = L.lsSet;
  var normalizeSettings = L.normalizeSettings;
  var normalizeTxns = L.normalizeTxns;
  var saveLocal = L.saveLocal;
  var ssDel = L.ssDel;
  var state = L.state;   /* 다른 모듈 값 */
  var thisMonth = L.thisMonth;
  var ui = L.ui;   /* 다른 모듈 값 */

  /* ============================================================
     부팅
     ============================================================ */
  function showGate(mode, msg) {
    $('appRoot').hidden = true;
    if ($('lockScreen')) $('lockScreen').hidden = true;
    $('gateScreen').hidden = false;
    $('gateScreen').removeAttribute('data-loading');
    var m = $('gateMsg');
    if (m && msg) m.textContent = msg;
    else if (m && mode === 'setup') m.textContent = '가족 허브에서 기기를 연결하면 가계부가 열려요.';
    else if (m) m.textContent = '가족 허브에서 로그인하면 여기서도 바로 이어서 쓸 수 있어요.';
    renderSyncPill();
  }

  /* 계정별 대시보드 접근 권한 — 가족 허브(/home/)의 👥 계정 설정과 같은 규칙이에요. */
  var DASH_ID = 'ledger';
  var DASH_IDS = ['kids', 'fridge', 'ledger'];
  var DASH_DEFAULTS = {
    admin: ['kids', 'fridge', 'ledger'],
    parent: ['kids', 'fridge', 'ledger'],
    viewer: ['kids', 'fridge', 'ledger'],
    child: ['kids']
  };
  function dashboardsFor(u) {
    if (!u) return [];
    if (u.role === 'admin') return DASH_IDS.slice();
    if (Object.prototype.toString.call(u.dashboards) === '[object Array]') {
      var out = [];
      for (var i = 0; i < u.dashboards.length; i++) {
        var id = String(u.dashboards[i] == null ? '' : u.dashboards[i]);
        if (DASH_IDS.indexOf(id) >= 0 && out.indexOf(id) < 0) out.push(id);
      }
      return out;
    }
    var def = DASH_DEFAULTS[u.role] || DASH_IDS;
    return def.slice();
  }
  function dashAllowed(u) { return dashboardsFor(u).indexOf(DASH_ID) >= 0; }

  function showLock() {
    $('appRoot').hidden = true;
    if ($('gateScreen')) { $('gateScreen').hidden = true; $('gateScreen').removeAttribute('data-loading'); }
    $('lockScreen').hidden = false;
    var who = $('lockWho');
    if (who) {
      who.textContent = (cloud.me ? ((cloud.me.name || cloud.me.id) + ' 계정은 이 대시보드를 열 수 없어요.') : '') +
        ' 허브에서 관리자에게 요청해 주세요.';
    }
  }

  async function boot() {
    try { cloud.sha = JSON.parse(lsGet(SHA_KEY) || '{}') || {}; } catch (e) { cloud.sha = {}; }
    loadUi();
    if (!ui.month) ui.month = thisMonth();
    var local = loadLocal();
    if (local) hydrateLocal(local);
    cloud.conn = loadDevice();
    renderSyncPill();
    if (!cloud.conn) { showGate('setup'); return; }
    var sess = loadSession();
    if (!sess) { showGate('login'); return; }
    var res = null;
    try { res = await ghGet('config/users.json'); } catch (e) { res = null; }
    if (res && res.status === 401) {
      showGate('login', '토큰이 만료됐어요. 가족 허브에서 기기를 다시 연결해 주세요.');
      return;
    }
    if (res && res.ok && res.data && Object.prototype.toString.call(res.data.users) === '[object Array]') {
      cloud.users = res.data;
      lsSet(USERS_CACHE_KEY, JSON.stringify(res.data));
      var u = findUser(sess.id);
      if (!u) {
        lsDel(SESSION_KEY); ssDel(SESSION_KEY);
        showGate('login', '계정 정보를 찾을 수 없어요. 가족 허브에서 다시 로그인해 주세요.');
        return;
      }
      cloud.me = { id: u.id, name: u.name || u.id, role: ROLES[u.role] ? u.role : 'viewer', dashboards: dashboardsFor(u) };
    } else {
      var cached = cachedUsers();
      var uc = cached ? findIn(cached.users, sess.id) : null;
      if (cached && uc) cloud.me = { id: uc.id, name: uc.name || uc.id, role: ROLES[uc.role] ? uc.role : 'viewer', dashboards: dashboardsFor(uc) };
      else cloud.me = { id: sess.id, name: sess.name, role: sess.role, dashboards: dashboardsFor(sess) };
    }
    if (!dashAllowed(cloud.me)) { showLock(); return; }
    enterApp();
  }

  function enterApp() {
    lsSet(HUB_LAST_KEY, 'ledger');
    applyUserUi();
    renderAll();
    aiSyncShared();
    return showLoadingThenApp();
  }

  function waitMs(ms) { return new Promise(function (res) { window.setTimeout(res, ms); }); }

  /* 첫 로딩: 게이트의 로딩 안내를 보여 준 채 원격 데이터를 기다리고, 다 오면 앱을 한 번에 연다.
     네트워크가 없거나 BOOT_WAIT_MS를 넘기면 기기에 있던 자료로 바로 넘어간다. */
  async function showLoadingThenApp() {
    var gate = $('gateScreen');
    $('appRoot').hidden = true;
    if ($('lockScreen')) $('lockScreen').hidden = true;
    if (gate) { gate.hidden = false; gate.setAttribute('data-loading', '1'); }
    var msg = $('gateMsg'); if (msg) msg.textContent = '데이터를 불러오는 중…';
    if (navigator.onLine !== false) {
      try { await Promise.race([loadRemote(), waitMs(BOOT_WAIT_MS)]); } catch (e) { /* 캐시로 계속 */ }
    }
    renderAll();
    if (gate) { gate.hidden = true; gate.removeAttribute('data-loading'); }
    $('appRoot').hidden = false;
  }

  async function loadRemote() {
    if (!cloud.conn || !cloud.me) return;
    setSync('syncing');
    var r = await Promise.all([ghGet(PATH_TX), ghGet(PATH_SET)]);
    var okAll = true;

    if (r[0].ok && r[0].data && !cloud.dirty.txns) {
      state.txns = normalizeTxns(r[0].data);
    } else if (r[0].ok && r[0].missing) {
      if (!cloud.dirty.txns) { cloud.dirty.txns = true; }
    } else if (!r[0].ok) okAll = false;

    if (r[1].ok && r[1].data && !cloud.dirty.settings) {
      state.settings = normalizeSettings(r[1].data);
    } else if (r[1].ok && r[1].missing) {
      if (!cloud.dirty.settings) cloud.dirty.settings = true;
    } else if (!r[1].ok) okAll = false;

    saveLocal();
    renderAll();
    if (!okAll) setSync(navigator.onLine === false ? 'offline' : 'error');
    else if (anyDirty()) { setSync('syncing'); scheduleSync(); }
    else setSync('ok');
  }

  /* 시작 */
  boot();

  /* 내보내기 */
  L.showGate = showGate;
  L.DASH_ID = DASH_ID;
  L.DASH_IDS = DASH_IDS;
  L.DASH_DEFAULTS = DASH_DEFAULTS;
  L.dashboardsFor = dashboardsFor;
  L.dashAllowed = dashAllowed;
  L.showLock = showLock;
  L.boot = boot;
  L.enterApp = enterApp;
  L.waitMs = waitMs;
  L.showLoadingThenApp = showLoadingThenApp;
  L.loadRemote = loadRemote;
})();
