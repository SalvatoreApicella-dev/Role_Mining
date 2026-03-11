"""
Fresh import test - clears state and imports fresh CSV to verify BR assignment.
"""
import requests

BASE_URL = "http://127.0.0.1:8002"

# Login
token = requests.post(f"{BASE_URL}/api/auth/login", json={"username":"admin","password":"admin123","domain":"example.internal"}).json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}

# Fresh CSV import
csv_content = """DisplayName;Department;Ruoli
Bob Bianchi;HR;HRIS,Payroll,Confluence
Alice Rossi;IT;VPN,GitLab
Marco Conti;FINANCE;SAP_FI,Accounting
Prova Accesso;;Admin,Admin1
"""

print("Importing fresh CSV...")
files = {'file': ('fresh_test.csv', csv_content, 'text/csv')}
resp = requests.post(f"{BASE_URL}/api/import/csv", headers=headers, files=files)
print(f"Import response: {resp.status_code}")
if resp.status_code == 200:
    print(f"Import result: {resp.json()}")
else:
    print(f"Import error: {resp.text}")

# Check users immediately after import
print("\n--- Checking users ---")
users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])

for name in ["Bob Bianchi", "Alice Rossi", "Marco Conti", "Prova Accesso"]:
    user = next((u for u in users if name.lower() in (u.get('displayName') or '').lower()), None)
    if user:
        print(f"\n{name}:")
        print(f"  department: {user.get('department')}")
        print(f"  businessRole: {user.get('businessRole')}")
        print(f"  groups: {user.get('groups')}")
        
        # Validation
        dept = user.get('department') or ''
        br = user.get('businessRole') or ''
        if dept and br and br != 'Unassigned':
            print(f"  [PASS] Has valid BR")
        elif not dept:
            print(f"  [INFO] No department (BR assignment may be Unassigned)")
        else:
            print(f"  [FAIL] Has department but BR is Unassigned or missing!")
    else:
        print(f"\n{name}: NOT FOUND")
