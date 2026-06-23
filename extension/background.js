/**
 * One Max VPN — Background Service Worker
 * Прокси, авто-обновление серверов (GitHub Actions CDN), статистика
 */

const SERVERS_URL = 'https://one-max-vpn.vercel.app/servers.json';

const FALLBACK = [
  { host: '185.220.101.1',   port: 8080, name: 'Germany #1',     country: 'DE', flag: '🇩🇪' },
  { host: '185.220.101.34',  port: 8080, name: 'Germany #2',     country: 'DE', flag: '🇩🇪' },
  { host: '45.142.212.100',  port: 3128, name: 'Netherlands #1', country: 'NL', flag: '🇳🇱' },
  { host: '103.149.162.195', port: 80,   name: 'Singapore #1',   country: 'SG', flag: '🇸🇬' },
  { host: '20.206.106.192',  port: 8080, name: 'USA #1',         country: 'US', flag: '🇺🇸' },
];

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({
      vpnEnabled: false, currentServer: null, servers: FALLBACK,
      savedBytes: 0, blockedCount: 0, wifiSaving: false,
      privacyMode: true, adBlock: true, incognitoOnExit: false, lastUpdated: null
    });
  }
  await refreshServers();
  await registerAlarm();
});

async function registerAlarm() {
  await chrome.alarms.clear('refreshServers');
  chrome.alarms.create('refreshServers', { periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'refreshServers') await refreshServers();
});

async function refreshServers() {
  try {
    const r = await fetch(SERVERS_URL + '?_=' + Date.now(), {
      cache: 'no-store', signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('empty');
    const servers = raw.map(s => ({
      host: s.host || s.ip, port: parseInt(s.port),
      name: s.name || countryName(s.country),
      country: s.country || 'XX', flag: s.flag || countryFlag(s.country), ping: null
    }));
    await chrome.storage.local.set({ servers, lastUpdated: new Date().toISOString() });
    console.log('[OneMaxVPN] Серверов:', servers.length);
    const { vpnEnabled, currentServer } = await chrome.storage.local.get(['vpnEnabled','currentServer']);
    if (vpnEnabled) {
      const refreshed = servers.find(s => s.host === currentServer?.host) || servers[0];
      await applyProxy(refreshed);
      await chrome.storage.local.set({ currentServer: refreshed });
    }
  } catch (e) {
    console.warn('[OneMaxVPN] Обновление не удалось:', e.message);
    const { servers } = await chrome.storage.local.get('servers');
    if (!servers?.length) await chrome.storage.local.set({ servers: FALLBACK });
  }
}

async function applyProxy(server) {
  await chrome.proxy.settings.set({
    value: {
      mode: 'fixed_servers',
      rules: { singleProxy: { scheme: 'http', host: server.host, port: parseInt(server.port) }, bypassList: ['localhost','127.0.0.1','<local>'] }
    }, scope: 'regular'
  });
  if (server.username && !chrome.webRequest.onAuthRequired.hasListener(onAuth))
    chrome.webRequest.onAuthRequired.addListener(onAuth, { urls: ['<all_urls>'] }, ['asyncBlocking']);
}

async function clearProxy() {
  await chrome.proxy.settings.set({ value: { mode: 'direct' }, scope: 'regular' });
  if (chrome.webRequest.onAuthRequired.hasListener(onAuth))
    chrome.webRequest.onAuthRequired.removeListener(onAuth);
}

function onAuth(details, cb) {
  chrome.storage.local.get('currentServer', ({ currentServer }) => {
    if (currentServer?.username) cb({ authCredentials: { username: currentServer.username, password: currentServer.password } });
    else cb({});
  });
}

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (!details.responseHeaders) return;
  let len = 0, enc = '';
  for (const h of details.responseHeaders) {
    const n = h.name.toLowerCase();
    if (n === 'content-length')   len = parseInt(h.value) || 0;
    if (n === 'content-encoding') enc = h.value;
  }
  if (enc && len > 0) {
    const saved = Math.floor(len * 1.8) - len;
    if (saved > 0) chrome.storage.local.get('savedBytes', ({ savedBytes }) => {
      chrome.storage.local.set({ savedBytes: (savedBytes || 0) + saved });
    });
  }
}, { urls: ['<all_urls>'] }, ['responseHeaders']);

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {
        case 'getState': {
          const state = await chrome.storage.local.get([
            'vpnEnabled','currentServer','servers','savedBytes','blockedCount',
            'wifiSaving','privacyMode','adBlock','incognitoOnExit','lastUpdated'
          ]);
          sendResponse({ ok: true, state }); break;
        }
        case 'toggleVPN': {
          const { vpnEnabled, servers, currentServer } = await chrome.storage.local.get(['vpnEnabled','servers','currentServer']);
          const next = !vpnEnabled;
          if (next) {
            const srv = currentServer || servers?.[0] || FALLBACK[0];
            await applyProxy(srv);
            await chrome.storage.local.set({ vpnEnabled: true, currentServer: srv });
          } else {
            await clearProxy();
            await chrome.storage.local.set({ vpnEnabled: false });
            const { incognitoOnExit } = await chrome.storage.local.get('incognitoOnExit');
            if (incognitoOnExit) await clearData();
          }
          sendResponse({ ok: true, vpnEnabled: next }); break;
        }
        case 'switchServer': {
          const { servers, currentServer, vpnEnabled } = await chrome.storage.local.get(['servers','currentServer','vpnEnabled']);
          const pool = servers?.length ? servers : FALLBACK;
          const idx  = pool.findIndex(s => s.host === currentServer?.host);
          const next = pool[(idx + 1) % pool.length];
          await chrome.storage.local.set({ currentServer: next });
          if (vpnEnabled) await applyProxy(next);
          sendResponse({ ok: true, server: next }); break;
        }
        case 'selectServer': {
          const { servers, vpnEnabled } = await chrome.storage.local.get(['servers','vpnEnabled']);
          const srv = servers?.find(s => s.host === msg.host);
          if (srv) { await chrome.storage.local.set({ currentServer: srv }); if (vpnEnabled) await applyProxy(srv); }
          sendResponse({ ok: !!srv }); break;
        }
        case 'setSetting': {
          if (msg.payload._clearNow) { await clearData(); delete msg.payload._clearNow; }
          if (Object.keys(msg.payload).length) await chrome.storage.local.set(msg.payload);
          sendResponse({ ok: true }); break;
        }
        case 'forceRefresh': {
          await refreshServers();
          const { servers } = await chrome.storage.local.get('servers');
          sendResponse({ ok: true, count: servers?.length }); break;
        }
        default: sendResponse({ ok: false, error: 'unknown action' });
      }
    } catch (e) { sendResponse({ ok: false, error: e.message }); }
  })();
  return true;
});

async function clearData() {
  await chrome.browsingData.remove({ since: Date.now() - 3600000 }, {
    cookies: true, cache: true, localStorage: true, sessionStorage: true
  });
}

function countryName(code) {
  const m = { DE:'Germany',NL:'Netherlands',US:'United States',SG:'Singapore',
    FR:'France',GB:'United Kingdom',FI:'Finland',SE:'Sweden',CH:'Switzerland',
    AT:'Austria',CZ:'Czech Republic',PL:'Poland',RO:'Romania',UA:'Ukraine' };
  return m[code] || code || 'Unknown';
}

function countryFlag(code) {
  if (!code || code.length !== 2) return '🌐';
  return [...code.toUpperCase()].map(c => String.fromCodePoint(0x1F1E6 + c.charCodeAt(0) - 65)).join('');
}

(async () => {
  const { vpnEnabled, currentServer } = await chrome.storage.local.get(['vpnEnabled','currentServer']);
  if (vpnEnabled && currentServer) await applyProxy(currentServer);
  await registerAlarm();
})();
