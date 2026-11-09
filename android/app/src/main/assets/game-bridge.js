// 注入 ATG 遊戲頁（play.godeebxp.com，Cocos Creator 3.7）的輔助程式，掛在 window.__lwApp。
// 只做三件事：讀畫面上的文字（目前機台、點數、贏分、押注）、讀每一轉結束時的盤面符號（1.4.0+）、
// 替會員切換到指定機台。不按 Spin、不下注、不鎖定機台、不碰網路請求。
// 節點路徑見 docs/plans/2026-11-05-app-in-game-recon.md、docs/plans/2026-11-09-board-signal-recon.md。
(function () {
  if (window.__lwApp) return;
  var cc = function () { return window.cc; };
  var scene = function () { return cc().director.getScene(); };

  function walk(node, fn) {
    fn(node);
    for (var i = 0; i < node.children.length; i++) walk(node.children[i], fn);
  }
  function textOf(node) {
    if (!node || !node.getComponent) return null;
    var l = node.getComponent('cc.Label') || node.getComponent('cc.RichText');
    return l ? l.string : null;
  }
  function find(pred) {
    var out = [];
    walk(scene(), function (n) { if (pred(n)) out.push(n); });
    return out;
  }
  function child(node, path) {
    var n = node;
    var parts = path.split('/');
    for (var i = 0; i < parts.length && n; i++) n = n.getChildByName(parts[i]);
    return n;
  }
  function byName(name, active) {
    return find(function (n) { return n.name === name && (!active || n.activeInHierarchy); })[0] || null;
  }
  function clickable(node) {
    for (var n = node, i = 0; n && i < 6; n = n.parent, i++) {
      var c = n.getComponent && (n.getComponent('cc.Button') || n.getComponent('cc.Toggle'));
      if (c) return { node: n, comp: c };
    }
    return null;
  }
  // 按鈕有 clickEvents 就觸發它；沒有的（例如切換確認視窗）送觸控事件給節點。
  // 機台格要再 emit('click') 細項才會更新；分頁籤多送 click 會讓直式清單清空後不再載入，所以換頁時傳 noClick。
  function press(node, noClick) {
    var t = clickable(node);
    if (!t) return false;
    if (t.comp.clickEvents && t.comp.clickEvents.length) {
      var EH = cc().EventHandler || cc().Component.EventHandler;
      EH.emitEvents(t.comp.clickEvents, { target: t.node });
      if (!noClick) t.node.emit('click', t.comp);
      return true;
    }
    var v = new (cc().Vec2)(0, 0);
    var mk = function (type) {
      return {
        type: type, target: t.node, currentTarget: t.node, propagationStopped: false, propagationImmediateStopped: false,
        bubbles: true, preventSwallow: false,
        touch: { getLocation: function () { return v; }, getUILocation: function () { return v; }, getID: function () { return 0; } },
        getLocation: function () { return v; }, getUILocation: function () { return v; }, getID: function () { return 0; },
        getTouches: function () { return []; }, getAllTouches: function () { return []; },
      };
    };
    t.node.emit('touch-start', mk('touch-start'));
    t.node.emit('touch-end', mk('touch-end'));
    return true;
  }
  function ready() {
    try { return !!(cc() && cc().director && scene()); } catch (e) { return false; }
  }
  function listItems() {
    return find(function (n) { return n.name === 'SlotTableItem2' && n.activeInHierarchy; });
  }
  function pageButton(page) {
    var hit = null;
    walk(scene(), function (n) {
      if (hit || n.name !== 'SlotTablePageTabsItem' || !n.activeInHierarchy) return;
      if (textOf(child(n, 'content/title')) === String(page)) hit = n;
    });
    return hit;
  }
  function detailRoom() {
    var n = byName('slotTableNumber', true);
    return n ? textOf(n) : null;
  }
  // 節點底下第一個符合的文字（直式版面的文字節點名稱和橫式不同，用內容找）
  function textUnder(node, re) {
    var hit = null;
    if (!node) return null;
    walk(node, function (n) {
      if (hit || !n.activeInHierarchy) return;
      var t = textOf(n);
      if (t && re.test(t.trim())) hit = t.trim();
    });
    return hit;
  }
  // 機台按鈕：橫式 slotTable2Btn、直式 slotTableBtn
  function roomButton() {
    return byName('slotTable2Btn', true) || byName('slotTableBtn', true);
  }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  async function until(fn, ms) {
    var end = Date.now() + ms;
    while (Date.now() < end) {
      try { var v = fn(); if (v) return v; } catch (e) { /* 場景切換中 */ }
      await sleep(200);
    }
    return null;
  }

  // ── 盤面（房間訊號用）──────────────────────────
  // SymbolView 底下 0–29 號格子的 symbolSprite 圖片名稱就是符號。一轉結束＝30 格都有、沒有消除動畫
  // （symbolAnimation／symbolOut／frame）、沒有轉動中的模糊圖，且盤面維持 0.5 秒不變。
  var SYMBOLS = {
    symbol_01: 'eye', symbol_02: 'cobra', symbol_03: 'bow', symbol_04: 'sickle',
    symbol_05: 'gem_yellow', symbol_06: 'gem_red', symbol_07: 'gem_purple', symbol_08: 'gem_blue', symbol_09: 'gem_green',
  };
  var BUSY = { symbolAnimation: 1, symbolOut: 1, frame: 1 };
  var board = { sid: Math.random().toString(36).slice(2, 8), seq: 0, sig: null, since: 0, last: null, list: [], first: true };

  var svCache = null;
  function symbolView() {
    if (svCache && svCache.isValid && svCache.activeInHierarchy) return svCache;
    var hit = null;
    walk(scene(), function (n) {
      if (!hit && n.name === 'SymbolView' && n.parent && n.parent.name === 'gameLayer' && n.activeInHierarchy) hit = n;
    });
    svCache = hit;
    return hit;
  }
  function readCells(sv) {
    var busy = false;
    walk(sv, function (n) { if (BUSY[n.name] && n.activeInHierarchy) busy = true; });
    if (busy) return null;
    var cells = [];
    for (var i = 0; i < 30; i++) {
      var cell = sv.getChildByName(String(i));
      var sp = cell && cell.getChildByName('symbolSprite');
      var comp = sp && sp.activeInHierarchy && sp.getComponent('cc.Sprite');
      var name = comp && comp.spriteFrame && comp.spriteFrame.name;
      if (!name || /_blur$/.test(name)) return null;
      cells.push(name);
    }
    return cells;
  }
  function tickBoard() {
    if (!ready()) return;
    var sv = symbolView();
    var cells = sv && readCells(sv);
    var now = Date.now();
    if (!cells) { board.sig = null; return; }
    var sig = cells.join(',');
    if (sig !== board.sig) { board.sig = sig; board.since = now; return; }
    if (now - board.since < 500 || sig === board.last) return;
    board.last = sig;
    // 進入遊戲時原本就在盤面上的那一盤不算（還沒轉過）
    if (board.first) { board.first = false; return; }
    var counts = {};
    cells.forEach(function (c) { var k = SYMBOLS[c]; if (k) counts[k] = (counts[k] || 0) + 1; });
    board.seq += 1;
    board.list.push({ sid: board.sid, seq: board.seq, counts: counts });
    if (board.list.length > 6) board.list.shift();
  }
  setInterval(function () { try { tickBoard(); } catch (e) { board.sig = null; } }, 150);

  var state = { target: null, status: 'idle', error: null };

  async function switchRoom(roomNo) {
    state = { target: roomNo, status: 'running', error: null };
    try {
      if (!ready()) throw new Error('NOT_READY');
      // 1. 開「選擇機台」（遊戲中按機台按鈕；剛進遊戲時清單本來就開著）
      if (listItems().length === 0) {
        var btn = roomButton();
        if (!btn) throw new Error('NOT_IN_GAME');
        press(btn);
        if (!(await until(function () { return listItems().length > 0; }, 8000))) throw new Error('LIST_NOT_OPEN');
      }
      // 清單第一次打開時還在載入目前那一頁；這時候換頁會兩個請求互撞、清單停在空白，所以等載入完再動
      await until(function () { var l = byName('loadingContent', true); return !l; }, 8000);
      await sleep(1000);
      // 2. 切到該分頁（每頁 500 台）
      var n = Number(roomNo);
      var page = Math.floor((n - 1) / 500) + 1;
      var lo = (page - 1) * 500 + 1;
      var hi = page * 500;
      var inPage = function () {
        var items = listItems();
        return items.length > 0 && items.every(function (it) {
          var no = Number(textOf(child(it, 'content/number')));
          return no >= lo && no <= hi;
        });
      };
      if (!inPage()) {
        var pb = pageButton(page);
        if (!pb) throw new Error('PAGE_NOT_FOUND');
        press(pb, true);
        if (!(await until(inPage, 15000))) throw new Error('PAGE_TIMEOUT');
      }
      // 3. 點機台，等細項面板換成這台
      var item = listItems().filter(function (it) { return textOf(child(it, 'content/number')) === roomNo; })[0];
      if (!item) throw new Error('ROOM_NOT_FOUND');
      press(item);
      if (!(await until(function () { return detailRoom() === roomNo; }, 8000))) throw new Error('DETAIL_TIMEOUT');
      // 4. 遊戲中是「確定」，剛進遊戲是「選取」＋確認視窗
      var findConfirm = function () { return byName('confirmBtn', true) || byName('selectBtn', true); };
      var confirm = await until(findConfirm, 3000);
      if (!confirm) throw new Error('NO_CONFIRM');
      // 細項剛換成這台時按鈕可能還沒啟用，等一下再判斷是否被占用
      var usable = await until(function () {
        var b = findConfirm();
        var cb = b && clickable(b);
        return cb && cb.comp.interactable !== false ? b : null;
      }, 3000);
      if (!usable) throw new Error('ROOM_UNAVAILABLE');
      confirm = usable;
      press(confirm);
      var alertBtn = await until(function () {
        var a = byName('GameAlert', true);
        return a && child(a, 'content/button/confirm');
      }, 3000);
      if (alertBtn) press(alertBtn);
      state.status = 'switching';
    } catch (e) {
      state.status = 'error';
      state.error = String((e && e.message) || e);
    }
  }

  window.__lwApp = {
    hud: function () {
      if (!ready()) return null;
      var room = textUnder(roomButton(), /^\d+$/);
      var bal = byName('balanceLabel', true);
      var win = byName('totalWinLabel', true);
      // 押注：橫式 stakeContent/stake、直式 InfoBarP/content/betAmount
      var stakeNode = find(function (n) { return n.name === 'stake' && n.activeInHierarchy && n.parent && n.parent.name === 'stakeContent'; })[0];
      var stake = stakeNode ? textOf(stakeNode) : textUnder(byName('betAmount', true), /^[\d.,]+$/);
      if (!room && !bal) return null;
      return { room: room, balance: textOf(bal), win: textOf(win), stake: stake, boards: board.list };
    },
    switchRoom: function (roomNo) { switchRoom(String(roomNo)); return true; },
    switchState: function () { return state; },
  };
})();
