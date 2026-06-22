"""
One Max VPN — Менеджер серверов
Загружает, ротирует и обновляет пул прокси-серверов
"""

import asyncio
import logging
import random
from datetime import datetime, timezone

import aiohttp

log = logging.getLogger('OneMaxVPN.servers')

# ─── Статический пул (резервный) ─────────────────────────────────────────────

FALLBACK_SERVERS = [
    { 'host': '185.220.101.1',  'port': 8080, 'username': '', 'password': '', 'protocol': 'HTTP Proxy' },
    { 'host': '185.220.101.2',  'port': 8080, 'username': '', 'password': '', 'protocol': 'HTTP Proxy' },
    { 'host': '45.142.212.100', 'port': 3128, 'username': '', 'password': '', 'protocol': 'HTTP Proxy' },
    { 'host': '103.149.162.195','port': 80,   'username': '', 'password': '', 'protocol': 'HTTP Proxy' },
    { 'host': '20.206.106.192', 'port': 8080, 'username': '', 'password': '', 'protocol': 'HTTP Proxy' },
]

# Публичные источники прокси (API, которые возвращают JSON)
PROXY_SOURCES = [
    'https://proxylist.geonode.com/api/proxy-list?limit=50&page=1&sort_by=lastChecked&sort_type=desc&protocols=http&speed=fast',
]


class ServerManager:
    def __init__(self):
        self._servers     = list(FALLBACK_SERVERS)
        self._current_idx = 0
        self._last_updated: datetime | None = None

    def get_current(self) -> dict | None:
        if not self._servers:
            return None
        return self._servers[self._current_idx % len(self._servers)]

    def get_all(self) -> list[dict]:
        return list(self._servers)

    def last_updated(self) -> str:
        if not self._last_updated:
            return 'никогда'
        return self._last_updated.strftime('%d.%m.%Y %H:%M UTC')

    def rotate(self):
        """Переключается на следующий сервер в пуле"""
        if self._servers:
            self._current_idx = (self._current_idx + 1) % len(self._servers)
            log.info(f'Ротация сервера → {self.get_current()["host"]}')

    async def fetch_servers(self) -> list[dict]:
        """Загружает свежий список серверов из публичных источников"""
        servers = []

        async with aiohttp.ClientSession(timeout=aiohttp.ClientTimeout(total=15)) as session:
            for url in PROXY_SOURCES:
                try:
                    async with session.get(url) as resp:
                        if resp.status != 200:
                            continue
                        data = await resp.json(content_type=None)

                        # Парсим формат GeoNode
                        if isinstance(data, dict) and 'data' in data:
                            for item in data['data']:
                                try:
                                    servers.append({
                                        'host':     item['ip'],
                                        'port':     int(item['port']),
                                        'username': '',
                                        'password': '',
                                        'protocol': 'HTTP Proxy',
                                        'country':  item.get('country', ''),
                                    })
                                except (KeyError, ValueError):
                                    pass
                        log.info(f'Загружено {len(servers)} серверов из {url}')
                except Exception as e:
                    log.warning(f'Не удалось загрузить серверы из {url}: {e}')

        return servers

    async def update(self):
        """Обновляет пул серверов"""
        log.info('Обновляю список серверов...')
        fresh = await self.fetch_servers()

        if fresh:
            # Перемешиваем для случайной ротации
            random.shuffle(fresh)
            self._servers = fresh
            self._current_idx = 0
            log.info(f'Серверов загружено: {len(fresh)}')
        else:
            log.warning('Источники недоступны, используем резервный пул')
            self._servers = list(FALLBACK_SERVERS)

        self._last_updated = datetime.now(timezone.utc)

    async def schedule_updates(self):
        """Планировщик: обновляет серверы каждые 24 часа в 00:00 UTC"""
        # Первое обновление сразу при запуске
        await self.update()

        while True:
            now = datetime.now(timezone.utc)
            # Следующее обновление — следующие 00:00 UTC
            next_midnight = now.replace(hour=0, minute=0, second=0, microsecond=0)
            if next_midnight <= now:
                next_midnight = next_midnight.replace(day=next_midnight.day + 1)

            wait_secs = (next_midnight - now).total_seconds()
            log.info(f'Следующее обновление серверов через {wait_secs/3600:.1f} ч')
            await asyncio.sleep(wait_secs)
            await self.update()
