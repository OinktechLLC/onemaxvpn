/**
 * One Max VPN — Background Service Worker
 * Управляет прокси, статистикой, алармами и состоянием расширения
 */

// ─── Константы ───────────────────────────────────────────────────────────────

/** URL сервера для получения актуального списка прокси */
const PROXY_UPDATE_URL = 'https://one-max-vpn.vercel.app/servers.json';

/** Интервал автообновления серверов (в минутах) */
const SERVER_UPDATE_INTERVAL = 60 * 24; // раз в сутки

/** Дефолтный пул серверов (резервные, если API недоступен) */
const DEFAULT_SERVERS = [
  { host: '185.220.101.1',  port: 8080, username: 'onemaxvpn', password: 'free2024' },
  { host: '185.220.101.2',  port: 8080, username: 'onemaxvpn', password: 'free2024' },
  { host: '45.142.212.100', port: 3128, username: '',           password: ''           }
];

// ─── Инициализация ────────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('[OneMaxVPN] Расширение установлено/обновлено:', details.reason);

  // Инициализируем хранилище при первой установке
  if (details.reason === 'install') {
    await chrome.storage.local.set({
      vpnEnabled:       false,
      currentServer:    DEFAULT_SERVERS[0],
      servers:          DEFAULT_SERVERS,
      savedBytes:       0,       // сэкономленный трафик в байтах
      blockedRequests:  0,       // заблокированных запросов
      whitelistDomains: [],      // домены, которые идут напрямую
      blacklistDomains: [],      // принудительно через VPN
      trackersEnabled:  true,    // блокировка трекеров
      incognitoOnExit:  false    // очищать данные при отключении
    });
    console.log('[OneMaxVPN] Хранилище инициализировано');
  }

  // Регистрируем аларм для обновления серверов
  await registerServerUpdateAlarm();
});

// ─── Аларм: обновление серверов ──────────────────────────────────────────────

async function registerServerUpdateAlarm() {
  await chrome.alarms.clear('updateServers');
  await chrome.alarms.create('updateServers', {
    periodInMinutes: SERVER_UPDATE_INTERVAL
  });
  console.log('[OneMaxVPN] Аларм обновления серверов зарегистрирован');
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'updateServers') {
    await fetchAndUpdateServers();
  }
});

/** Загружает актуальный список серверов с удалённого API */
async function fetchAndUpdateServers() {
  try {
    console.log('[OneMaxVPN] Обновляю список серверов...');
    const resp = await fetch(PROXY_UPDATE_URL, { cache: 'no-store' });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const servers = await resp.json();
    if (!Array.isArray(servers) || servers.length === 0) throw new Error('Пустой список');

    await chrome.storage.local.set({ servers });
    console.log('[OneMaxVPN] Серверов получено:', servers.length);

    // Если VPN включён — переключаемся на первый новый сервер
    const { vpnEnabled } = await chrome.storage.local.get('vpnEnabled');
    if (vpnEnabled) {
      await applyProxy(servers[0]);
      await chrome.storage.local.set({ currentServer: servers[0] });
    }
  } catch (err) {
    console.warn('[OneMaxVPN] Не удалось обновить серверы:', err.message);
  }
}

// ─── Управление прокси ────────────────────────────────────────────────────────

/**
 * Включает прокси через chrome.proxy.settings
 * @param {{ host: string, port: number, username?: string, password?: string }} server
 */
async function applyProxy(server) {
  const config = {
    mode: 'fixed_servers',
    rules: {
      singleProxy: {
        scheme: 'http',
        host:   server.host,
        port:   parseInt(server.port)
      },
      bypassList: ['localhost', '127.0.0.1', '<local>']
    }
  };

  await chrome.proxy.settings.set({ value: config, scope: 'regular' });
  console.log('[OneMaxVPN] Прокси включён:', server.host + ':' + server.port);

  // Если нужна авторизация — обрабатываем через webAuthRequired
  if (server.username) {
    chrome.webRequest.onAuthRequired.addListener(
      handleProxyAuth,
      { urls: ['<all_urls>'] },
      ['asyncBlocking']
    );
  }
}

/** Снимает прокси (прямое соединение) */
async function clearProxy() {
  await chrome.proxy.settings.set({
    value: { mode: 'direct' },
    scope: 'regular'
  });

  // Убираем слушатель авторизации
  if (chrome.webRequest.onAuthRequired.hasListener(handleProxyAuth)) {
    chrome.webRequest.onAuthRequired.removeListener(handleProxyAuth);
  }
  console.log('[OneMaxVPN] Прокси отключён');
}

/** Обрабатывает запрос авторизации прокси-сервера */
function handleProxyAuth(details, callbackFn) {
  chrome.storage.local.get('currentServer', ({ currentServer }) => {
    if (currentServer?.username) {
      callbackFn({
        authCredentials: {
          username: currentServer.username,
          password: currentServer.password
        }
      });
    } else {
      callbackFn({});
    }
  });
}

// ─── Сообщения от popup / content script ─────────────────────────────────────

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  (async () => {
    try {
      switch (msg.action) {

        // Включить VPN
        case 'enableVPN': {
          const { servers, currentServer } = await chrome.storage.local.get(['servers', 'currentServer']);
          const server = currentServer || (servers && servers[0]) || DEFAULT_SERVERS[0];
          await applyProxy(server);
          await chrome.storage.local.set({ vpnEnabled: true, currentServer: server });
          sendResponse({ success: true, server });
          break;
        }

        // Выключить VPN
        case 'disableVPN': {
          await clearProxy();
          await chrome.storage.local.set({ vpnEnabled: false });
          // Режим инкогнито — очищаем данные браузера
          const { incognitoOnExit } = await chrome.storage.local.get('incognitoOnExit');
          if (incognitoOnExit) {
            await clearBrowsingData();
          }
          sendResponse({ success: true });
          break;
        }

        // Получить текущее состояние
        case 'getState': {
          const state = await chrome.storage.local.get([
            'vpnEnabled', 'currentServer', 'savedBytes',
            'blockedRequests', 'trackersEnabled', 'incognitoOnExit',
            'whitelistDomains', 'blacklistDomains', 'servers'
          ]);
          sendResponse({ success: true, state });
          break;
        }

        // Сменить сервер вручную
        case 'switchServer': {
          const { servers } = await chrome.storage.local.get('servers');
          const pool = servers?.length ? servers : DEFAULT_SERVERS;
          const idx = pool.findIndex(s => s.host === msg.host) ?? 0;
          const next = pool[(idx + 1) % pool.length];
          await chrome.storage.local.set({ currentServer: next });
          const { vpnEnabled } = await chrome.storage.local.get('vpnEnabled');
          if (vpnEnabled) await applyProxy(next);
          sendResponse({ success: true, server: next });
          break;
        }

        // Обновить настройки
        case 'updateSettings': {
          await chrome.storage.local.set(msg.settings);
          sendResponse({ success: true });
          break;
        }

        // Принудительно обновить серверы
        case 'forceUpdateServers': {
          await fetchAndUpdateServers();
          const { servers } = await chrome.storage.local.get('servers');
          sendResponse({ success: true, count: servers?.length });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Неизвестное действие: ' + msg.action });
      }
    } catch (err) {
      console.error('[OneMaxVPN] Ошибка обработки сообщения:', err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // асинхронный ответ
});

// ─── Очистка данных браузера (incognito-режим) ───────────────────────────────

async function clearBrowsingData() {
  const since = Date.now() - 1000 * 60 * 60; // последний час
  await chrome.browsingData.remove({ since }, {
    cookies:        true,
    cache:          true,
    localStorage:   true,
    sessionStorage: true,
    indexedDB:      true
  });
  console.log('[OneMaxVPN] Данные браузера очищены (incognito-режим)');
}

// ─── Отслеживание сэкономленного трафика ─────────────────────────────────────

/**
 * Перехватываем ответы для подсчёта трафика.
 * Сжатие на уровне расширения не реализуемо в MV3 напрямую,
 * но мы считаем разницу Content-Length vs Transfer-Encoding.
 */
chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if (!details.responseHeaders) return;

    let contentLength = 0;
    let contentEncoding = '';

    for (const h of details.responseHeaders) {
      const name = h.name.toLowerCase();
      if (name === 'content-length')   contentLength   = parseInt(h.value) || 0;
      if (name === 'content-encoding') contentEncoding = h.value;
    }

    // Считаем как "сэкономленное" если контент сжат сервером (gzip/br)
    if (contentEncoding && contentLength > 0) {
      const estimatedOriginal = Math.floor(contentLength * 3); // эвристика ~3x
      const saved = estimatedOriginal - contentLength;
      if (saved > 0) {
        chrome.storage.local.get('savedBytes', ({ savedBytes }) => {
          chrome.storage.local.set({ savedBytes: (savedBytes || 0) + saved });
        });
      }
    }
  },
  { urls: ['<all_urls>'] },
  ['responseHeaders']
);

// ─── Старт: применяем прокси если VPN был включён до перезагрузки ────────────

(async () => {
  const { vpnEnabled, currentServer } = await chrome.storage.local.get(['vpnEnabled', 'currentServer']);
  if (vpnEnabled && currentServer) {
    await applyProxy(currentServer);
    console.log('[OneMaxVPN] VPN восстановлен после перезагрузки');
  }
})();

console.log('[OneMaxVPN] Service Worker запущен');
