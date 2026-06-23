import requests
import json
from datetime import datetime

# Production серверный робот
def fetch_proxies():
    proxies = []
    sources = [
        "https://raw.githubusercontent.com/TheSpeedX/PROXY-List/master/http.txt",
        "https://raw.githubusercontent.com/clarketm/proxy-list/master/proxy-list-raw.txt"
    ]
    
    for url in sources:
        try:
            r = requests.get(url, timeout=10)
            if r.status_code == 200:
                for line in r.text.splitlines():
                    if line.strip() and ':' in line:
                        proxies.append(line.strip())
        except:
            continue
    
    # Сохраняем
    with open('/home/workdir/one-max-vpn/landing/servers.json', 'w') as f:
        json.dump({
            "last_update": datetime.utcnow().isoformat(),
            "servers": proxies[:50]  # Топ 50
        }, f, indent=2)
    
    print(f"✅ Обновлено {len(proxies)} прокси")
    return proxies

if __name__ == "__main__":
    fetch_proxies()