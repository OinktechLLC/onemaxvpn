/**
 * One Max VPN — popup.js
 * Логика всех 4 вкладок: Home / Servers / Stats / Privacy
 */

// ─── Утилиты ─────────────────────────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function fmtBytes(b) {
  if (!b || b < 1024)       return { v: b || 0,              u: 'Б'  };
  if (b < 1024 ** 2)        return { v: (b/1024).toFixed(1), u: 'КБ' };
  if (b < 1024 ** 3)        return { v: (b/1024**2).toFixed(2), u: 'МБ' };
  return                           { v: (b/1024**3).toFixed(2), u: 'ГБ' };
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru', { day:'2-digit', month:'2-digit' })
    + ' ' + d.toLocaleTimeString('ru', { hour:'2-digit', minute:'2-digit' });
}

function send(action, payload = {}) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage({ action, ...payload }, r => {
      if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
      res(r);
    });
  });
}

// ─── Вкладки ─────────────────────────────────────────────────────────────────

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    $('tab-' + tab.dataset.tab).classList.add('active');
    if (tab.dataset.tab === 'servers') renderServerList(lastState);
    if (tab.dataset.tab === 'stats')   renderStats(lastState);
  });
});

// ─── Состояние ───────────────────────────────────────────────────────────────

let lastState = {};
let pingInterval = null;

// ─── Кнопка Connect ──────────────────────────────────────────────────────────

$('connectBtn').addEventListener('click', async () => {
  $('connectBtn').classList.add('connecting');
  $('connectLabel').textContent = 'Подключаю...';
  try {
    const r = await send('toggleVPN');
    if (r?.ok) await loadAll();
  } finally {
    $('connectBtn').classList.remove('connecting');
  }
});

// ─── Следующий сервер ────────────────────────────────────────────────────────

$('btnNext').addEventListener('click', async () => {
  const r = await send('switchServer');
  if (r?.ok) await loadAll();
});

// ─── Обновить серверы ────────────────────────────────────────────────────────

$('btnRefresh').addEventListener('click', async () => {
  $('btnRefresh').textContent = '...';
  $('btnRefresh').disabled = true;
  try {
    const r = await send('forceRefresh');
    await loadAll();
    $('btnRefresh').textContent = r?.count ? '✓ ' + r.count : '✓';
    setTimeout(() => { $('btnRefresh').textContent = '↻'; $('btnRefresh').disabled = false; }, 2000);
  } catch {
    $('btnRefresh').textContent = '✗';
    setTimeout(() => { $('btnRefresh').textContent = '↻'; $('btnRefresh').disabled = false; }, 2000);
  }
});

// ─── Тоглы Home ──────────────────────────────────────────────────────────────

$('togWifi').addEventListener('change', async e => {
  await send('setSetting', { payload: { wifiSaving: e.target.checked } });
  $('wifiSub').textContent = e.target.checked ? 'Вкл — экономия активна' : 'Выкл';
});

$('togPrivacy').addEventListener('change', async e => {
  await send('setSetting', { payload: { privacyMode: e.target.checked } });
  $('privacySub').textContent = e.target.checked ? 'Вкл — трекеры заблокированы' : 'Выкл';
});

$('togAd').addEventListener('change', async e => {
  await send('setSetting', { payload: { adBlock: e.target.checked } });
  $('adSub').textContent = e.target.checked ? 'Вкл — реклама заблокирована' : 'Выкл';
});

$('togIncognito').addEventListener('change', async e => {
  await send('setSetting', { payload: { incognitoOnExit: e.target.checked } });
});

// ─── Privacy вкладка ─────────────────────────────────────────────────────────

$('togCookie').addEventListener('change', async e => {
  await send('setSetting', { payload: { incognitoOnExit: e.target.checked } });
  // синхронизируем с Home
  $('togIncognito').checked = e.target.checked;
});

$('btnClearNow').addEventListener('click', async () => {
  await send('setSetting', { payload: { _clearNow: true } });
  $('btnClearNow').textContent = '✓ Готово';
  setTimeout(() => { $('btnClearNow').textContent = 'Очистить'; }, 2000);
});

// ─── Рендер состояния ────────────────────────────────────────────────────────

function renderMain(state) {
  const { vpnEnabled, currentServer, wifiSaving, privacyMode, adBlock, incognitoOnExit } = state;

  // Кнопка connect
  const btn = $('connectBtn');
  btn.classList.toggle('connected', !!vpnEnabled);
  btn.classList.remove('connecting');
  $('connectLabel').textContent = vpnEnabled ? 'Отключить' : 'Подключить';

  // Иконка кнопки
  btn.querySelector('svg path').setAttribute('d', vpnEnabled
    ? 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z'
    : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'
  );

  // Server strip
  const strip = $('serverStrip');
  if (vpnEnabled && currentServer) {
    strip.classList.add('visible');
    $('sFlag').textContent = currentServer.flag || '🌐';
    $('sName').textContent = currentServer.name || currentServer.country || currentServer.host;
    $('sHost').textContent = currentServer.host + ':' + currentServer.port;
  } else {
    strip.classList.remove('visible');
  }

  // Home тоглы
  $('togWifi').checked     = !!wifiSaving;
  $('togPrivacy').checked  = !!privacyMode;
  $('togAd').checked       = !!adBlock;
  $('togIncognito').checked = !!incognitoOnExit;
  $('togCookie').checked    = !!incognitoOnExit;

  $('wifiSub').textContent    = wifiSaving   ? 'Вкл — экономия активна'       : 'Выкл';
  $('privacySub').textContent = privacyMode  ? 'Вкл — трекеры заблокированы' : 'Выкл';
  $('adSub').textContent      = adBlock      ? 'Вкл — реклама заблокирована'  : 'Выкл';

  // Update badge
  const updated = state.lastUpdated;
  const isStale = !updated || (Date.now() - new Date(updated).getTime()) > 25 * 3600000;
  $('updateDot').className = 'update-dot' + (isStale ? ' stale' : '');
  $('updateText').textContent = updated
    ? 'Серверов в пуле: ' + (state.servers?.length || 0) + ' · ' + fmtDate(updated)
    : 'Обновляю список серверов...';
}

function renderServerList(state) {
  const servers = state.servers || [];
  const cur = state.currentServer;
  const list = $('serverList');

  if (!servers.length) {
    list.innerHTML = '<div style="padding:20px;text-align:center;color:#8e8e93">Нет серверов</div>';
    return;
  }

  list.innerHTML = servers.map((s, i) => {
    const active = cur && s.host === cur.host;
    return `<div class="srv-row ${active ? 'active-srv' : ''}" data-i="${i}">
      <div class="srv-flag">${s.flag || '🌐'}</div>
      <div>
        <div class="srv-name">${s.name || s.country || 'Server ' + (i+1)}</div>
        <div class="srv-host">${s.host}:${s.port}</div>
      </div>
      <span class="srv-ping">${s.ping ? s.ping + 'ms' : '—'}</span>
      ${active ? '<span class="srv-check">✓</span>' : ''}
    </div>`;
  }).join('');

  // Клик по серверу — переключиться на него
  list.querySelectorAll('.srv-row').forEach(row => {
    row.addEventListener('click', async () => {
      const idx = parseInt(row.dataset.i);
      const target = servers[idx];
      await send('selectServer', { host: target.host });
      await loadAll();
    });
  });
}

function renderStats(state) {
  const bytes = fmtBytes(state.savedBytes || 0);
  $('statSaved').textContent    = bytes.v;
  $('statSavedUnit').textContent = bytes.u + ' сэкономлено';
  $('statBlocked').textContent  = (state.blockedCount || 0).toLocaleString('ru');
  $('statServers').textContent  = (state.servers?.length || 0);
  $('statUptime').textContent   = state.lastUpdated ? fmtDate(state.lastUpdated).split(' ')[1] : '—';

  const s = state.currentServer;
  $('detStatus').textContent   = state.vpnEnabled ? 'Подключено' : 'Отключено';
  $('detStatus').className     = 'info-val ' + (state.vpnEnabled ? 'green' : 'red');
  $('detServer').textContent   = s ? s.host + ':' + s.port : '—';
  $('detCountry').textContent  = s ? (s.flag || '') + ' ' + (s.name || s.country || '—') : '—';
  $('detUpdated').textContent  = fmtDate(state.lastUpdated);
}

// ─── Главный загрузчик ───────────────────────────────────────────────────────

async function loadAll() {
  try {
    const r = await send('getState');
    if (!r?.ok) return;
    lastState = r.state;
    renderMain(r.state);

    // Обновляем активную вкладку
    const activeTab = document.querySelector('.tab.active')?.dataset?.tab;
    if (activeTab === 'servers') renderServerList(r.state);
    if (activeTab === 'stats')   renderStats(r.state);
  } catch (e) {
    console.error('[popup]', e);
  }
}

// ─── Пинг текущего сервера ───────────────────────────────────────────────────

async function pingServer(server) {
  if (!server) return;
  const t0 = Date.now();
  try {
    await fetch('http://' + server.host + ':' + server.port, {
      method: 'HEAD', mode: 'no-cors', signal: AbortSignal.timeout(3000)
    });
    const ms = Date.now() - t0;
    $('sPing').textContent = ms + ' ms';
    $('sPing').style.color = ms < 300 ? '#34c759' : ms < 800 ? '#ff9f0a' : '#ff3b30';
  } catch {
    $('sPing').textContent = '— ms';
    $('sPing').style.color = '#8e8e93';
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

(async () => {
  await loadAll();
  // Пингуем сервер каждые 10 сек пока попап открыт
  pingInterval = setInterval(async () => {
    const { currentServer, vpnEnabled } = lastState;
    if (vpnEnabled && currentServer) await pingServer(currentServer);
  }, 10000);
  if (lastState.currentServer && lastState.vpnEnabled) {
    await pingServer(lastState.currentServer);
  }
})();
