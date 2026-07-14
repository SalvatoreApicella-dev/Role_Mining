"""Test case for peer-driven and risk-aware role modeling optimization engine."""

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path


class EnhancedOptimizationTest(unittest.TestCase):
    def test_peer_profiling_and_sod_merge_exclusion(self):
        backend_dir = Path(__file__).resolve().parent
        script = textwrap.dedent(
            """
            from fastapi.testclient import TestClient
            from app.server import app, state

            # Setup test scenario:
            # 1) Users in Buyer role sharing some extra groups in the same department (Purchasing)
            # 2) GRP_OPAQ_A and GRP_OPAQ_B have an active SoD conflict (so they must NOT be merged)
            state["last_mining"] = {}
            state["last_extract"] = {
                "users": [
                    # Peer group for Buyer in Purchasing (all have GRP_SHARED_EXTRA, which is not in template)
                    {"username": "buyer1", "displayName": "Buyer 1", "groups": ["GRP_TEMPLATE", "GRP_SHARED_EXTRA", "GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer2", "displayName": "Buyer 2", "groups": ["GRP_TEMPLATE", "GRP_SHARED_EXTRA", "GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer3", "displayName": "Buyer 3", "groups": ["GRP_TEMPLATE", "GRP_SHARED_EXTRA", "GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer4", "displayName": "Buyer 4", "groups": ["GRP_TEMPLATE", "GRP_SHARED_EXTRA", "GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    {"username": "buyer5", "displayName": "Buyer 5", "groups": ["GRP_TEMPLATE", "GRP_SHARED_EXTRA", "GRP_OPAQ_A"], "department": "Purchasing", "businessRole": "Buyer"},
                    
                    # Individual outlier buyer in Purchasing (has GRP_INDIVIDUAL_OUTLIER)
                    {"username": "buyer_outlier", "displayName": "Outlier", "groups": ["GRP_TEMPLATE", "GRP_INDIVIDUAL_OUTLIER"], "department": "Purchasing", "businessRole": "Buyer"},
                    
                    # Admin role in Administration department (to create SoD contrast on GRP_OPAQ_B)
                    {"username": "admin1", "displayName": "Admin 1", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin2", "displayName": "Admin 2", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin3", "displayName": "Admin 3", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin4", "displayName": "Admin 4", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    {"username": "admin5", "displayName": "Admin 5", "groups": ["GRP_OPAQ_B"], "department": "Administration", "businessRole": "Accountant"},
                    
                    # Rogue user triggers SoD alert (has both GRP_OPAQ_A & GRP_OPAQ_B)
                    {"username": "rogue1", "displayName": "Rogue 1", "groups": ["GRP_OPAQ_A", "GRP_OPAQ_B"], "department": "Purchasing", "businessRole": "Buyer"},
                ]
            }
            state["role_meta"] = {
                "Buyer": {
                    "role": "Buyer",
                    "groups": ["GRP_TEMPLATE"]
                }
            }

            client = TestClient(app)
            login = client.post(
                "/api/auth/login",
                json={"domain": "example.internal", "username": "admin", "password": "admin123"},
            )
            assert login.status_code == 200
            token = login.json()["access_token"]
            headers = {"Authorization": f"Bearer {token}"}

            response = client.post(
                "/api/role-modeling/sandbox",
                headers=headers,
                json={
                    "max_suggestions": 24,
                    "min_group_support": 0.95,
                    "redundancy_threshold": 0.8,
                    "ml_weight": 0.35
                },
            )
            assert response.status_code == 200, response.text
            res = response.json()
            
            proposals = res.get("proposals", [])
            sod_matrix = res.get("sodMatrix", [])
            
            # Check SoD exists between GRP_OPAQ_A and GRP_OPAQ_B
            sod_alert = next((x for x in sod_matrix if set([x["groupA"], x["groupB"]]) == set(["GRP_OPAQ_A", "GRP_OPAQ_B"])), None)
            if sod_alert is None:
                # Also accept if SoD was detected but groups were in different order
                sod_alert = next((x for x in sod_matrix if "GRP_OPAQ" in x.get("groupA","") and "GRP_OPAQ" in x.get("groupB","")), None)
            assert sod_alert is not None, f"SoD alert not generated. sodMatrix: {sod_matrix}"
            
            # Verify no group_merge proposal is generated between GRP_OPAQ_A and GRP_OPAQ_B
            sod_merges = [p for p in proposals if p["proposalType"] == "group_merge" and "GRP_OPAQ_A" in p["id"] and "GRP_OPAQ_B" in p["id"]]
            assert len(sod_merges) == 0, f"Expected no group merge proposals for SoD-conflicting pairs, but found: {sod_merges}"
            
            # Verify Buyer template update suggestion: find any proposal that mentions GRP_SHARED_EXTRA in rationale
            template_update_proposals = [p for p in proposals if p["proposalType"] == "assignment_update" and "aggiornamento template" in p["title"].lower()]
            assert len(template_update_proposals) > 0, f"Expected at least one template update proposal. All proposals: {proposals}"
            shared_extra_proposal = next((p for p in template_update_proposals if "GRP_SHARED_EXTRA" in p["rationale"]), None)
            assert shared_extra_proposal is not None, f"Expected GRP_SHARED_EXTRA in at least one template update rationale. Template updates: {template_update_proposals}"
            
            # Verify individual outlier normalization proposal
            outlier_proposal = next((p for p in proposals if p["proposalType"] == "assignment_update" and "buyer_outlier" in p.get("shortLabel", "").lower()), None)
            assert outlier_proposal is not None, f"Expected outlier proposal for buyer_outlier. Proposals: {proposals}"
            assert "Anomalia individuale" in outlier_proposal["rationale"] or "Scostamento" in outlier_proposal["rationale"], f"Expected outlier rationale, got: {outlier_proposal}"
            
            print("Enhanced Optimization test successfully passed!")
            """
        )

        with tempfile.TemporaryDirectory() as tmpdir:
            env = os.environ.copy()
            env["PYTHONPATH"] = str(backend_dir)
            env["JWT_SECRET"] = "enhanced-optimization-test-secret-32"
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
