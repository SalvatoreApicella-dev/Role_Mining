"""
Comprehensive UAT Suite for Role Mining Backend.
Covers:
1. Authentication (Login, Token Validity)
2. CSV Import Logic (New Users, Existing Users matches)
3. REPLACE Behavior Verification (Groups, Department, Business Role)

Usage:
    python uat_integrated.py
"""
import requests
import json
import time
import sys
from datetime import datetime

BASE_URL = "http://127.0.0.1:8002"
AUTH_USER = "admin"
AUTH_PASS = "admin123"

class UATRunner:
    def __init__(self):
        self.token = None
        self.headers = {}
        self.session = requests.Session()
        self.results = []
        
    def log(self, message, status="INFO"):
        print(f"[{datetime.now().strftime('%H:%M:%S')}] [{status}] {message}")
        
    def assert_true(self, condition, message):
        if condition:
            self.log(f"PASS: {message}", "SUCCESS")
            self.results.append(True)
        else:
            self.log(f"FAIL: {message}", "ERROR")
            self.results.append(False)
            
    def authenticate(self):
        self.log("Attempting authentication...")
        try:
            resp = self.session.post(f"{BASE_URL}/api/auth/login", json={"username": AUTH_USER, "password": AUTH_PASS})
            if resp.status_code == 200:
                data = resp.json()
                self.token = data.get("access_token")
                if self.token:
                    self.headers = {"Authorization": f"Bearer {self.token}"}
                    self.log("Authentication successful")
                    return True
                else:
                    self.log("Authentication failed: No token returned", "ERROR")
            else:
                self.log(f"Authentication failed: {resp.status_code} - {resp.text}", "ERROR")
        except Exception as e:
            self.log(f"Authentication Exception: {str(e)}", "ERROR")
        return False

    def get_user(self, display_name_fragment):
        try:
            resp = self.session.get(f"{BASE_URL}/api/users", headers=self.headers)
            if resp.status_code == 401:
                self.log("Token expired or invalid during get_user", "ERROR")
                return None
            users = resp.json().get("users", [])
            for u in users:
                if display_name_fragment.lower() in (u.get("displayName") or "").lower():
                    return u
        except Exception as e:
            self.log(f"Exception getting user: {e}", "ERROR")
        return None

    def run_tests(self):
        if not self.authenticate():
            return
        
        self.test_csv_import_replace_logic()
        
        total = len(self.results)
        passed = sum(self.results)
        self.log(f"COMPLETED: {passed}/{total} tests passed.", "RESULT")

    def test_csv_import_replace_logic(self):
        self.log("=== START TEST: CSV Import REPLACE Logic ===")
        
        # 1. Setup Initial User via Import
        csv_initial = """DisplayName;Department;BusinessRole;Ruoli
UAT User;Sales;Sales_Rep;GroupA,GroupB
"""
        files = {'file': ('uat_init.csv', csv_initial, 'text/csv')}
        self.log("Step 1: Importing initial user state...")
        resp = self.session.post(f"{BASE_URL}/api/import/csv", headers=self.headers, files=files)
        
        if resp.status_code != 200:
            self.log(f"Initial import failed: {resp.status_code}", "ERROR")
            self.results.append(False)
            return

        # Verify Initial State
        user = self.get_user("UAT User")
        if not user:
            self.assert_true(False, "Initial user creation failed")
            return
            
        initial_groups = set(user.get("groups") or [])
        self.assert_true(initial_groups == {"GroupA", "GroupB"}, f"Initial groups correct: {initial_groups}")
        self.assert_true(user.get("department") == "Sales", f"Initial Dept correct: {user.get('department')}")
        self.assert_true(user.get("businessRole") == "Sales_Rep", f"Initial BR correct: {user.get('businessRole')}")
        
        # 2. Update User via Import (Same DisplayName) -> Test REPLACE
        # Change Dept, Change BR, Change Groups (GroupC only)
        # Expected: Groups -> [GroupC] (NOT merged), Dept -> Marketing, BR -> Marketer
        csv_update = """DisplayName;Department;BusinessRole;Ruoli
UAT User;Marketing;Marketer;GroupC
"""
        files = {'file': ('uat_update.csv', csv_update, 'text/csv')}
        self.log("Step 2: Importing update with NEW values (Testing REPLACE)...")
        resp = self.session.post(f"{BASE_URL}/api/import/csv", headers=self.headers, files=files)
        
        if resp.status_code != 200:
            self.log(f"Update import failed: {resp.status_code}", "ERROR")
            self.results.append(False)
            return

        # Verify Updated State
        updated_user = self.get_user("UAT User")
        current_groups = set(updated_user.get("groups") or [])
        current_dept = updated_user.get("department")
        current_br = updated_user.get("businessRole")
        
        # Check Groups REPLACE behavior
        msg = f"Groups REPLACED verification. Expected {{'GroupC'}}, Got {current_groups}"
        if current_groups == {"GroupC"}:
            self.assert_true(True, msg)
        else:
            self.assert_true(False, msg)
            
        # Check Department Update
        self.assert_true(current_dept == "Marketing", f"Department Updated. Got: {current_dept}")
        
        # Check Business Role Update
        self.assert_true(current_br == "Marketer", f"Business Role Updated. Got: {current_br}")

        # 3. Simulate Invalid Token Scenario
        # We manually mess up the token header to verify API handles it (401)
        self.log("Step 3: Verifying Invalid Token Handling...")
        old_headers = self.headers.copy()
        self.headers["Authorization"] = "Bearer INVALID_TOKEN_STRING"
        resp = self.session.get(f"{BASE_URL}/api/users", headers=self.headers)
        
        if resp.status_code == 401:
            self.assert_true(True, "API correctly rejected invalid token (401)")
        else:
            self.assert_true(False, f"API did NOT reject invalid token. Status: {resp.status_code}")
            
        # Restore headers for any future steps (though specific test ends here)
        self.headers = old_headers

if __name__ == "__main__":
    runner = UATRunner()
    runner.run_tests()
