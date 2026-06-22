/**
 * One Max VPN — Content Script
 * Инъектируется на каждую страницу. Отслеживает заблокированные запросы
 * и передаёт статистику в background.
 */

(function () {
  'use strict';

  // Счётчик заблокированных ресурсов на странице
  let localBlocked = 0;

  // Наблюдатель за DOM — перехватываем динамически добавляемые скрипты/пиксели
  const observer = new MutationObserver((mutations) => {
    for (const mut of mutations) {
      for (const node of mut.addedNodes) {
        if (node.nodeType !== 1) continue; // только элементы

        // Проверяем src/href на известные трекеры
        const src = node.src || node.href || '';
        if (isTrackerUrl(src)) {
          node.remove();
          localBlocked++;
          reportBlocked();
        }
      }
    }
  });

  /** Простая эвристика: URL содержит типичные трекер-домены */
  function isTrackerUrl(url) {
    if (!url) return false;
    const trackers = [
      'google-analytics', 'googletagmanager', 'doubleclick',
      'mc.yandex', 'hotjar', 'amplitude', 'mixpanel',
      'segment.io', 'intercom', 'facebook.com/tr',
      'top-fwz1.mail.ru', 'tns-counter', 'scorecardresearch'
    ];
    return trackers.some(t => url.includes(t));
  }

  /** Сообщает background о заблокированных запросах */
  function reportBlocked() {
    try {
      chrome.runtime.sendMessage({
        action: 'updateSettings',
        settings: {} // background сам увеличивает счётчик через webRequest
      });
    } catch (_) {}
  }

  // Запускаем наблюдатель когда DOM готов
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true });
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      observer.observe(document.body, { childList: true, subtree: true });
    });
  }
})();
