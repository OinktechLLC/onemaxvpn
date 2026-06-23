// Service Worker для One Max VPN
// Управление прокси и блокировкой трекеров

let currentProxy = null;

chrome.runtime.onInstalled.addListener(() => {
  console.log('One Max VPN установлен');
  loadProxySettings();
});

async function loadProxySettings() {
  const result = await chrome.storage.local.get(['vpnEnabled', 'currentServer']);
  if (result.vpnEnabled) {
    enableProxy(result.currentServer || 'default');
  }
}

function enableProxy(server) {
  currentProxy = {
    scheme: "http",
    host: server.host || "proxy.example.com",
    port: server.port || 8080
  };

  chrome.proxy.settings.set({
    value: {
      mode: "fixed_servers",
      rules: {
        singleProxy: currentProxy
      }
    },
    scope: 'regular'
  }, () => {
    console.log('VPN включён для сервера:', server);
  });
}

function disableProxy() {
  chrome.proxy.settings.set({
    value: { mode: "direct" },
    scope: 'regular'
  });
  currentProxy = null;
  console.log('VPN выключен');
}

// Слушаем сообщения от popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleVPN') {
    if (message.enabled) {
      enableProxy(message.server);
    } else {
      disableProxy();
    }
    chrome.storage.local.set({ vpnEnabled: message.enabled });
    sendResponse({ success: true });
  }
});
