/**
 * One Max VPN — Content Script
 * Блокирует динамически добавляемые трекеры через MutationObserver
 */
(function () {
  'use strict';
  const TRACKERS = [
    'google-analytics','googletagmanager','doubleclick','facebook.com/tr',
    'connect.facebook.net','mc.yandex','top-fwz1.mail.ru','hotjar','amplitude',
    'mixpanel','segment.io','intercom.io','sentry.io','scorecardresearch',
    'tns-counter','adfox.ru','an.yandex.ru','counter.ok.ru','vk.com/rtrg'
  ];

  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        const url = node.src || node.href || node.action || '';
        if (url && TRACKERS.some(t => url.includes(t))) {
          node.remove();
        }
      }
    }
  });

  const start = () => observer.observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
