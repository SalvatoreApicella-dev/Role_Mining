import json
import os
import secrets
from pathlib import Path

STORAGE_PATH = "backend/data/storage.json"

def populate_special_cases():
    if not os.path.exists(STORAGE_PATH):
        print(f"Error: {STORAGE_PATH} not found.")
        return

    with open(STORAGE_PATH, "r", encoding="utf-8") as f:
        state = json.load(f)

    users = state.get("last_extract", {}).get("users", [])
    
    # 1. Add 100 duplicate users (50 pairs)
    print("Generating 100 duplicate users (50 pairs)...")
    for i in range(50):
        display_name = f"Duplicate User {i}"
        # First of the pair
        users.append({
            "username": f"dup_{i}_a",
            "displayName": display_name,
            "department": "IT",
            "groups": ["G-Duplicate-Test"],
            "lastLogin": "2024-01-01",
            "accountType": "Internal"
        })
        # Second of the pair
        users.append({
            "username": f"dup_{i}_b",
            "displayName": display_name,
            "department": "HR",
            "groups": ["G-Duplicate-Test"],
            "lastLogin": "2024-01-02",
            "accountType": "Internal"
        })

    # 2. Add 100 users without department
    print("Generating 100 users without department...")
    for i in range(100):
        users.append({
            "username": f"orphan_{i}",
            "displayName": f"No Dept User {i}",
            "department": None,
            "groups": ["G-Orphan-Test"],
            "lastLogin": "2024-02-01",
            "accountType": "Internal"
        })

    state["last_extract"]["users"] = users
    
    # Update stats
    stats = state.get("last_ingest_stats", {})
    stats["rowsTotal"] = len(users)
    stats["duplicateDisplayName"] = stats.get("duplicateDisplayName", 0) + 50
    stats["missingDepartment"] = stats.get("missingDepartment", 0) + 100
    state["last_ingest_stats"] = stats
    
    # Force mining dirty to trigger recalculation
    state["mining_dirty"] = True

    with open(STORAGE_PATH, "w", encoding="utf-8") as f:
        json.dump(state, f, indent=2, ensure_ascii=False)

    print(f"Successfully injected 200 users. Total users: {len(users)}")

if __name__ == "__main__":
    populate_special_cases()
