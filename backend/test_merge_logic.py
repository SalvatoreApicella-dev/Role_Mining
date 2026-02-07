import requests
import time

BASE_URL = "http://127.0.0.1:8002"
USER = "admin"
PASS = "admin123"

def login():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USER, "password": PASS})
    resp.raise_for_status()
    return resp.json()["access_token"]

def reproduce():
    token = login()
    headers = {"Authorization": f"Bearer {token}"}

    print("1. Cleaning state (optional, assuming start fresh)...")
    # We can't easily clean state via API unless we restart. 
    # But we can check current users.
    
    # 2. Upload a small CSV
    print("2. Importing CSV user 'csv_user_test'...")
    csv_content = "DistinguishedName;DisplayName;Department;BusinessRole;Ruoli\n" \
                  "CN=csv_user,OU=Users,DC=example,DC=com;CSV User;IT;DevOps;Azure\n" \
                  "CN=alice,OU=Users,DC=example,DC=com;Alice;Sales;Manager;SalesGroup"
    files = {"file": ("test.csv", csv_content, "text/csv")}
    resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
    if resp.status_code != 200:
        print("CSV Import failed:", resp.text)
        return False
    print("CSV Import OK")

    # Verify CSV user exists
    resp = requests.get(f"{BASE_URL}/api/users", headers=headers)
    users = resp.json()["users"]
    if not any(u["username"] == "csv.user" for u in users):
        print("ERROR: CSV user 'csv.user' not found after import! Users found:", [u["username"] for u in users])
        return False
    print("CSV user confirmed in DB.")

    # 3. Importing from AD (Mock)
    print("3. Importing from AD (Mock)...")
    resp = requests.post(f"{BASE_URL}/api/config/connector", headers=headers, json={
        "server": "mock", "bind_user": "u", "bind_password": "p", "base_dn": "dc", "auth": "SIMPLE"
    })
    resp.raise_for_status()

    resp = requests.post(f"{BASE_URL}/api/ad/extract", headers=headers, json={"ou": "OU=Test"})
    if resp.status_code != 200:
        print("AD Import failed:", resp.text)
        return False
    print("AD Import OK")

    # 4. Verify CSV user STILL exists
    print("4. Verifying CSV user persistence...")
    resp = requests.get(f"{BASE_URL}/api/users", headers=headers)
    users = resp.json()["users"]
    
    csv_found = any(u["username"] == "csv.user" for u in users)
    ad_found = any(u["username"] == "alice" for u in users)

    print(f"CSV User Found: {csv_found}")
    print(f"AD User Found: {ad_found}")

    alice = next((u for u in users if u["username"] == "alice"), None)
    if alice:
        print(f"Alice BusinessRole: {alice.get('businessRole')}")
        print(f"Alice Department: {alice.get('department')}")
        # Expect BusinessRole="Manager" (from CSV, preserved) and Department="HR" (from AD Mock, updated)
        # Note: Mock AD data for alice might have Department="HR". CSV has "Sales".
        # If AD is source of truth for Dept, it should be "HR".
        if alice.get("businessRole") == "Manager" and (alice.get("department") == "HR" or alice.get("department") is None):
             print(f"SUCCESS: Alice attributes merged correctly. (Dep={alice.get('department')})")
        else:
             print(f"FAILURE: Alice attributes not merged correctly. BR={alice.get('businessRole')}, Dep={alice.get('department')}")
             return True # Fail

    if ad_found and csv_found:
        print("ISSUE NOT REPRODUCED: Merge seems to work?")
        return False
    else:
        print("Unclear result.")
        return False

if __name__ == "__main__":
    try:
        if reproduce():
            exit(1) # Repro = Failure of logic
        else:
            exit(0)
    except Exception as e:
        print(f"Error: {e}")
        exit(1)
