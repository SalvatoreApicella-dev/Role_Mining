"""Regression guard: role modeling export must produce a styled XLSX workbook."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class RoleModelingXlsxExportTest(unittest.TestCase):
    def test_export_endpoint_generates_xlsx_with_removed_rows_in_red(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from io import BytesIO

            from fastapi.testclient import TestClient
            from openpyxl import load_workbook

            from app.server import app

            client = TestClient(app)
            login = client.post(
                "/api/auth/login",
                json={"domain": "example.internal", "username": "admin", "password": "admin123"},
            )
            assert login.status_code == 200, login.text
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = client.post(
                "/api/role-modeling/export/xlsx",
                headers=headers,
                json={
                    "filename": "role_modeling_test.xlsx",
                    "sheet_name": "New Model",
                    "rows": [
                        {"business_role": "Finance AP", "role": "SAP_AP", "status": "active", "highlight": "", "note": ""},
                        {"business_role": "Legacy", "role": "LEGACY_X", "status": "removed", "highlight": "red", "note": "Retired"},
                    ],
                },
            )
            assert response.status_code == 200, response.text
            assert "role_modeling_test.xlsx" in response.headers.get("content-disposition", "")
            assert response.headers.get("content-type", "").startswith(
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            )

            workbook = load_workbook(BytesIO(response.content))
            sheet = workbook.active
            assert sheet.title == "New Model"
            assert sheet["A1"].value == "business role"
            assert sheet["B1"].value == "ruolo"
            assert sheet["A2"].value == "Finance AP"
            assert sheet["B2"].value == "SAP_AP"
            assert sheet["A3"].value == "Legacy"
            assert sheet["B3"].value == "LEGACY_X"
            assert sheet["A3"].fill.fgColor.rgb and "FDE9E7" in sheet["A3"].fill.fgColor.rgb.upper()
            assert sheet["A3"].font.color.rgb and "9C0006" in sheet["A3"].font.color.rgb.upper()
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "role-modeling-xlsx-test-secret-32"
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
