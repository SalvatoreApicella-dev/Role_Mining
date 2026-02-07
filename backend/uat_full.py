import unittest
import requests
import json
import time
import os

BASE_URL = "http://localhost:8000"
AD_HOST = "79.36.174.172"
AD_USER = "Administrator@example.internal"
AD_PASS = "Role_Mining"
AD_BASE_DN = "DC=example,DC=internal"

class RoleMiningFullUAT(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.token = ""
        cls.headers = {}

    def test_01_health(self):
        resp = requests.get(f"{BASE_URL}/api/health")
        self.assertEqual(resp.status_code, 200)

    def test_02_login(self):
        payload = {"username": "admin", "password": "admin123"}
        resp = requests.post(f"{BASE_URL}/api/auth/login", json=payload)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("access_token", data)
        RoleMiningFullUAT.token = data["access_token"]
        RoleMiningFullUAT.headers = {"Authorization": f"Bearer {data['access_token']}"}

    def test_03_connector_config(self):
        payload = {
            "server": AD_HOST,
            "bind_user": AD_USER,
            "bind_password": AD_PASS,
            "base_dn": AD_BASE_DN,
            "auth": "SIMPLE"
        }
        resp = requests.post(f"{BASE_URL}/api/config/connector", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)

    def test_04_ad_extract(self):
        # This might take a while
        payload = {"ou": AD_BASE_DN}
        resp = requests.post(f"{BASE_URL}/api/ad/extract", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("total_users", data)
        self.assertGreater(data["total_users"], 0)

    def test_05_import_csv_with_duplicates(self):
        # Create a CSV with intentional duplicates to test conflict endpoint
        csv_content = (
            "DisplayName;Department;BusinessRole;Ruoli\n"
            "Conflict User;IT;IT;VPN,GitLab\n"
            "Conflict User;HR;HR;Payroll\n"
            "Single User;SALES;SALES;CRM\n"
        )
        files = {'file': ('test_conflict.csv', csv_content)}
        resp = requests.post(f"{BASE_URL}/api/import/csv", files=files, headers=self.headers)
        self.assertEqual(resp.status_code, 200)

    def test_06_verify_conflicts(self):
        resp = requests.get(f"{BASE_URL}/api/ingest/conflicts/duplicate-displayname", headers=self.headers)
        self.assertEqual(resp.status_code, 200, f"Conflict endpoint failed: {resp.text}")
        data = resp.json()
        self.assertIn("items", data)
        found = any(item["displayName"] == "Conflict User" for item in data["items"])
        self.assertTrue(found, "Conflict User not found in duplicates list")

    def test_07_resolve_conflict(self):
        # Get the conflict list first to find IDs
        resp = requests.get(f"{BASE_URL}/api/ingest/conflicts/duplicate-displayname", headers=self.headers)
        data = resp.json()
        target = next(item for item in data["items"] if item["displayName"] == "Conflict User")
        rows = target["rows"]
        
        # Choose the first one
        payload = {
            "kind": "duplicate-displayname",
            "displayName": "Conflict User",
            "candidateId": rows[0]["candidateId"]
        }
        resp = requests.post(f"{BASE_URL}/api/ingest/conflicts/choose", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)

    def test_08_run_mining(self):
        payload = {"n_clusters": 5, "role_support": 0.5}
        resp = requests.post(f"{BASE_URL}/api/rolemining/run", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("clusters", data)

    def test_09_kpi_and_drilldown(self):
        # Test generic kpi
        resp = requests.get(f"{BASE_URL}/api/kpi", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        
        # Test drilldown
        for metric in ["overprivileged", "ai-detection", "cluster-quality"]:
            resp = requests.get(f"{BASE_URL}/api/kpi/drilldown/{metric}", headers=self.headers)
            self.assertEqual(resp.status_code, 200, f"Drilldown {metric} failed: {resp.text}")

    def test_10_user_management(self):
        # List users
        resp = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        users = data.get("users") or []
        self.assertGreater(len(users), 0)
        
        uname = users[0]["username"]
        # Get user
        resp = requests.get(f"{BASE_URL}/api/users/{uname}", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        
        # Toggle group
        group = users[0]["groups"][0] if users[0].get("groups") else "SomeGroup"
        payload = {"username": uname, "group": group, "enabled": False}
        resp = requests.post(f"{BASE_URL}/api/users/groups/toggle", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)

    def test_11_business_role_management(self):
        # List Roles
        resp = requests.get(f"{BASE_URL}/api/businessroles", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        roles = data.get("roles") or []
        
        # Create Role
        new_role = "UAT_NEW_ROLE"
        payload = {"role": new_role}
        resp = requests.post(f"{BASE_URL}/api/businessroles/create", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        
        # Get Suggestions
        resp = requests.get(f"{BASE_URL}/api/businessroles/{new_role}/suggestions", headers=self.headers)
        self.assertEqual(resp.status_code, 200)
        
        # Set Color
        payload = {"color": "#FF5733"}
        resp = requests.post(f"{BASE_URL}/api/businessroles/{new_role}/color", json=payload, headers=self.headers)
        self.assertEqual(resp.status_code, 200)

if __name__ == "__main__":
    unittest.main()
