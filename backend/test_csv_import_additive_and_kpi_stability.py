"""Regression guard for additive CSV imports and non-zero KPI fallback."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class CsvImportAdditiveAndKpiStabilityTest(unittest.TestCase):
    def test_csv_import_adds_to_existing_users_and_kpi_does_not_zero_loaded_data(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from fastapi.testclient import TestClient

            from app import server
            from app.db.storage import init_default_state, tenant_context

            client = TestClient(server.app)
            with tenant_context("example.internal"):
                init_default_state("example.internal")
                server._ensure_system_users_state()
                server.state.save()

            login = client.post(
                "/api/auth/login",
                json={"domain": "example.internal", "username": "admin", "password": "admin123"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            first_csv = (
                "DisplayName;Department;BusinessRole;Ruoli;Username\\n"
                "Mario Rossi;IT;IT Admin;VPN,EMAIL;mario.rossi\\n"
                "Anna Verdi;Finance;Finance Analyst;ERP_READ;anna.verdi\\n"
            )
            second_csv = (
                "DisplayName;Department;BusinessRole;Ruoli;Username\\n"
                "Mario Rossi Updated;IT;IT Admin;AD_ADMIN;mario.rossi\\n"
                "Luca Bianchi;IT;IT Admin;VPN;luca.bianchi\\n"
            )

            first = client.post("/api/import/csv", headers=headers, files={"file": ("first.csv", first_csv, "text/csv")})
            assert first.status_code == 200, first.text
            second = client.post("/api/import/csv", headers=headers, files={"file": ("second.csv", second_csv, "text/csv")})
            assert second.status_code == 200, second.text
            assert second.json()["totalUsers"] == 3, second.json()

            users_response = client.get("/api/users?limit=10", headers=headers)
            assert users_response.status_code == 200, users_response.text
            users = users_response.json()["users"]
            by_username = {user["username"]: user for user in users}
            assert set(by_username) >= {"mario.rossi", "anna.verdi", "luca.bianchi"}, by_username
            assert by_username["mario.rossi"]["displayName"] == "Mario Rossi Updated", by_username["mario.rossi"]
            assert set(by_username["mario.rossi"]["groups"]) == {"VPN", "EMAIL", "AD_ADMIN"}, by_username["mario.rossi"]
            assert set(by_username["anna.verdi"]["groups"]) == {"ERP_READ"}, by_username["anna.verdi"]

            with tenant_context("example.internal"):
                server.state["last_mining"] = {}
                server.state["mining_processing"] = True
                server.state["mining_status"] = "running"

            kpi = client.get("/api/kpi", headers=headers)
            assert kpi.status_code == 200, kpi.text
            payload = kpi.json()
            assert payload["totalUsers"] == 3, payload
            assert payload["totalAssignments"] >= 5, payload
            assert payload["clusterQuality"] > 0, payload
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "csv-additive-kpi-test-secret-32"
            env["CSV_IMPORT_DETACHED_POSTPROCESS"] = "0"
            result = subprocess.run(
                [sys.executable, "-c", script],
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
            msg=f"stdout:\\n{result.stdout}\\nstderr:\\n{result.stderr}",
        )

    def test_csv_import_400_plus_200_with_100_overlaps_totals_500(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from fastapi.testclient import TestClient

            from app import server
            from app.db.storage import init_default_state, tenant_context

            client = TestClient(server.app)
            with tenant_context("example.internal"):
                init_default_state("example.internal")
                server._ensure_system_users_state()
                server.state.save()

            login = client.post(
                "/api/auth/login",
                json={"domain": "example.internal", "username": "admin", "password": "admin123"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            header = "DisplayName;Department;BusinessRole;Ruoli;Username\\n"
            first_rows = [
                f"User {idx};Dept {idx % 10};Role {idx % 20};BASE_{idx % 30};user{idx}"
                for idx in range(400)
            ]
            second_rows = [
                f"User {idx};Dept {idx % 10};Role {idx % 20};NEW_{idx % 30};user{idx}"
                for idx in range(300, 500)
            ]

            first = client.post(
                "/api/import/csv",
                headers=headers,
                files={"file": ("first.csv", header + "\\n".join(first_rows) + "\\n", "text/csv")},
            )
            assert first.status_code == 200, first.text
            assert first.json()["totalUsers"] == 400, first.json()

            second = client.post(
                "/api/import/csv",
                headers=headers,
                files={"file": ("second.csv", header + "\\n".join(second_rows) + "\\n", "text/csv")},
            )
            assert second.status_code == 200, second.text
            assert second.json()["addedUsers"] == 100, second.json()
            assert second.json()["updatedUsers"] == 100, second.json()
            assert second.json()["totalUsers"] == 500, second.json()

            users_response = client.get("/api/users?limit=1", headers=headers)
            assert users_response.status_code == 200, users_response.text
            assert users_response.json()["total"] == 500, users_response.json()

            overlap = client.get("/api/users?q=User%20300&limit=10", headers=headers)
            assert overlap.status_code == 200, overlap.text
            user300 = next(user for user in overlap.json()["users"] if user["username"] == "user300")
            assert set(user300["groups"]) == {"BASE_0", "NEW_0"}, user300
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "csv-additive-scale-test-secret-32"
            env["CSV_IMPORT_DETACHED_POSTPROCESS"] = "0"
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=tmpdir,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
                timeout=120,
            )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\\n{result.stdout}\\nstderr:\\n{result.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
