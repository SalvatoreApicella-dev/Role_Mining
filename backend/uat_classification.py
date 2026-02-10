import requests
import json
import sys

BASE_URL = "http://localhost:8002"
# Use default credentials for mock AD
USER = "admin"
PASS = "admin123"

def get_token():
    try:
        res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USER, "password": PASS})
        if res.status_code != 200:
            print(f"Login failed: {res.status_code} {res.text}")
            sys.exit(1)
        return res.json()["access_token"]
    except Exception as e:
        print(f"Connection failed: {e}")
        sys.exit(1)

def main():
    print("--- Starting UAT: Account Classification & Peer Analysis ---")
    
    # 1. Login
    token = get_token()
    headers = {"Authorization": f"Bearer {token}"}
    print("[OK] Login successful")

    # 2. Get a user
    res = requests.get(f"{BASE_URL}/api/users?limit=1", headers=headers)
    if res.status_code != 200:
        print(f"[FAIL] Get users: {res.text}")
        sys.exit(1)
        
    items = res.json().get("items", [])
    if not items:
        print("[WARN] No users found. Creating a test user via import would be better, but assuming data exists.")
        sys.exit(0)
        
    target_user = items[0]
    username = target_user["username"]
    print(f"[OK] Selected target user: {username} (Current Type: {target_user.get('accountType')})")
    
    # 3. Update Account Type to 'External' or toggle it
    new_type = "External" if target_user.get("accountType") != "External" else "Internal"
    print(f"--- Testing Update Account Type for {username} to {new_type} ---")
    
    res = requests.post(
        f"{BASE_URL}/api/users/{username}/update",
        json={"accountType": new_type},
        headers=headers
    )
    if res.status_code != 200:
        print(f"[FAIL] Update failed: {res.text}")
        sys.exit(1)
        
    # Verify update
    res = requests.get(f"{BASE_URL}/api/users/{username}", headers=headers)
    updated_user = res.json()["user"]
    if updated_user.get("accountType") == new_type:
        print(f"[OK] Account type updated to {new_type}. Verified.")
    else:
        print(f"[FAIL] Account type mismatch. Expected {new_type}, got {updated_user.get('accountType')}")
        sys.exit(1)

    # 4. Peer Analysis
    print(f"--- Testing Peer Analysis for {username} ---")
    res = requests.get(f"{BASE_URL}/api/users/{username}/peer-analysis", headers=headers)
    if res.status_code != 200:
        print(f"[FAIL] Peer Analysis failed: {res.text}")
        sys.exit(1)
        
    data = res.json()
    print("Peer Analysis Response:")
    print(json.dumps(data, indent=2))
    
    if "peersCount" in data and "anomalies" in data:
        print("[OK] Structure is correct.")
    else:
        print("[FAIL] Unexpected response structure.")
        sys.exit(1)

    print("\n--- UAT Completed Successfully ---")

if __name__ == "__main__":
    main()
