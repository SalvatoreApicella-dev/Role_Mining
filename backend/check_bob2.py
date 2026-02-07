import requests

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    return resp.json().get("access_token")

token = get_token()
headers = {"Authorization": f"Bearer {token}"}

# Get all users and find Bob
users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
print(f"Total users: {len(users)}")
print()
for u in users:
    if "bob" in (u.get("displayName") or "").lower():
        print(f"username={u.get('username')}")
        print(f"displayName={u.get('displayName')}")
        print(f"groups={u.get('groups')}")
        print(f"department={u.get('department')}")
        print(f"businessRole={u.get('businessRole')}")
        print()
