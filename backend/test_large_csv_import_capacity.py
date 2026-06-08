"""Regression guard for large CSV imports."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class LargeCsvImportCapacityTest(unittest.TestCase):
    def test_imports_large_csv_without_persisting_unique_candidate_noise(self):
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

            header = "DisplayName;Department;BusinessRole;Ruoli;Username;Email\\n"
            rows = [
                f"Large User {idx};Dept {idx % 25};Role {idx % 50};APP_{idx % 40},SYS_{idx % 90};large{idx};large{idx}@example.com"
                for idx in range(5000)
            ]
            csv_text = header + "\\n".join(rows) + "\\n"
            response = client.post(
                "/api/import/csv",
                headers={"Authorization": f"Bearer {token}"},
                files={"file": ("large.csv", csv_text, "text/csv")},
            )
            assert response.status_code == 200, response.text
            payload = response.json()
            assert payload["rowsTotal"] == 5000, payload
            assert payload["totalUsers"] == 5000, payload

            with tenant_context("example.internal"):
                assert len(server.state.get("last_extract", {}).get("users") or []) == 5000
                assert len(server.state.get("last_csv_rows") or []) == 0
                assert len((server.state.get("ingest_sources") or {}).get("csv") or []) == 0
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "large-csv-import-test-secret-32b"
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
