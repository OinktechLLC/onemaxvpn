// background.js — Service Worker для One Max VPN

console.log('One Max VPN background started');

// Глобальное состояние
let isVPNEnabled = false;
let currentProxy = null;

// Список серверов (обновляется ботом)
const SERVER_POOL = [
  { host: "proxy1.example.com", port: 8080, username: "", password: "" },
  { host: "proxy2.example.com", port: 8080, username: "", password: "" }
];

// Включение VPN
async function enableVPN() {
  isVPNEnabled = true;
  
  // Выбираем случайный сервер
  currentProxy = SERVER_POOL[Math.floor(Math.random() * SERVER_POOL.length)];

  await chrome.proxy.settings.set({
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: {
          scheme: "http",
          host: currentProxy.host,
          port: currentProxy.port
        }
      }
    },
    scope: 'regular'
  });

  console.log('VPN включён через', currentProxy.host);
  chrome.storage.local.set({ vpnEnabled: true, currentProxy });
}

// Выключение VPN
async function disableVPN() {
  isVPNEnabled = false;
  await chrome.proxy.settings.clear({ scope: 'regular' });
  chrome.storage.local.set({ vpnEnabled: false });
  console.log('VPN выключен');
}

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleVPN') {
    if (isVPNEnabled) {
      disableVPN();
    } else {
      enableVPN();
    }
    sendResponse({ success: true, enabled: !isVPNEnabled });
  }
  return true;
});

// Инициализация
chrome.storage.local.get('vpnEnabled', (data) => {
  if (data.vpnEnabled) enableVPN();
});
