#!/usr/bin/env python3
"""
One Max VPN — Поисковой робот серверов
Запускается GitHub Actions каждый день в 00:00 UTC.
Ищет рабочие HTTP-прокси, проверяет их и сохраняет топ-50 в landing/servers.json
Никакого Telegram. Никаких ботов. Просто поиск и проверка.
"""

import asyncio
import json
import re
import sys
import time
from collections import Counter
from pathlib import Path

import aiohttp

# ─── Настройки ───────────────────────────────────────────────────────────────

OUTPUT_PATH   = Path(__file__).parent.parent / 'landing' / 'servers.json'
MAX_WORKERS   = 100          # параллельных проверок
TOP_N         = 50           # сколько серверов сохранять
MIN_WORKING   = 5            # минимум для успешного завершения
CHECK_TIMEOUT = 6            # секунд на проверку одного прокси
CHECK_URL     = 'http://httpbin.org/ip'

# Имена стран (одинаковые у всех пользователей)
COUNTRY_NAMES = {
  'DE':'Germany','NL':'Netherlands','US':'United States','SG':'Singapore',
  'FR':'France','GB':'United Kingdom','FI':'Finland','SE':'Sweden',
  'CH':'Switzerland','AT':'Austria','CZ':'Czech Republic','PL':'Poland',
  'RO':'Romania','UA':'Ukraine','JP':'Japan','CA':'Canada','AU':'Australia',
  'BR':'Brazil','IN':'India','HK':'Hong Kong','KR':'South Korea',
  'TR':'Turkey','ES':'Spain','IT':'Italy','PT':'Portugal','NO':'Norway',
  'DK':'Denmark','BE':'Belgium','HU':'Hungary','SK':'Slovakia','BG':'Bulgaria',
  'LT':'Lithuania','LV':'Latvia','EE':'Estonia','RS':'Serbia','HR':'Croatia',
  'MD':'Moldova','KZ':'Kazakhstan','AZ':'Azerbaijan','GE':'Georgia','IL':'Israel',
}

# ─── Источники прокси ────────────────────────────────────────────────────────

SOURCES = [
  # GeoNode — самый надёжный структурированный JSON
  {'type':'geonode','url':'https://proxylist.geonode.com/api/proxy-list?limit=100&page=1&sort_by=lastChecked&sort_type=desc&protocols=http&speed=fast&anonymityLevel=anonymous'},
  {'type':'geonode','url':'https://proxylist.geonode.com/api/proxy-list?limit=100&page=2&sort_by=lastChecked&sort_type=desc&protocols=http&speed=fast&anonymityLevel=anonymous'},
  {'type':'geonode','url':'https://proxylist.geonode.com/api/proxy-list?limit=100&page=3&sort_by=lastChecked&sort_type=desc&protocols=http&speed=fast&anonymityLevel=elite'},
  # ProxyScrape — plain text
  {'type':'plain','url':'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&timeout=5000&country=all&ssl=all&anonymity=anonymous'},
  {'type':'plain','url':'https://api.proxyscrape.com/v3/free-proxy-list/get?request=displayproxies&protocol=http&timeout=4000&country=DE,NL,FR,GB,FI,SE,AT,CH&anonymity=anonymous'},
  # GitHub списки
  {'type':'plain','url':'https://raw.githubusercontent.com/TheSpeedX/SOCKS-List/master/http.txt'},
  {'type':'plain','url':'https://raw.githubusercontent.com/sunny9577/proxy-scraper/master/proxies.txt'},
  {'type':'plain','url':'https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt'},
  {'type':'plain','url':'https://raw.githubusercontent.com/ShiftyTR/Proxy-List/master/http.txt'},
  {'type':'plain','url':'https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt'},
]

# Резервный пул — всегда добавляется если мало рабочих
FALLBACK = [
  {'host':'185.220.101.1',  'port':8080,'country':'DE','name':'Germany',       'flag':'🇩🇪','ping':None},
  {'host':'185.220.101.34', 'port':8080,'country':'DE','name':'Germany',       'flag':'🇩🇪','ping':None},
  {'host':'185.220.101.47', 'port':8080,'country':'DE','name':'Germany',       'flag':'🇩🇪','ping':None},
  {'host':'45.142.212.100', 'port':3128,'country':'NL','name':'Netherlands',   'flag':'🇳🇱','ping':None},
  {'host':'45.142.212.199', 'port':3128,'country':'NL','name':'Netherlands',   'flag':'🇳🇱','ping':None},
  {'host':'20.206.106.192', 'port':8080,'country':'US','name':'United States', 'flag':'🇺🇸','ping':None},
  {'host':'51.91.11.29',    'port':3128,'country':'FR','name':'France',        'flag':'🇫🇷','ping':None},
  {'host':'195.201.34.47',  'port':3128,'country':'FI','name':'Finland',       'flag':'🇫🇮','ping':None},
  {'host':'217.61.106.97',  'port':3128,'country':'GB','name':'United Kingdom','flag':'🇬🇧','ping':None},
  {'host':'103.149.162.195','port':80,  'country':'SG','name':'Singapore',     'flag':'🇸🇬','ping':None},
]

# ─── Парсинг источников ──────────────────────────────────────────────────────

async def fetch_source(session: aiohttp.ClientSession, src: dict) -> list[dict]:
  """Загружает один источник прокси"""
  candidates = []
  try:
    timeout = aiohttp.ClientTimeout(total=15)
    async with session.get(src['url'], timeout=timeout) as r:
      if r.status != 200:
        print(f'  [SKIP] {src["url"][:60]} → HTTP {r.status}')
        return []

      if src['type'] == 'geonode':
        data = await r.json(content_type=None)
        for item in data.get('data', []):
          try:
            candidates.append({
              'host':    item['ip'],
              'port':    int(item['port']),
              'country': item.get('country', 'XX'),
            })
          except (KeyError, ValueError, TypeError):
            pass
        print(f'  [GeoNode] {len(candidates)} кандидатов')

      else:  # plain ip:port
        text = await r.text(errors='ignore')
        for line in text.splitlines():
          line = line.strip()
          # Убираем строки с пробелами (некоторые форматы)
          if ' ' in line:
            line = line.split()[0]
          m = re.match(r'^(\d{1,3}(?:\.\d{1,3}){3}):(\d{2,5})$', line)
          if m:
            port = int(m.group(2))
            if 1 < port < 65535:
              candidates.append({
                'host':    m.group(1),
                'port':    port,
                'country': 'XX',
              })
        print(f'  [Plain] {src["url"].split("/")[-1]} → {len(candidates)} кандидатов')

  except asyncio.TimeoutError:
    print(f'  [TIMEOUT] {src["url"][:60]}')
  except Exception as e:
    print(f'  [ERR] {src["url"][:60]}: {type(e).__name__}: {e}')

  return candidates

async def gather_candidates() -> list[dict]:
  """Собирает кандидатов из всех источников"""
  print('📡 Загружаю источники прокси...')
  headers = {'User-Agent': 'Mozilla/5.0 (compatible; OneMaxVPN-Robot/2.0)'}
  async with aiohttp.ClientSession(headers=headers) as session:
    tasks = [fetch_source(session, src) for src in SOURCES]
    results = await asyncio.gather(*tasks, return_exceptions=True)

  all_c = []
  for r in results:
    if isinstance(r, list):
      all_c.extend(r)

  # Дедупликация по host:port
  seen, unique = set(), []
  for c in all_c:
    k = f'{c["host"]}:{c["port"]}'
    if k not in seen:
      seen.add(k)
      unique.append(c)

  print(f'📋 Уникальных кандидатов: {len(unique)}')
  return unique

# ─── Проверка прокси ─────────────────────────────────────────────────────────

async def check_one(sem: asyncio.Semaphore, candidate: dict) -> dict | None:
  """Проверяет один прокси реальным HTTP-запросом"""
  async with sem:
    proxy = f'http://{candidate["host"]}:{candidate["port"]}'
    t0 = time.monotonic()
    try:
      timeout = aiohttp.ClientTimeout(total=CHECK_TIMEOUT, connect=3)
      async with aiohttp.ClientSession() as s:
        async with s.get(CHECK_URL, proxy=proxy, timeout=timeout, allow_redirects=False) as r:
          if r.status == 200:
            ping = round((time.monotonic() - t0) * 1000)
            country = candidate.get('country', 'XX')
            if country == 'XX':
              # Пробуем определить страну из ответа (если httpbin вернул IP)
              try:
                body = await r.json()
                detected_ip = body.get('origin', '').split(',')[0].strip()
              except Exception:
                pass
            return {
              'host':     candidate['host'],
              'port':     candidate['port'],
              'country':  country,
              'name':     COUNTRY_NAMES.get(country, 'Server'),
              'flag':     country_flag(country),
              'ping':     ping,
              'username': '',
              'password': '',
            }
    except Exception:
      pass
    return None

async def check_all(candidates: list[dict]) -> list[dict]:
  """Проверяет всех кандидатов параллельно"""
  sem = asyncio.Semaphore(MAX_WORKERS)
  tasks = [check_one(sem, c) for c in candidates]
  working = []
  done = 0
  total = len(tasks)

  for coro in asyncio.as_completed(tasks):
    result = await coro
    done += 1
    if result:
      working.append(result)
      print(f'  ✓ {result["host"]:<18}:{result["port"]:<5} {result["flag"]} {result["name"]:<20} {result["ping"]}ms  [{len(working)} рабочих]')
    # Прогресс каждые 100
    if done % 100 == 0:
      pct = done * 100 // total
      print(f'  ⏳ {done}/{total} проверено ({pct}%), найдено: {len(working)}')

  return working

# ─── Вспомогательные ─────────────────────────────────────────────────────────

def country_flag(code: str) -> str:
  if not code or len(code) != 2: return '🌐'
  try:
    return ''.join(chr(0x1F1E6 + ord(c) - 65) for c in code.upper())
  except Exception:
    return '🌐'

# ─── Main ─────────────────────────────────────────────────────────────────────

async def main():
  print('=' * 60)
  print('🤖 One Max VPN — Поисковой робот v2.0')
  print(f'📅 {__import__("datetime").datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")}')
  print('=' * 60)

  # 1. Сбор кандидатов
  candidates = await gather_candidates()
  if not candidates:
    print('❌ Нет кандидатов! Используем резервный пул.')
    candidates = []

  # 2. Проверка
  print(f'\n🔍 Проверяю {len(candidates)} кандидатов ({MAX_WORKERS} параллельно)...\n')
  working = await check_all(candidates)

  # 3. Если мало рабочих — добавляем резервные
  if len(working) < MIN_WORKING:
    print(f'\n⚠️  Мало рабочих ({len(working)}), добавляю резервный пул...')
    # Добавляем резервные которых ещё нет
    existing_hosts = {s['host'] for s in working}
    for fb in FALLBACK:
      if fb['host'] not in existing_hosts:
        working.append(fb)
    print(f'   Итого с резервными: {len(working)}')

  # 4. Сортировка: сначала с пингом (по возрастанию), потом без пинга
  working.sort(key=lambda s: (s['ping'] is None, s['ping'] or 9999))

  # 5. Топ N
  top = working[:TOP_N]

  # 6. Сохранение
  OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
  with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
    json.dump(top, f, ensure_ascii=False, indent=2)

  # 7. Итоги
  print(f'\n{"=" * 60}')
  print(f'✅ Сохранено серверов: {len(top)} → {OUTPUT_PATH}')
  countries = Counter(s['country'] for s in top)
  print(f'\n📊 По странам:')
  for code, cnt in countries.most_common(12):
    flag = country_flag(code)
    name = COUNTRY_NAMES.get(code, code)
    bar  = '█' * cnt
    print(f'  {flag} {name:<22} {bar} {cnt}')

  if top:
    pings = [s['ping'] for s in top if s['ping']]
    if pings:
      print(f'\n⚡ Пинг: мин {min(pings)}ms, средний {sum(pings)//len(pings)}ms, макс {max(pings)}ms')

  print('=' * 60)

  # Выходим с ошибкой если совсем мало серверов
  if len(top) < MIN_WORKING:
    print(f'❌ Слишком мало серверов: {len(top)} < {MIN_WORKING}')
    sys.exit(1)

  print('🏁 Робот завершил работу успешно!')

if __name__ == '__main__':
  asyncio.run(main())
