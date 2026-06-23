#!/usr/bin/env python3
# servers.py — Production поисковый робот One Max VPN
# Ежедневно обновляет список рабочих прокси

import json
import requests
import random
from datetime import datetime

def fetch_free_proxies():
    """Парсит бесплатные прокси из публичных источников"""
    proxies = []
    sources = [
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
        "https://raw.githubusercontent.com/monosans/proxy-list/main/proxies/http.txt"
    ]
    
    for url in sources:
        try:
            resp = requests.get(url, timeout=10)
            if resp.status_code == 200:
                for line in resp.text.splitlines():
                    if line.strip() and ':' in line:
                        proxies.append(line.strip())
        except:
            continue
    return list(set(proxies))  # Убираем дубли

def main():
    proxies = fetch_free_proxies()
    if not proxies:
        proxies = ["proxy1.one-max-vpn.com:8080", "proxy2.one-max-vpn.com:3128"]  # Fallback
    
    selected = random.sample(proxies, min(5, len(proxies)))
    
    data = {
        "last_update": datetime.utcnow().isoformat(),
        "servers": selected,
        "active": selected[0] if selected else None
    }
    
    with open('/home/workdir/one-max-vpn/landing/servers.json', 'w') as f:
        json.dump(data, f, indent=2)
    
    print(f"✅ Обновлено {len(selected)} серверов на {data['last_update']}")

if __name__ == "__main__":
    main()