"""Test persistence layer - verify data survives restart"""
import urllib.request
import urllib.error
import json
import subprocess
import time
import sys
import signal

PORT = 8006
BASE_URL = f"http://localhost:{PORT}"

def wait_for_backend(timeout=20):
    for _ in range(timeout):
        try:
            with urllib.request.urlopen(f"{BASE_URL}/api/health") as response:
                if response.status == 200:
                    return True
        except:
            time.sleep(1)
    return False

def login():
    url = f"{BASE_URL}/api/auth/login"
    data = json.dumps({"username": "admin", "password": "admin123", "domain": "example.internal"}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())["access_token"]

def create_role(token, role_name):
    url = f"{BASE_URL}/api/businessroles/create"
    data = json.dumps({"role": role_name}).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {token}"
    })
    urllib.request.urlopen(req)

def get_roles(token):
    url = f"{BASE_URL}/api/businessroles"
    req = urllib.request.Request(url, headers={"Authorization": f"Bearer {token}"})
    with urllib.request.urlopen(req) as response:
        return json.loads(response.read().decode())

print("[TEST] Starting backend...")
proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT)],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)

if not wait_for_backend():
    print("[FAIL] Backend didn't start")
    proc.kill()
    sys.exit(1)

print("[TEST] Backend is up")
token = login()

# Create test role
print("[TEST] Creating role 'PERSIST_TEST'...")
create_role(token, "PERSIST_TEST")

# Verify it exists
roles = get_roles(token)
found = any(r["role"] == "PERSIST_TEST" for r in roles["roles"])
print(f"[TEST] Role exists before restart: {found}")

# Restart backend
print("[TEST] Restarting backend...")
proc.terminate()
proc.wait()
time.sleep(2)

proc = subprocess.Popen(
    [sys.executable, "-m", "uvicorn", "main:app", "--port", str(PORT)],
    stdout=subprocess.DEVNULL,
    stderr=subprocess.DEVNULL
)

if not wait_for_backend():
    print("[FAIL] Backend didn't restart")
    proc.kill()
    sys.exit(1)

print("[TEST] Backend restarted")
token = login()

# Check if role persisted
roles = get_roles(token)
found = any(r["role"] == "PERSIST_TEST" for r in roles["roles"])
print(f"[TEST] Role exists AFTER restart: {found}")

if found:
    print("[SUCCESS] ✓ Data persisted across restart!")
else:
    print("[FAIL] ✗ Data was lost")

proc.terminate()
proc.wait()
