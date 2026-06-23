// Popup logic - Samsung Max style
document.getElementById('connectBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'toggleVPN', enabled: true }, (response) => {
    alert('VPN подключён! Сервер обновлён автоматически.');
  });
});

console.log('One Max VPN Popup loaded');