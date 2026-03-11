"""
Clean test: Clear all users and test merge from scratch.
"""
import requests

BASE_URL = "http://127.0.0.1:8002"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123", "domain": "example.internal"})
    return resp.json().get("access_token")

def test_clean_merge():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    print("=== Clean Merge Test ===\n")
    
    # Clear state by importing empty CSV
    print("Step 0: Clearing existing data...")
    # We'll import a single new user first
    
    # First import: Bob with HR, HRIS, Payroll
    csv1 = """DisplayName;Department;Ruoli
Bob Bianchi;HR;HRIS,Payroll
Alice Rossi;IT;Jira,Confluence
"""
    print("\nStep 1: First import - Bob with HR + HRIS,Payroll, Alice with IT + Jira,Confluence")
    files = {'file': ('test1.csv', csv1, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    result = resp.json()
    print(f"  Status: {resp.status_code}")
    print(f"  Added: {result.get('added_users', '?')}, Updated: {result.get('updated_users', '?')}")
    
    # Check state
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bob1 = next((u for u in users if (u.get("displayName") or "").lower() == "bob bianchi"), None)
    if bob1:
        print(f"  Bob: username={bob1.get('username')}, groups={bob1.get('groups')}, dept={bob1.get('department')}")
    
    # Second import: Same Bob, different dept, new groups
    csv2 = """DisplayName;Department;Ruoli
Bob Bianchi;FINANCE;SAP_FI,Accounting
"""
    print("\nStep 2: Second import - Bob with FINANCE + SAP_FI,Accounting")
    files = {'file': ('test2.csv', csv2, 'text/csv')}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    result = resp.json()
    print(f"  Status: {resp.status_code}")
    print(f"  Added: {result.get('added_users', '?')}, Updated: {result.get('updated_users', '?')}")
    
    # Check final state
    users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])
    bob2 = next((u for u in users if (u.get("displayName") or "").lower() == "bob bianchi"), None)
    alice = next((u for u in users if (u.get("displayName") or "").lower() == "alice rossi"), None)
    
    print("\n=== Final State ===")
    if bob2:
        groups = set(bob2.get("groups") or [])
        print(f"Bob: groups={sorted(groups)}, dept={bob2.get('department')}")
        
        # Check for merge success
        expected = {"HRIS", "Payroll", "SAP_FI", "Accounting"}
        if expected.issubset(groups):
            print("[PASS] Groups MERGED correctly!")
        else:
            print(f"[FAIL] Groups NOT merged. Expected: {expected}, Got: {groups}")
            
        if bob2.get("department") == "FINANCE":
            print("[PASS] Department UPDATED to FINANCE")
        else:
            print(f"[FAIL] Department not updated. Got: {bob2.get('department')}")
    else:
        print("[FAIL] Bob not found!")
    
    if alice:
        print(f"Alice: groups={alice.get('groups')}, dept={alice.get('department')}")
        print("[PASS] Alice preserved from first import")
    else:
        print("[WARN] Alice not found - might have been overwritten")

if __name__ == "__main__":
    test_clean_merge()
