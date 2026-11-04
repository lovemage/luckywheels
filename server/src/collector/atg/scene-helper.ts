// 注入遊戲頁面（Cocos Creator 3.7）的輔助程式，掛在 window.__lw。
// 只讀取場景樹上已顯示的文字，以及「點擊」遊戲自己的按鈕；不碰網路、不解密。
// 以字串形式注入：tsx 編譯後的函式會帶 __name 等 helper，page.evaluate 在瀏覽器端無法執行。

export const SCENE_HELPER_SOURCE = String.raw`
(() => {
  if (window.__lw) return;
  const cc = () => window.cc;
  const scene = () => cc().director.getScene();

  function walk(node, fn, path) {
    const here = path ? path + '/' + node.name : node.name;
    fn(node, here);
    for (const c of node.children) walk(c, fn, here);
  }
  function textOf(node) {
    if (!node || !node.getComponent) return null;
    const l = node.getComponent('cc.Label') || node.getComponent('cc.RichText');
    return l ? l.string : null;
  }
  function child(node, path) {
    let n = node;
    for (const name of path.split('/')) n = n && n.getChildByName(name);
    return n;
  }
  function spriteName(node) {
    const s = node && node.getComponent && node.getComponent('cc.Sprite');
    return s && s.spriteFrame ? s.spriteFrame.name : null;
  }
  function findNodes(pred) {
    const out = [];
    walk(scene(), (n, p) => { if (pred(n, p)) out.push(n); }, '');
    return out;
  }
  function clickable(node) {
    for (let n = node, i = 0; n && i < 6; n = n.parent, i++) {
      const c = n.getComponent && (n.getComponent('cc.Button') || n.getComponent('cc.Toggle'));
      if (c) return { node: n, comp: c };
    }
    return null;
  }
  // 節點中心點換算成頁面 CSS 座標（給 Playwright 真實滑鼠點擊用）
  function screenPoint(node) {
    const cams = scene().getComponentsInChildren('cc.Camera');
    const cam = cams.find((c) => c.node.activeInHierarchy && (c.visibility & node.layer)) || cams[0];
    if (!cam) return null;
    const out = new (cc().Vec3)();
    cam.worldToScreen(node.worldPosition, out);
    const canvas = cc().game.canvas;
    const rect = canvas.getBoundingClientRect();
    const x = rect.left + out.x * (rect.width / canvas.width);
    const y = rect.top + rect.height - out.y * (rect.height / canvas.height);
    const inside = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
    return { x, y, inside };
  }
  // 依序嘗試：按鈕的 clickEvents → node 的 click 事件；回傳畫面座標供滑鼠備援
  function press(node) {
    const target = clickable(node);
    const point = screenPoint(target ? target.node : node);
    let method = null;
    if (target && target.comp.clickEvents && target.comp.clickEvents.length) {
      const EventHandler = cc().EventHandler || cc().Component.EventHandler;
      EventHandler.emitEvents(target.comp.clickEvents, { target: target.node });
      target.node.emit('click', target.comp);
      method = 'clickEvents';
    }
    return { method, point };
  }
  const visibleLabels = () =>
    findNodes((n) => n.activeInHierarchy && !!textOf(n)).map((n) => ({ node: n, text: textOf(n).trim() }));

  window.__lw = {
    ready() {
      try { return !!(cc() && cc().director && scene()); } catch (e) { return false; }
    },
    hasText(text) { return visibleLabels().some((l) => l.text === text); },
    // 除錯用：所有顯示中的文字節點、是否可點擊、畫面座標
    debug() {
      const out = [];
      walk(scene(), (n, p) => {
        const t = textOf(n);
        if (t && n.activeInHierarchy) {
          const c = clickable(n);
          out.push({ path: p, text: t.trim().slice(0, 60), clickable: c ? c.comp.constructor.name + ':' + (c.comp.clickEvents || []).length : null, point: screenPoint(n) });
        }
      }, '');
      return out;
    },
    pressText(text) {
      const hit = visibleLabels().find((l) => l.text === text);
      return hit ? press(hit.node) : null;
    },
    readList() {
      return findNodes((n) => n.name === 'SlotTableItem2' && n.activeInHierarchy).map((n) => ({
        roomNo: textOf(child(n, 'content/number')),
        rate: textOf(child(n, 'content/rate')),
        roomId: textOf(child(n, 'content/roomId')),
        icon: spriteName(child(n, 'content/icon')),
      }));
    },
    // 分頁按鈕：文字為 "1".."9"、可點擊、且同一個父層下湊得齊 1–9 的那一組
    pressPage(page) {
      const groups = new Map();
      for (const l of visibleLabels()) {
        if (!/^[1-9]$/.test(l.text)) continue;
        const target = clickable(l.node);
        if (!target || !target.node.parent) continue;
        const key = target.node.parent.uuid;
        if (!groups.has(key)) groups.set(key, new Map());
        groups.get(key).set(l.text, l.node);
      }
      const group = [...groups.values()].sort((a, b) => b.size - a.size)[0];
      const node = group && group.get(String(page));
      return node ? press(node) : null;
    },
    pressRoom(roomNo) {
      const item = findNodes((n) => n.name === 'SlotTableItem2' && textOf(child(n, 'content/number')) === roomNo)[0];
      return item ? press(item) : null;
    },
    // 細項面板：從 slotTableNumber 往上找到同時包含 scoreCol 與 notOpenContent（未開轉數）的祖先，
    // 回傳其下所有文字（路徑相對於該祖先）。不往上到含機台列表的層級，避免一次讀進 500 台。
    readDetail() {
      const num = findNodes((n) => n.name === 'slotTableNumber' && n.activeInHierarchy)[0];
      if (!num) return null;
      const has = (r, name) => findNodesUnder(r, (n) => n.name === name).length > 0;
      let root = num.parent;
      while (root && root.parent && !(has(root, 'scoreCol') && has(root, 'notOpenContent')) && !has(root.parent, 'SlotTableItem2')) {
        root = root.parent;
      }
      const labels = [];
      walk(root, (n, p) => { const t = textOf(n); if (t && n.activeInHierarchy) labels.push({ path: p, text: t.trim() }); }, '');
      return labels;
    },
  };
  function findNodesUnder(root, pred) {
    const out = [];
    walk(root, (n, p) => { if (pred(n, p)) out.push(n); }, '');
    return out;
  }
})();
`;
