/**
 * One Max VPN — Landing script
 * Загружает последний релиз с GitHub и обновляет кнопки скачивания
 */

const GITHUB_REPO = 'OinkTechLtd/one-max-vpn';

/** Загружает информацию о последнем релизе с GitHub API */
async function loadLatestRelease() {
  try {
    const resp = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
    if (!resp.ok) throw new Error('GitHub API недоступен');
    const release = await resp.json();

    // Находим ZIP-файл расширения
    const zip = release.assets?.find(a => a.name.endsWith('.zip'));
    if (zip) {
      const btnZip = document.getElementById('btnDownloadZip');
      if (btnZip) {
        btnZip.href = zip.browser_download_url;
        btnZip.textContent = `⬇️ Скачать ${release.tag_name}`;
      }
    }

    // Обновляем счётчик скачиваний
    const totalDownloads = release.assets?.reduce((sum, a) => sum + (a.download_count || 0), 0) || 0;
    if (totalDownloads > 0) {
      document.querySelectorAll('.stat-downloads').forEach(el => {
        el.textContent = totalDownloads.toLocaleString('ru') + '+';
      });
    }

  } catch (e) {
    console.warn('[OneMaxVPN] Не удалось загрузить данные релиза:', e.message);
  }
}

/** Загружает количество активных серверов */
async function loadServerCount() {
  try {
    const resp = await fetch('/servers.json', { cache: 'no-store' });
    if (!resp.ok) return;
    const servers = await resp.json();
    if (Array.isArray(servers)) {
      const el = document.getElementById('statServers');
      if (el) el.textContent = servers.length + '+';
    }
  } catch (_) {}
}

// ─── Инициализация ────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  loadLatestRelease();
  loadServerCount();
});
