#!/usr/bin/env python3
"""
One Max VPN — Поисковой робот серверов
Запускается GitHub Actions каждый день в 00:00 UTC.
Собирает рабочие HTTP-прокси из нескольких источников,
проверяет их доступность и сохраняет в landing/servers.json
"""

import asyncio
import json
import re
import sys
import time
from pathlib import Path

import aiohttp

# ─── Конфигурация ─────────────────────────────────────────────────────────────

OUTPUT = Path(__file__).parent.parent / 'landing' / 'servers.json'
TIMEOUT = aiohttp.ClientTimeout(total=8, connect=4)
MAX_WORKERS = 80          # параллельных проверок
MIN_SERVERS = 10          # минимум рабочих серверов для коммита
CHECK_URL   = 'http://httpbin.org/ip'   # URL для проверки прокси

# Имена локаций (одинаковые для всех пользователей по коду страны)
COUNTRY_NAMES = {
  'DE': 'Germany',     'NL': 'Netherlands', 'US': 'United States',
  'SG': 'Singapore',   'FR': 'France',      'GB': 'United Kingdom',
  'FI': 'Finland',     'SE': 'Sweden',      'CH': 'Switzerland',
  'AT': 'Austria',     'CZ': 'Czech Republic', 'PL': 'Poland',
  'RO': 'Romania',     'UA': 'Ukraine',     'JP': 'Japan',
  'CA': 'Canada',      'AU': 'Australia',   'BR': 'Brazil',
  'IN': 'India',       'HK': 'Hong Kong',   'KR': 'South Korea',
  'TR': 'Turkey',      'ES': 'Spain',       'IT': 'Italy',
  'PT': 'Portugal',    'NO': 'Norway',      'DK': 'Denmark',
  'BE': 'Belgium',     'HU': 'Hungary',     'SK': 'Slovakia',
  'BG': 'Bulgaria',    'LT': 'Lithuania',   'LV': 'Latvia',
  'EE': 'Estonia',     'RS': 'Serbia',      'HR': 'Croatia',
  'MD': 'Moldova',     'BY': 'Belarus',     'KZ': 'Kazakhstan',
  'AZ': 'Azerbaijan',  'GE': 'Georgia',
}

# ─── Источники прокси ─────────────────────────────────────────────────────────

SOURCES = [
  # GeoNode API — структурированный JSON
  {
    'type': 'geonode',
    'url':  'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&protocols=http&speed=fast&anonymityLevel=anonymous'
  },
  {
    'type': 'geonode',
    'url':  'https://proxylist.geonode.com/api/proxy-list?limit=100&page=2&sort_by=lastChecked&sort_type=desc&protocols=http&speed=fast&anonymityLevel=anonymous'
  },
  # ProxyScrape — plain text ip:port
  {
    'type': 'plain',
    'url':  'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=anonymous',
    'country': None
  },
  # Free-proxy-list plain
  {
    'type': 'plain',
    'url':  'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt',
    'country': None
  },
  # Sunny9577 list
  {
    'type': 'plain',
    'url':  'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt',
    'country': None
  },
]

# ─── Парсинг источников ───────────────────────────────────────────────────────

async def fetch_source(session: aiohttp.ClientSession, source: dict) -> list[dict]:
  """Загружает и парсит один источник прокси"""
  candidates = []
  try:
    async with session.get(source['url'], timeout=TIMEOUT) as r:
      if r.status != 200:
        print(f'  [WARN] {source["url"][:60]} → HTTP {r.status}')
        return []

      if source['type'] == 'geonode':
        data = await r.json(content_type=None)
        for item in data.get('data', []):
          try:
            candidates.append({
              'host':    item['ip'],
              'port':    int(item['port']),
              'country': item.get('country', 'XX'),
            })
          except (KeyError, ValueError):
            pass
        print(f'  [GeoNode] {len(candidates)} кандидатов')

      elif source['type'] == 'plain':
        text = await r.text()
        for line in text.splitlines():
          m = re.match(r'^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$', line.strip())
          if m:
            candidates.append({
              'host':    m.group(1),
              'port':    int(m.group(2)),
              'country': source.get('country') or 'XX',
            })
        print(f'  [Plain] {source["url"][:50]} → {len(candidates)} кандидатов')

  except Exception as e:
    print(f'  [ERR] {source["url"][:60]}: {e}')

  return candidates

# ─── Проверка доступности прокси ─────────────────────────────────────────────

async def check_proxy(session: aiohttp.ClientSession, candidate: dict) -> dict | None:
  """Проверяет прокси через реальный HTTP-запрос. Возвращает None если не работает."""
  proxy_url = f'http://{candidate["host"]}:{candidate["port"]}'
  t0 = time.monotonic()
  try:
    async with session.get(
      CHECK_URL,
      proxy=proxy_url,
      timeout=aiohttp.ClientTimeout(total=6, connect=3),
      allow_redirects=False
    ) as r:
      if r.status == 200:
        ping = round((time.monotonic() - t0) * 1000)
        country = candidate.get('country', 'XX')
        return {
          'host':    candidate['host'],
          'port':    candidate['port'],
          'country': country,
          'name':    COUNTRY_NAMES.get(country, country),
          'flag':    country_flag(country),
          'ping':    ping,
        }
  except Exception:
    pass
  return None

async def check_batch(candidates: list[dict]) -> list[dict]:
  """Проверяет список кандидатов с ограничением параллелизма"""
  sem = asyncio.Semaphore(MAX_WORKERS)
  results = []

  async def guarded(c):
    async with sem:
      async with aiohttp.ClientSession() as s:
        return await check_proxy(s, c)

  tasks = [asyncio.create_task(guarded(c)) for c in candidates]
  done = 0
  for coro in asyncio.as_completed(tasks):
    res = await coro
    done += 1
    if res:
      results.append(res)
      print(f'  ✓ {res["host"]}:{res["port"]} ({res["country"]}) {res["ping"]}ms [{len(results)} рабочих]')
    if done % 50 == 0:
      print(f'  Прогресс: {done}/{len(tasks)} проверено, {len(results)} рабочих...')

  return results

# ─── Вспомогательные ─────────────────────────────────────────────────────────

def country_flag(code: str) -> str:
  if not code or len(code) != 2: return '🌐'
  try:
    return ''.join(chr(0x1F1E6 + ord(c) - 65) for c in code.upper())
  except Exception:
    return '🌐'

def dedupe(servers: list[dict]) -> list[dict]:
  """Убирает дублирующиеся хосты"""
  seen = set()
  out  = []
  for s in servers:
    k = f'{s["host"]}:{s["port"]}'
    if k not in seen:
      seen.add(k)
      out.append(s)
  return out

# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
  print('🤖 One Max VPN — Поисковой робот стартует...')

  # 1. Собираем кандидатов из всех источников
  all_candidates = []
  async with aiohttp.ClientSession(headers={'User-Agent': 'OneMaxVPN-Robot/1.0'}) as session:
    tasks = [fetch_source(session, src) for src in SOURCES]
    results = await asyncio.gather(*tasks, return_exceptions=True)
    for r in results:
      if isinstance(r, list):
        all_candidates.extend(r)

  all_candidates = dedupe(all_candidates)
  print(f'\n📋 Кандидатов после дедупликации: {len(all_candidates)}')

  if not all_candidates:
    print('❌ Нет кандидатов! Выход с ошибкой.')
    sys.exit(1)

  # 2. Проверяем доступность
  print(f'\n🔍 Проверяю {len(all_candidates)} прокси ({MAX_WORKERS} параллельно)...')
  working = await check_batch(all_candidates)

  # 3. Сортируем по пингу
  working.sort(key=lambda s: s['ping'])

  print(f'\n✅ Рабочих серверов: {len(working)}')

  if len(working) < MIN_SERVERS:
    print(f'⚠️  Мало рабочих серверов ({len(working)} < {MIN_SERVERS}), добавляю резервные...')
    # Добавляем резервные серверы если не хватает
    from fallback_servers import FALLBACK_SERVERS
    for fb in FALLBACK_SERVERS:
      if not any(s['host'] == fb['host'] for s in working):
        working.append(fb)

  # 4. Берём топ-50 по пингу
  top = working[:50]

  # 5. Сохраняем
  OUTPUT.parent.mkdir(parents=True, exist_ok=True)
  with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(top, f, ensure_ascii=False, indent=2)

  print(f'\n💾 Сохранено {len(top)} серверов → {OUTPUT}')
  print('🏁 Робот завершил работу успешно!')

  # Статистика по странам
  from collections import Counter
  countries = Counter(s['country'] for s in top)
  print('\n📊 По странам:')
  for country, count in countries.most_common(10):
    flag = country_flag(country)
    name = COUNTRY_NAMES.get(country, country)
    print(f'  {flag} {name}: {count}')

if __name__ == '__main__':
  asyncio.run(main())
