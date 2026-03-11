"""Final verification of Business Role assignment fix"""
import requests

BASE_URL = "http://127.0.0.1:8002"
token = requests.post(f"{BASE_URL}/api/auth/login", json={"username":"admin","password":"admin123","domain":"example.internal"}).json().get("access_token")
headers = {"Authorization": f"Bearer {token}"}
users = requests.get(f"{BASE_URL}/api/users", headers=headers).json().get("users", [])

# Check multiple users
test_users = ["bob", "alice", "marco", "paolo", "giulia", "sara"]
print("=== Business Role Verification ===\n")

passed = 0
failed = 0

for name in test_users:
    user = next((u for u in users if name in (u.get('username') or '').lower()), None)
    if user:
        br = (user.get('businessRole') or '').strip()
        dept = (user.get('department') or '').strip()
        dn = user.get('displayName', '')
        
        status = "PASS" if (br and br != "Unassigned") else "FAIL"
        if status == "PASS":
            passed += 1
        else:
            failed += 1
        print(f"[{status}] {dn}: BR={br}, Dept={dept}")

print(f"\n=== Results: {passed} passed, {failed} failed ===")
