// 點工具列上的曜金圖示直接打開側邊欄（sidepanel.html）
chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

// 點桌面通知：回到 Chrome 視窗
chrome.notifications.onClicked.addListener((id) => {
  chrome.windows.getLastFocused().then((w) => w && chrome.windows.update(w.id, { focused: true })).catch(() => {});
  chrome.notifications.clear(id);
});
