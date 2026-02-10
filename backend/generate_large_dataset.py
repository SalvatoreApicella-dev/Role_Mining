import csv
import random
import os

DEPARTMENTS = ["Engineering", "HR", "Sales", "Finance", "Legal"]
ROLES = ["Analyst", "Manager", "Developer", "Clerk"]

def generate_csv(filename="backend/large_dataset.csv", num_users=1000):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    
    print(f"Generating {num_users} users for 10% detection target...")
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["DisplayName", "Department", "BusinessRole", "AccountType", "Ruoli"])
        
        for i in range(num_users):
            dept = random.choice(DEPARTMENTS)
            br = random.choice(ROLES)
            acct_type = "WhiteCollar"
            
            # Baseline: 3 common roles per user
            groups = ["GLOBAL_BASE", f"DEPT_{dept}_BASE", f"ROLE_{br}_BASE"]
            
            # 12.5% of users (1 in 8) will be anomalous.
            # Each such user will have ~3 distinct anomalies.
            # Total assignments/user = ~6. 
            # Total assignments for 1000 users = 6000.
            # We need 600 anomalies.
            # 125 users * 4-5 anomalies = ~500-600.
            
            if i % 8 == 0:
                # 1 & 2: Redundancy (VPN_GLOBAL supercedes VPN_IT and VPN_FR)
                groups.append("VPN_GLOBAL")
                groups.append("VPN_IT")
                groups.append("VPN_FR")
                
                # 3: Policy
                acct_type = "BlueCollar"
                groups.append("ADMIN_CONSOLE_ACCESS")
                
                # 4: Statistical Outlier
                groups.append(f"UNIQUE_PERM_{i}")
            else:
                # Normal extra roles (Common across users)
                groups.append(f"Common_Resource_{random.randint(1, 3)}")
            
            writer.writerow([f"Seeded_User_{i}", dept, br, acct_type, ",".join(list(set(groups)))])
            
    print("Done!")

if __name__ == "__main__":
    path = "large_dataset.csv" if os.path.exists("main.py") else "backend/large_dataset.csv"
    generate_csv(filename=path)
