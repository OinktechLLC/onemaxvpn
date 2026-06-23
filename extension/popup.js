// popup.js
let isEnabled = false;

document.getElementById('connectBtn').addEventListener('click', async () => {
  const response = await chrome.runtime.sendMessage({ action: 'toggleVPN' });
  if (response.success) {
    isEnabled = response.enabled;
    document.getElementById('connectBtn').textContent = isEnabled ? 'Disconnect' : 'Connect';
    document.getElementById('connectBtn').style.background = isEnabled ? '#ff3b30' : '#34c759';
  }
});

// Загрузка состояния
chrome.storage.local.get('vpnEnabled', (data) => {
  isEnabled = !!data.vpnEnabled;
  document.getElementById('connectBtn').textContent = isEnabled ? 'Disconnect' : 'Connect';
  document.getElementById('connectBtn').style.background = isEnabled ? '#ff3b30' : '#34c759';
});
