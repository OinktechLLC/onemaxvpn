// popup.js — Логика попапа One Max VPN
let isEnabled = false;

document.getElementById('connectBtn').addEventListener('click', async () => {
  isEnabled = !isEnabled;
  const btn = document.getElementById('connectBtn');
  
  if (isEnabled) {
    btn.textContent = 'Disconnect';
    btn.style.background = '#ff3b30';
    
    // Пример production прокси (обновляется из servers.json)
    const proxy = { host: "proxy.one-max-vpn.com", port: "8080" };
    
    chrome.runtime.sendMessage({
      action: "toggleVPN",
      enabled: true,
      proxy: proxy
    });
  } else {
    btn.textContent = 'Connect';
    btn.style.background = '#34c759';
    
    chrome.runtime.sendMessage({
      action: "toggleVPN",
      enabled: false
    });
  }
});

// Загрузка сохранённого состояния
chrome.storage.local.get('vpnEnabled', (data) => {
  isEnabled = data.vpnEnabled || false;
  // Обновить UI...
});