"""
UAT: Test CSV merge by displayName and username.
Verifies that importing same displayName twice merges data (groups union, fields update).
"""
import requests

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    return resp.json().get("access_token")

def test_csv_merge_by_displayname():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    print("=== UAT: CSV Merge by DisplayName ===\n")
    
    # First import: Bob with HR, groups HRIS, Payroll
    csv1 = """DisplayName;Department;Ruoli
Bob Bianchi;HR;HRIS,Payroll
"""
    print("Step 1: First import - Bob with HR, HRIS, Payroll")
    files = {'file': ('test1.csv', csv1, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    print(f"  Response: {resp.status_code}")
    
    # Check Bob's state after first import
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bob = next((u for u in users if "bob" in (u.get("displayName") or "").lower()), None)
    if bob:
        print(f"  Bob after 1st import: groups={bob.get('groups')}, dept={bob.get('department')}")
    
    # Second import: Same Bob (by displayName), different dept, new groups
    csv2 = """DisplayName;Department;Ruoli
Bob Bianchi;FINANCE;SAP_FI,Accounting
"""
    print("\nStep 2: Second import - Bob with FINANCE, SAP_FI, Accounting")
    files = {'file': ('test2.csv', csv2, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    print(f"  Response: {resp.status_code}")
    
    # Check Bob's state after second import
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bob = next((u for u in users if "bob" in (u.get("displayName") or "").lower()), None)
    
    if bob:
        groups = set(bob.get("groups") or [])
        dept = bob.get("department")
        
        print(f"\n=== Final State ===")
        print(f"Bob's groups: {sorted(groups)}")
        print(f"Bob's department: {dept}")
        
        # Verify merge
        expected_groups = {"HRIS", "Payroll", "SAP_FI", "Accounting"}
        if expected_groups.issubset(groups):
            print("\n[PASS] Groups were MERGED (union of both imports)")
        else:
            print(f"\n[FAIL] Groups not merged. Expected subset: {expected_groups}")
            print(f"       Actual: {groups}")
        
        if dept == "FINANCE":
            print("[PASS] Department was UPDATED to FINANCE")
        else:
            print(f"[FAIL] Department not updated. Expected: FINANCE, Got: {dept}")
    else:
        print("[FAIL] Bob not found!")

if __name__ == "__main__":
    test_csv_merge_by_displayname()
