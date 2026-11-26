/* 가계부 · receipt — 영수증 AI */
(function () {
  'use strict';
  var L = window.Ledger = window.Ledger || {};

  /* 다른 모듈의 함수 — 부를 때마다 찾아 써요 (불러오는 순서와 상관없이 동작) */
  function aiAnyKey() { var f = L.aiAnyKey; return f.apply(this, arguments); }
  function aiHasKey() { var f = L.aiHasKey; return f.apply(this, arguments); }
  function aiJSON() { var f = L.aiJSON; return f.apply(this, arguments); }
  function aiProvider() { var f = L.aiProvider; return f.apply(this, arguments); }
  function aiSummary() { var f = L.aiSummary; return f.apply(this, arguments); }
  function markDirty() { var f = L.markDirty; return f.apply(this, arguments); }
  function providerLabel() { var f = L.providerLabel; return f.apply(this, arguments); }
  function renderAll() { var f = L.renderAll; return f.apply(this, arguments); }
  function saveUi() { var f = L.saveUi; return f.apply(this, arguments); }

  /* 공통 상태·도구 */
  var $ = L.$;
  var METHODS = L.METHODS;   /* 다른 모듈 값 */
  var catEmoji = L.catEmoji;
  var catsFor = L.catsFor;
  var closeModal = L.closeModal;
  var esc = L.esc;
  var fieldVal = L.fieldVal;
  var isYmd = L.isYmd;
  var makeTxn = L.makeTxn;
  var normMethod = L.normMethod;
  var num = L.num;
  var state = L.state;   /* 다른 모듈 값 */
  var toast = L.toast;
  var todayStr = L.todayStr;
  var ui = L.ui;   /* 다른 모듈 값 */
  var wonW = L.wonW;
  var ymOf = L.ymOf;

  /* ============================================================
     영수증 AI
     ============================================================ */
  var PROMPT_RECEIPT = '너는 한국 가정의 가계부 도우미야. 첨부한 영수증 사진에서 결제 정보를 읽어 정리해줘.\n' +
    '규칙: 1) date는 영수증의 결제일(YYYY-MM-DD), 없으면 오늘 2) store는 상호명을 짧게 3) total은 최종 결제 금액(원, 숫자만 — 할인·적립 제외) ' +
    '4) category는 식비/생활용품/육아·교육/교통·차량/주거·관리비/의료·건강/여가·외식/기타 중 하나 5) method는 신용카드/체크카드/현금/계좌이체 중 하나(표시 없으면 신용카드) ' +
    '6) items에는 주요 품목 이름만 최대 8개. 확실하지 않은 값은 비워두고 total과 store만 정확히 채워줘.';
  var SCHEMA_RECEIPT = {
    type: 'OBJECT',
    properties: {
      date: { type: 'STRING' },
      store: { type: 'STRING' },
      total: { type: 'NUMBER' },
      category: { type: 'STRING' },
      method: { type: 'STRING' },
      items: { type: 'ARRAY', items: { type: 'STRING' } }
    },
    required: ['store', 'total']
  };

  function msgForError(e) {
    var m = (e && e.message) ? e.message : String(e || '');
    if (m === 'NO_KEY') return '⚙️ 설정에서 영수증 AI 키를 먼저 넣어 주세요.';
    if (m === 'NO_PHOTO') return '영수증 사진을 읽을 AI가 없어요. ⚙️ 설정에서 Gemini나 OpenRouter 키를 넣어 주세요.';
    if (m === 'TIMEOUT' || /timeout|abort/i.test(m)) return 'AI 응답이 너무 늦어서 멈췄어요. 잠시 뒤 다시 시도해 주세요.';
    if (/API key not valid|API_KEY_INVALID|API key expired|invalid api key|incorrect api key|401/i.test(m)) return 'AI 키가 올바르지 않아요. ⚙️ 설정에서 확인해 주세요.';
    if (/quota|RESOURCE_EXHAUSTED|429|rate limit|한도/i.test(m)) return 'AI 무료 사용량을 다 썼어요. 잠시 후 다시 시도해 주세요.';
    if (/403|권한|forbidden|지역/i.test(m)) return '지금은 이 AI를 쓸 수 없어요. 잠시 뒤 다시 시도해 주세요.';
    if (/HTTP 5\d\d|internal|server error|unavailable|overloaded|high demand|과부하/i.test(m)) return 'AI가 잠시 붐비네요. 조금 뒤 다시 시도해 주세요.';
    if (/응답을 이해하지 못했어요|읽지 못했어요|비어 있/i.test(m)) return '영수증 글자를 읽지 못했어요. 사진을 밝게 다시 찍어 주세요.';
    if (/네트워크|fetch|Failed to fetch|NetworkError/i.test(m)) return '인터넷에 연결하지 못했어요.';
    return m || '알 수 없는 오류가 생겼어요.';
  }

  function shrinkImage(file, maxSide, quality) {
    if (!maxSide) maxSide = 1000;
    if (!quality) quality = 0.72;
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onload = function () {
        var img = new Image();
        img.onload = function () {
          var w = img.width, h = img.height;
          var scale = Math.min(1, maxSide / Math.max(w, h));
          var cw = Math.round(w * scale), ch = Math.round(h * scale);
          var cv = document.createElement('canvas');
          cv.width = cw; cv.height = ch;
          var ctx = cv.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, cw, ch);
          ctx.drawImage(img, 0, 0, cw, ch);
          try { resolve(cv.toDataURL('image/jpeg', quality)); } catch (e) { reject(e); }
        };
        img.onerror = function () { reject(new Error('사진을 열지 못했어요.')); };
        img.src = String(reader.result || '');
      };
      reader.onerror = function () { reject(new Error('사진을 읽지 못했어요.')); };
      reader.readAsDataURL(file);
    });
  }
  function receiptReadyText() {
    var sum = aiSummary();
    if (!sum.any) return '먼저 ⚙️ 설정에서 영수증 AI 키를 넣어 주세요. 키 없이도 직접 기록할 수 있어요.';
    if (!sum.photos) return providerLabel(sum.provider) + '는 사진 읽기를 지원하지 않아 ' + sum.photoProviders.map(providerLabel).join('·') + '로 읽어요.';
    if (aiHasKey(sum.provider)) return providerLabel(sum.provider) + '로 읽을 준비가 됐어요.';
    return '키가 있는 다른 AI로 읽어요.';
  }
  function renderReceipt() {
    var body = $('receiptBody');
    if (!body) return;
    var r = ui.rec;
    if (r.step === 'idle') {
      body.innerHTML = '<p class="hint">영수증 사진을 고르면 AI가 결제일·상호·금액·카테고리를 읽어 드려요. 확인하고 저장만 누르면 돼요.</p>' +
        '<input id="recFile" type="file" accept="image/*" capture="environment" style="font-size:13px;font-weight:800">' +
        '<p class="hint">' + receiptReadyText() + '</p>';
    } else if (r.step === 'busy') {
      body.innerHTML = (r.thumb ? '<img class="rec-thumb" src="' + r.thumb + '" alt="영수증 사진">' : '') +
        '<p class="msg">🔍 영수증을 읽는 중…</p>' +
        '<p class="hint">보통 3~10초면 끝나요. 응답이 없으면 다른 AI로 다시 시도해요.</p>';
    } else if (r.step === 'error') {
      body.innerHTML = (r.thumb ? '<img class="rec-thumb" src="' + r.thumb + '" alt="영수증 사진">' : '') +
        '<p class="msg err">' + esc(r.error) + '</p>' +
        '<input id="recFile" type="file" accept="image/*" capture="environment" style="font-size:13px;font-weight:800">' +
        '<div class="modal-acts"><button class="btn sm ghost" type="button" data-act="modal-close" data-m="receiptModal">직접 입력하기</button></div>';
    } else if (r.step === 'review') {
      var d = r.data || {};
      var cats = catsFor('expense');
      if (cats.indexOf(d.category) < 0 && d.category) cats.push(d.category);
      var catOpts = '';
      for (var i = 0; i < cats.length; i++) catOpts += '<option value="' + esc(cats[i]) + '"' + (cats[i] === d.category ? ' selected' : '') + '>' + catEmoji(cats[i]) + ' ' + esc(cats[i]) + '</option>';
      var mOpts = '';
      for (var j = 0; j < METHODS.length; j++) mOpts += '<option value="' + METHODS[j] + '"' + (METHODS[j] === d.method ? ' selected' : '') + '>' + METHODS[j] + '</option>';
      body.innerHTML = (r.thumb ? '<img class="rec-thumb" src="' + r.thumb + '" alt="영수증 사진">' : '') +
        '<p class="msg">영수증을 읽었어요. 확인하고 저장하세요.</p>' +
        '<div class="field-row">' +
          '<div class="field"><label>날짜</label><input id="recDate" type="date" value="' + esc(d.date || todayStr()) + '"></div>' +
          '<div class="field"><label>금액 (원)</label><input id="recAmount" type="number" inputmode="numeric" min="0" step="100" value="' + (d.amount || '') + '"></div>' +
        '</div>' +
        '<div class="field"><label>상호 / 내용</label><input id="recTitle" type="text" maxlength="60" value="' + esc(d.title || '') + '"></div>' +
        '<div class="field-row">' +
          '<div class="field"><label>카테고리</label><select id="recCat">' + catOpts + '</select></div>' +
          '<div class="field"><label>결제수단</label><select id="recMethod">' + mOpts + '</select></div>' +
        '</div>' +
        '<div class="field"><label>메모</label><input id="recMemo" type="text" maxlength="200" value="' + esc(d.memo || '') + '"></div>' +
        '<div class="modal-acts"><button class="btn wide" type="button" data-act="rec-save">저장</button></div>' +
        '<div class="modal-acts"><button class="btn sm ghost" type="button" data-act="rec-retry">다른 사진</button></div>';
    }
  }
  async function analyzeReceipt(file) {
    ui.rec = { step: 'busy', thumb: '', error: '', data: null };
    renderReceipt();
    try {
      if (!aiAnyKey()) throw new Error('NO_KEY');
      if (!/^image\//.test(file.type || '')) throw new Error('이미지 파일만 올릴 수 있어요.');
      var dataUrl = await shrinkImage(file, 1000, 0.72);
      ui.rec.thumb = dataUrl;
      renderReceipt();
      var mime = (/^data:(.*?);/.exec(dataUrl) || [])[1] || 'image/jpeg';
      var b64 = dataUrl.split(',')[1];
      var out = await aiJSON({ prompt: PROMPT_RECEIPT, mime: mime, b64: b64, schema: SCHEMA_RECEIPT, image: true });
      var items = (out && out.items) || [];
      ui.rec = {
        step: 'review', thumb: dataUrl, error: '',
        data: {
          date: isYmd(out && out.date) ? out.date : todayStr(),
          title: String((out && out.store) || '').slice(0, 60),
          amount: Math.abs(Math.round(num(out && out.total))),
          category: String((out && out.category) || '기타').replace(/[·ㆍ]/g, '/').slice(0, 20),
          method: normMethod(out && out.method),
          memo: items.length ? '품목: ' + items.slice(0, 8).join(', ') : ''
        }
      };
      renderReceipt();
    } catch (e) {
      ui.rec.step = 'error';
      ui.rec.error = msgForError(e);
      renderReceipt();
    }
  }
  function saveReceipt() {
    var date = fieldVal('recDate');
    var amount = num(fieldVal('recAmount'));
    var title = fieldVal('recTitle').trim();
    if (!isYmd(date)) { toast('날짜를 확인해 주세요.', true); return; }
    if (!(amount > 0)) { toast('금액을 넣어 주세요.', true); return; }
    var t = makeTxn({
      date: date, type: 'expense', category: fieldVal('recCat') || '기타', title: title || '영수증 지출',
      amount: amount, method: fieldVal('recMethod'), memo: fieldVal('recMemo')
    });
    state.txns.push(t);
    markDirty('txns');
    closeModal('receiptModal');
    /* 기록 추가 창에서 '영수증으로 채우기'로 들어온 경우엔 빈 입력창을 남기지 않아요 */
    closeModal('txModal');
    ui.txEdit = null;
    if (ymOf(t.date) !== ui.month) { ui.month = ymOf(t.date); saveUi(); }
    renderAll();
    toast('영수증을 기록했어요 · ' + wonW(t.amount));
  }


  /* 내보내기 */
  L.msgForError = msgForError;
  L.shrinkImage = shrinkImage;
  L.renderReceipt = renderReceipt;
  L.analyzeReceipt = analyzeReceipt;
  L.saveReceipt = saveReceipt;
})();
