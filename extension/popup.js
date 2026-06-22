/**
 * One Max VPN — Логика popup
 */

// ─── Утилиты ─────────────────────────────────────────────────────────────────

/** Форматирует байты в читаемый вид */
function formatBytes(bytes) {
  if (bytes < 1024)       return { value: bytes,                    unit: 'Б'  };
  if (bytes < 1024**2)    return { value: (bytes / 1024).toFixed(1),      unit: 'КБ' };
  if (bytes < 1024**3)    return { value: (bytes / 1024**2).toFixed(2),   unit: 'МБ' };
  return                         { value: (bytes / 1024**3).toFixed(2),   unit: 'ГБ' };
}

/** Отправляет сообщение в background и возвращает Promise */
function sendMsg(action, extra = {}) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action, ...extra }, (resp) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(resp);
    });
  });
}

// ─── Элементы DOM ─────────────────────────────────────────────────────────────

const vpnBtn         = document.getElementById('vpnBtn');
const vpnIcon        = document.getElementById('vpnIcon');
const vpnLabel       = document.getElementById('vpnLabel');
const statusText     = document.getElementById('statusText');
const statusLabel    = document.getElementById('statusLabel');
const serverHost     = document.getElementById('serverHost');
const serverPort     = document.getElementById('serverPort');
const serverFlag     = document.getElementById('serverFlag');
const savedBytesEl   = document.getElementById('savedBytes');
const savedUnitEl    = document.getElementById('savedUnit');
const blockedReqsEl  = document.getElementById('blockedReqs');
const toggleTrackers = document.getElementById('toggleTrackers');
const toggleIncognito= document.getElementById('toggleIncognito');
const btnSwitch      = document.getElementById('btnSwitch');
const btnRefresh     = document.getElementById('btnRefresh');
const loader         = document.getElementById('loader');
const versionEl      = document.getElementById('version');

// ─── Состояние ────────────────────────────────────────────────────────────────

let isLoading = false;

/** Показывает/скрывает лоадер */
function setLoading(v) {
  isLoading = v;
  loader.classList.toggle('active', v);
  vpnBtn.disabled = v;
}

/** Обновляет UI по состоянию */
function renderState(state) {
  const { vpnEnabled, currentServer, savedBytes, blockedRequests, trackersEnabled, incognitoOnExit } = state;

  // Кнопка
  vpnBtn.className = 'vpn-btn ' + (vpnEnabled ? 'on' : 'off');
  vpnIcon.textContent  = vpnEnabled ? '🔓' : '🔒';
  vpnLabel.textContent = vpnEnabled ? 'ВКЛ' : 'ВЫКЛ';

  // Статус
  statusText.className = 'status-text ' + (vpnEnabled ? 'connected' : 'disconnected');
  statusLabel.textContent = vpnEnabled ? `Подключено` : 'Не подключено';

  // Сервер
  if (currentServer) {
    serverHost.textContent = currentServer.host;
    serverPort.textContent = `Порт: ${currentServer.port}`;
    serverFlag.textContent = '🌐'; // можно добавить геолокацию
  } else {
    serverHost.textContent = '—';
    serverPort.textContent = 'Нет сервера';
  }

  // Статистика
  const fmt = formatBytes(savedBytes || 0);
  savedBytesEl.textContent = fmt.value;
  savedUnitEl.textContent  = fmt.unit;
  blockedReqsEl.textContent = (blockedRequests || 0).toLocaleString('ru');

  // Тоглы
  toggleTrackers.checked  = !!trackersEnabled;
  toggleIncognito.checked = !!incognitoOnExit;
}

// ─── Загрузка состояния ──────────────────────────────────────────────────────

async function loadState() {
  setLoading(true);
  try {
    const resp = await sendMsg('getState');
    if (resp?.success) renderState(resp.state);
  } catch (e) {
    console.error('[popup] Ошибка загрузки состояния:', e);
  } finally {
    setLoading(false);
  }
}

// ─── Обработчики ─────────────────────────────────────────────────────────────

// Главная кнопка VPN
vpnBtn.addEventListener('click', async () => {
  if (isLoading) return;
  setLoading(true);
  try {
    const { state } = (await sendMsg('getState')) || {};
    const action = state?.vpnEnabled ? 'disableVPN' : 'enableVPN';
    const resp = await sendMsg(action);
    if (resp?.success) await loadState();
  } catch (e) {
    console.error('[popup] Ошибка переключения VPN:', e);
  } finally {
    setLoading(false);
  }
});

// Смена сервера
btnSwitch.addEventListener('click', async () => {
  if (isLoading) return;
  setLoading(true);
  try {
    const resp = await sendMsg('switchServer');
    if (resp?.success) await loadState();
  } catch (e) {
    console.error('[popup] Ошибка смены сервера:', e);
  } finally {
    setLoading(false);
  }
});

// Тогл блокировки трекеров
toggleTrackers.addEventListener('change', async () => {
  await sendMsg('updateSettings', { settings: { trackersEnabled: toggleTrackers.checked } });
});

// Тогл очистки при выходе
toggleIncognito.addEventListener('change', async () => {
  await sendMsg('updateSettings', { settings: { incognitoOnExit: toggleIncognito.checked } });
});

// Кнопка обновления серверов
btnRefresh.addEventListener('click', async () => {
  if (isLoading) return;
  setLoading(true);
  btnRefresh.textContent = '⏳ Обновляю...';
  try {
    const resp = await sendMsg('forceUpdateServers');
    if (resp?.success) {
      btnRefresh.textContent = `✅ Серверов: ${resp.count}`;
      setTimeout(() => { btnRefresh.textContent = '🔄 Обновить серверы'; }, 2000);
      await loadState();
    }
  } catch (e) {
    btnRefresh.textContent = '❌ Ошибка';
    setTimeout(() => { btnRefresh.textContent = '🔄 Обновить серверы'; }, 2000);
  } finally {
    setLoading(false);
  }
});

// ─── Инициализация ────────────────────────────────────────────────────────────

(async () => {
  // Показываем версию из манифеста
  const manifest = chrome.runtime.getManifest();
  versionEl.textContent = 'v' + manifest.version;

  await loadState();
})();
