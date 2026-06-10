"""Regression guard: Business Roles must expose groups imported from CSV users."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class BusinessRoleGroupsFromCsvTest(unittest.TestCase):
    def test_businessroles_endpoint_derives_groups_from_csv_assignments(self):
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

            csv_text = (
                "DisplayName;Department;BusinessRole;Ruoli;Username\\n"
                "Mario Rossi;IT;IT Admin;VPN,AD_ADMIN,EMAIL;mario.rossi\\n"
                "Luca Bianchi;IT;IT Admin;VPN,AD_ADMIN,EMAIL;luca.bianchi\\n"
                "Anna Verdi;Finance;Finance Analyst;ERP_READ,BI_VIEW;anna.verdi\\n"
            )
            response = client.post(
                "/api/import/csv",
                headers=headers,
                files={"file": ("roles.csv", csv_text, "text/csv")},
            )
            assert response.status_code == 200, response.text

            roles_response = client.get("/api/businessroles", headers=headers)
            assert roles_response.status_code == 200, roles_response.text
            by_role = {item["role"]: item for item in roles_response.json()["roles"]}
            assert set(by_role["IT Admin"]["groups"]) == {"VPN", "AD_ADMIN", "EMAIL"}, by_role
            assert set(by_role["Finance Analyst"]["groups"]) == {"ERP_READ", "BI_VIEW"}, by_role

            meta_response = client.get("/api/businessroles/IT%20Admin/meta", headers=headers)
            assert meta_response.status_code == 200, meta_response.text
            assert set(meta_response.json()["groups"]) == {"VPN", "AD_ADMIN", "EMAIL"}
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "business-role-groups-test-secret-32"
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


if __name__ == "__main__":
    unittest.main()
