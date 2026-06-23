// Логика попапа One Max VPN

document.addEventListener('DOMContentLoaded', async () => {
  const connectBtn = document.getElementById('connectBtn');
  const dataSave = document.getElementById('dataSave');
  const privacy = document.getElementById('privacy');

  // Загружаем состояние
  const state = await chrome.storage.local.get(['vpnEnabled']);
  connectBtn.textContent = state.vpnEnabled ? 'Disconnect' : 'Connect';
  connectBtn.style.background = state.vpnEnabled ? '#ff3b30' : '#34c759';

  connectBtn.addEventListener('click', () => {
    const enabled = connectBtn.textContent === 'Connect';
    chrome.runtime.sendMessage({
      action: 'toggleVPN',
      enabled: enabled,
      server: { host: 'live.proxy.one-max.com', port: 8080 }
    }, (response) => {
      if (response.success) {
        connectBtn.textContent = enabled ? 'Disconnect' : 'Connect';
        connectBtn.style.background = enabled ? '#ff3b30' : '#34c759';
      }
    });
  });
});
