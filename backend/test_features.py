
import sys
import os
import json
from collections import defaultdict

# Add current directory to path to import modules
sys.path.append(os.getcwd())

try:
    from ml_engine import MLEngine
except ImportError:
    print("Error: Run this script from the backend directory.")
    sys.exit(1)

def test_regex_engine():
    print("\n--- Testing MLEngine Regex ---")
    engine = MLEngine()
    
    # Clean state
    if os.path.exists(engine.custom_patterns_path):
        os.remove(engine.custom_patterns_path)
    engine.custom_patterns = []

    # 1. Add Rule
    print("[1] Adding Rule: Type='TestType', Field='display_name', Regex='^TEST_.*'")
    engine.add_pattern("TestType", "display_name", "^TEST_.*")
    
    # 2. Verify Rule Exists
    patterns = engine.get_patterns()
    custom = patterns.get("custom", [])
    if len(custom) == 1 and custom[0]["regex"] == "^TEST_.*":
        print("PASS: Rule added.")
    else:
        print(f"FAIL: Rule not found. Got {custom}")

    # 3. Test Classification
    print("[2] Testing Classification")
    # Should match
    res1 = engine.classify_account_rules("TEST_Account", "IT", "User")
    if res1 == "TestType":
        print("PASS: Matched 'TEST_Account' -> 'TestType'")
    else:
        print(f"FAIL: Expected 'TestType', got '{res1}'")
        
    # Should NOT match
    res2 = engine.classify_account_rules("Regular_Account", "IT", "User")
    if res2 != "TestType":
        print(f"PASS: Did not match 'Regular_Account' -> '{res2}'")
    else:
        print("FAIL: False positive match")

    # 4. Delete Rule
    print("[3] Deleting Rule")
    engine.delete_pattern(0)
    if len(engine.get_patterns()["custom"]) == 0:
        print("PASS: Rule deleted.")
    else:
        print("FAIL: Rule not deleted.")

def test_peer_analysis_logic():
    print("\n--- Testing Peer Analysis Logic (Replication) ---")
    
    # Bug Reproduction: Peer Analysis with 3 peers, 2 have group G2 (66%). 
    # Current logic requires 80% (0.8). Expect failure to suggest G2.
    peers = [
        {"username": "p1", "groups": ["G1", "G2"]},
        {"username": "p2", "groups": ["G1", "G2"]},
        {"username": "p3", "groups": ["G1"]}, 
    ]
    # G2 frequency: 2/3 = 0.66. 
    # Current Threshold: 0.8.
    
    peers_count = len(peers)
    grp_counts = defaultdict(int)
    for p in peers:
        for g in p["groups"]:
            grp_counts[g] += 1
            
    target_groups = set(["G1"])
    suggested = []
    
    print(f"Peer Count: {peers_count}")
    
    for g, cnt in grp_counts.items():
        freq = cnt / peers_count
        print(f"Group {g}: {cnt}/{peers_count} ({freq*100:.1f}%)")
        # Reproduce current logic
        if freq >= 0.80 and g not in target_groups:
            suggested.append(g)
            
    if "G2" not in suggested:
        print("CONFIRMED: G2 (66%) not suggested due to 80% threshold.")
    else:
        print("UNEXPECTED: G2 was suggested.")

def test_sorting_logic():
    print("\n--- Testing Sorting Logic (Replication) ---")
    users = [
        {"username": "u1", "accountType": "service"}, # lowercase
        {"username": "u2", "accountType": "Admin"},   # Uppercase
        {"username": "u3", "accountType": "Service"}, # Uppercase
        {"username": "u4", "accountType": None},      # None
    ]
    
    # Sort by accountType desc (current logic)
    # Current logic: str(x.get("accountType") or "").lower() ? 
    # main.py code: users.sort(key=lambda x: str(x.get(sortBy)).lower() if x.get(sortBy) else "", reverse=(order == "desc"))
    
    # Let's see how main.py actually does it. 
    # In main.py line 389 (approx): 
    # if sortBy:
    #     users.sort(key=lambda x: str(x.get(sortBy)).lower() if x.get(sortBy) else "", reverse=(order == "desc"))
    
    # Simulation:
    s_users = sorted(users, key=lambda x: str(x.get("accountType") or "").lower(), reverse=True)
    
    print("Sorted by Type DESC (simulated):")
    for u in s_users:
        print(f"  {u['username']}: {u['accountType']}")
        
    # Expected: service/Service (s) > Admin (a) > None ("")
    # If the user says it doesn't work, maybe keys are wrong?
    # Let's try sorting with a missing key
    s_missing = sorted(users, key=lambda x: str(x.get("AccountType") or "").lower(), reverse=True) # Wrong case key
    print("Sorted by WRONG KEY (AccountType) DESC:")
    for u in s_missing:
        print(f"  {u['username']}: {u['accountType']}") 
        
    if s_missing[0]["accountType"] == "service":
         print("CONFIRMED: If key is wrong (AccountType vs accountType), sort fails to order properly (all empty strings).")


if __name__ == "__main__":
    test_peer_analysis_logic()
    test_sorting_logic()
