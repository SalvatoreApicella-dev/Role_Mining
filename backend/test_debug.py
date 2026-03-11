"""
Debug: Trace merge behavior step by step
"""
import requests

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123", "domain": "example.internal"})
    return resp.json().get("access_token")

def test_debug():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    print("=== Debug Merge Trace ===\n")
    
    # Get initial state
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    print(f"Initial users count: {len(users)}")
    
    bob = next((u for u in users if "bob" in (u.get("displayName") or "").lower()), None)
    if bob:
        print(f"Bob found: username={bob.get('username')}, dn={bob.get('displayName')}, groups={bob.get('groups')}")
    else:
        print("Bob NOT found initially")
    
    # First import
    csv1 = """DisplayName;Department;Ruoli
Bob Bianchi;HR;HRIS,Payroll
"""
    print("\n--- First Import ---")
    files = {'file': ('test1.csv', csv1, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    print(f"Status: {resp.status_code}")
    
    # Check state
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    print(f"Users count: {len(users)}")
    
    # Find ALL Bobs
    bobs = [u for u in users if "bob" in (u.get("displayName") or "").lower()]
    for b in bobs:
        print(f"  Bob: username={b.get('username')}, dn={b.get('displayName')}, groups={b.get('groups')}")
    
    # Second import
    csv2 = """DisplayName;Department;Ruoli
Bob Bianchi;FINANCE;SAP_FI,Accounting
"""
    print("\n--- Second Import ---")
    files = {'file': ('test2.csv', csv2, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    print(f"Status: {resp.status_code}")
    
    # Check final state
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    print(f"Users count: {len(users)}")
    
    # Find ALL Bobs
    bobs = [u for u in users if "bob" in (u.get("displayName") or "").lower()]
    for b in bobs:
        print(f"  Bob: username={b.get('username')}, dn={b.get('displayName')}, groups={b.get('groups')}")

if __name__ == "__main__":
    test_debug()
