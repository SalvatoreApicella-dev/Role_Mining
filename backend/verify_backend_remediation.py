import requests
import sys
import time

BASE_URL = "http://127.0.0.1:8002/api"
TOKEN = None

def login():
    global TOKEN
    url = f"{BASE_URL}/auth/login"
    creds = {"username": "admin", "password": "admin123"}
    
    print(f"Logging in to {url}...")
    for i in range(5):
        try:
            r = requests.post(url, json=creds, timeout=5)
            if r.status_code == 200:
                data = r.json()
                TOKEN = data.get("access_token")
                print("Login successful.")
                return True
            else:
                print(f"Login failed: {r.status_code} {r.text}")
        except Exception as e:
            print(f"Login connection error: {e}")
            time.sleep(1)
            
    print("Could not login after retries.")
    return False

def get_headers():
    return {"Authorization": f"Bearer {TOKEN}"}

def check_health():
    # Login acts as health check too
    if not login():
        return False
        
    print("Checking /users connectivity...")
    for _ in range(5):
        try:
            r = requests.get(f"{BASE_URL}/users", params={"limit": 1}, headers=get_headers(), timeout=5)
            if r.status_code == 200:
                print("Backend is healthy and authorized.")
                return True
            else:
                print(f"Health check failed: {r.status_code} {r.text}")
        except Exception as e:
            print(f"Health check error: {e}")
            time.sleep(1)
    return False

def test_type_filter():
    print("\n--- Testing Type Filter ---")
    try:
        r = requests.get(f"{BASE_URL}/users", params={"limit": 50}, headers=get_headers())
        if r.status_code != 200:
            print(f"FAIL: /users returned {r.status_code}")
            return False
        
        users = r.json().get("items", [])
        if not users:
            print("WARN: No users found. Skipping filter test.")
            return True
        
        distinct_types = set()
        for u in users:
            t = u.get("accountType") or "Internal"
            distinct_types.add(t)
            
        print(f"Available types: {distinct_types}")
        
        for t in distinct_types:
            print(f"Filtering for type: '{t}'")
            r = requests.get(f"{BASE_URL}/users", params={"type_q": t, "limit": 100}, headers=get_headers())
            if r.status_code != 200:
                print(f"FAIL: Request failed for type_q={t}")
                return False
            
            filtered = r.json().get("items", [])
            print(f"Found {len(filtered)} users.")
            for u in filtered:
                u_type = u.get("accountType") or "Internal"
                if t.lower() not in u_type.lower():
                    print(f"FAIL: User {u['username']} has type '{u_type}', expected match for '{t}'")
                    return False
        
        print("PASS: Type Filter works correctly.")
        return True
    except Exception as e:
        print(f"EXCEPTION in test_type_filter: {e}")
        return False

def test_sorting():
    print("\n--- Testing Sorting ---")
    try:
        # Test ASC
        print("Sorting by accountType ASC")
        r = requests.get(f"{BASE_URL}/users", params={"sort_by": "accountType", "order": "asc", "limit": 20}, headers=get_headers())
        if r.status_code != 200: return False
        users_asc = r.json().get("items", [])
        vals_asc = [(u.get("accountType") or "internal").lower() for u in users_asc]
        
        if vals_asc != sorted(vals_asc):
            print(f"FAIL: Not sorted ASC. Got: {vals_asc}")
            return False
            
        # Test DESC
        print("Sorting by accountType DESC")
        r = requests.get(f"{BASE_URL}/users", params={"sort_by": "accountType", "order": "desc", "limit": 20}, headers=get_headers())
        if r.status_code != 200: return False
        users_desc = r.json().get("items", [])
        vals_desc = [(u.get("accountType") or "internal").lower() for u in users_desc]
        
        if vals_desc != sorted(vals_desc, reverse=True):
             print(f"FAIL: Not sorted DESC. Got: {vals_desc}")
             return False
             
        print("PASS: Sorting works correctly.")
        return True
    except Exception as e:
        print(f"EXCEPTION in test_sorting: {e}")
        return False

if __name__ == "__main__":
    if not check_health():
        print("BACKEND_NOT_RUNNING_OR_AUTH_FAILED")
        sys.exit(1)
        
    success = True
    if not test_type_filter(): success = False
    if not test_sorting(): success = False
    
    if success:
        print("\nALL VERIFICATIONS PASSED")
        sys.exit(0)
    else:
        print("\nSOME VERIFICATIONS FAILED")
        sys.exit(1)
