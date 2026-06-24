/**
 * One Max VPN — popup.js
 * 5 вкладок: Главная / Серверы / Сайты / Статистика / Приватность
 */

// ─── Утилиты ─────────────────────────────────────────────────────────────────

const $ = id => document.getElementById(id);

function send(action, extra = {}) {
  return new Promise((res, rej) => {
    chrome.runtime.sendMessage({ action, ...extra }, r => {
      if (chrome.runtime.lastError) return rej(chrome.runtime.lastError);
      res(r);
    });
  });
}

function fmtBytes(b) {
  if (!b || b < 1024)      return { v: b || 0,               u: 'Б' };
  if (b < 1024 ** 2)       return { v: (b / 1024).toFixed(1), u: 'КБ' };
  if (b < 1024 ** 3)       return { v: (b / 1024 ** 2).toFixed(2), u: 'МБ' };
  return                          { v: (b / 1024 ** 3).toFixed(2), u: 'ГБ' };
}

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ru', { day: '2-digit', month: '2-digit' })
    + ' ' + d.toLocaleTimeString('ru', { hour: '2-digit', minute: '2-digit' });
}

function pingClass(ms) {
  if (!ms) return 'unk';
  if (ms < 300) return 'good';
  if (ms < 700) return 'mid';
  return 'bad';
}

// Встроенные домены (показываем в UI вкладке Сайты)
const BUILTIN_DOMAINS = [
  'youtube.com','youtu.be','googlevideo.com',
  'telegram.org','t.me','web.telegram.org',
  'whatsapp.com','whatsapp.net',
  'anthropic.com','claude.ai',
  'openai.com','chatgpt.com',
  'twitter.com','x.com','twimg.com',
  'instagram.com','fbcdn.net',
  'discord.com','discord.gg',
  'facebook.com',
  'reddit.com','redd.it',
  'tiktok.com',
  'spotify.com',
  'github.com','githubusercontent.com',
  'linkedin.com',
  'medium.com',
  'twitch.tv',
  'notion.so',
  'figma.com',
  'canva.com',
  'meduza.io',
  'bbc.com',
];

// ─── Вкладки ─────────────────────────────────────────────────────────────────

let activeTab = 'home';
let state = {};

document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.pane').forEach(p => p.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    $('pane-' + activeTab).classList.add('active');
    if (activeTab === 'servers') renderServers();
    if (activeTab === 'sites')   renderSites();
    if (activeTab === 'stats')   renderStats();
  });
});

// ─── Кнопка включения СБП ────────────────────────────────────────────────────

$('connectBtn').addEventListener('click', async () => {
  const btn = $('connectBtn');
  btn.classList.add('loading');
  btn.disabled = true;
  $('connectLabel').textContent = 'Подключаю...';
  try {
    const r = await send('toggleSBP');
    if (r?.ok) await loadState();
  } catch (e) {
    console.error(e);
  } finally {
    btn.classList.remove('loading');
    btn.disabled = false;
  }
});

// ─── Кнопка смены сервера ────────────────────────────────────────────────────

$('btnSwitch').addEventListener('click', async () => {
  $('btnSwitch').disabled = true;
  try {
    await send('switchServer');
    await loadState();
  } finally {
    $('btnSwitch').disabled = false;
  }
});

// ─── Кнопка обновления серверов ──────────────────────────────────────────────

$('btnRefresh').addEventListener('click', async () => {
  const btn = $('btnRefresh');
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const r = await send('forceRefresh');
    await loadState();
    btn.textContent = r?.count ? '✓' + r.count : '✓';
    setTimeout(() => { btn.textContent = '↻'; btn.disabled = false; }, 2000);
  } catch {
    btn.textContent = '✗';
    setTimeout(() => { btn.textContent = '↻'; btn.disabled = false; }, 2000);
  }
});

// ─── Тоглы Home ──────────────────────────────────────────────────────────────

$('togWifi').addEventListener('change', async e => {
  await send('setSetting', { payload: { wifiSaving: e.target.checked } });
  $('subWifi').textContent = e.target.checked ? 'Вкл — сжатие трафика активно' : 'Выкл';
});

$('togPrivacy').addEventListener('change', async e => {
  await send('setSetting', { payload: { privacyMode: e.target.checked } });
  $('subPrivacy').textContent = e.target.checked ? 'Вкл — трекеры заблокированы' : 'Выкл';
});

$('togAd').addEventListener('change', async e => {
  await send('setSetting', { payload: { adBlock: e.target.checked } });
  $('subAd').textContent = e.target.checked ? 'Вкл — реклама и трекеры блокируются' : 'Выкл';
});

$('togIncognito').addEventListener('change', async e => {
  await send('setSetting', { payload: { incognitoOnExit: e.target.checked } });
  $('togCookie').checked = e.target.checked;
});

$('togCookie').addEventListener('change', async e => {
  await send('setSetting', { payload: { incognitoOnExit: e.target.checked } });
  $('togIncognito').checked = e.target.checked;
});

$('btnClearNow').addEventListener('click', async () => {
  $('btnClearNow').textContent = '...';
  await send('setSetting', { payload: { _clearNow: true } });
  $('btnClearNow').textContent = '✓ Готово';
  setTimeout(() => { $('btnClearNow').textContent = 'Очистить'; }, 2500);
});

// ─── Вкладка Серверы ─────────────────────────────────────────────────────────

function renderServers() {
  const servers = state.servers || [];
  const cur = state.currentServer;
  const list = $('srvList');
  if (!servers.length) {
    list.innerHTML = '<div class="empty"><div class="empty-ico">🔌</div>Нет серверов. Нажми «↻» для обновления.</div>';
    return;
  }
  list.innerHTML = servers.map((s, i) => {
    const active = cur && s.host === cur.host;
    const pc = pingClass(s.ping);
    const pingLabel = s.ping ? s.ping + 'ms' : '—';
    return `<div class="srv-item ${active ? 'cur' : ''}" data-host="${s.host}">
      <div class="sri-flag">${s.flag || '🌐'}</div>
      <div class="sri-info">
        <div class="sri-name">${s.name || 'Server ' + (i + 1)}</div>
        <div class="sri-host">${s.host}:${s.port}</div>
      </div>
      <span class="sri-ping ${pc}">${pingLabel}</span>
      ${active ? '<span class="sri-check">✓</span>' : ''}
    </div>`;
  }).join('');

  list.querySelectorAll('.srv-item').forEach(item => {
    item.addEventListener('click', async () => {
      await send('selectServer', { host: item.dataset.host });
      await loadState();
      renderServers();
    });
  });
}

// ─── Вкладка Сайты ───────────────────────────────────────────────────────────

function renderSites() {
  // Встроенные
  $('builtinCount').textContent = BUILTIN_DOMAINS.length;
  const builtinList = $('builtinList');
  builtinList.innerHTML = BUILTIN_DOMAINS.map(d =>
    `<div class="dom-item">
      <span class="dom-name">${d}</span>
      <span class="dom-built">встроен</span>
    </div>`
  ).join('');

  // Пользовательские
  renderCustomDomains();
}

function renderCustomDomains() {
  const customs = state.customDomains || [];
  const list = $('customList');
  if (!customs.length) {
    list.innerHTML = '<div class="empty">Добавь свои сайты для разблокировки</div>';
    return;
  }
  list.innerHTML = customs.map(d =>
    `<div class="dom-item">
      <span class="dom-name">${d}</span>
      <span class="dom-del" data-dom="${d}">✕</span>
    </div>`
  ).join('');
  list.querySelectorAll('.dom-del').forEach(btn => {
    btn.addEventListener('click', async () => {
      await send('removeCustomDomain', { domain: btn.dataset.dom });
      await loadState();
      renderCustomDomains();
    });
  });
}

$('btnAddDom').addEventListener('click', async () => {
  const input = $('domInput');
  const val = input.value.trim();
  if (!val) return;
  $('btnAddDom').disabled = true;
  await send('addCustomDomain', { domain: val });
  input.value = '';
  $('btnAddDom').disabled = false;
  await loadState();
  renderCustomDomains();
});

$('domInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') $('btnAddDom').click();
});

// ─── Вкладка Статистика ──────────────────────────────────────────────────────

function renderStats() {
  const b = fmtBytes(state.savedBytes || 0);
  $('stSaved').textContent  = b.v;
  $('stSavedU').textContent = b.u + ' сэкономлено';
  $('stBlocked').textContent = (state.blockedCount || 0).toLocaleString('ru');
  $('stSrv').textContent     = state.servers?.length || 0;
  $('stSites').textContent   = state.bypassCount || 0;

  const s = state.currentServer;
  const on = state.sbpEnabled;
  $('dtStatus').textContent  = on ? 'Активен' : 'Отключён';
  $('dtStatus').className    = 'info-val ' + (on ? 'green' : 'red');
  $('dtSrv').textContent     = s ? s.host + ':' + s.port : '—';
  $('dtCountry').textContent = s ? (s.flag || '') + ' ' + (s.name || s.country || '—') : '—';
  $('dtUpd').textContent     = fmtDate(state.lastUpdated);
}

// ─── Главный рендер состояния ────────────────────────────────────────────────

function renderMain() {
  const { sbpEnabled, currentServer, wifiSaving, privacyMode, adBlock, incognitoOnExit, lastUpdated, servers } = state;

  // Кнопка
  const btn = $('connectBtn');
  btn.classList.toggle('on', !!sbpEnabled);
  btn.classList.remove('loading');
  btn.disabled = false;
  $('connectLabel').textContent = sbpEnabled ? 'Выключить СБП' : 'Включить СБП';

  // Иконка кнопки
  $('connectIcon').querySelector('path').setAttribute('d',
    sbpEnabled
      ? 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14H9V8h2v8zm4 0h-2V8h2v8z'
      : 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z'
  );

  // Статус
  const dot = $('statusDot');
  dot.className = 'status-dot' + (sbpEnabled ? ' on' : '');
  $('statusText').textContent = sbpEnabled
    ? `Активен · ${currentServer?.flag || ''} ${currentServer?.name || 'Сервер'}`
    : 'Отключено · Трафик без защиты';

  // Серверная полоска
  const strip = $('srvStrip');
  if (sbpEnabled && currentServer) {
    strip.classList.add('show');
    $('sFlag').textContent = currentServer.flag || '🌐';
    $('sName').textContent = currentServer.name || currentServer.country || currentServer.host;
    $('sAddr').textContent = currentServer.host + ':' + currentServer.port;
    const pc = pingClass(currentServer.ping);
    $('sPing').className   = 'srv-ping ' + pc;
    $('sPing').textContent = currentServer.ping ? currentServer.ping + 'ms' : '— ms';
  } else {
    strip.classList.remove('show');
  }

  // Update badge
  const ageH = lastUpdated ? (Date.now() - new Date(lastUpdated).getTime()) / 3600000 : 999;
  const dotCls = ageH < 25 ? '' : ageH < 50 ? 'stale' : 'old';
  $('updDot').className = 'upd-dot ' + dotCls;
  $('updText').textContent = lastUpdated
    ? `Серверов: ${servers?.length || 0} · Обновлено ${fmtDate(lastUpdated)}`
    : 'Нажмите ↻ для загрузки серверов';

  // Тоглы
  $('togWifi').checked     = !!wifiSaving;
  $('togPrivacy').checked  = !!privacyMode;
  $('togAd').checked       = !!adBlock;
  $('togIncognito').checked = !!incognitoOnExit;
  $('togCookie').checked    = !!incognitoOnExit;

  $('subWifi').textContent    = wifiSaving  ? 'Вкл — сжатие трафика активно'      : 'Выкл';
  $('subPrivacy').textContent = privacyMode ? 'Вкл — трекеры заблокированы'       : 'Выкл';
  $('subAd').textContent      = adBlock     ? 'Вкл — реклама и трекеры блокируются' : 'Выкл';
}

// ─── Загрузка состояния ──────────────────────────────────────────────────────

async function loadState() {
  try {
    const r = await send('getState');
    if (!r?.ok) return;
    state = r.state;
    renderMain();
    if (activeTab === 'servers') renderServers();
    if (activeTab === 'sites')   renderSites();
    if (activeTab === 'stats')   renderStats();
  } catch (e) {
    console.error('[popup]', e);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
loadState();
