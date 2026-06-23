// content.js — Сжатие и оптимизация страниц
console.log("🚀 One Max VPN content script loaded");

// Пример оптимизации изображений (реальное сжатие требует backend)
document.querySelectorAll('img').forEach(img => {
  if (img.src && img.src.startsWith('http')) {
    console.log('Optimizing image:', img.src);
    // В production: отправлять на compression proxy
  }
});