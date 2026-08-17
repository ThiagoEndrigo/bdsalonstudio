import urllib.request
import json

sql_text = """
SELECT *
FROM company_keilafrutuoso.agendamentos
WHERE deletado = 'N'
AND data_hora BETWEEN '2026-08-18T00:00:00.000Z' AND '2026-08-18T23:00:00.000Z';

SELECT * FROM clientes;
"""

payload = {
    'sql': sql_text,
    'schema': 'company_keilafrutuoso'
}

req = urllib.request.Request(
    'http://localhost:3000/api/query', 
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    res = urllib.request.urlopen(req)
    data = json.loads(res.read().decode('utf-8'))
    print("SUCCESS MULTI-QUERY!")
    print(f"Results Count: {len(data['results'])}")
    for idx, r in enumerate(data['results']):
        print(f"Result #{idx+1}: Command={r['command']}, Rows={len(r['rows'])}, Columns={len(r['fields'])}")
except urllib.error.HTTPError as e:
    print("ERROR:", e.read().decode())
