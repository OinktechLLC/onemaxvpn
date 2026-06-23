// Background service worker — управление VPN прокси и блокировкой

chrome.runtime.onInstalled.addListener(() => {
  console.log('One Max VPN установлен');
});

// Включение/выключение VPN
async function toggleVPN(enabled) {
  if (enabled) {
    // Пример: использование SOCKS5 прокси (реальный сервер из servers.json)
    const config = {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "socks5",
          host: "proxy.example.com",  // будет обновляться
          port: 1080
        }
      }
    };
    await chrome.proxy.settings.set({ value: config, scope: 'regular' });
    console.log('VPN включен');
  } else {
    await chrome.proxy.settings.set({ value: { mode: 'system' }, scope: 'regular' });
    console.log('VPN выключен');
  }
}

// Блокировка трекеров (declarativeNetRequest)
chrome.declarativeNetRequest.updateDynamicRules({
  removeRuleIds: [1],
  addRules: [{
    id: 1,
    priority: 1,
    action: { type: "block" },
    condition: {
      urlFilter: "*google-analytics.com*|*doubleclick.net*|*facebook.com/tr*",
      resourceTypes: ["xmlhttprequest", "image", "script"]
    }
  }]
});
