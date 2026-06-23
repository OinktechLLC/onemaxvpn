// content.js — инъекция на страницы для оптимизации (сжатие изображений и т.д.)

console.log('One Max VPN content script loaded');

// Пример: оптимизация изображений (замена на lazy + низкое качество)
document.querySelectorAll('img').forEach(img => {
  if (img.src && !img.dataset.optimized) {
    img.loading = 'lazy';
    img.dataset.optimized = 'true';
    console.log('Optimized image:', img.src);
  }
});
