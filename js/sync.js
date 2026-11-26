/* 가계부 · sync — GitHub 저장소 연결 · 동기화 · 권한 */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function warnPct() { var f = L.warnPct; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var API_BASE = L.API_BASE;   /* 다른 모듈 값 */
  var PATH_SET = L.PATH_SET;   /* 다른 모듈 값 */
  var PATH_TX = L.PATH_TX;   /* 다른 모듈 값 */
  var ROLES = L.ROLES;   /* 다른 모듈 값 */
  var SHA_KEY = L.SHA_KEY;   /* 다른 모듈 값 */
  var cloud = L.cloud;   /* 다른 모듈 값 */
  var customCats = L.customCats;
  var lsSet = L.lsSet;
  var nowIso = L.nowIso;
  var pad2 = L.pad2;
  var saveLocal = L.saveLocal;
  var state = L.state;   /* 다른 모듈 값 */
  var toast = L.toast;
  var ui = L.ui;   /* 다른 모듈 값 */

  /* ============================================================
     GitHub API
     ============================================================ */
  function ghHeaders() {
    return {
      'Authorization': 'Bearer ' + ((cloud.conn && cloud.conn.token) || ''),
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function ghRepoBase() { return API_BASE + '/repos/' + encodeURIComponent(cloud.conn.owner) + '/' + encodeURIComponent(cloud.conn.repo); }
  function b64encodeUtf8(str) {
    var bytes = new TextEncoder().encode(String(str));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }
  function b64decodeUtf8(b64) {
    var bin = window.atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(bin));
  }
  function rememberSha(p, sha) { if (!p || !sha) return; cloud.sha[p] = sha; lsSet(SHA_KEY, JSON.stringify(cloud.sha || {})); }

  async function ghGet(path) {
    if (!cloud.conn) return { ok: false, status: 0, error: '연결 전' };
    var branch = cloud.conn.branch || 'main';
    var url = ghRepoBase() + '/contents/' + path + '?ref=' + encodeURIComponent(branch) + '&_=' + Date.now();
    try {
      var res = await window.fetch(url, { headers: ghHeaders(), cache: 'no-store' });
      if (res.status === 404) return { ok: true, missing: true };
      if (res.status === 401) return { ok: false, status: 401, error: '토큰이 올바르지 않아요' };
      if (res.status === 403) return { ok: false, status: 403, error: '권한이 없어요 (Contents: Read and write)' };
      if (!res.ok) return { ok: false, status: res.status, error: 'HTTP ' + res.status };
      var j = await res.json();
      if (Object.prototype.toString.call(j) === '[object Array]') return { ok: true, list: j };
      var text = j && j.content ? b64decodeUtf8(j.content) : '';
      var data = null;
      if (text) { try { data = JSON.parse(text); } catch (e) { data = null; } }
      rememberSha(path, j && j.sha);
      return { ok: true, data: data, sha: j && j.sha, raw: text };
    } catch (e) {
      return { ok: false, status: 0, error: '네트워크에 연결하지 못했어요' };
    }
  }

  async function ghPut(path, obj, message) {
    if (!cloud.conn) return { ok: false, status: 0, error: '연결 전' };
    var payload = {
      message: message || ('가계부: ' + path),
      content: b64encodeUtf8(JSON.stringify(obj, null, 2)),
      branch: cloud.conn.branch || 'main'
    };
    if (cloud.sha[path]) payload.sha = cloud.sha[path];
    for (var attempt = 0; attempt < 3; attempt++) {
      try {
        var res = await window.fetch(ghRepoBase() + '/contents/' + path, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(payload) });
        if (res.ok) {
          var j = await res.json();
          rememberSha(path, j && j.content && j.content.sha);
          return { ok: true };
        }
        if (res.status === 409 || res.status === 422 || res.status === 404) {
          var cur = await ghGet(path);
          if (!cur.ok) return { ok: false, status: cur.status, error: cur.error };
          if (cur.missing) delete payload.sha; else payload.sha = cur.sha;
          continue;
        }
        if (res.status === 401) return { ok: false, status: 401, error: '토큰이 올바르지 않아요' };
        if (res.status === 403) return { ok: false, status: 403, error: '쓰기 권한이 없어요' };
        return { ok: false, status: res.status, error: 'HTTP ' + res.status };
      } catch (e) {
        return { ok: false, status: 0, error: '네트워크에 연결하지 못했어요' };
      }
    }
    return { ok: false, status: 409, error: '다른 기기에서 먼저 저장했어요' };
  }

  /* ============================================================
     동기화
     ============================================================ */
  function setSync(st) { cloud.status = st; cloud.statusAt = Date.now(); renderSyncPill(); }
  function anyDirty() { return cloud.dirty.txns || cloud.dirty.settings; }
  function renderSyncPill() {
    var el = $('syncPill');
    if (!el) return;
    if (!cloud.conn) { el.className = 'sync-pill'; el.textContent = '☁️ 연결 전'; return; }
    if (!cloud.me) { el.className = 'sync-pill'; el.textContent = '🔐 로그인 전'; return; }
    if (anyDirty()) { el.className = 'sync-pill sync'; el.textContent = cloud.saving ? '☁️ 저장 중…' : '☁️ 저장 대기'; return; }
    if (cloud.status === 'offline') { el.className = 'sync-pill off'; el.textContent = '📴 오프라인 · 기기에 저장'; return; }
    if (cloud.status === 'error') { el.className = 'sync-pill err'; el.textContent = '⚠️ 동기화 오류'; return; }
    if (cloud.status === 'syncing') { el.className = 'sync-pill sync'; el.textContent = '☁️ 저장 중…'; return; }
    if (cloud.status === 'ok') {
      el.className = 'sync-pill ok';
      var d = new Date(cloud.statusAt || Date.now());
      el.textContent = '☁️ 저장됨 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
      return;
    }
    el.className = 'sync-pill';
    el.textContent = '☁️ 준비';
  }
  function syncText() {
    if (!cloud.conn) return '기기가 연결되지 않았어요. 가족 허브에서 연결해 주세요.';
    if (!cloud.me) return '로그인이 필요해요.';
    var d = new Date(cloud.statusAt || Date.now());
    if (cloud.saving) return '저장 중…';
    if (anyDirty()) return '저장 대기 중이에요.';
    if (cloud.status === 'ok') return '마지막 저장 ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
    if (cloud.status === 'offline') return '오프라인 · 이 기기에만 저장 중이에요.';
    if (cloud.status === 'error') return '마지막 저장에 실패했어요. 인터넷과 권한을 확인해 주세요.';
    return '아직 저장 기록이 없어요.';
  }
  function markDirty(kind) {
    if (kind === 'txns') cloud.dirty.txns = true;
    if (kind === 'settings') cloud.dirty.settings = true;
    saveLocal();
    renderSyncPill();
    scheduleSync();
  }
  function scheduleSync() {
    if (!cloud.conn || !cloud.me || ui.readOnly) return;
    if (cloud.timer) window.clearTimeout(cloud.timer);
    cloud.timer = window.setTimeout(function () { cloud.timer = 0; flushSync(); }, 900);
  }
  async function flushSync() {
    if (!cloud.conn || !cloud.me || ui.readOnly || cloud.saving) return;
    if (!anyDirty()) return;
    cloud.saving = true;
    setSync('syncing');
    var jobs = [];
    if (cloud.dirty.txns) jobs.push({ kind: 'txns', path: PATH_TX, obj: { version: 1, updatedAt: nowIso(), items: state.txns } });
    if (cloud.dirty.settings) {
      jobs.push({
        kind: 'settings', path: PATH_SET, obj: {
          version: 1, updatedAt: nowIso(), budgetDefault: state.settings.budgetDefault, warnPct: warnPct(),
          budgets: state.settings.budgets, fixedTemplates: state.settings.fixedTemplates, customCats: state.settings.customCats,
          aiProvider: state.settings.aiProvider || ''
        }
      });
    }
    var failed = null;
    for (var i = 0; i < jobs.length; i++) {
      var job = jobs[i];
      var r = await ghPut(job.path, job.obj, '가계부 저장: ' + job.kind);
      if (r.ok) { cloud.dirty[job.kind] = false; }
      else { failed = r; break; }
    }
    cloud.saving = false;
    saveLocal();
    if (failed) {
      setSync(navigator.onLine === false ? 'offline' : 'error');
      if (failed.status === 401 || failed.status === 403) toast('저장 권한이 없어요. 가족 허브에서 기기를 다시 연결해 주세요.', true);
    } else {
      setSync(navigator.onLine === false ? 'offline' : 'ok');
    }
    if (anyDirty()) scheduleSync();
  }

  /* ============================================================
     권한
     ============================================================ */
  function canEdit() {
    if (!cloud.me) return false;
    var r = ROLES[cloud.me.role];
    return !!(r && r.edit);
  }
  function roleLabel(role) { return (ROLES[role] && ROLES[role].label) || '보기 전용'; }
  function applyUserUi() {
    var me = cloud.me;
    var chip = $('userChip');
    if (chip) chip.hidden = !me;
    if (me) {
      var av = $('ucAv'); if (av) av.textContent = String(me.name || me.id).slice(0, 1) || '·';
      var nm = $('ucName'); if (nm) nm.textContent = me.name || me.id;
      var rl = $('ucRole'); if (rl) rl.textContent = roleLabel(me.role) + ' · ' + me.id;
    }
    var ro = $('roPill'); if (ro) ro.hidden = canEdit();
    var fab = $('fab'); if (fab) fab.hidden = !canEdit();
    ui.readOnly = !canEdit();
  }


  /* 내보내기 */
  L.ghHeaders = ghHeaders;
  L.ghRepoBase = ghRepoBase;
  L.b64encodeUtf8 = b64encodeUtf8;
  L.b64decodeUtf8 = b64decodeUtf8;
  L.rememberSha = rememberSha;
  L.ghGet = ghGet;
  L.ghPut = ghPut;
  L.setSync = setSync;
  L.anyDirty = anyDirty;
  L.renderSyncPill = renderSyncPill;
  L.syncText = syncText;
  L.markDirty = markDirty;
  L.scheduleSync = scheduleSync;
  L.flushSync = flushSync;
  L.canEdit = canEdit;
  L.roleLabel = roleLabel;
  L.applyUserUi = applyUserUi;
})();
