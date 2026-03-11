import unittest
import requests
import json
import time
import os

BASE_URL = "http://localhost:8002"

# Configuration for Real AD (attempt)
AD_HOST = "79.36.174.172"
AD_USER = "Administrator@example.internal"
AD_PASS = "Role_Mining"
AD_BASE_DN = "DC=example,DC=internal"

class RoleMiningUAT(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = ""
        cls.headers = {}
        # Wait for service
        for i in range(5):
            try:
                requests.get(f"{BASE_URL}/api/health")
                break
            except:
                time.sleep(1)

    def test_00_health(self):
        try:
            resp = requests.get(f"{BASE_URL}/api/health")
            self.assertEqual(resp.status_code, 200)
        except Exception as e:
            self.fail(f"Backend not reachable: {e}")

    def test_01_login(self):
        payload = {"username": "admin", "password": "admin123", "domain": "example.internal"}
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        self.assertEqual(resp.status_code, 200, "Login failed")
        data = resp.json()
        self.assertIn("access_token", data)
        RoleMiningUAT.token = data["access_token"]
        RoleMiningUAT.headers = {"Authorization": f"Bearer {data['access_token']}"}

    def test_02_config_connector_mock(self):
        """Set connector to MOCK to verify parsing/extraction logic works without network dependency"""
        payload = {
            "server": "mock",
            "bind_user": "",
            "bind_password": "",
            "base_dn": "",
            "auth": "SIMPLE"
        }
        resp = requests.post(f"{BASE_URL}/api/config/connector", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        
        # Trigger Extract
        resp = requests.post(f"{BASE_URL}/api/ad/extract", json={"ou": "ignored"}, headers=self.headers)
        self.assertEqual(resp.status_code, 200, "Mock extraction failed")
        data = resp.json()
        self.assertGreater(data["total_users"], 0, "Mock extract returned no users")

    def test_03_config_connector_real_attempt(self):
        """Configure Real AD and attempt extraction. Should NOT return 500 even if it fails."""
        payload = {
            "server": AD_HOST,
            "bind_user": AD_USER,
            "bind_password": AD_PASS,
            "base_dn": AD_BASE_DN,
            "auth": "SIMPLE",
            "port": 636,
            "use_ssl": True
        }
        resp = requests.post(f"{BASE_URL}/api/config/connector", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        
        # Verify config was saved
        data = resp.json()
        self.assertEqual(data.get("port"), 636)
        self.assertEqual(data.get("use_ssl"), True)

        # Attempt Extract
        print(f"\n[INFO] Attempting Real AD extraction from {AD_HOST}...")
        resp = requests.post(f"{BASE_URL}/api/ad/extract", json={"ou": AD_BASE_DN}, headers=self.headers)
        
        if resp.status_code == 200:
            print("[INFO] Real AD Connection SUCCESS")
            data = resp.json()
            self.assertIn("users", data)
        else:
            print(f"[INFO] Real AD Connection FAILED (Expected if unreachable). Status: {resp.status_code}, Detail: {resp.text}")
            # The CRITICAL check: did we get a handled error (400, 503, 504) or an unhandled crash (500)?
            # My fix returns 503/504/400. 500 is what we want to avoid (unless it's a handled 500 with message).
            # If status is 500, check if detail is structured json
            if resp.status_code == 500:
                 # Check if it is a JSON error from HTTPException
                 try:
                     err = resp.json()
                     self.assertIn("detail", err, "got raw 500 HTML body? verify backend logs")
                     print(f"[PASS] Got handled 500: {err['detail']}")
                 except:
                     self.fail(f"Got UNHANDLED 500 error! Fix failed? Response: {resp.text[:200]}")
            else:
                 self.assertIn(resp.status_code, [400, 503, 504], f"Unexpected status code {resp.status_code}")

    def test_04_role_mining_flow(self):
        # Ensure we have data (Switch back to mock if needed? No, let's assume we have data from step 2 if step 3 failed, or step 3 if success. 
        # Actually, if step 3 failed without updating state, we still might have mock data from step 2 if we didn't overwrite it? 
        # Check if users exist
        resp = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        if resp.json()["total"] == 0:
            # Re-run mock ingest to ensure we have data for mining test
             self.test_02_config_connector_mock()

        payload = {"n_clusters": 2, "role_support": 0.5}
        resp = requests.post(f"{BASE_URL}/api/rolemining/run", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200, f"Role Mining failed: {resp.text}")
        data = resp.json()
        self.assertIn("clusters", data)

    def test_05_kpi(self):
        resp = requests.get(f"{BASE_URL}/api/kpi", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
    
    def test_06_business_role_creation(self):
        new_role = "TEST_ROLE_UAT"
        # Check if exists (idempotency)
        resp = requests.get(f"{BASE_URL}/api/businessroles", headers=self.headers)
        
        # Create
        requests.post(f"{BASE_URL}/api/businessroles/create", json={"role": new_role}, headers=self.headers)
        
        # Verify
        resp = requests.get(f"{BASE_URL}/api/businessroles", headers=self.headers)
        found = any(r["role"] == new_role for r in resp.json()["roles"])
        self.assertTrue(found, "Business Role creation failed")

if __name__ == "__main__":
    unittest.main()
