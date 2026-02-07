
import requests
import time
import os
import json

BASE_URL = "http://localhost:8002"
LOGIN_URL = f"{BASE_URL}/api/auth/login"
IMPORT_URL = f"{BASE_URL}/api/import/csv"
KPI_URL = f"{BASE_URL}/api/kpi"
LAST_MINING_URL = f"{BASE_URL}/api/rolemining/last"
DATASET_FILE = "large_dataset.csv"

# Credentials (default)
USERNAME = "admin"
PASSWORD = "admin123"

def run_test():
    print("=== STARTING FULL UAT VERIFICATION ===")
    
    # 1. Login
    print(f"[1] Logging in as {USERNAME}...")
    try:
        resp = requests.post(LOGIN_URL, json={"username": USERNAME, "password": PASSWORD})
        if resp.status_code != 200:
            print(f"ERROR: Login failed. Status: {resp.status_code}, Body: {resp.text}")
            return
        token = resp.json().get("access_token")
        print("    Success! Token received.")
    except Exception as e:
        print(f"ERROR: Login exception: {e}")
        return

    headers = {"Authorization": f"Bearer {token}"}

    # 2. Upload CSV
    # Only upload if file exists
    if not os.path.exists(DATASET_FILE):
        print(f"WARNING: {DATASET_FILE} not found. Skipping upload.")
    else:
        print(f"[2] Uploading {DATASET_FILE}...")
        try:
            with open(DATASET_FILE, "rb") as f:
                start = time.time()
                resp = requests.post(IMPORT_URL, files={"file": f}, headers=headers)
                dur = time.time() - start
            if resp.status_code == 200:
                 print(f"    Success! Time: {dur:.2f}s. Response: {resp.json().get('ok')}")
            else:
                 print(f"ERROR: Import failed. Status: {resp.status_code}, Body: {resp.text}")
                 return
        except Exception as e:
            print(f"ERROR: Import exception: {e}")
            return

    # 3. Trigger Mining via KPI
    print("[3] Triggering Mining (GET /api/kpi)...")
    try:
        start = time.time()
        resp = requests.get(KPI_URL, headers=headers)
        dur = time.time() - start
        if resp.status_code == 200:
            print(f"    Success! Mining took {dur:.2f}s.")
        else:
            print(f"ERROR: KPI failed. Status: {resp.status_code}, Body: {resp.text}")
            return
    except Exception as e:
        print(f"ERROR: KPI exception: {e}")
        return

    # 4. Download Matrix (Sparse Check)
    print("[4] Downloading Matrix (GET /api/rolemining/last)...")
    try:
        start = time.time()
        resp = requests.get(LAST_MINING_URL, headers=headers)
        dur = time.time() - start
        
        content_len = len(resp.content)
        mb = content_len / (1024 * 1024)
        print(f"    Download Time: {dur:.2f}s")
        print(f"    Payload Size: {mb:.2f} MB")
        
        data = resp.json()
        matrix = data.get("matrix", {})
        
        # Verify Sparse (Values should be list, not dict)
        if matrix:
            first_key = next(iter(matrix))
            first_val = matrix[first_key]
            print(f"    Sample User: {first_key}")
            print(f"    Sample Value Type: {type(first_val)}")
            if isinstance(first_val, list):
                print("    VERIFIED: Matrix is SPARSE (List of groups).")
            elif isinstance(first_val, dict):
                 print(f"    WARNING: Matrix is DENSE (Dict). Optimization NOT active.")
            else:
                 print(f"    UNKNOWN format: {type(first_val)}")
        else:
            print("    WARNING: Matrix is empty.")

    except Exception as e:
        print(f"ERROR: Matrix check exception: {e}")
        return

    # 5. Verify Token Persistence
    print("[5] Verifying Token Persistence (GET /api/users)...")
    try:
        resp = requests.get(f"{BASE_URL}/api/users?limit=1", headers=headers)
        if resp.status_code == 200:
            print("    Success! Token is still valid.")
        else:
            print(f"ERROR: Token invalid? Status: {resp.status_code}")
    except Exception as e:
        print(f"ERROR: Persistence check exception: {e}")

    print("=== UAT COMPLETED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_test()
