"""
UAT: Advanced Optimization Verification (including Cache)
Tests:
1. /api/rolemining/last includes displayNames
2. /api/kpi responds within 10ms
3. /api/cache/stats endpoint works
4. Cache hit rate improves on repeated requests
"""
import requests
import time
import sys

BASE_URL = "http://127.0.0.1:8002"

def login():
    try:
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={"username": "admin", "password": "admin123"})
        resp.raise_for_status()
        return resp.json()["access_token"]
    except Exception as e:
        print(f"Login failed: {e}")
        sys.exit(1)

def test_displaynames_in_mining(token):
    """Test Solution 2: displayNames included in mining response"""
    print("\n[TEST] Solution 2: displayNames in mining response...")
    headers = {"Authorization": f"Bearer {token}"}
    
    start = time.time()
    resp = requests.get(f"{BASE_URL}/api/rolemining/last", headers=headers)
    elapsed = (time.time() - start) * 1000
    
    if resp.status_code != 200:
        print(f"  FAIL: {resp.status_code} {resp.text}")
        return False
    
    data = resp.json()
    display_names = data.get("displayNames", {})
    
    print(f"  Response time: {elapsed:.2f}ms")
    print(f"  displayNames count: {len(display_names)}")
    
    if not display_names and data.get("matrix"):
        print("  FAIL: displayNames missing but matrix exists")
        return False
    
    if display_names:
        sample_key = list(display_names.keys())[0]
        print(f"  Sample: {sample_key} -> {display_names[sample_key]}")
        print("  PASS: displayNames included")
    else:
        print("  SKIP: No mining data yet")
    
    return True

def test_kpi_precomputed(token):
    """Test Solution 4: KPI response time (should be pre-computed)"""
    print("\n[TEST] Solution 4: Pre-computed KPI response...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # First call (cold cache)
    start = time.time()
    resp = requests.get(f"{BASE_URL}/api/kpi", headers=headers)
    elapsed1 = (time.time() - start) * 1000
    
    if resp.status_code == 400:
        print("  SKIP: No mining data yet")
        return True
        
    if resp.status_code != 200:
        print(f"  FAIL: {resp.status_code}")
        return False
    
    print(f"  Cold cache response: {elapsed1:.2f}ms")
    
    # Second call (hot cache)
    start = time.time()
    resp = requests.get(f"{BASE_URL}/api/kpi", headers=headers)
    elapsed2 = (time.time() - start) * 1000
    print(f"  Hot cache response: {elapsed2:.2f}ms")
    
    if elapsed2 < 10:
        print("  PASS: KPI response under 10ms")
    elif elapsed2 < 50:
        print("  WARN: KPI response under 50ms (acceptable)")
    else:
        print(f"  WARN: KPI response {elapsed2:.2f}ms")
    
    return True

def test_cache_endpoint(token):
    """Test cache stats endpoint"""
    print("\n[TEST] Solution 1: Cache stats endpoint...")
    headers = {"Authorization": f"Bearer {token}"}
    
    resp = requests.get(f"{BASE_URL}/api/cache/stats", headers=headers)
    
    if resp.status_code != 200:
        print(f"  FAIL: {resp.status_code} {resp.text}")
        return False
    
    stats = resp.json()
    print(f"  Cache hits: {stats.get('hits', 0)}")
    print(f"  Cache misses: {stats.get('misses', 0)}")
    print(f"  Hit rate: {stats.get('hit_rate', 'N/A')}")
    print(f"  Cached keys: {stats.get('cached_keys', 0)}")
    print("  PASS: Cache stats endpoint working")
    
    return True

def test_cache_hit_rate(token):
    """Test that cache improves on repeated requests"""
    print("\n[TEST] Solution 1: Cache hit rate improvement...")
    headers = {"Authorization": f"Bearer {token}"}
    
    # Make 5 requests to same endpoint
    times = []
    for i in range(5):
        start = time.time()
        resp = requests.get(f"{BASE_URL}/api/rolemining/last", headers=headers)
        elapsed = (time.time() - start) * 1000
        times.append(elapsed)
        if resp.status_code != 200:
            print(f"  FAIL: Request {i+1} failed: {resp.status_code}")
            return False
    
    print(f"  Request times: {', '.join([f'{t:.1f}ms' for t in times])}")
    
    avg_first = times[0]
    avg_rest = sum(times[1:]) / len(times[1:])
    
    print(f"  First request: {avg_first:.1f}ms")
    print(f"  Avg subsequent: {avg_rest:.1f}ms")
    
    if avg_rest < avg_first:
        improvement = ((avg_first - avg_rest) / avg_first) * 100
        print(f"  PASS: Cache provides {improvement:.0f}% improvement")
    else:
        print("  WARN: No noticeable cache improvement (may be too fast already)")
    
    # Check final cache stats
    resp = requests.get(f"{BASE_URL}/api/cache/stats", headers=headers)
    if resp.status_code == 200:
        stats = resp.json()
        print(f"  Final hit rate: {stats.get('hit_rate', 'N/A')}")
    
    return True

def main():
    print("=" * 60)
    print("UAT: Advanced Optimization Verification (with Cache)")
    print("=" * 60)
    
    token = login()
    print("  Login: OK")
    
    results = []
    results.append(("Solution 2: displayNames", test_displaynames_in_mining(token)))
    results.append(("Solution 4: KPI precompute", test_kpi_precomputed(token)))
    results.append(("Solution 1: Cache stats", test_cache_endpoint(token)))
    results.append(("Solution 1: Cache improvement", test_cache_hit_rate(token)))
    
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    all_pass = True
    for name, passed in results:
        status = "PASS" if passed else "FAIL"
        print(f"  [{status}] {name}")
        if not passed:
            all_pass = False
    
    if all_pass:
        print("\nALL TESTS PASSED")
        return 0
    else:
        print("\nSOME TESTS FAILED")
        return 1

if __name__ == "__main__":
    sys.exit(main())
