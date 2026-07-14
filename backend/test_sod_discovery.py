"""Test case for SoD matrix discovery using statistical mutual exclusion and user demographic profiling."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class SoDDiscoveryTest(unittest.TestCase):
    def test_sod_discovery_with_opaque_groups(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from fastapi.testclient import TestClient
            from app.server import app, state

            # Setup synthetic test users with opaque groups & distinct departments/roles
            state["last_mining"] = {}
            state["last_extract"] = {
                "users": [
                    # Purchasing Department (mostly Group A, never Group B)
                    {"username": "buyer1", "displayName": "Buyer 1", "groups": ["GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer2", "displayName": "Buyer 2", "groups": ["GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer3", "displayName": "Buyer 3", "groups": ["GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer4", "displayName": "Buyer 4", "groups": ["GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer5", "displayName": "Buyer 5", "groups": ["GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    
                    # Administration Department (mostly Group B, never Group A)
                    {"username": "admin1", "displayName": "Admin 1", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin2", "displayName": "Admin 2", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin3", "displayName": "Admin 3", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin4", "displayName": "Admin 4", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin5", "displayName": "Admin 5", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    
                    # One exception user having both (representing the SoD conflict alert)
                    {"username": "rogue1", "displayName": "Rogue 1", "groups": ["GRP_OPAQ_A", "GRP_OPAQ_B"], "department": "Purchasing", "businessRole": "Buyer"},
                ]
            }

            client = TestClient(app)
            login = client.post(
                "/api/auth/login",
                json={"domain": "example.internal", "username": "admin", "password": "admin123"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = client.post(
                "/api/role-modeling/sandbox",
                headers=headers,
                json={
                    "max_suggestions": 24,
                    "min_group_support": 0.6,
                    "redundancy_threshold": 0.8,
                    "ml_weight: ": 0.35
                },
            )
            assert response.status_code == 200, response.text
            res_data = response.json()
            
            sod_matrix = res_data.get("sodMatrix", [])
            assert len(sod_matrix) > 0, f"Expected SoD alerts, got none. Data: {res_data}"
            
            # Find the alert between GRP_OPAQ_A and GRP_OPAQ_B
            alert = next((x for x in sod_matrix if (x["groupA"] == "GRP_OPAQ_A" and x["groupB"] == "GRP_OPAQ_B") or (x["groupA"] == "GRP_OPAQ_B" and x["groupB"] == "GRP_OPAQ_A")), None)
            assert alert is not None, "GRP_OPAQ_A x GRP_OPAQ_B alert not found"
            assert alert["users"] == 1, f"Expected 1 user in conflict, got {alert['users']}"
            
            # Verify the description profiles Purchasing vs Administration
            rec = alert["recommendation"]
            assert "Purchasing" in rec, f"Expected department 'Purchasing' in recommendation: {rec}"
            assert "Administration" in rec, f"Expected department 'Administration' in recommendation: {rec}"
            assert "Buyer" in rec or "Accountant" in rec, f"Expected business role in recommendation: {rec}"
            print("SoD Discovery test successfully passed!")
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "sod-discovery-test-secret-32"
            python_bin = backend_dir / ".venv" / "bin" / "python"
            if not python_bin.exists():
                python_bin = Path(sys.executable)
            result = subprocess.run(
                [str(python_bin), "-c", script],
                cwd=tmpdir,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=90,
            )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
