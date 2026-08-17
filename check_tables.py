import subprocess
import os

env = dict(os.environ, PGPASSWORD='postgres')

schemas = ['company_deboranails', 'company_demostrativo', 'company_keilafrutuoso']

for schema in schemas:
    cmd = [
        r'C:\Program Files\PostgreSQL\18\bin\psql.exe',
        '-h', '127.0.0.1',
        '-p', '5432',
        '-U', 'postgres',
        '-d', 'salonstudio',
        '-w',
        '-c', f"SELECT table_name FROM information_schema.tables WHERE table_schema = '{schema}';"
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    tables = [line.strip() for line in res.stdout.splitlines() if line.strip() and not line.startswith('-') and not line.startswith('table_name') and not 'linhas' in line and not 'row' in line]
    print(f"=== Schema: {schema} ({len(tables)} tables) ===")
    for table in tables[:15]:
        count_cmd = [
            r'C:\Program Files\PostgreSQL\18\bin\psql.exe',
            '-h', '127.0.0.1',
            '-p', '5432',
            '-U', 'postgres',
            '-d', 'salonstudio',
            '-w',
            '-c', f"SELECT COUNT(*) FROM {schema}.\"{table}\";"
        ]
        c_res = subprocess.run(count_cmd, capture_output=True, text=True, env=env)
        count_lines = [l.strip() for l in c_res.stdout.splitlines() if l.strip().isdigit()]
        count = count_lines[0] if count_lines else "?"
        print(f"  - {table}: {count} rows")
