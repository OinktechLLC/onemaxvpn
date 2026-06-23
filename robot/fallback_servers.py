"""Резервный пул серверов — используется если робот нашёл мало рабочих"""

FALLBACK_SERVERS = [
  {'host':'185.220.101.1',   'port':8080, 'country':'DE', 'name':'Germany',        'flag':'🇩🇪', 'ping':None},
  {'host':'185.220.101.34',  'port':8080, 'country':'DE', 'name':'Germany',        'flag':'🇩🇪', 'ping':None},
  {'host':'185.220.101.47',  'port':8080, 'country':'DE', 'name':'Germany',        'flag':'🇩🇪', 'ping':None},
  {'host':'45.142.212.100',  'port':3128, 'country':'NL', 'name':'Netherlands',    'flag':'🇳🇱', 'ping':None},
  {'host':'45.142.212.199',  'port':3128, 'country':'NL', 'name':'Netherlands',    'flag':'🇳🇱', 'ping':None},
  {'host':'20.206.106.192',  'port':8080, 'country':'US', 'name':'United States',  'flag':'🇺🇸', 'ping':None},
  {'host':'103.149.162.195', 'port':80,   'country':'SG', 'name':'Singapore',      'flag':'🇸🇬', 'ping':None},
  {'host':'51.91.11.29',     'port':3128, 'country':'FR', 'name':'France',         'flag':'🇫🇷', 'ping':None},
  {'host':'195.201.34.47',   'port':3128, 'country':'FI', 'name':'Finland',        'flag':'🇫🇮', 'ping':None},
  {'host':'217.61.106.97',   'port':3128, 'country':'GB', 'name':'United Kingdom', 'flag':'🇬🇧', 'ping':None},
]
