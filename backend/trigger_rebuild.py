from main import brdb_rebuild, state
import json

print("Triggering manual BRDB rebuild...")
brdb_rebuild()
print("Rebuild completed.")
# Verify role_suggestions cache exists in ml_engine (via indirect state check if possible, or just trust the code)
from ml_engine import get_ml_engine
ml = get_ml_engine()
print(f"Roles in suggestions cache: {len(ml.brdb.get('role_suggestions', {}))}")
