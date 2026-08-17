import subprocess
import os

passwords = ['postgres', 'admin', 'root', '123456', '1234', 'salonstudio', 'masterkey', '12345678', 'password', '']
ports = [5432, 5433]

for port in ports:
    for pwd in passwords:
        env = dict(os.environ, PGPASSWORD=pwd)
        res = subprocess.run(
            ['C:\\Program Files\\PostgreSQL\\18\\bin\\psql.exe', '-h', '127.0.0.1', '-p', str(port), '-U', 'postgres', '-w', '-c', 'SELECT 1;'],
            capture_output=True, text=True, env=env
        )
        if res.returncode == 0:
            print(f'MATCH FOUND! Port: {port}, Password: "{pwd}"')
            break
        else:
            # check stderr
            if 'password authentication failed' not in res.stderr:
                print(f'Port {port}, pwd "{pwd}": {res.stderr.strip()}')
