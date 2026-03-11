
import requests
import time
import random

BASE_URL = "http://localhost:8002"
USERNAME = "admin"
PASSWORD = "admin123"

def get_token():
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": USERNAME, "password": PASSWORD, "domain": "example.internal"})
    if resp.status_code != 200:
        print("Login failed")
        return None
    return resp.json()["access_token"]

def generate_csv(rows=1000):
    lines = ["DisplayName;Department;BusinessRole;Roles"]
    for i in range(rows):
        dn = f"User {i}"
        dept = f"Dept_{i % 10}"  # 10 departments
        br = ""
        roles = f"Group_A_{i%5},Group_B_{i%3}"
        lines.append(f"{dn};{dept};{br};{roles}")
    return "\n".join(lines)

def test_csv_upload():
    token = get_token()
    if not token:
        return

    csv_content = generate_csv(2000)
    print(f"Uploading CSV with 2000 rows... ({len(csv_content)} bytes)")

    files = {"file": ("test_perf.csv", csv_content, "text/csv")}
    headers = {"Authorization": f"Bearer {token}"}

    start = time.time()
    resp = requests.post(f"{BASE_URL}/api/import/csv", files=files, headers=headers)
    end = time.time()

    print(f"Status: {resp.status_code}")
    print(f"Time: {end - start:.2f} seconds")
    if resp.status_code != 200:
        print(resp.text)

if __name__ == "__main__":
    test_csv_upload()
