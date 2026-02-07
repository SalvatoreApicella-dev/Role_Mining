"""
Isolated debug: Test merge logic on fresh import.
"""
import requests
import json

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    return resp.json().get("access_token")

def test():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # Get current state
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    print(f"Current user count: {len(users)}")
    
    # Find all Bobs
    bobs = [u for u in users if "bob" in (u.get("displayName") or "").lower()]
    print(f"Bobs found: {len(bobs)}")
    for b in bobs:
        print(f"  - username={b.get('username')}, dn={b.get('displayName')}, groups={b.get('groups')}")
    
    # First import
    print("\n=== First Import ===")
    csv1 = "DisplayName;Department;Ruoli\nBob Bianchi;HR;HRIS,Payroll\n"
    files = {'file': ('test1.csv', csv1, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    result = resp.json()
    print(f"Status: {resp.status_code}")
    print(f"Full response: {json.dumps(result, indent=2)[:500]}")
    
    # Check Bob after first import
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bobs = [u for u in users if "bob" in (u.get("displayName") or "").lower()]
    print(f"\nBobs after first import: {len(bobs)}")
    for b in bobs:
        print(f"  - username={b.get('username')}, groups={b.get('groups')}")

if __name__ == "__main__":
    test()
