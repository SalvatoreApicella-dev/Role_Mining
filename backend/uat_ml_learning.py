#!/usr/bin/env python
"""
UAT Test: ML Learning System
-----------------------------
Tests the end-to-end ML learning loop including:
1. ML status check
2. Account types list
3. Peer analysis
4. Type confirmation/correction
5. Training trigger
"""

import requests
import sys

BASE_URL = "http://127.0.0.1:8002"
TOKEN = None


def get_token():
    """Authenticate and get JWT token."""
    global TOKEN
    resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
    if resp.status_code != 200:
        print(f"❌ Login failed: {resp.status_code}")
        return False
    TOKEN = resp.json().get("access_token")
    print(f"✅ Authenticated successfully")
    return True


def headers():
    return {"Authorization": f"Bearer {TOKEN}"}


def test_ml_status():
    """Test ML status endpoint."""
    print("\n--- Test: ML Status ---")
    resp = requests.get(f"{BASE_URL}/api/ml/status", headers=headers())
    if resp.status_code != 200:
        print(f"❌ ML status failed: {resp.status_code}")
        return False
    
    data = resp.json()
    print(f"✅ ML Status:")
    print(f"   - Classifier ready: {data.get('classifier', {}).get('ready', False)}")
    print(f"   - BRDB total assignments: {data.get('brdb', {}).get('total_assignments', 0)}")
    print(f"   - Corrections recorded: {len(data.get('history', {}).get('corrections', []))}")
    print(f"   - Confirmations recorded: {len(data.get('history', {}).get('confirmations', []))}")
    return True


def test_account_types():
    """Test account types endpoint."""
    print("\n--- Test: Account Types ---")
    resp = requests.get(f"{BASE_URL}/api/ml/account-types", headers=headers())
    if resp.status_code != 200:
        print(f"❌ Account types failed: {resp.status_code}")
        return False
    
    types = resp.json().get("types", [])
    print(f"✅ Found {len(types)} account types:")
    for t in types:
        print(f"   - {t}")
    return len(types) >= 12


def test_peer_analysis():
    """Test peer analysis endpoint."""
    print("\n--- Test: Peer Analysis ---")
    
    # First get a user to test with
    resp = requests.get(f"{BASE_URL}/api/users", headers=headers())
    if resp.status_code != 200:
        print(f"❌ Get users failed: {resp.status_code}")
        return False
    
    users = resp.json().get("users", [])
    if not users:
        print("⚠️ No users found, skipping peer analysis test")
        return True
    
    # Find a user with a business role
    test_user = None
    for u in users:
        if u.get("businessRole") and u.get("businessRole") != "Unassigned":
            test_user = u
            break
    
    if not test_user:
        print("⚠️ No users with business roles found, skipping")
        return True
    
    uname = test_user.get("username")
    resp = requests.get(f"{BASE_URL}/api/users/{uname}/peer-analysis", headers=headers())
    if resp.status_code != 200:
        print(f"❌ Peer analysis failed: {resp.status_code}")
        return False
    
    data = resp.json()
    print(f"✅ Peer analysis for '{uname}':")
    print(f"   - Peers count: {data.get('peersCount', 0)}")
    print(f"   - Anomalies: {len(data.get('anomalies', []))}")
    return True


def test_type_confirmation():
    """Test type confirmation endpoint."""
    print("\n--- Test: Type Confirmation ---")
    
    resp = requests.get(f"{BASE_URL}/api/users", headers=headers())
    if resp.status_code != 200:
        print(f"❌ Get users failed: {resp.status_code}")
        return False
    
    users = resp.json().get("users", [])
    if not users:
        print("⚠️ No users found, skipping type confirmation test")
        return True
    
    test_user = users[0]
    uname = test_user.get("username")
    current_type = test_user.get("accountType", "Internal")
    
    resp = requests.post(
        f"{BASE_URL}/api/users/{uname}/confirm-type",
        headers=headers(),
        json={"confirmed_type": current_type}
    )
    
    if resp.status_code != 200:
        print(f"❌ Type confirmation failed: {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ Confirmed type for '{uname}':")
    print(f"   - Type: {data.get('type')}")
    return True


def test_type_correction():
    """Test type correction endpoint."""
    print("\n--- Test: Type Correction ---")
    
    resp = requests.get(f"{BASE_URL}/api/users", headers=headers())
    if resp.status_code != 200:
        print(f"❌ Get users failed: {resp.status_code}")
        return False
    
    users = resp.json().get("users", [])
    if len(users) < 2:
        print("⚠️ Not enough users, skipping type correction test")
        return True
    
    test_user = users[1]
    uname = test_user.get("username")
    
    # Correct to a different type temporarily
    resp = requests.post(
        f"{BASE_URL}/api/users/{uname}/correct-type",
        headers=headers(),
        json={"confirmed_type": "Technical"}
    )
    
    if resp.status_code != 200:
        print(f"❌ Type correction failed: {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ Corrected type for '{uname}':")
    print(f"   - Old type: {data.get('old_type')}")
    print(f"   - New type: {data.get('new_type')}")
    return True


def test_rebuild_brdb():
    """Test BRDB rebuild endpoint."""
    print("\n--- Test: Rebuild BRDB ---")
    
    resp = requests.post(f"{BASE_URL}/api/ml/rebuild-brdb", headers=headers())
    if resp.status_code != 200:
        print(f"❌ BRDB rebuild failed: {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ BRDB rebuilt:")
    print(f"   - OK: {data.get('ok')}")
    print(f"   - Total assignments: {data.get('total_assignments', 0)}")
    print(f"   - Groups tracked: {data.get('groups_tracked', 0)}")
    return True


def test_train_ml():
    """Test ML training endpoint."""
    print("\n--- Test: Train ML ---")
    
    resp = requests.post(f"{BASE_URL}/api/ml/train", headers=headers())
    if resp.status_code != 200:
        print(f"❌ ML training failed: {resp.status_code} - {resp.text}")
        return False
    
    data = resp.json()
    print(f"✅ ML training result:")
    print(f"   - Success: {data.get('success', False)}")
    if data.get('message'):
        print(f"   - Message: {data.get('message')}")
    if data.get('samples'):
        print(f"   - Training samples: {data.get('samples')}")
    return True


def main():
    print("=" * 50)
    print("ML Learning System - UAT Test")
    print("=" * 50)
    
    if not get_token():
        print("\n❌ FAILED: Could not authenticate")
        return 1
    
    tests = [
        ("ML Status", test_ml_status),
        ("Account Types", test_account_types),
        ("Peer Analysis", test_peer_analysis),
        ("Type Confirmation", test_type_confirmation),
        ("Type Correction", test_type_correction),
        ("Rebuild BRDB", test_rebuild_brdb),
        ("Train ML", test_train_ml),
    ]
    
    results = []
    for name, test_fn in tests:
        try:
            passed = test_fn()
            results.append((name, passed))
        except Exception as e:
            print(f"❌ {name} exception: {e}")
            results.append((name, False))
    
    print("\n" + "=" * 50)
    print("RESULTS SUMMARY")
    print("=" * 50)
    
    passed = sum(1 for _, p in results if p)
    total = len(results)
    
    for name, p in results:
        status = "✅ PASS" if p else "❌ FAIL"
        print(f"  {status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    return 0 if passed == total else 1


if __name__ == "__main__":
    sys.exit(main())
