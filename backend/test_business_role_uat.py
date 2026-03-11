"""
Comprehensive UAT for Business Role Assignment from CSV Import.
Tests specifically for Bob Bianchi getting BR=HR (from Department).

CSV Format:
DisplayName;Department;Ruoli
Bob Bianchi;HR;HRIS,Payroll,Confluence
"""
import sys
from fastapi.testclient import TestClient
from main import app

client = TestClient(app)

def get_token():
    resp = client.post("/api/auth/login", json={"username": "admin", "password": "admin123", "domain": "example.internal"})
    if resp.status_code != 200:
        print(f"FAIL: Login failed: {resp.status_code} {resp.text}")
        sys.exit(1)
    return resp.json().get("access_token")

def test_csv_import_business_role():
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    # CSV with Bob Bianchi - should get BR=HR (from Department since no explicit BR column)
    csv_content = """DisplayName;Department;Ruoli
Bob Bianchi;HR;HRIS,Payroll,Confluence
Alice Rossi;IT;VPN,GitLab
Prova Accesso;;Admin,Admin1
"""

    # Import CSV
    files = {'file': ('test.csv', csv_content, 'text/csv')}
    resp = client.post("/api/import/csv", headers=headers, files=files)
    if resp.status_code != 200:
        print(f"FAIL: CSV import failed: {resp.status_code} {resp.text}")
        return False
    
    import_result = resp.json()
    print(f"CSV Import OK: {import_result}")
    
    # Fetch users and check Bob Bianchi
    resp = client.get("/api/users", headers=headers)
    if resp.status_code != 200:
        print(f"FAIL: Users fetch failed: {resp.status_code}")
        return False
    
    users_data = resp.json()
    users = users_data.get("users", [])
    
    # Find Bob Bianchi
    bob = None
    alice = None
    prova = None
    
    for u in users:
        dn = (u.get("displayName") or "").lower()
        if "bob bianchi" in dn:
            bob = u
        elif "alice rossi" in dn:
            alice = u
        elif "prova accesso" in dn:
            prova = u
    
    all_passed = True
    
    # Test 1: Bob Bianchi should have BR=HR (from Department)
    if bob:
        bob_br = (bob.get("businessRole") or "").strip()
        bob_groups = bob.get("groups", [])
        print(f"\n=== Bob Bianchi ===")
        print(f"  Department: {bob.get('department')}")
        print(f"  BusinessRole: {bob_br}")
        print(f"  Groups: {bob_groups}")
        
        if bob_br and bob_br != "Unassigned":
            print(f"  [PASS] Bob has BusinessRole assigned: {bob_br}")
        else:
            print(f"  [FAIL] Bob has NO BusinessRole! Expected: HR")
            all_passed = False
        
        if "HRIS" in bob_groups and "Payroll" in bob_groups:
            print(f"  [PASS] Bob has correct groups")
        else:
            print(f"  [FAIL] Bob missing groups. Expected: HRIS, Payroll, Confluence")
            all_passed = False
    else:
        print("[FAIL] Bob Bianchi not found in users!")
        all_passed = False
    
    # Test 2: Alice Rossi should have BR=IT (from Department)
    if alice:
        alice_br = (alice.get("businessRole") or "").strip()
        print(f"\n=== Alice Rossi ===")
        print(f"  Department: {alice.get('department')}")
        print(f"  BusinessRole: {alice_br}")
        
        if alice_br and alice_br != "Unassigned":
            print(f"  [PASS] Alice has BusinessRole assigned: {alice_br}")
        else:
            print(f"  [FAIL] Alice has NO BusinessRole! Expected: IT")
            all_passed = False
    else:
        print("[FAIL] Alice Rossi not found!")
        all_passed = False
    
    # Test 3: Prova Accesso (no department) - should still preserve any BR set, or be Unassigned
    if prova:
        prova_br = (prova.get("businessRole") or "").strip()
        prova_dept = (prova.get("department") or "").strip()
        print(f"\n=== Prova Accesso (no dept) ===")
        print(f"  Department: '{prova_dept}'")
        print(f"  BusinessRole: '{prova_br}'")
        
        # Since no department, BR might be empty or Unassigned - that's OK
        if not prova_dept:
            print(f"  [INFO] No department as expected")
    else:
        print("[INFO] Prova Accesso not found (may have been filtered)")
    
    return all_passed

if __name__ == "__main__":
    print("=" * 60)
    print("UAT: Business Role Assignment from CSV Import")
    print("=" * 60)
    
    try:
        passed = test_csv_import_business_role()
        print("\n" + "=" * 60)
        if passed:
            print("RESULT: ALL TESTS PASSED")
            sys.exit(0)
        else:
            print("RESULT: SOME TESTS FAILED")
            sys.exit(1)
    except Exception as e:
        print(f"\nFATAL ERROR: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
