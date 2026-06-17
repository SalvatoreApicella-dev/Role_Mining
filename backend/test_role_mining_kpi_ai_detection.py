"""Regression guard for role mining KPI and smart AI detection output."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class RoleMiningKpiAiDetectionTest(unittest.TestCase):
    def test_role_mining_persists_matrix_kpi_and_sparse_ai_detection(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from app import server
            from app.db.storage import init_default_state, tenant_context

            users = [
                {
                    "username": "svc.robot",
                    "displayName": "SVC Robot",
                    "department": "IT",
                    "businessRole": "Automation",
                    "accountType": "Service",
                    "groups": ["APP_READ", "APP_ADMIN"],
                },
                {
                    "username": "mario.rossi",
                    "displayName": "Mario Rossi",
                    "department": "IT",
                    "businessRole": "Automation",
                    "accountType": "Employee",
                    "groups": ["APP_READ"],
                },
                {
                    "username": "anna.verdi",
                    "displayName": "Anna Verdi",
                    "department": "Finance",
                    "businessRole": "Finance",
                    "accountType": "Employee",
                    "groups": ["ERP_READ"],
                },
            ]

            with tenant_context("example.internal"):
                init_default_state("example.internal")
                server.state["last_extract"] = {
                    "ou": "TEST",
                    "users": users,
                    "groups": sorted({g for user in users for g in user["groups"]}),
                    "ts": 1,
                }
                result = server.run_role_mining(users, n_clusters=None, role_support=0.5)
                assert len(result.get("matrix") or {}) == 3, result
                assert result.get("kpi", {}).get("totalUsers") == 3, result
                assert result.get("kpi", {}).get("modelQuality", 0) > 0, result

                ai = server.run_smart_ai_detection(users, result["matrix"])
                assert ai.get("status") == "ready", ai
                assert ai.get("stats", {}).get("totalAssignments") == 4, ai
                assert ai.get("stats", {}).get("aiDetection", 0) > 0, ai
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "role-mining-kpi-ai-test-secret-32"
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
            msg=f"stdout:\n{result.stdout}\nstderr:\n{result.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
