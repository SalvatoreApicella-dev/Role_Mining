
import sys
import os
import re
from backend.ml_engine import MLEngine

def test_custom_fields():
    print("Initializing MLEngine...")
    engine = MLEngine()
    
    # 1. Add a custom pattern using a custom field
    print("Adding custom pattern for field 'department_code'...")
    engine.add_pattern(
        account_type="Technical",
        field="department_code",
        regex="^DEV.*"
    )
    
    # 2. Add a custom pattern using a standard field but overriding ML
    print("Adding custom pattern for field 'display_name' to override ML...")
    engine.add_pattern(
        account_type="Executive",
        field="display_name",
        regex=".*CEO.*"
    )

    # 3. Test Case 1: Match custom field
    print("\nTest Case 1: User with department_code='DEV01'")
    user1_attrs = {"department_code": "DEV01"}
    # display_name, ou, employee_type
    t1, conf1, method1 = engine.classify_account(
        display_name="John Doe", 
        ou="Users", 
        employee_type="Employee", 
        attributes=user1_attrs
    )
    print(f"Result: Type={t1}, Method={method1}")
    
    if t1 == "Technical" and method1 == "custom_rule":
        print("✅ Test Case 1 Passed")
    else:
        print(f"❌ Test Case 1 Failed: Expected Technical/custom_rule, got {t1}/{method1}")

    # 4. Test Case 2: Match override on standard field
    print("\nTest Case 2: User with display_name='The CEO'")
    t2, conf2, method2 = engine.classify_account(
        display_name="The CEO", 
        ou="Executives", 
        employee_type="User",
        attributes={}
    )
    print(f"Result: Type={t2}, Method={method2}")
    
    if t2 == "Executive" and method2 == "custom_rule":
        print("✅ Test Case 2 Passed")
    else:
        print(f"❌ Test Case 2 Failed: Expected Executive/custom_rule, got {t2}/{method2}")

    # 5. Test Case 3: No match (fallback)
    print("\nTest Case 3: User with no matching rules")
    t3, conf3, method3 = engine.classify_account(
        display_name="Regular Joe", 
        ou="Users", 
        employee_type="User", 
        attributes={"department_code": "HR01"}
    )
    print(f"Result: Type={t3}, Method={method3}")
    
    # Expected: Internal (static rule fallback) or ML if model was trained (it's likely not trained or empty in this test env)
    # Since we didn't train, prediction might fail or return low confidence, defaulting to Static Rules -> Internal
    if method3 in ["static_rule", "ml"]:
         print("✅ Test Case 3 Passed (Fallback behavior)")
    else:
         print(f"❌ Test Case 3 Failed: Unexpected method {method3}")

if __name__ == "__main__":
    test_custom_fields()
