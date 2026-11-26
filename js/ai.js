/* 가계부 · ai — Gemini · OpenRouter · Groq 공통 호출 (20초 타임아웃 · 자동 폴백)
   config/ai.json 에 암호문으로 올라간 가족 공유 키를 세 제공자 모두 읽어 쓰고,
   고른 AI가 느리거나 한도를 넘으면 나머지 두 제공자로 알아서 다시 시도해요. */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* state.js 가 먼저 불러오므로 값은 그대로 받아 써요 */
  var lsGet = L.lsGet;
  var lsSet = L.lsSet;
  var lsDel = L.lsDel;
  var nowIso = L.nowIso;
  var cloud = L.cloud;
  var state = L.state;

  /* 다른 모듈의 함수 — 부르는 시점에 찾아 써요 */
  function ghGet() { var f = L.ghGet; return f.apply(this, arguments); }
  function ghPut() { var f = L.ghPut; return f.apply(this, arguments); }
  function canEdit() { var f = L.canEdit; return f.apply(this, arguments); }
  function renderSettings() { var f = L.renderSettings; return f.apply(this, arguments); }
  function markDirty() { var f = L.markDirty; return f.apply(this, arguments); }

  /* ============================================================
     설정값
     ============================================================ */
  var AI_PATH = 'config/ai.json';
  var AI_ITER = 120000;
  var AI_STATE_KEY = 'ledgerDashboard.aiState.v1';
  var AI_KEYS_KEY = 'ledgerDashboard.aiKeys.v1';       /* 이 기기에만 둔 키 */
  var AI_MODEL_KEY = 'ledgerDashboard.aiModel.v1';     /* 제공자별로 마지막에 잘 읽은 모델 */
  var LEGACY_GEMINI_KEY = 'ledgerDashboard.geminiKey.v1';
  var LEGACY_GEMINI_KEY2 = 'fridgeDashboard.geminiKey.v1';

  var AI_TIMEOUT_MS = 20000;   /* AI 한 번 부를 때 기다리는 시간 */
  var AI_BUDGET_MS = 50000;    /* 세 제공자를 다 시도해도 이 시간을 넘기지 않아요 */

  var GEMINI_MODELS = ['gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite', 'gemini-3.5-flash'];
  var OPENROUTER_MODELS = ['nvidia/nemotron-3.5-super-vl:free', 'google/gemma-4-31b-it:free', 'google/gemma-4-26b-a4b-it:free'];
  var GROQ_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];

  var PROVIDERS = {
    gemini: { id: 'gemini', label: 'Gemini', models: GEMINI_MODELS },
    openrouter: { id: 'openrouter', label: 'OpenRouter', models: OPENROUTER_MODELS },
    groq: { id: 'groq', label: 'Groq', models: GROQ_MODELS }
  };
  var PROVIDER_ORDER = ['gemini', 'openrouter', 'groq'];
  var AI_LOG = [];   /* 최근 호출 기록 (문제 확인용) */

  /* 지금 키 상태 */
  var AI = { keys: { gemini: [], openrouter: [], groq: [] }, present: false, locked: false, at: 0, note: '', loaded: false };

  function emptyKeys() { return { gemini: [], openrouter: [], groq: [] }; }
  function cleanList(arr) {
    var out = [];
    if (Object.prototype.toString.call(arr) !== '[object Array]') return out;
    for (var i = 0; i < arr.length; i++) {
      var v = String(arr[i] == null ? '' : arr[i]).trim();
      if (v && out.indexOf(v) < 0) out.push(v);
    }
    return out;
  }
  function pidOk(pid) { return PROVIDER_ORDER.indexOf(String(pid || '')) >= 0; }
  function providerLabel(pid) { return (PROVIDERS[pid] && PROVIDERS[pid].label) || 'AI'; }

  /* ============================================================
     가족 공유 키 암호 풀기 (config/ai.json · AES-GCM)
     저장소 주소에서 유도한 같은 열쇠를 가족 대시보드가 함께 써요.
     ============================================================ */
  function aiCrypto() { return (window.crypto && window.crypto.subtle) ? window.crypto.subtle : null; }
  function aiPass() {
    var c = cloud.conn || {};
    return String(c.owner || '').toLowerCase() + '/' + String(c.repo || '').toLowerCase() + '::jadenfamily-ai-v1';
  }
  function aiB64(buf) {
    var b = new Uint8Array(buf), s = '', i;
    for (i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return window.btoa(s);
  }
  function aiUnB64(txt) {
    var bin = window.atob(String(txt || '').replace(/\s/g, '')), i;
    var out = new Uint8Array(bin.length);
    for (i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  async function aiKey(salt, iter) {
    var sub = aiCrypto();
    if (!sub) throw new Error('이 브라우저에서는 암호화를 쓸 수 없어요');
    var raw = new TextEncoder().encode(aiPass());
    if (!salt) {
      var d = await sub.digest('SHA-256', raw);
      return sub.importKey('raw', d, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
    }
    var base = await sub.importKey('raw', raw, { name: 'PBKDF2' }, false, ['deriveKey']);
    return sub.deriveKey({ name: 'PBKDF2', salt: salt, iterations: Math.max(1, Number(iter) || 1), hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }
  async function aiEncrypt(obj) {
    var sub = aiCrypto();
    if (!sub) throw new Error('이 브라우저에서는 암호화를 쓸 수 없어요');
    var salt = window.crypto.getRandomValues(new Uint8Array(16));
    var iv = window.crypto.getRandomValues(new Uint8Array(12));
    var k = await aiKey(salt, AI_ITER);
    var ct = await sub.encrypt({ name: 'AES-GCM', iv: iv }, k, new TextEncoder().encode(JSON.stringify(obj)));
    return { version: 1, alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iter: AI_ITER, salt: aiB64(salt), iv: aiB64(iv), ct: aiB64(ct), updatedAt: nowIso() };
  }
  async function aiDecrypt(p) {
    if (!p || !p.iv || !p.ct) return null;
    var sub = aiCrypto();
    if (!sub) return null;
    var k = await aiKey(p.salt ? aiUnB64(p.salt) : null, Number(p.iter) || 1);
    var pt = await sub.decrypt({ name: 'AES-GCM', iv: aiUnB64(p.iv) }, k, aiUnB64(p.ct));
    var txt = new TextDecoder('utf-8').decode(new Uint8Array(pt));
    try { return JSON.parse(txt); } catch (e) { return null; }
  }

  /* config/ai.json 안의 여러 형태(예전 단일 key · 제공자별 배열)를 모두 읽어요 */
  function keysFromConfig(obj) {
    var keys = emptyKeys();
    obj = obj || {};
    for (var i = 0; i < PROVIDER_ORDER.length; i++) {
      var pid = PROVIDER_ORDER[i];
      var list = cleanList(obj[pid + 'Keys']);
      if (!list.length) {
        var single = String((pid === 'gemini' ? (obj.key || obj.gemini) : obj[pid]) || '').trim();
        if (single) list = [single];
      }
      keys[pid] = list;
    }
    return keys;
  }
  function configFromKeys(keys, base) {
    var out = base && typeof base === 'object' ? base : {};
    out.key = (keys.gemini || [])[0] || '';
    out.gemini = out.key;
    out.geminiKeys = (keys.gemini || []).slice();
    out.openrouter = (keys.openrouter || [])[0] || '';
    out.openrouterKeys = (keys.openrouter || []).slice();
    out.groq = (keys.groq || [])[0] || '';
    out.groqKeys = (keys.groq || []).slice();
    out.updatedAt = nowIso();
    return out;
  }

  /* ============================================================
     이 기기에 둔 키
     ============================================================ */
  function localKeys() {
    var out = emptyKeys();
    var raw = null;
    try { raw = JSON.parse(lsGet(AI_KEYS_KEY) || 'null'); } catch (e) { raw = null; }
    if (raw && typeof raw === 'object') {
      for (var i = 0; i < PROVIDER_ORDER.length; i++) out[PROVIDER_ORDER[i]] = cleanList(raw[PROVIDER_ORDER[i]]);
    }
    /* 예전 버전에서 넣어 둔 Gemini 키도 그대로 써요 */
    if (!out.gemini.length) {
      var legacy = String(lsGet(LEGACY_GEMINI_KEY) || lsGet(LEGACY_GEMINI_KEY2) || '').trim();
      if (legacy) out.gemini = [legacy];
    }
    return out;
  }
  function saveLocalKeys(keys) {
    var out = emptyKeys();
    for (var i = 0; i < PROVIDER_ORDER.length; i++) out[PROVIDER_ORDER[i]] = cleanList(keys[PROVIDER_ORDER[i]]);
    lsSet(AI_KEYS_KEY, JSON.stringify(out));
  }
  function localKeyOf(pid) { return (localKeys()[pid] || [])[0] || ''; }
  function sharedKeyOf(pid) { return (AI.keys[pid] || [])[0] || ''; }
  function aiKeyOf(pid) { return sharedKeyOf(pid) || localKeyOf(pid); }
  function aiHasKey(pid) { return !!aiKeyOf(pid); }
  function aiKeyOrigin(pid) {
    if (sharedKeyOf(pid)) return 'shared';
    if (localKeyOf(pid)) return 'local';
    return '';
  }
  function aiOriginText(pid) {
    var o = aiKeyOrigin(pid);
    if (o === 'shared') return '가족 공유 키';
    if (o === 'local') return '이 기기에만 있는 키';
    return '';
  }

  /* 대표 제공자 — 설정에서 고른 값, 없으면 키가 있는 첫 제공자 */
  function aiProvider() {
    var pick = String((state.settings && state.settings.aiProvider) || '').trim();
    if (pidOk(pick)) return pick;
    for (var i = 0; i < PROVIDER_ORDER.length; i++) if (aiHasKey(PROVIDER_ORDER[i])) return PROVIDER_ORDER[i];
    return 'gemini';
  }
  function aiSetProvider(pid) {
    if (!pidOk(pid)) return;
    if (!state.settings) return;
    state.settings.aiProvider = pid;
    markDirty('settings');
  }
  function aiAnyKey() {
    for (var i = 0; i < PROVIDER_ORDER.length; i++) if (aiHasKey(PROVIDER_ORDER[i])) return true;
    return false;
  }

  /* ============================================================
     가족 공유 키 읽기 / 저장
     ============================================================ */
  function aiState() { try { return JSON.parse(lsGet(AI_STATE_KEY) || '{}') || {}; } catch (e) { return {}; } }
  function aiSetState(o) { lsSet(AI_STATE_KEY, JSON.stringify(o || {})); }

  async function aiSyncShared() {
    AI.loaded = false;
    if (!cloud.conn) {
      AI.present = false;
      AI.keys = emptyKeys();
      AI.loaded = true;
      AI.note = 'offline';
      renderSettings();
      return;
    }
    var r = null;
    try { r = await ghGet(AI_PATH); } catch (e) { r = null; }
    if (!r || !r.ok) {
      AI.note = 'offline';
      AI.loaded = true;
      renderSettings();
      return;
    }
    if (r.missing) {
      AI.present = false;
      AI.locked = false;
      AI.keys = emptyKeys();
      AI.loaded = true;
      AI.note = 'none';
      renderSettings();
      return;
    }
    var obj = null;
    try { obj = await aiDecrypt(r.data || {}); } catch (e) { obj = null; }
    AI.present = true;
    AI.at = Date.parse((r.data && r.data.updatedAt) || '') || 0;
    AI.loaded = true;
    if (!obj) {
      AI.locked = true;
      AI.keys = emptyKeys();
      AI.note = 'locked';
      renderSettings();
      return;
    }
    AI.locked = false;
    AI.note = '';
    AI.keys = keysFromConfig(obj);
    /* 이 기기에만 있던 키가 있고 가족 공유에 아직 없으면 올려서 함께 써요 */
    var local = localKeys();
    var missing = false;
    for (var i = 0; i < PROVIDER_ORDER.length; i++) {
      var pid = PROVIDER_ORDER[i];
      if (!AI.keys[pid].length && local[pid].length) missing = true;
    }
    if (missing && canEdit() && cloud.me) {
      for (var j = 0; j < PROVIDER_ORDER.length; j++) {
        var p2 = PROVIDER_ORDER[j];
        if (!AI.keys[p2].length && local[p2].length) AI.keys[p2] = local[p2].slice();
      }
      var up = await aiPushShared(obj);
      if (up.ok) { saveLocalKeys(emptyKeys()); AI.note = 'uploaded'; }
      else AI.keys = keysFromConfig(obj);
    }
    renderSettings();
  }

  /* 지금 키 상태를 config/ai.json 에 다시 올려요 (다른 대시보드가 넣은 키는 그대로 둬요) */
  async function aiPushShared(baseObj) {
    if (!cloud.conn || !cloud.me) return { ok: false, error: '연결 전' };
    try {
      var keys = emptyKeys();
      for (var i = 0; i < PROVIDER_ORDER.length; i++) {
        var pid = PROVIDER_ORDER[i];
        var list = (AI.keys[pid] || []).slice();
        if (!list.length) list = localKeys()[pid] || [];
        keys[pid] = list;
      }
      var payload = configFromKeys(keys, baseObj);
      var env = await aiEncrypt(payload);
      var r = await ghPut(AI_PATH, env, '가족 공유 AI 키 저장 (가계부)');
      if (!r.ok) return { ok: false, error: r.error || '공유 저장 실패' };
      return { ok: true, updatedAt: env.updatedAt, env: env };
    } catch (e) {
      return { ok: false, error: '암호화하지 못했어요' };
    }
  }

  /* 제공자 하나의 키 저장 — 이 기기 + (가능하면) 가족 공유 */
  async function aiSaveKey(pid, keyStr) {
    if (!pidOk(pid)) return { ok: false, error: '제공자를 확인해 주세요.' };
    var v = String(keyStr || '').trim();
    if (!v) return { ok: false, error: '키를 입력해 주세요.' };
    var local = localKeys();
    local[pid] = [v];
    saveLocalKeys(local);
    if (pid === 'gemini') lsDel(LEGACY_GEMINI_KEY);
    if (!cloud.conn || !cloud.me || !canEdit()) return { ok: true, shared: false, local: true };
    var r = null;
    try { r = await ghGet(AI_PATH); } catch (e) { r = null; }
    var baseObj = null;
    if (r && r.ok && r.data) { try { baseObj = await aiDecrypt(r.data); } catch (e) { baseObj = null; } }
    AI.keys[pid] = [v];
    if (baseObj) {
      var kc = keysFromConfig(baseObj);
      kc[pid] = [v];
      AI.keys = kc;
    }
    var up = await aiPushShared(baseObj);
    if (!up.ok) return { ok: true, shared: false, local: true, error: up.error || '' };
    AI.present = true;
    AI.locked = false;
    saveLocalKeys(emptyKeys());
    AI.at = Date.now();
    return { ok: true, shared: true };
  }

  async function aiClearKey(pid) {
    if (!pidOk(pid)) return { ok: false, error: '제공자를 확인해 주세요.' };
    var local = localKeys();
    local[pid] = [];
    saveLocalKeys(local);
    var wasShared = !!sharedKeyOf(pid);
    AI.keys[pid] = [];
    if (!cloud.conn || !cloud.me || !canEdit() || !wasShared) return { ok: true, shared: false };
    var baseObj = null;
    try {
      var r = await ghGet(AI_PATH);
      if (r && r.ok && r.data) baseObj = await aiDecrypt(r.data);
    } catch (e) { baseObj = null; }
    var up = await aiPushShared(baseObj);
    return { ok: !!up.ok, shared: !!up.ok, error: up.error || '' };
  }

  /* ============================================================
     호출 — 20초 타임아웃 · 실패하면 다음 제공자
     ============================================================ */
  function aiLastModels() {
    var j = null;
    try { j = JSON.parse(lsGet(AI_MODEL_KEY) || 'null'); } catch (e) { j = null; }
    return (j && typeof j === 'object') ? j : {};
  }
  function aiRememberModel(pid, model) {
    var m = aiLastModels();
    if (m[pid] === model) return;
    m[pid] = model;
    lsSet(AI_MODEL_KEY, JSON.stringify(m));
  }
  function modelOrder(pid) {
    var base = (PROVIDERS[pid] && PROVIDERS[pid].models) || [];
    var last = aiLastModels()[pid] || '';
    var out = [];
    if (last && base.indexOf(last) >= 0) out.push(last);
    else if (last) out.push(last);
    for (var i = 0; i < base.length; i++) if (out.indexOf(base[i]) < 0) out.push(base[i]);
    return out;
  }

  function aiErr(msg, extra) {
    var e = new Error(msg || 'AI 오류');
    if (extra) for (var k in extra) if (Object.prototype.hasOwnProperty.call(extra, k)) e[k] = extra[k];
    return e;
  }

  async function fetchTimeout(url, opts, ms) {
    var ctrl = (typeof window.AbortController === 'function') ? new window.AbortController() : null;
    var o = {};
    for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    var timer = 0;
    if (ctrl) {
      o.signal = ctrl.signal;
      timer = window.setTimeout(function () { try { ctrl.abort(); } catch (e) { /* 무시 */ } }, Math.max(1000, ms || AI_TIMEOUT_MS));
    }
    try {
      return await window.fetch(url, o);
    } catch (e) {
      if (e && (e.name === 'AbortError' || /abort/i.test(String(e.message || '')))) throw aiErr('TIMEOUT', { timeout: true });
      throw aiErr('네트워크에 연결하지 못했어요.', { network: true });
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function looseJson(t) {
    var s = String(t || '').trim();
    s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
    try { return JSON.parse(s); } catch (e) { /* 아래에서 재시도 */ }
    var a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { return JSON.parse(s.slice(a, b + 1)); } catch (e2) { /* 무시 */ }
    }
    return null;
  }

  async function callGemini(model, req, ms) {
    var key = aiKeyOf('gemini');
    if (!key) throw aiErr('NO_KEY');
    var url = 'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent';
    var cfg = { temperature: 0.2, responseMimeType: 'application/json', maxOutputTokens: 1500 };
    if (req.schema) cfg.responseSchema = req.schema;
    var body = {
      contents: [{ role: 'user', parts: [{ text: String(req.prompt || '') }, { inline_data: { mime_type: req.mime || 'image/jpeg', data: String(req.b64 || '') } }] }],
      generationConfig: cfg
    };
    var res = await fetchTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(body)
    }, ms);
    var txt = '';
    try { txt = await res.text(); } catch (e) { txt = ''; }
    var json = null;
    try { json = JSON.parse(txt); } catch (e) { json = null; }
    var em = (json && json.error && json.error.message) ? String(json.error.message) : '';
    if (res.status === 404 || (res.status === 400 && /model|not found|no longer available|unsupported|지원하지/i.test(em))) {
      throw aiErr('이 모델은 지금 쓸 수 없어요', { nextModel: true, status: res.status });
    }
    if (!res.ok) throw aiErr(em || ('HTTP ' + res.status), { status: res.status });
    var c = (json && json.candidates && json.candidates[0]) || null;
    var parts = (c && c.content && c.content.parts) || [];
    var out = '';
    for (var i = 0; i < parts.length; i++) {
      if (parts[i] && parts[i].text && !parts[i].thought) out += parts[i].text;
    }
    var parsed = looseJson(out);
    if (!parsed) throw aiErr('응답을 이해하지 못했어요.');
    return parsed;
  }

  async function callOpenAI(pid, model, req, ms) {
    var key = aiKeyOf(pid);
    if (!key) throw aiErr('NO_KEY');
    var url = pid === 'openrouter' ? 'https://openrouter.ai/api/v1/chat/completions' : 'https://api.groq.com/openai/v1/chat/completions';
    var headers = {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + key
    };
    if (pid === 'openrouter') {
      headers['HTTP-Referer'] = 'https://jadenfamily.github.io/ledger-dashboard/';
      headers['X-Title'] = 'jadenfamily ledger';
    }
    var body = {
      model: model,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: String(req.prompt || '') },
          { type: 'image_url', image_url: { url: 'data:' + (req.mime || 'image/jpeg') + ';base64,' + String(req.b64 || '') } }
        ]
      }],
      temperature: 0.2,
      max_tokens: 1500
    };
    var res = await fetchTimeout(url, { method: 'POST', headers: headers, body: JSON.stringify(body) }, ms);
    var txt = '';
    try { txt = await res.text(); } catch (e) { txt = ''; }
    var json = null;
    try { json = JSON.parse(txt); } catch (e) { json = null; }
    var em = (json && json.error && (json.error.message || json.error.code)) ? String(json.error.message || json.error.code) : '';
    if (res.status === 404 || res.status === 400) {
      if (/model|not found|does not exist|decommissioned|unsupported|invalid/i.test(em) || res.status === 404) {
        throw aiErr('이 모델은 지금 쓸 수 없어요', { nextModel: true, status: res.status });
      }
    }
    if (!res.ok) throw aiErr(em || ('HTTP ' + res.status), { status: res.status });
    var ch = (json && json.choices && json.choices[0]) || null;
    var out = ch && ch.message ? String(ch.message.content || '') : '';
    var parsed = looseJson(out);
    if (!parsed) throw aiErr('응답을 이해하지 못했어요.');
    return parsed;
  }

  /* 고른 제공자 → 나머지 제공자 순서로, 20초씩 끊어서 시도해요.
     다 실패해도 AI_BUDGET_MS 안에 끝나므로 화면이 무한 로딩에 걸리지 않아요. */
  async function aiJSON(req) {
    var first = aiProvider();
    var chain = [first];
    for (var i = 0; i < PROVIDER_ORDER.length; i++) if (PROVIDER_ORDER[i] !== first) chain.push(PROVIDER_ORDER[i]);
    var started = Date.now();
    var errors = [];
    var tried = 0;
    for (var c = 0; c < chain.length; c++) {
      var pid = chain[c];
      if (!aiHasKey(pid)) continue;
      tried++;
      if (Date.now() - started > AI_BUDGET_MS - 4000) break;
      var models = modelOrder(pid);
      for (var m = 0; m < models.length; m++) {
        var left = Math.min(AI_TIMEOUT_MS, AI_BUDGET_MS - (Date.now() - started));
        if (left < 3000) break;
        var t0 = Date.now();
        try {
          var out = pid === 'gemini'
            ? await callGemini(models[m], req, left)
            : await callOpenAI(pid, models[m], req, left);
          if (out) {
            aiLog(pid, models[m], Date.now() - t0, '');
            aiRememberModel(pid, models[m]);
            if (pid !== first) aiSetState({ source: aiKeyOrigin(pid), fallback: pid, at: Date.now() });
            return out;
          }
        } catch (e) {
          aiLog(pid, models[m], Date.now() - t0, (e && e.message) || 'error');
          if (e && e.nextModel) continue;   /* 이 모델만 못 쓰는 경우 → 다음 모델 */
          errors.push(e);
          break;                             /* 제공자 전체 문제(429·타임아웃 등) → 다음 제공자 */
        }
      }
    }
    if (!tried) throw aiErr('NO_KEY');
    var last = errors.length ? errors[errors.length - 1] : null;
    if (last) throw last;
    throw aiErr('AI가 영수증을 읽지 못했어요.');
  }

  function aiLog(pid, model, ms, error) {
    AI_LOG.push({ pid: pid, model: model, ms: ms, error: String(error || ''), at: Date.now() });
    if (AI_LOG.length > 30) AI_LOG.shift();
  }

  /* 설정 화면에서 쓰는 요약 */
  function aiSummary() {
    var pick = aiProvider();
    var keys = {};
    for (var i = 0; i < PROVIDER_ORDER.length; i++) keys[PROVIDER_ORDER[i]] = aiHasKey(PROVIDER_ORDER[i]);
    return {
      provider: pick,
      label: providerLabel(pick),
      keys: keys,
      origin: aiKeyOrigin(pick),
      originText: aiOriginText(pick),
      any: aiAnyKey(),
      shared: !!AI.present && !AI.locked,
      locked: !!AI.locked,
      loaded: !!AI.loaded
    };
  }

  L.AI_PATH = AI_PATH;
  L.AI_TIMEOUT_MS = AI_TIMEOUT_MS;
  L.GEMINI_MODELS = GEMINI_MODELS;
  L.PROVIDER_ORDER = PROVIDER_ORDER;
  L.PROVIDERS = PROVIDERS;
  L.aiProvider = aiProvider;
  L.aiSetProvider = aiSetProvider;
  L.aiHasKey = aiHasKey;
  L.aiAnyKey = aiAnyKey;
  L.aiKeyOf = aiKeyOf;
  L.aiKeyOrigin = aiKeyOrigin;
  L.aiOriginText = aiOriginText;
  L.aiSummary = aiSummary;
  L.aiSyncShared = aiSyncShared;
  L.aiSaveKey = aiSaveKey;
  L.aiClearKey = aiClearKey;
  L.aiJSON = aiJSON;
  L.aiLog = AI_LOG;
  L.aiState = aiState;
  L.aiSetState = aiSetState;
  L.providerLabel = providerLabel;
})();
