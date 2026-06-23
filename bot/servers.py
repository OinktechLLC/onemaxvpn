import requests
import json
from datetime import datetime

# Production поисковый робот для обновления прокси-серверов
def fetch_free_proxies():
    try:
        # Парсинг бесплатных прокси (production sources)
        response = requests.get("https://www.proxy-list.download/api/v1/get?type=socks5")
        proxies = response.text.strip().split('\n')
        servers = []
        for p in proxies[:10]:  # Топ 10
            if p:
                servers.append({"host": p.split(':')[0], "port": int(p.split(':')[1])})
        return servers
    except:
        return [{"host": "proxy.one-max-vpn.com", "port": 1080}]  # Fallback

if __name__ == "__main__":
    servers = fetch_free_proxies()
    with open("/home/workdir/one-max-vpn/landing/servers.json", "w") as f:
        json.dump({"last_update": datetime.utcnow().isoformat(), "servers": servers}, f, indent=2)
    print(f"✅ Обновлено {len(servers)} серверов")
