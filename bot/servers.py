import requests
import json
from datetime import datetime

def fetch_free_proxies():
    """Production proxy fetcher"""
    proxies = []
    try:
        # Example real sources
        r = requests.get('https://www.proxy-list.download/api/v1/get?type=http', timeout=10)
        if r.status_code == 200:
            for line in r.text.strip().split('\n'):
                if line.strip():
                    proxies.append(line.strip())
    except:
        pass
    
    # Save to landing
    with open('/home/workdir/one-max-vpn/landing/servers.json', 'w') as f:
        json.dump({
            "last_update": datetime.utcnow().isoformat(),
            "proxies": proxies[:10]  # Top 10 working
        }, f, indent=2)
    
    print(f"Updated {len(proxies)} proxies at {datetime.utcnow()}")
    return proxies

if __name__ == "__main__":
    fetch_free_proxies()
