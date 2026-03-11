"""
Test REPLACE behavior: When importing same displayName,
groups and department should be REPLACED (not merged).
"""
import requests

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123", "domain": "example.internal"})
    return resp.json().get("access_token")

def test_replace():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    print("=== Test REPLACE Behavior ===\n")
    
    # First import: Bob with HR, HRIS, Payroll
    csv1 = "DisplayName;Department;Ruoli\nBob Bianchi;HR;HRIS,Payroll\n"
    print("Import 1: Bob with HR + HRIS,Payroll")
    files = {'file': ('test1.csv', csv1, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    print(f"  Status: {resp.status_code}")
    
    # Check Bob after first import
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bob = next((u for u in users if (u.get("displayName") or "").lower() == "bob bianchi"), None)
    if bob:
        print(f"  Bob: groups={bob.get('groups')}, dept={bob.get('department')}")
    
    # Second import: Same Bob, different dept, different groups
    csv2 = "DisplayName;Department;Ruoli\nBob Bianchi;FINANCE;SAP_FI,Accounting\n"
    print("\nImport 2: Bob with FINANCE + SAP_FI,Accounting")
    files = {'file': ('test2.csv', csv2, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    print(f"  Status: {resp.status_code}")
    
    # Check Bob after second import
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bob = next((u for u in users if (u.get("displayName") or "").lower() == "bob bianchi"), None)
    
    if bob:
        groups = set(bob.get("groups") or [])
        dept = bob.get("department")
        print(f"  Bob: groups={sorted(groups)}, dept={dept}")
        
        # REPLACE means: only new groups, not merged
        expected_groups = {"SAP_FI", "Accounting"}
        if groups == expected_groups:
            print("\n[PASS] Groups were REPLACED correctly!")
        else:
            print(f"\n[FAIL] Groups not replaced. Expected: {expected_groups}, Got: {groups}")
        
        if dept == "FINANCE":
            print("[PASS] Department was REPLACED correctly!")
        else:
            print(f"[FAIL] Department not replaced. Expected: FINANCE, Got: {dept}")
    else:
        print("[FAIL] Bob not found!")

if __name__ == "__main__":
    test_replace()
