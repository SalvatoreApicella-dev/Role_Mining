"""
Debug script: Test merge step by step with detailed output.
"""
import requests

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123", "domain": "example.internal"})
    return resp.json().get("access_token")

def get_bob(headers):
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    for u in users:
        if (u.get("displayName") or "").lower() == "bob bianchi":
            return u
    return None

def test():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # STEP 1: Check initial state
    print("=== STEP 1: Initial State ===")
    bob = get_bob(headers)
    if bob:
        print(f"  Bob exists: username={bob.get('username')}, groups={bob.get('groups')}")
    else:
        print("  Bob does NOT exist")
    
    # STEP 2: First import
    print("\n=== STEP 2: First Import ===")
    csv1 = "DisplayName;Department;Ruoli\nBob Bianchi;HR;HRIS,Payroll\n"
    files = {'file': ('test1.csv', csv1, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    result = resp.json()
    print(f"  Response: {resp.status_code}")
    print(f"  added_users={result.get('added_users')}, updated_users={result.get('updated_users')}")
    
    bob = get_bob(headers)
    if bob:
        print(f"  Bob: username={bob.get('username')}, groups={bob.get('groups')}, dept={bob.get('department')}")
    else:
        print("  Bob NOT FOUND after first import!")
    
    # STEP 3: Second import
    print("\n=== STEP 3: Second Import ===")
    csv2 = "DisplayName;Department;Ruoli\nBob Bianchi;FINANCE;SAP_FI,Accounting\n"
    files = {'file': ('test2.csv', csv2, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    result = resp.json()
    print(f"  Response: {resp.status_code}")
    print(f"  added_users={result.get('added_users')}, updated_users={result.get('updated_users')}")
    
    bob = get_bob(headers)
    if bob:
        print(f"  Bob: username={bob.get('username')}, groups={bob.get('groups')}, dept={bob.get('department')}")
        
        groups = set(bob.get('groups') or [])
        expected = {'HRIS', 'Payroll', 'SAP_FI', 'Accounting'}
        if expected == groups:
            print("\n  [PASS] Groups correctly merged!")
        elif expected.issubset(groups):
            print("\n  [PASS] Groups merged with extras")
        else:
            print(f"\n  [FAIL] Groups NOT merged correctly")
            print(f"         Expected: {expected}")
            print(f"         Got: {groups}")
            print(f"         Missing: {expected - groups}")
    else:
        print("  Bob NOT FOUND after second import!")

if __name__ == "__main__":
    test()
