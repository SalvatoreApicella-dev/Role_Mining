import sys
import os

# Add backend to path
sys.path.append(os.path.abspath("."))

from ml_engine import get_ml_engine
import time

def test():
    print("Testing ML Engine suggestions...")
    ml = get_ml_engine(data_dir="./ml_data")
    
    role = "AP Specialist"
    print(f"Calculating suggestions for '{role}'...")
    try:
        start = time.time()
        res = ml.brdb_suggest_groups(role, min_conf=0.1)
        print(f"Success! Found {len(res)} suggestions in {time.time()-start:.3f}s")
        for r in res[:5]:
            print(f"  - {r['group']} (conf: {r['confidence']})")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    test()
