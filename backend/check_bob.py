import requests
token = requests.post('http://127.0.0.1:8002/api/auth/login', json={'username':'admin','password':'admin123'}).json().get('access_token')
headers = {'Authorization': f'Bearer {token}'}
users = requests.get('http://127.0.0.1:8002/api/users', headers=headers).json().get('users',[])
bob = next((u for u in users if 'bob' in (u.get('displayName') or '').lower()), None)
if bob:
    print('Bob Bianchi:')
    print('  username:', bob.get('username'))
    print('  displayName:', bob.get('displayName'))
    print('  department:', bob.get('department'))
    print('  businessRole:', bob.get('businessRole'))
    print('  groups:', bob.get('groups'))
else:
    print('Bob not found!')
