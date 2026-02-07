import requests
import time
import os

BASE_URL = "http://127.0.0.1:8002"
LOGIN_USER = "admin"
LOGIN_PASS = "admin123"
CSV_FILE = "large_dataset.csv"

def get_token():
    print("Logging in...")
    try:
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"username": LOGIN_USER, "password": LOGIN_PASS})
        r.raise_for_status()
        return r.json()["access_token"]
    except Exception as e:
        print(f"Login failed: {e}")
        return None

def upload_csv(token):
    if not os.path.exists(CSV_FILE):
        print(f"File {CSV_FILE} not found!")
        return False
    
    print(f"Uploading {CSV_FILE} (5000 users)... this may take a while...")
    files = {'file': open(CSV_FILE, 'rb')}
    headers = {'Authorization': f'Bearer {token}'}
    
    start = time.time()
    try:
        r = requests.post(f"{BASE_URL}/api/import/csv", files=files, headers=headers, timeout=120)
        r.raise_for_status()
        end = time.time()
        print(f"Import Success! Time: {end - start:.2f}s")
        print(r.json())
        return True
    except Exception as e:
        print(f"Import Failed: {e}")
        if hasattr(e, 'response') and e.response:
             print(e.response.text)
        return False

def benchmark_mining(token):
    headers = {'Authorization': f'Bearer {token}'}
    
    # 1. Trigger Mining (via KPI or mining start if needed)
    # The import triggers mining dirty=True. 
    # Calling /api/kpi triggers ensure_last_mining()
    print("\nTriggering Mining (GET /api/kpi)...")
    start = time.time()
    try:
        r = requests.get(f"{BASE_URL}/api/kpi", headers=headers, timeout=120)
        r.raise_for_status()
        end = time.time()
        print(f"Mining/KPI Time: {end - start:.2f}s")
    except Exception as e:
        print(f"KPI Failed: {e}")

    # 2. Download Matrix
    print("\nDownloading Matrix (GET /api/rolemining/last)...")
    start = time.time()
    try:
        r = requests.get(f"{BASE_URL}/api/rolemining/last", headers=headers, stream=True, timeout=120)
        r.raise_for_status()
        
        # Calculate size
        content_len = len(r.content)
        end = time.time()
        
        print(f"Matrix Download Time: {end - start:.2f}s")
        print(f"Payload Size: {content_len / 1024 / 1024:.2f} MB")
        
    except Exception as e:
        print(f"Matrix Download Failed: {e}")

if __name__ == "__main__":
    token = get_token()
    if token:
        # success = upload_csv(token)
        # Assuming CSV is already imported or I should import it?
        # User said "Testa con 5000 entry", so I MUST import it.
        if upload_csv(token):
             benchmark_mining(token)
