
import unittest
import requests
import json
import time
import subprocess
import sys
import os

# Configuration
BASE_URL = "http://localhost:8000/api"
AUTH_USER = "admin"
AUTH_PASS = "admin123"

# AD Configuration provided by user
AD_HOST = "79.36.174.172"
AD_USER = "Administrator@example.internal"
AD_PASS = "Role_Mining"
AD_BASE_DN = "DC=example,DC=internal"

class RoleMiningUAT(unittest.TestCase):
    token = None
    headers = {}

    @classmethod
    def setUpClass(cls):
        # Ensure backend is accessible on port 8001
        try:
            requests.get(f"{BASE_URL}/health", timeout=2)
        except:
            print(f"Backend not running at {BASE_URL}? Starting it on port 8001...")
            cls.log_out = open("backend_stdout.log", "w")
            cls.log_err = open("backend_stderr.log", "w")
            cls.proc = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "main:app", "--port", "8000"],
                cwd=r"e:\Salvo\Desktop\Progetti\Role Mining\Role_Mining\backend",
                stdout=cls.log_out,
                stderr=cls.log_err
            )
            time.sleep(5)
            # Verify it came up
            try:
                requests.get(f"{BASE_URL}/health", timeout=5)
            except:
                print("Failed to start backend.")
                raise Exception("Backend failed to start")

    def test_01_health_check(self):
        """Verify API is responsive."""
        resp = requests.get(f"{BASE_URL}/health")
        self.assertEqual(resp.status_code, 200, f"Health check failed: {resp.text}")

    def test_02_login(self):
        """Verify login functionality."""
        resp = requests.post(f"{BASE_URL}/auth/login", json={"username": AUTH_USER, "password": AUTH_PASS})
        self.assertEqual(resp.status_code, 200, f"Login failed: {resp.text}")
        data = resp.json()
        self.assertIn("access_token", data)
        RoleMiningUAT.token = data["access_token"]
        RoleMiningUAT.headers = {"Authorization": f"Bearer {RoleMiningUAT.token}"}

    def test_03_import_csv(self):
        """Simulate CSV import (using post parameters similar to frontend)."""
        csv_text = "DisplayName;Department;BusinessRole;Roles\nUserUAT;DeptUAT;RoleUAT;Group1,Group2"
        files = {'file': ('uat.csv', csv_text, 'text/csv')}
        
        if not RoleMiningUAT.token: self.test_02_login()
            
        resp = requests.post(f"{BASE_URL}/import/csv", files=files, headers=RoleMiningUAT.headers)
        self.assertEqual(resp.status_code, 200, f"CSV Import failed: {resp.text}")
        data = resp.json()
        self.assertGreaterEqual(data.get("rowsKept", 0), 1)

    def test_04_verify_csv_user_created(self):
        """Verify the user import created the user."""
        resp = requests.get(f"{BASE_URL}/users", headers=RoleMiningUAT.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        users = data.get("users", [])
        found = any(u.get("displayName") == "UserUAT" for u in users)
        self.assertTrue(found, f"Imported CSV user 'UserUAT' not found.")

    def test_05_verify_csv_business_role_created(self):
        """Verify the 'RoleUAT' was added to business roles."""
        resp = requests.get(f"{BASE_URL}/businessroles", headers=RoleMiningUAT.headers)
        data = resp.json()
        roles_found = [r["role"] for r in data.get("roles", [])]
        found = "RoleUAT" in roles_found
        self.assertTrue(found, f"Imported Business Role 'RoleUAT' not found. Found: {roles_found}")

    def test_08_config_ad(self):
        """Configure AD Connector."""
        config_payload = {
            "server": AD_HOST,
            "bind_user": AD_USER,
            "bind_password": AD_PASS,
            "base_dn": AD_BASE_DN,
            "auth": "SIMPLE"
        }
        if not RoleMiningUAT.token: self.test_02_login()

        resp = requests.post(f"{BASE_URL}/config/connector", json=config_payload, headers=RoleMiningUAT.headers)
        self.assertEqual(resp.status_code, 200, f"AD Config failed: {resp.text}")
        data = resp.json()
        self.assertEqual(data["server"], AD_HOST)

    def test_09_import_ad(self):
        """Perform AD Extraction."""
        if not RoleMiningUAT.token: self.test_02_login()
        
        # Using the base DN provided as the OU to extract from
        req_payload = {"ou": AD_BASE_DN}
        
        print(f"Attempting AD extraction from {AD_HOST}...")
        resp = requests.post(f"{BASE_URL}/ad/extract", json=req_payload, headers=RoleMiningUAT.headers)
        
        if resp.status_code != 200:
            print(f"AD Extract Failed: {resp.text}")
        
        self.assertEqual(resp.status_code, 200, f"AD Extract failed: {resp.text}")
        data = resp.json()
        self.assertIn("total_users", data)
        print(f"AD Import Success! Found {data['total_users']} users.")
        self.assertGreater(data["total_users"], 0, "AD import returned 0 users.")

    def test_06_run_mining(self):
        """Trigger mining."""
        params = {"n_clusters": 2, "role_support": 0.5}
        resp = requests.post(f"{BASE_URL}/rolemining/run", json=params, headers=RoleMiningUAT.headers)
        self.assertIn(resp.status_code, [200, 400]) 

if __name__ == "__main__":
    with open("uat_results.txt", "w") as f:
        runner = unittest.TextTestRunner(stream=f, verbosity=2)
        prog = unittest.main(testRunner=runner, exit=False)
        if not prog.result.wasSuccessful():
            sys.exit(1)
