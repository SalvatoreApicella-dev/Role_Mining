import subprocess
import time
import sys
import json
import urllib.request
import urllib.error
import io
import os
import signal

# Configuration
PORT = 8001
BASE_URL = f"http://localhost:{PORT}"
ADMIN_USER = "admin"
ADMIN_PASS = "admin123"

def log(msg):
    print(f"[TEST] {msg}")

def wait_for_backend():
    retries = 20
    for i in range(retries):
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health") as response:
                if response.status == 200:
                    log("Backend is up.")
                    return True
        except:
            time.sleep(1)
            pass
    return False

def start_backend():
    log("Starting backend...")
    # Assumes we are in the backend directory
    proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT)],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )
    if not wait_for_backend():
        log("Failed to start backend.")
        proc.kill()
        sys.exit(1)
    return proc

def login():
    url = f"{BASE_URL}/api/auth/login"
    data = json.dumps({"username": ADMIN_USER, "password": ADMIN_PASS}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            return res["access_token"]
    except urllib.error.HTTPError as e:
        log(f"Login failed: {e}")
        return None

def test_persistence():
    log("--- Testing Persistence ---")
    proc = start_backend()
    token = login()
    if not token:
        log("Could not login.")
        proc.kill()
        return

    # Create Role
    log("Creating role 'PERSISTENCE_TEST'...")
    url = f"{BASE_URL}/api/businessroles/create"
    data = json.dumps({"role": "PERSISTENCE_TEST"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    })
    try:
        urllib.request.urlopen(req)
    except Exception as e:
        log(f"Failed to create role: {e}")
    
    # Verify existence
    url = f"{BASE_URL}/api/businessroles"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    roles = json.loads(urllib.request.urlopen(req).read().decode())
    found = any(r["role"] == "PERSISTENCE_TEST" for r in roles["roles"])
    log(f"Role 'PERSISTENCE_TEST' exists before restart: {found}")

    # Restart
    log("Restarting backend...")
    proc.terminate()
    proc.wait()
    time.sleep(2)
    
    proc = start_backend()
    token = login() # Login again
    
    # Verify existence
    url = f"{BASE_URL}/api/businessroles"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    roles = json.loads(urllib.request.urlopen(req).read().decode())
    found = any(r["role"] == "PERSISTENCE_TEST" for r in roles["roles"])
    log(f"Role 'PERSISTENCE_TEST' exists AFTER restart: {found}")
    
    if not found:
        log("SUCCESS: Data loss verified (Expected behavior for in-memory DB).")
    else:
        log("FAILURE: Data persisted (Unexpected).")

    proc.terminate()
    proc.wait()

def test_csv_import():
    log("--- Testing CSV Import (10k rows) ---")
    proc = start_backend()
    token = login()
    
    # Generate CSV
    csv_content = "DisplayName;Department;BusinessRole;Roles\n"
    for i in range(10000):
        csv_content += f"User{i};Dept{i%10};Role{i%5};GroupA,GroupB,Group{i}\n"
    
    csv_bytes = csv_content.encode('utf-8')
    boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
    
    # Build Multipart body manually (yay)
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="test_10k.csv"\r\n'
        f'Content-Type: text/csv\r\n\r\n'
    ).encode('utf-8') + csv_bytes + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    url = f"{BASE_URL}/api/import/csv"
    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": f"multipart/form-data; boundary={boundary}",
        "Authorization": f"Bearer {token}"
    })
    
    start = time.time()
    try:
        with urllib.request.urlopen(req) as response:
            res = json.loads(response.read().decode())
            dur = time.time() - start
            log(f"Import success! Time: {dur:.2f}s")
            log(f"Rows kept: {res.get('rowsKept', 'Unknown')}")
    except urllib.error.HTTPError as e:
        log(f"Import failed: {e} {e.read().decode()}")
    except Exception as e:
        log(f"Import error: {e}")

    proc.terminate()
    proc.wait()

if __name__ == "__main__":
    try:
        test_persistence()
        test_csv_import()
    except Exception as e:
        log(f"Test crashed: {e}")
        # cleanup if needed (proc might be dangling if not handled)
