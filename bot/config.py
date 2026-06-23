"""
One Max VPN Bot — Конфигурация
Переменные загружаются из .env или окружения (Railway/Render)
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Токен Telegram-бота (обязательно)
BOT_TOKEN: str = os.environ['BOT_TOKEN']

# Интервал обновления серверов (секунды), дефолт 24ч
UPDATE_INTERVAL: int = int(os.getenv('UPDATE_INTERVAL', 86400))
