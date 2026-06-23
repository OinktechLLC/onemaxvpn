// Service Worker - управление VPN и прокси

chrome.runtime.onInstalled.addListener(() => {
  console.log('One Max VPN установлен');
  chrome.storage.local.set({ vpnEnabled: false });
});

// Включение/выключение VPN
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleVPN') {
    const enabled = message.enabled;
    
    if (enabled) {
      // Получаем текущий сервер
      chrome.storage.local.get(['currentServer'], (data) => {
        const config = {
          mode: "fixed_servers",
          rules: {
            singleProxy: {
              scheme: "http",
              host: data.currentServer ? data.currentServer.host : "proxy.example.com",
              port: data.currentServer ? data.currentServer.port : 8080
            }
          }
        };
        chrome.proxy.settings.set({ value: config, scope: 'regular' });
      });
    } else {
      chrome.proxy.settings.set({ value: { mode: "direct" }, scope: 'regular' });
    }
    
    chrome.storage.local.set({ vpnEnabled: enabled });
    sendResponse({ success: true });
  }
});

// Блокировка трекеров
chrome.declarativeNetRequest.onRuleMatchedDebug.addListener((info) => {
  console.log('Blocked:', info);
});
