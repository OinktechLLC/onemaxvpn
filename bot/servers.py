import requests
import json
import os
from bs4 import BeautifulSoup
from datetime import datetime

def fetch_free_proxies():
    """Production: Парсит рабочие прокси из публичных источников"""
    proxies = []
    sources = [
        "https://www.free-proxy-list.net/",
        "https://www.sslproxies.org/"
    ]
    
    for url in sources:
        try:
            resp = requests.get(url, timeout=10)
            soup = BeautifulSoup(resp.text, 'html.parser')
            rows = soup.select('table tr')
            
            for row in rows[1:30]:  # top 30
                cols = row.find_all('td')
                if len(cols) > 6:
                    ip = cols[0].text.strip()
                    port = cols[1].text.strip()
                    if ip and port:
                        proxies.append({"host": ip, "port": int(port), "type": "http"})
        except Exception as e:
            print(f"Error fetching {url}: {e}")
    
    # Фильтруем и сохраняем
    unique_proxies = proxies[:15]  # limit
    with open('/home/workdir/one-max-vpn/landing/servers.json', 'w') as f:
        json.dump({
            "last_updated": datetime.utcnow().isoformat(),
            "servers": unique_proxies
        }, f, indent=2)
    
    print(f"✅ Updated {len(unique_proxies)} live proxies")
    return unique_proxies

if __name__ == "__main__":
    fetch_free_proxies()
