import asyncio
import io
import os
import sys
from fastapi import UploadFile

# Add the backend directory to path
sys.path.append(os.getcwd())

import main
from main import state, import_csv

async def run_import():
    print("Starting internal import of stale_users.csv...")
    csv_path = "data/stale_users.csv"
    
    if not os.path.exists(csv_path):
        print(f"Error: {csv_path} not found.")
        return

    with open(csv_path, "rb") as f:
        # Simulate UploadFile
        mock_file = UploadFile(filename="stale_users.csv", file=f)
        
        # Call the endpoint function directly (mocking dependencies)
        try:
            await import_csv(file=mock_file, username="system_internal")
            print("Import complete!")
            print(f"Total rows in state: {state.get('last_ingest_stats', {}).get('rowsTotal')}")
            print(f"Stale users in state: {len(state.get('last_extract', {}).get('users', []))}")
        except Exception as e:
            print(f"Import failed: {e}")

if __name__ == "__main__":
    asyncio.run(run_import())
