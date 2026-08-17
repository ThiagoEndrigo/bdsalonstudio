import subprocess
import os

env = dict(os.environ, PGPASSWORD='postgres')

def run_sql(sql_cmd, db='salonstudio', port=5432):
    cmd = [
        r'C:\Program Files\PostgreSQL\18\bin\psql.exe',
        '-h', '127.0.0.1',
        '-p', str(port),
        '-U', 'postgres',
        '-d', db,
        '-w',
        '-c', sql_cmd
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, env=env)
    return res.stdout, res.stderr

stdout, stderr = run_sql("SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema';")
print("Schemas:")
print(stdout)
