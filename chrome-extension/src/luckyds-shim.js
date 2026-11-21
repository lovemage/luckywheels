// 注入 luckyds.com（MAIN world、document_start）：只有被本擴充功能的側邊欄嵌入時才生效，
// 提供和 Android App 相同介面的 window.LuckyApp（對應 src/native.ts），呼叫一律轉給側邊欄（postMessage）。
// 側邊欄送回的遊戲資訊、模式變化，轉成網頁原本就在聽的 luckyapp:* 事件。
(function () {
  var PANEL_ORIGIN = 'chrome-extension://__EXTENSION_ID__';
  var anc = location.ancestorOrigins;
  if (window.top === window || !anc || anc.length !== 1 || anc[0] !== PANEL_ORIGIN) return;
  if (window.LuckyApp) return;

  var mode = 'full';
  function send(type, data) {
    window.parent.postMessage({ source: 'luckyds', type: type, data: data === undefined ? null : data }, PANEL_ORIGIN);
  }
  function str(v, max) { return String(v == null ? '' : v).slice(0, max); }

  window.addEventListener('message', function (e) {
    if (e.source !== window.parent || e.origin !== PANEL_ORIGIN) return;
    var m = e.data;
    if (!m || m.source !== 'luckyds-panel') return;
    if (m.type === 'mode') {
      mode = m.data === 'dock' || m.data === 'signal' ? m.data : 'full';
      window.dispatchEvent(new CustomEvent('luckyapp:mode', { detail: mode }));
    } else if (m.type === 'game') {
      window.dispatchEvent(new CustomEvent('luckyapp:game', { detail: m.data == null ? null : m.data }));
    }
  });

  window.LuckyApp = {
    /** 電腦版擴充功能（src/native.ts 以此和 Android App 區分） */
    platform: 'chrome',
    version: '__VERSION__',
    capabilities: function () { return 'signal,multiswitch,login'; },
    collapse: function () { send('collapse'); },
    setMode: function (m) { send('setMode', str(m, 10)); },
    getMode: function () { return mode; },
    resize: function () { /* 側邊欄高度固定，不需要 */ },
    switchRoom: function (rooms) { send('switchRoom', str(rooms, 120)); },
    alert: function (message) { send('alert', str(message, 200)); },
    signalHit: function (message) { send('signalHit', str(message, 200)); },
    /** LINE 登入頁不能放在側邊欄裡：改在新分頁登入，完成後側邊欄自動重新整理 */
    login: function () { send('login'); },
    /** 在新分頁開啟網址（娛樂城、說明頁等） */
    openTab: function (url) { send('openTab', str(url, 500)); },
  };
  send('ready');
})();
