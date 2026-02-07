import csv
import random

DEPARTMENTS = ["HR", "IT", "Finance", "Sales", "Marketing", "Legal", "Operations", "Engineering", "Product", "Support"]
GROUPS_POOL = [f"Group_{i}" for i in range(1, 101)] # 100 groups
ROLES = ["Analyst", "Manager", "Director", "VP", "Associate", "Intern"]

def generate_csv(filename="large_dataset.csv", num_users=5000):
    print(f"Generating {num_users} users into {filename}...")
    with open(filename, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, delimiter=";")
        writer.writerow(["DisplayName", "Department", "BusinessRole", "Ruoli"])
        
        for i in range(num_users):
            # Deterministic/Random mix
            dn = f"User_{i} Surname_{i}"
            dept = random.choice(DEPARTMENTS)
            br = random.choice(ROLES)
            
            # Random groups (2 to 10 groups per user)
            num_groups = random.randint(2, 10)
            user_groups = random.sample(GROUPS_POOL, num_groups)
            groups_str = ",".join(user_groups)
            
            writer.writerow([dn, dept, br, groups_str])
            
    print("Done!")

if __name__ == "__main__":
    generate_csv()
