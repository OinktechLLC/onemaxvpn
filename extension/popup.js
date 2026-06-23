// Popup logic
let vpnEnabled = false;

document.getElementById('connectBtn').addEventListener('click', () => {
  vpnEnabled = !vpnEnabled;
  const btn = document.getElementById('connectBtn');
  btn.textContent = vpnEnabled ? 'Disconnect' : 'Connect';
  btn.style.background = vpnEnabled ? '#f44336' : '#4CAF50';
  
  chrome.runtime.sendMessage({ 
    action: 'toggleVPN', 
    enabled: vpnEnabled 
  });
});
