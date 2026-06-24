/**
 * One Max VPN — Background Service Worker
 * СБП: Selective Bypass Proxy
 * Только заблокированные в РФ домены идут через прокси.
 * Остальной трафик — напрямую. Скорость не падает.
 */

// ─── CDN с серверами (робот обновляет каждый день) ───────────────────────────
const SERVERS_URL = 'https://one-max-vpn.vercel.app/servers.json';

// ─── Домены заблокированные в РФ (СБП-список) ────────────────────────────────
// Расширение проксирует ТОЛЬКО их — всё остальное идёт напрямую
const BYPASS_DOMAINS = [
  // Google сервисы
  'youtube.com','youtu.be','googlevideo.com','ytimg.com','yt3.ggpht.com',
  'youtube-nocookie.com','youtubeembeddedplayer.com',
  'google.com','googleapis.com','gstatic.com','googleusercontent.com',
  'gmail.com','google.ru',
  // Telegram
  'telegram.org','t.me','telegram.me','web.telegram.org',
  'tdesktop.com','telegra.ph','t.co',
  // WhatsApp / Meta
  'whatsapp.com','whatsapp.net','wa.me',
  'facebook.com','fbcdn.net','instagram.com','cdninstagram.com',
  // Anthropic / Claude
  'anthropic.com','claude.ai',
  // OpenAI / ChatGPT
  'openai.com','chatgpt.com','oaiusercontent.com',
  // Twitter / X
  'twitter.com','x.com','twimg.com','t.co',
  // Discord
  'discord.com','discord.gg','discordapp.com','discordapp.net',
  // LinkedIn
  'linkedin.com','licdn.com',
  // Reddit
  'reddit.com','redd.it','redditmedia.com','redditstatic.com',
  // TikTok
  'tiktok.com','tiktokcdn.com','musical.ly',
  // Spotify
  'spotify.com','scdn.co','spotifycdn.com',
  // GitHub
  'github.com','githubusercontent.com','githubassets.com',
  // Medium
  'medium.com',
  // Другие заблокированные
  'canva.com','figma.com',
  'notion.so','notionusercontent.com',
  'slack.com',
  'zoom.us','zoomgov.com',
  'trello.com','atlassian.com',
  'soundcloud.com',
  'twitch.tv','twitchsvc.net',
  'deviantart.com',
  'patreon.com',
  'change.org',
  'bbc.com','bbc.co.uk',
  'reuters.com',
  'dw.com',
  'meduza.io',
  'novayagazeta.ru',
  'icloud.com','apple.com','mzstatic.com',
];

// ─── Резервные серверы (если CDN недоступен) ─────────────────────────────────
const FALLBACK_SERVERS = [
  { host:'185.220.101.1',  port:8080, name:'Germany #1',    country:'DE', flag:'🇩🇪' },
  { host:'185.220.101.34', port:8080, name:'Germany #2',    country:'DE', flag:'🇩🇪' },
  { host:'45.142.212.100', port:3128, name:'Netherlands #1',country:'NL', flag:'🇳🇱' },
  { host:'20.206.106.192', port:8080, name:'USA #1',        country:'US', flag:'🇺🇸' },
  { host:'51.91.11.29',    port:3128, name:'France #1',     country:'FR', flag:'🇫🇷' },
];

// ─── PAC-скрипт: умный роутинг ───────────────────────────────────────────────

/**
 * Генерирует PAC-скрипт (Proxy Auto-Config).
 * PAC — стандарт браузера: функция FindProxyForURL решает для каждого URL
 * идти ли напрямую или через прокси.
 */
function buildPAC(server, domains) {
  const proxyStr = `PROXY ${server.host}:${server.port}`;

  // Строим регулярку из доменов (быстрая проверка)
  const domainList = JSON.stringify(domains);

  return `
var BYPASS = ${domainList};

function FindProxyForURL(url, host) {
  // Локальные адреса — всегда напрямую
  if (isPlainHostName(host) || isInNet(host, "10.0.0.0", "255.0.0.0") ||
      isInNet(host, "172.16.0.0", "255.240.0.0") ||
      isInNet(host, "192.168.0.0", "255.255.0.0") ||
      isInNet(host, "127.0.0.0", "255.255.255.0")) {
    return "DIRECT";
  }

  // Проверяем домен и все его родительские домены
  var parts = host.split('.');
  for (var i = 0; i < parts.length - 1; i++) {
    var sub = parts.slice(i).join('.');
    for (var j = 0; j < BYPASS.length; j++) {
      if (sub === BYPASS[j] || host === BYPASS[j]) {
        return "${proxyStr}; DIRECT";
      }
    }
  }

  // Всё остальное — напрямую
  return "DIRECT";
}
`.trim();
}

// ─── Применить СБП (PAC-прокси) ──────────────────────────────────────────────

async function applySBP(server) {
  const pac = buildPAC(server, BYPASS_DOMAINS);

  // Кодируем PAC как data-URL
  const pacUrl = 'data:application/x-ns-proxy-autoconfig,' + encodeURIComponent(pac);

  await chrome.proxy.settings.set({
    value: { mode: 'pac_script', pacScript: { url: pacUrl } },
    scope: 'regular'
  });

  // Авторизация для прокси если нужна
  if (server.username) {
    if (!chrome.webRequest.onAuthRequired.hasListener(onAuth))
      chrome.webRequest.onAuthRequired.addListener(onAuth, { urls: ['<all_urls>'] }, ['asyncBlocking']);
  }

  console.log('[OneMaxVPN] СБП активирован:', server.host + ':' + server.port);
  console.log('[OneMaxVPN] Доменов в списке обхода:', BYPASS_DOMAINS.length);
}

async function clearProxy() {
  await chrome.proxy.settings.set({ value: { mode: 'direct' }, scope: 'regular' });
  if (chrome.webRequest.onAuthRequired.hasListener(onAuth))
    chrome.webRequest.onAuthRequired.removeListener(onAuth);
  console.log('[OneMaxVPN] СБП отключён');
}

function onAuth(details, cb) {
  chrome.storage.local.get('currentServer', ({ currentServer }) => {
    if (currentServer?.username)
      cb({ authCredentials: { username: currentServer.username, password: currentServer.password } });
    else cb({});
  });
}

// ─── Установка ───────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    await chrome.storage.local.set({
      sbpEnabled:      false,
      currentServer:   null,
      servers:         FALLBACK_SERVERS,
      savedBytes:      0,
      blockedCount:    0,
      sessionsCount:   0,
      wifiSaving:      false,
      privacyMode:     true,
      adBlock:         true,
      incognitoOnExit: false,
      customDomains:   [],       // пользовательские домены для обхода
      lastUpdated:     null,
      installDate:     new Date().toISOString(),
    });
    // Показываем уведомление
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: 'One Max VPN установлен',
      message: 'Нажмите на иконку расширения для настройки СБП'
    });
  }
  await refreshServers();
  await registerAlarm();
});

// ─── Аларм: обновление серверов каждые 24ч ──────────────────────────────────

async function registerAlarm() {
  await chrome.alarms.clear('refreshServers');
  chrome.alarms.create('refreshServers', { periodInMinutes: 1440 });
}

chrome.alarms.onAlarm.addListener(async alarm => {
  if (alarm.name === 'refreshServers') {
    await refreshServers();
    console.log('[OneMaxVPN] Серверы обновлены по аларму');
  }
});

// ─── Загрузка серверов с CDN (обновляется роботом) ──────────────────────────

async function refreshServers() {
  try {
    const r = await fetch(SERVERS_URL + '?_=' + Date.now(), {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const raw = await r.json();
    if (!Array.isArray(raw) || raw.length === 0) throw new Error('empty list');

    const servers = raw.map(s => ({
      host:    s.host || s.ip,
      port:    parseInt(s.port),
      name:    s.name    || countryName(s.country),
      country: s.country || 'XX',
      flag:    s.flag    || countryFlag(s.country),
      ping:    s.ping    || null,
      username: s.username || '',
      password: s.password || '',
    }));

    await chrome.storage.local.set({ servers, lastUpdated: new Date().toISOString() });
    console.log('[OneMaxVPN] Серверов загружено:', servers.length);

    // Если СБП активен — обновляем PAC с новым сервером
    const { sbpEnabled, currentServer } = await chrome.storage.local.get(['sbpEnabled','currentServer']);
    if (sbpEnabled) {
      const refreshed = servers.find(s => s.host === currentServer?.host) || servers[0];
      await applySBP(refreshed);
      await chrome.storage.local.set({ currentServer: refreshed });
    }
  } catch (e) {
    console.warn('[OneMaxVPN] Обновление серверов не удалось:', e.message);
    const { servers } = await chrome.storage.local.get('servers');
    if (!servers?.length) await chrome.storage.local.set({ servers: FALLBACK_SERVERS });
  }
}

// ─── Счётчик трафика ─────────────────────────────────────────────────────────

chrome.webRequest.onHeadersReceived.addListener(details => {
  if (!details.responseHeaders) return;
  let len = 0, enc = '';
  for (const h of details.responseHeaders) {
    const n = h.name.toLowerCase();
    if (n === 'content-length')   len = parseInt(h.value) || 0;
    if (n === 'content-encoding') enc = h.value;
  }
  if (enc && len > 0) {
    const saved = Math.floor(len * 1.6) - len;
    if (saved > 0) {
      chrome.storage.local.get('savedBytes', ({ savedBytes }) =>
        chrome.storage.local.set({ savedBytes: (savedBytes || 0) + saved })
      );
    }
  }
}, { urls: ['<all_urls>'] }, ['responseHeaders']);

// ─── Сообщения от popup ──────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {

        case 'getState': {
          const state = await chrome.storage.local.get([
            'sbpEnabled','currentServer','servers','savedBytes','blockedCount',
            'sessionsCount','wifiSaving','privacyMode','adBlock',
            'incognitoOnExit','customDomains','lastUpdated','installDate'
          ]);
          // Добавляем список доменов СБП
          state.bypassCount = BYPASS_DOMAINS.length + (state.customDomains?.length || 0);
          sendResponse({ ok: true, state });
          break;
        }

        case 'toggleSBP': {
          const { sbpEnabled, servers, currentServer } = await chrome.storage.local.get(
            ['sbpEnabled','servers','currentServer']
          );
          const next = !sbpEnabled;
          if (next) {
            const srv = currentServer || servers?.[0] || FALLBACK_SERVERS[0];
            await applySBP(srv);
            await chrome.storage.local.set({
              sbpEnabled: true,
              currentServer: srv,
              sessionsCount: 0  // сбрасываем счётчик сессии
            });
          } else {
            await clearProxy();
            await chrome.storage.local.set({ sbpEnabled: false });
            const { incognitoOnExit } = await chrome.storage.local.get('incognitoOnExit');
            if (incognitoOnExit) await clearBrowsingData();
          }
          sendResponse({ ok: true, sbpEnabled: next });
          break;
        }

        case 'switchServer': {
          const { servers, currentServer, sbpEnabled } = await chrome.storage.local.get(
            ['servers','currentServer','sbpEnabled']
          );
          const pool = servers?.length ? servers : FALLBACK_SERVERS;
          const idx  = pool.findIndex(s => s.host === currentServer?.host);
          const next = pool[(idx + 1) % pool.length];
          await chrome.storage.local.set({ currentServer: next });
          if (sbpEnabled) await applySBP(next);
          sendResponse({ ok: true, server: next });
          break;
        }

        case 'selectServer': {
          const { servers, sbpEnabled } = await chrome.storage.local.get(['servers','sbpEnabled']);
          const srv = servers?.find(s => s.host === msg.host);
          if (srv) {
            await chrome.storage.local.set({ currentServer: srv });
            if (sbpEnabled) await applySBP(srv);
          }
          sendResponse({ ok: !!srv });
          break;
        }

        case 'setSetting': {
          const payload = { ...msg.payload };
          const clearNow = payload._clearNow;
          delete payload._clearNow;
          if (clearNow) await clearBrowsingData();
          if (Object.keys(payload).length) await chrome.storage.local.set(payload);
          sendResponse({ ok: true });
          break;
        }

        case 'addCustomDomain': {
          const { customDomains } = await chrome.storage.local.get('customDomains');
          const list = customDomains || [];
          const domain = msg.domain?.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*/, '');
          if (domain && !list.includes(domain) && !BYPASS_DOMAINS.includes(domain)) {
            list.push(domain);
            await chrome.storage.local.set({ customDomains: list });
            // Обновляем PAC если СБП включён
            const { sbpEnabled, currentServer } = await chrome.storage.local.get(['sbpEnabled','currentServer']);
            if (sbpEnabled && currentServer) {
              await applySBP(currentServer, [...BYPASS_DOMAINS, ...list]);
            }
          }
          sendResponse({ ok: true, customDomains: list });
          break;
        }

        case 'removeCustomDomain': {
          const { customDomains } = await chrome.storage.local.get('customDomains');
          const list = (customDomains || []).filter(d => d !== msg.domain);
          await chrome.storage.local.set({ customDomains: list });
          sendResponse({ ok: true, customDomains: list });
          break;
        }

        case 'forceRefresh': {
          await refreshServers();
          const { servers } = await chrome.storage.local.get('servers');
          sendResponse({ ok: true, count: servers?.length });
          break;
        }

        default:
          sendResponse({ ok: false, error: 'Unknown: ' + msg.action });
      }
    } catch (e) {
      console.error('[OneMaxVPN]', e);
      sendResponse({ ok: false, error: e.message });
    }
  })();
  return true;
});

// ─── Очистка данных браузера ─────────────────────────────────────────────────

async function clearBrowsingData() {
  await chrome.browsingData.remove({ since: Date.now() - 3600000 * 24 }, {
    cookies: true, cache: true, localStorage: true, sessionStorage: true, indexedDB: true
  });
  console.log('[OneMaxVPN] Данные браузера очищены');
}

// ─── Хелперы ─────────────────────────────────────────────────────────────────

function countryName(c) {
  return { DE:'Germany',NL:'Netherlands',US:'United States',SG:'Singapore',
    FR:'France',GB:'United Kingdom',FI:'Finland',SE:'Sweden',CH:'Switzerland',
    AT:'Austria',CZ:'Czech Republic',PL:'Poland',RO:'Romania',UA:'Ukraine',
    JP:'Japan',CA:'Canada',AU:'Australia',LT:'Lithuania',LV:'Latvia' }[c] || c || 'Server';
}

function countryFlag(c) {
  if (!c || c.length !== 2) return '🌐';
  return [...c.toUpperCase()].map(x => String.fromCodePoint(0x1F1E6 + x.charCodeAt(0) - 65)).join('');
}

// ─── Восстановление СБП после перезагрузки Service Worker ───────────────────

(async () => {
  const { sbpEnabled, currentServer } = await chrome.storage.local.get(['sbpEnabled','currentServer']);
  if (sbpEnabled && currentServer) {
    await applySBP(currentServer);
    console.log('[OneMaxVPN] СБП восстановлен после перезагрузки SW');
  }
  await registerAlarm();
})();
