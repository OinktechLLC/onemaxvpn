# 🛡️ One Max VPN

**One Max VPN** — бесплатный браузерный VPN-аналог Samsung Max VPN с блокировкой трекеров, статистикой трафика и Telegram-ботом для управления серверами.

[![GitHub Release](https://img.shields.io/github/v/release/OinkTechLtd/one-max-vpn?style=flat-square)](https://github.com/OinkTechLtd/one-max-vpn/releases/latest)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)

---

## ✨ Возможности

| Функция | Описание |
|---|---|
| 🔒 VPN-шифрование | HTTP-прокси с ротацией серверов каждые 24ч |
| 🚫 Блокировка трекеров | 25+ правил: Google Analytics, Яндекс.Метрика, Facebook Pixel и др. |
| 💾 Статистика трафика | Считает сэкономленные байты в реальном времени |
| 🔄 Автосмена серверов | GitHub Actions обновляет пул ежедневно в 00:00 UTC |
| 🕵️ Режим инкогнито | Очистка куки/кеша при отключении VPN |
| 💬 Telegram-бот | [@OneMaxVPNBot](https://t.me/OneMaxVPNBot) — команды `/server`, `/list`, `/status` |
| 🔁 Автообновление | `update_url` в манифесте — без Chrome Web Store |

---

## 📁 Структура проекта

```
one-max-vpn/
├── .github/workflows/build.yml   # CI/CD: сборка, релиз, деплой
├── extension/                    # Браузерное расширение (MV3)
│   ├── manifest.json
│   ├── background.js             # Service Worker: прокси, аларм, статистика
│   ├── popup.html / popup.js     # UI расширения
│   ├── content.js                # Инъекция на страницы
│   ├── rules/tracker_rules.json  # 25+ правил блокировки
│   └── icons/                   # 16, 48, 128 px
├── bot/                          # Telegram-бот (aiogram 3.x)
│   ├── bot.py
│   ├── servers.py                # Менеджер серверов + планировщик
│   ├── config.py
│   └── requirements.txt
├── landing/                      # Лендинг (Vercel)
│   ├── index.html
│   ├── styles.css
│   ├── script.js
│   ├── update.json               # Для автообновления расширения
│   └── servers.json              # Актуальный пул серверов
└── README.md
```

---

## 🚀 Установка расширения

### Способ 1: ZIP (рекомендуется)

1. Скачай [последний релиз](https://github.com/OinkTechLtd/one-max-vpn/releases/latest)
2. Распакуй ZIP-архив
3. Открой `chrome://extensions`
4. Включи **«Режим разработчика»** (правый верхний угол)
5. Нажми **«Загрузить распакованное расширение»**
6. Выбери папку `extension/`

### Способ 2: Edge/Firefox

Аналогично, через `edge://extensions` или `about:debugging` (Firefox).

---

## 🤖 Запуск Telegram-бота

### Локально

```bash
cd bot
cp .env.example .env
# Заполни BOT_TOKEN в .env

pip install -r requirements.txt
python bot.py
```

### На Render (бесплатно)

1. Fork репозитория
2. Зайди на [render.com](https://render.com) → New Web Service
3. Укажи репозиторий, директорию `bot/`
4. Build Command: `pip install -r requirements.txt`
5. Start Command: `python bot.py`
6. Добавь переменную `BOT_TOKEN` в Environment Variables

### На Railway

```bash
railway login
cd bot
railway up
railway variables set BOT_TOKEN=ваш_токен
```

---

## 🌐 Деплой лендинга

```bash
cd landing
npm i -g vercel
vercel --prod
```

Или через GitHub Actions — деплоится автоматически при пуше в `main`.

---

## ⚙️ Переменные окружения

### Бот (`bot/.env`)

```env
BOT_TOKEN=1234567890:ABCxxx       # Токен от @BotFather (обязательно)
UPDATE_INTERVAL=86400              # Интервал обновления серверов (сек)
```

### GitHub Actions Secrets

| Secret | Описание |
|---|---|
| `VERCEL_TOKEN` | Токен Vercel для деплоя лендинга |
| `VERCEL_ORG_ID` | ID организации Vercel |
| `VERCEL_PROJECT_ID` | ID проекта Vercel |

---

## 🔄 CI/CD (GitHub Actions)

Воркфлоу `.github/workflows/build.yml` запускается:

- При пуше в `main` (изменения в `extension/` или `landing/`)
- Каждый день в **00:00 UTC** (автообновление серверов)
- Вручную через **workflow_dispatch**

### Что делает CI:

1. **Build Extension** — валидирует `manifest.json`, создаёт ZIP
2. **Update JSON** — обновляет `update.json` и `servers.json` с живыми прокси
3. **Create Release** — создаёт GitHub Release с ZIP-вложением
4. **Deploy Landing** — деплоит лендинг на Vercel

---

## 🏗️ Архитектура

```
Пользователь
    │
    ▼
┌─────────────────┐     chrome.proxy.settings     ┌────────────────┐
│  Extension UI   │────────────────────────────────▶  Proxy Server  │
│  (popup.html)   │                                └────────────────┘
└────────┬────────┘                                       │
         │ sendMessage                                     │ трафик
         ▼                                                 ▼
┌─────────────────┐     update.json / servers.json  ┌────────────────┐
│  background.js  │◀───────────────────────────────  │  Vercel CDN   │
│  (SW)           │     раз в 24ч (alarm)            │  (лендинг)    │
└─────────────────┘                                  └────────────────┘
                                                            ▲
┌─────────────────┐     GitHub Actions (cron)               │
│  Telegram Bot   │     обновляет servers.json ─────────────┘
│  (aiogram 3)    │
└─────────────────┘
```

---

## 📄 Лицензия

MIT © 2024 [OinkTech Ltd](https://github.com/OinkTechLtd)
