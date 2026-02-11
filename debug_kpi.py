import jwt
import requests
import datetime
import os
import sys

# Configuration
JWT_SECRET = os.getenv("JWT_SECRET") or "dev_secret_key_persistent_change_in_prod"
API_URL = "http://localhost:8000/api/kpi/cluster-quality"

# Generate Token
def create_token():
    payload = {
        "sub": "admin",
        "exp": datetime.datetime.utcnow() + datetime.timedelta(minutes=60)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")

try:
    token = create_token()
    headers = {"Authorization": f"Bearer {token}"}
    
    print(f"DEBUG: sending request to {API_URL}...")
    response = requests.get(API_URL, headers=headers)
    
    if response.status_code == 200:
        data = response.json()
        items = data.get("items", [])
        
        print("\n--- KPI Data Inspection ---")
        for section in items:
            name = section.get("type")
            count = section.get("count")
            users = section.get("users", [])
            print(f"\nSection: {name} (Count: {count})")
            
            # Print first 3 users to check format
            for i, u in enumerate(users[:3]):
                print(f"  User {i+1}: {u}")
                
        # Also check Rejects
        rejects = data.get("rejects", [])
        print(f"\nRejects (Count: {len(rejects)})")
        for i, r in enumerate(rejects[:3]):
            print(f"  Reject {i+1}: {r}")

    else:
        print(f"Error: {response.status_code}")
        print(response.text)

except Exception as e:
    print(f"Exception: {e}")
