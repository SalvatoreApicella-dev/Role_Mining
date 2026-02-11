import csv
import random
import os
from datetime import datetime, timedelta

def generate_data(filename="large_dataset.csv"):
    departments = ["IT", "HR", "Finance", "Sales", "Marketing", "Legal", "Operations", "R&D"]
    account_types = ["Internal", "External", "Administrative", "Service", "Technical"]
    
    # Base groups for hierarchy testing
    app_patterns = ["Azure", "AWS", "Salesforce", "GitLab", "SAP", "Oracle"]
    permission_levels = ["_Read", "_Write", "_Admin", "_All", "_Full"]

    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["DisplayName", "Department", "Ruoli", "jobTitle", "lastLogon", "accountType", "username"])

        users = []

        # 1. ADD DUPLICATES (Cluster Quality)
        for i in range(5):
            name = f"Duplicate User {i}"
            users.append([name, "IT", "G-Global-Access", "Analyst", "2024-01-01", "Internal", f"user_dup_{i}_a"])
            users.append([name, "HR", "G-Global-Access", "Manager", "2024-01-02", "Internal", f"user_dup_{i}_b"])

        # 2. ADD ORPHANS (Model Quality - Users with no groups)
        for i in range(10):
            users.append([f"Orphan User {i}", random.choice(departments), "", "Clerk", "2024-02-01", "Internal", f"orphan_u_{i}"])

        # 3. ADD STALE ACCOUNTS (Model Quality - > 1 year)
        old_date = (datetime.now() - timedelta(days=400)).strftime("%Y-%m-%d")
        for i in range(20):
            users.append([f"Stale User {i}", random.choice(departments), "G-Static-Role", "Retiree", old_date, "Internal", f"stale_{i}"])

        # 4. ADD NEVER LOGGED IN (Model Quality)
        for i in range(10):
            users.append([f"New User {i}", random.choice(departments), "G-Onboarding", "Trainee", "", "Internal", f"newbie_{i}"])

        # 5. ADD REDUNDANT ROLES (AI Detection - Least Privilege)
        # Case: Specific + Global (Azure_1 + Azure_All)
        for i in range(30):
            app = random.choice(app_patterns)
            # Azure_1, Azure_Read, Azure_All
            roles = [f"{app}_1", f"{app}_All", "G-Standard-User"]
            users.append([f"Overprivileged {app} {i}", "IT", ",".join(roles), "DevOps", "2024-05-10", "Technical", f"over_priv_{app}_{i}"])
            
            # Case: Read + Admin (Read is redundant if Admin)
            roles2 = [f"{app}_Read", f"{app}_Admin", "G-Standard-User"]
            users.append([f"Overprivileged {app} Admin {i}", "IT", ",".join(roles2), "Admin", "2024-05-11", "Administrative", f"over_admin_{app}_{i}"])

        # 6. FILL UP TO 2000+ USERS
        for i in range(len(users), 2100):
            dept = random.choice(departments)
            acc_type = random.choice(account_types)
            username = f"std_user_{i}"
            role = f"G-{dept}-Access"
            users.append([f"Standard User {i}", dept, role, "Employee", "2024-06-01", acc_type, username])

        # Write all
        for u in users:
            writer.writerow(u)

    print(f"Generated {len(users)} users in {filename}")

if __name__ == "__main__":
    generate_data("backend/large_dataset.csv")
