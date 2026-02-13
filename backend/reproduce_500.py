import requests
import json

BASE_URL = "http://localhost:8000"
USER = "admin"
PASS = "admin123"

def reproduce():
    print(f"Logging in as {USER}...")
    login_res = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USER, "password": PASS})
    if login_res.status_code != 200:
        print(f"Login failed: {login_res.status_code} {login_res.text}")
        return
    
    token = login_res.json()["access_token"]
    headers = {"Authorization": f"Bearer {token}"}
    
    role = "AP Specialist"
    url = f"{BASE_URL}/api/businessroles/{role}/suggestions?min_conf=0.1"
    print(f"Hitting {url}...")
    
    res = requests.get(url, headers=headers)
    print(f"Response Code: {res.status_code}")
    if res.status_code == 200:
        print(f"Success! Received {len(res.json())} suggestions.")
    else:
        print(f"Error: {res.text}")

if __name__ == "__main__":
    reproduce()
