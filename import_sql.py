import subprocess
import os
import time

print("Starting restoration of banco_salonstudio_2026-08-17_12-00-01.sql into PostgreSQL database 'salonstudio'...")

env = dict(os.environ, PGPASSWORD='postgres')
sql_file = r"d:\SALONSTUDIO\banco_salonstudio_2026-08-17_12-00-01.sql"

start_time = time.time()
cmd = [
    r'C:\Program Files\PostgreSQL\18\bin\psql.exe',
    '-h', '127.0.0.1',
    '-p', '5432',
    '-U', 'postgres',
    '-d', 'salonstudio',
    '-w',
    '-f', sql_file
]

res = subprocess.run(cmd, capture_output=True, text=True, env=env)

print(f"Finished in {time.time() - start_time:.2f} seconds.")
if res.returncode == 0 or "CREATE SCHEMA" in res.stdout or "CREATE TABLE" in res.stdout:
    print("Restore completed!")
else:
    print("Error during restore:")
    print(res.stderr[:1000])

# Verify schemas created
verif_cmd = [
    r'C:\Program Files\PostgreSQL\18\bin\psql.exe',
    '-h', '127.0.0.1',
    '-p', '5432',
    '-U', 'postgres',
    '-d', 'salonstudio',
    '-w',
    '-c', "SELECT nspname FROM pg_namespace WHERE nspname NOT LIKE 'pg_%' AND nspname != 'information_schema';"
]
res_verif = subprocess.run(verif_cmd, capture_output=True, text=True, env=env)
print("Schemas after import:")
print(res_verif.stdout)
