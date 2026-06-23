// background.js — Service Worker для One Max VPN
// Реализует прокси, блокировку трекеров и статистику

let isVPNEnabled = false;
let currentProxy = null;

// Список правил для блокировки трекеров (EasyList-подобные)
const trackerRules = [
  { id: 1, priority: 1, action: { type: "block" }, condition: { urlFilter: "google-analytics.com" } },
  { id: 2, priority: 1, action: { type: "block" }, condition: { urlFilter: "doubleclick.net" } },
  { id: 3, priority: 1, action: { type: "block" }, condition: { urlFilter: "facebook.com/tr" } },
  // Добавляй больше правил
];

// Включаем VPN (прокси)
async function enableVPN(proxyConfig) {
  currentProxy = proxyConfig;
  isVPNEnabled = true;
  
  await chrome.proxy.settings.set({
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "http",
          host: proxyConfig.host,
          port: parseInt(proxyConfig.port)
        }
      }
    },
    scope: 'regular'
  });
  
  // Обновляем правила блокировки
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: trackerRules.map(r => r.id),
    addRules: trackerRules
  });
  
  console.log("✅ One Max VPN включен");
}

// Выключаем VPN
async function disableVPN() {
  isVPNEnabled = false;
  await chrome.proxy.settings.set({
    value: { mode: "direct" },
    scope: 'regular'
  });
  console.log("❌ One Max VPN выключен");
}

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "toggleVPN") {
    if (message.enabled) {
      enableVPN(message.proxy);
    } else {
      disableVPN();
    }
    sendResponse({ success: true });
  }
  return true;
});