"""Regression guard: tenants must never share state or cached responses."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class TenantIsolationGuardTest(unittest.TestCase):
    def test_registered_tenant_starts_empty_and_cache_stays_scoped(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from fastapi.testclient import TestClient

            from app import server
            from app.db.storage import init_default_state, tenant_context

            client = TestClient(server.app)

            with tenant_context("bip"):
                init_default_state("bip")
                server._ensure_system_users_state()
                server.state["last_extract"] = {
                    "ou": "BIP",
                    "users": [
                        {
                            "username": "bip.user",
                            "displayName": "BIP User",
                            "groups": ["BIP_CORE"],
                            "businessRole": "Consultant",
                            "excluded": False,
                        }
                    ],
                    "groups": ["BIP_CORE"],
                    "ts": "2026-05-29T00:00:00+00:00",
                }
                server.state.save()

            bip_login = client.post(
                "/api/auth/login",
                json={"domain": "bip", "username": "admin", "password": "admin123"},
            )
            assert bip_login.status_code == 200, bip_login.text
            bip_token = bip_login.json()["access_token"]
            bip_users = client.get(
                "/api/users",
                headers={"Authorization": f"Bearer {bip_token}"},
            ).json()
            assert bip_users["total"] == 1, bip_users

            registration = client.post(
                "/api/auth/register-domain",
                json={"domain": "acme.com", "licenseCode": "Bip2026!"},
            )
            assert registration.status_code == 200, registration.text
            assert registration.json()["tenant_id"] == "acme.com", registration.json()

            acme_login = client.post(
                "/api/auth/login",
                json={"domain": "acme.com", "username": "admin", "password": "admin123"},
            )
            assert acme_login.status_code == 200, acme_login.text
            acme_token = acme_login.json()["access_token"]
            acme_headers = {"Authorization": f"Bearer {acme_token}"}

            acme_users = client.get("/api/users", headers=acme_headers).json()
            assert acme_users["total"] == 0, acme_users

            bip_users_again = client.get(
                "/api/users",
                headers={"Authorization": f"Bearer {bip_token}"},
            ).json()
            assert bip_users_again["total"] == 1, bip_users_again

            acme_users_again = client.get("/api/users", headers=acme_headers).json()
            assert acme_users_again["total"] == 0, acme_users_again
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "tenant-isolation-test-secret"
            result = subprocess.run(
                [sys.executable, "-c", script],
                cwd=tmpdir,
                env=env,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                check=False,
            )

        self.assertEqual(
            result.returncode,
            0,
            msg=f"stdout:\\n{result.stdout}\\nstderr:\\n{result.stderr}",
        )


if __name__ == "__main__":
    unittest.main()
