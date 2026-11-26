/* 가계부 · request — 💬 요청하기 위젯 (AI 사무실 접수함으로 전송) */
(function () {
  'use strict';

  var SOURCE = 'ledger';
  var SOURCE_LABEL = '가계부';
  var ROOT_ID = 'appRoot';

  var DEVICE_KEY = 'kidsDashboard.device.v1';
  var SESSION_KEY = 'kidsDashboard.session.v1';
  var OWNER = 'jadenfamily';
  var REPO = 'kids-dashboard-data';
  var BRANCH = 'main';
  var FILE = 'ai-office/inbox.json';
  var API = 'https://api.github.com/repos/' + OWNER + '/' + REPO + '/contents/' + FILE;

  var fab = document.getElementById('askqFab');
  var sheet = document.getElementById('askqSheet');
  var ta = document.getElementById('askqTa');
  var msg = document.getElementById('askqMsg');
  var sendBtn = document.getElementById('askqSend');
  var kinds = document.getElementById('askqKinds');
  var toastEl = document.getElementById('askqToast');
  if (!fab || !sheet || !ta || !sendBtn) return;

  var kind = '요청';
  var draft = '';
  var sending = false;

  /* ---------- 저장된 기기·로그인 정보 ---------- */
  function lsGet(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } }
  function ssGet(k) { try { return window.sessionStorage.getItem(k); } catch (e) { return null; } }
  function device() {
    try {
      var j = JSON.parse(lsGet(DEVICE_KEY) || 'null');
      if (j && j.token) return j;
    } catch (e) { /* 무시 */ }
    return null;
  }
  function userInfo() {
    var raw = lsGet(SESSION_KEY) || ssGet(SESSION_KEY);
    if (!raw) return { id: '', name: '' };
    var j = null;
    try { j = JSON.parse(raw); } catch (e) { j = null; }
    if (!j) return { id: '', name: '' };
    return { id: String(j.id || ''), name: String(j.name || '') };
  }
  function currentName() {
    var u = userInfo();
    if (u.name) return u.name;
    if (!u.id) return '';
    /* 세션에 이름이 없으면 계정 목록에서 이름을 찾는다 */
    try {
      var users = JSON.parse(lsGet('kidsDashboard.users.v1') || 'null');
      var list = (users && users.users) || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i] && String(list[i].id) === u.id) return String(list[i].name || u.id);
      }
    } catch (e) { /* 무시 */ }
    return '';
  }

  /* ---------- 버튼 노출: 화면에 들어왔을 때만 ---------- */
  var rootEl = document.getElementById(ROOT_ID);
  function syncVis() {
    var on = !!(rootEl && !rootEl.hidden) && !!device();
    fab.hidden = !on;
    if (!on && !sheet.hidden) closeSheet();
  }
  if (rootEl) {
    try {
      new MutationObserver(syncVis).observe(rootEl, { attributes: true, attributeFilter: ['hidden', 'style', 'class'] });
    } catch (e) { /* 무시 */ }
  }
  syncVis();
  window.setTimeout(syncVis, 500);
  window.setTimeout(syncVis, 1800);
  window.addEventListener('load', syncVis);

  /* ---------- iOS 뒷배경 스크롤 잠금 ---------- */
  var lock = { on: false, y: 0 };
  function lockScroll() {
    if (lock.on) return;
    lock.y = window.scrollY || window.pageYOffset || 0;
    var b = document.body, h = document.documentElement;
    b.style.position = 'fixed';
    b.style.top = '-' + lock.y + 'px';
    b.style.left = '0';
    b.style.right = '0';
    b.style.width = '100%';
    b.style.overflow = 'hidden';
    h.style.overflow = 'hidden';
    lock.on = true;
  }
  function unlockScroll() {
    if (!lock.on) return;
    var b = document.body, h = document.documentElement;
    b.style.position = '';
    b.style.top = '';
    b.style.left = '';
    b.style.right = '';
    b.style.width = '';
    b.style.overflow = '';
    h.style.overflow = '';
    lock.on = false;
    window.scrollTo(0, lock.y);
  }

  /* ---------- 창 열기 / 닫기 ---------- */
  function setMsg(text, ok) {
    msg.textContent = text || '';
    msg.className = 'askq-msg' + (ok ? ' ok' : '');
  }
  function openSheet() {
    if (!device()) return;
    setMsg('');
    ta.value = draft || '';
    sheet.hidden = false;
    lockScroll();
    try { ta.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  function closeSheet() {
    draft = ta.value || '';
    sheet.hidden = true;
    unlockScroll();
    try { fab.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
  }
  fab.addEventListener('click', openSheet);
  document.getElementById('askqClose').addEventListener('click', closeSheet);
  sheet.addEventListener('click', function (ev) { if (ev.target === sheet) closeSheet(); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && !sheet.hidden) closeSheet();
  });

  kinds.addEventListener('click', function (ev) {
    var b = ev.target && ev.target.closest ? ev.target.closest('.askq-kind') : null;
    if (!b) return;
    kind = String(b.getAttribute('data-k') || '요청');
    var all = kinds.querySelectorAll('.askq-kind');
    for (var i = 0; i < all.length; i++) {
      var on = all[i] === b;
      all[i].className = 'askq-kind' + (on ? ' on' : '');
      all[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  });

  /* ---------- 보조 함수 ---------- */
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) {
    return '' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }
  function iso(d) { return d.toISOString().replace(/\.\d{3}Z$/, 'Z'); }
  function rand4() {
    var s = '0123456789abcdef', out = '';
    try {
      var b = new Uint8Array(4);
      window.crypto.getRandomValues(b);
      for (var i = 0; i < 4; i++) out += s.charAt(b[i] % 16);
    } catch (e) {
      for (var j = 0; j < 4; j++) out += s.charAt(Math.floor(Math.random() * 16));
    }
    return out;
  }
  function b64enc(str) {
    var bytes = new TextEncoder().encode(String(str));
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return window.btoa(bin);
  }
  function b64dec(b64) {
    var bin = window.atob(String(b64 || '').replace(/\s/g, ''));
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (window.TextDecoder) return new TextDecoder('utf-8').decode(bytes);
    return decodeURIComponent(escape(bin));
  }
  function sleep(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }
  function headers(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }
  function failText(status) {
    if (status === 401) return '기기 연결이 풀렸어요. 가족 홈에서 다시 연결해 주세요.';
    if (status === 403) return '보낼 권한이 없어요. 가족 홈에서 다시 연결해 주세요.';
    return '지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요.';
  }
  function toast(text) {
    toastEl.textContent = text;
    toastEl.hidden = false;
    window.clearTimeout(toast._t);
    toast._t = window.setTimeout(function () { toastEl.hidden = true; }, 3200);
  }

  /* ---------- 접수함 읽기 / 덧붙여 저장 ---------- */
  async function readInbox(token) {
    var res;
    try {
      res = await window.fetch(API + '?ref=' + encodeURIComponent(BRANCH) + '&_=' + Date.now(), {
        headers: headers(token), cache: 'no-store'
      });
    } catch (e) {
      return { ok: false, status: 0, error: '인터넷 연결을 확인해 주세요.' };
    }
    if (res.status === 404) {
      return { ok: true, data: { version: 1, updatedAt: iso(new Date()), items: [] }, sha: null };
    }
    if (!res.ok) return { ok: false, status: res.status, error: failText(res.status) };
    var j = null;
    try { j = await res.json(); } catch (e) { j = null; }
    if (!j) return { ok: false, status: 0, error: '지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요.' };
    var data = null;
    try { data = JSON.parse(b64dec(j.content || '')); } catch (e) { data = null; }
    if (!data || typeof data !== 'object' || Object.prototype.toString.call(data) === '[object Array]') {
      data = { version: 1, updatedAt: iso(new Date()), items: [] };
    }
    if (Object.prototype.toString.call(data.items) !== '[object Array]') data.items = [];
    return { ok: true, data: data, sha: j.sha || null };
  }

  async function saveItem(token, item) {
    var lastError = '';
    for (var attempt = 0; attempt < 3; attempt++) { /* 처음 1회 + 충돌 시 최대 2회 재시도 */
      var cur = await readInbox(token);
      if (!cur.ok) return cur;
      var obj = cur.data;
      var items = obj.items;
      var already = false;
      for (var i = 0; i < items.length; i++) {
        if (items[i] && String(items[i].id) === item.id) { already = true; break; }
      }
      if (!already) items.push(item);
      obj.version = Number(obj.version) || 1;
      obj.updatedAt = iso(new Date());
      var payload = {
        message: '💬 요청 접수: ' + SOURCE_LABEL + ' · ' + kind,
        content: b64enc(JSON.stringify(obj, null, 2)),
        branch: BRANCH
      };
      if (cur.sha) payload.sha = cur.sha;
      var res;
      try {
        res = await window.fetch(API, { method: 'PUT', headers: headers(token), body: JSON.stringify(payload) });
      } catch (e) {
        return { ok: false, status: 0, error: '인터넷 연결을 확인해 주세요.' };
      }
      if (res.ok) return { ok: true };
      if (res.status === 409 || res.status === 422) {
        lastError = '다른 기기에서 먼저 저장했어요.';
        await sleep(260);
        continue;
      }
      return { ok: false, status: res.status, error: failText(res.status) };
    }
    return { ok: false, status: 409, error: lastError + ' 잠시 뒤 다시 보내 주세요.' };
  }

  async function send() {
    if (sending) return;
    var text = String(ta.value || '').trim();
    if (!text) {
      setMsg('하고 싶은 말을 먼저 적어 주세요.');
      try { ta.focus({ preventScroll: true }); } catch (e) { /* 무시 */ }
      return;
    }
    var dev = device();
    if (!dev || !dev.token) {
      setMsg('기기 연결이 풀렸어요. 가족 홈에서 다시 연결해 주세요.');
      return;
    }
    sending = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '보내는 중…';
    setMsg('');
    var now = new Date();
    var item = {
      id: 'ib-' + stamp(now) + '-' + rand4(),
      at: iso(now),
      source: SOURCE,
      sourceLabel: SOURCE_LABEL,
      kind: kind,
      name: currentName(),
      text: text,
      status: 'new',
      handledAt: null
    };
    if (!item.name) delete item.name;
    var r = await saveItem(dev.token, item);
    sending = false;
    sendBtn.disabled = false;
    sendBtn.textContent = '보내기';
    if (r && r.ok) {
      draft = '';
      ta.value = '';
      sheet.hidden = true;
      unlockScroll();
      toast('사무실로 전달했어요! 💬');
      return;
    }
    setMsg((r && r.error) || '보내지 못했어요. 잠시 뒤 다시 해 주세요.');
  }
  sendBtn.addEventListener('click', send);
  ta.addEventListener('keydown', function (ev) {
    if ((ev.metaKey || ev.ctrlKey) && ev.key === 'Enter') { ev.preventDefault(); send(); }
  });
})();
