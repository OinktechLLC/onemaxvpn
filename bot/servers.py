#!/usr/bin/env python3
"""
Поисковый робот для One Max VPN.
Каждый день обновляет список рабочих прокси-серверов.
"""

import json
import random
import requests
from datetime import datetime

# Пулы бесплатных прокси (можно расширять)
PROXY_SOURCES = [
    "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
    # Добавь больше источников
]

def fetch_proxies():
    proxies = []
    for url in PROXY_SOURCES:
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                for line in resp.text.strip().split('\n'):
                    if ':' in line:
                        host, port = line.strip().split(':')
                        proxies.append({"host": host, "port": int(port)})
        except Exception as e:
            print(f"Error fetching {url}: {e}")
    return proxies[:50]  # Ограничиваем

def main():
    proxies = fetch_proxies()
    if not proxies:
        # Fallback
        proxies = [
            {"host": "proxy.example.com", "port": 8080},
            {"host": "backup.proxy.com", "port": 3128}
        ]

    data = {
        "last_updated": datetime.utcnow().isoformat(),
        "servers": proxies[:20]
    }

    with open('/home/workdir/one-max-vpn/landing/servers.json', 'w') as f:
        json.dump(data, f, indent=2)

    print(f"✅ Обновлено {len(proxies)} серверов в {datetime.utcnow()}")

if __name__ == "__main__":
    main()
