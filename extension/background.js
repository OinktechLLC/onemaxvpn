// Background service worker - Proxy management
chrome.runtime.onInstalled.addListener(() => {
  console.log('One Max VPN installed');
});

let currentProxy = null;

// Включение VPN
async function enableVPN() {
  currentProxy = {
    mode: "fixed_servers",
    rules: {
      singleProxy: {
        scheme: "http",
        host: "proxy.example.com", // Will be updated from servers.json
        port: 8080
      }
    }
  };
  
  await chrome.proxy.settings.set({ value: currentProxy, scope: 'regular' });
  console.log('VPN Enabled');
}

// Выключение VPN
async function disableVPN() {
  await chrome.proxy.settings.set({ 
    value: { mode: "direct" }, 
    scope: 'regular' 
  });
  console.log('VPN Disabled');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleVPN') {
    if (message.enabled) {
      enableVPN();
    } else {
      disableVPN();
    }
    sendResponse({ success: true });
  }
});
