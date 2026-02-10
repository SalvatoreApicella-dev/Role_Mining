import os
import json
import random
from datetime import datetime

# Ensure the path is absolute relative to this script or project root
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUTPUT_FILE = os.path.join(BASE_DIR, "ml_data", "knowledge_base.json")

# 1. Redundancy Rules (Broad -> Specific)
# "If you have BROAD, you don't need SPECIFIC"
REDUNDANCY_PATTERNS = {
    "GLOBAL": ["US", "EU", "ASIA", "FR", "DE", "IT", "ES", "UK", "CN", "JP"],
    "FULL": ["READ", "WRITE", "EDIT", "VIEW", "ACCESS"],
    "ADMIN": ["USER", "GUEST", "OPERATOR", "STAFF", "VIEWER"],
    "MANAGER": ["LEAD", "SENIOR", "JUNIOR", "INTERN"],
    "ALL": ["hq", "branch", "remote", "onsite"],
}

APPS = [
    "SAP", "SALESFORCE", "JIRA", "CONFLUENCE", "SLACK", "ZOOM", "OFFICE365",
    "AWS", "AZURE", "GCP", "GITHUB", "GITLAB", "BITBUCKET", "SERVICENOW",
    "WORKDAY", "ORACLE", "TABLEAU", "POWERBI", "SPLUNK", "DATADOG"
]

# 2. Role Archetypes (Job Title -> Typical Access)
# Used to check for "unusual" access (e.g. HR accessing Git)
ROLE_ARCHETYPES = {
    "Software Engineer": ["GITHUB", "JIRA", "SLACK", "AWS", "CONFLUENCE"],
    "Data Scientist": ["JUPYTER", "SNOWFLAKE", "TABLEAU", "AWS", "PYTHON"],
    "HR Specialist": ["WORKDAY", "OFFICE365", "ZOOM", "LINKEDIN"],
    "Sales Manager": ["SALESFORCE", "ZOOM", "OFFICE365", "LINKEDIN"],
    "Accountant": ["SAP", "ORACLE", "EXCEL", "OFFICE365"],
    "IT Support": ["SERVICENOW", "JIRA", "SLACK", "AD_ADMIN", "OFFICE365_ADMIN"],
    "Marketing": ["ADOBE", "FIGMA", "INSTAGRAM", "TWITTER", "HUBSPOT"],
    "Legal": ["DOCUSIGN", "OFFICE365", "LEXISNEXIS"],
    "Executive": ["OFFICE365", "ZOOM", "BOARD_PORTAL"],
}

# 3. Department Rules (Dept -> Typical Access)
DEPT_RULES = {
    "Engineering": ["GITHUB", "JIRA", "AWS", "AZURE"],
    "Sales": ["SALESFORCE", "HUBSPOT"],
    "Finance": ["SAP", "ORACLE", "NETSUITE"],
    "HR": ["WORKDAY", "BAMBOOHR"],
    "Marketing": ["ADOBE", "FIGMA"],
}

# 4. Account Type Policies (Type -> Forbidden Patterns)
ACCOUNT_TYPE_POLICIES = {
    "BlueCollar": ["VPN", "REMOTE", "ADMIN", "ROOT", "AWS", "AZURE", "GCP"],
    "External": ["INTERNAL", "HR", "FINANCE", "PAYROLL", "ADMIN_GLOBAL"],
    "Contractor": ["HR", "PAYROLL", "LEGAL", "STRATEGY"],
    "System": ["USER_INTERACTIVE", "OFFICE365"],
    "Bot": ["USER_INTERACTIVE", "OFFICE365"],
}


def generate_knowledge_base():
    kb = {
        "metadata": {
            "version": "1.0", 
            "generated_at": datetime.now().isoformat(),
            "description": "Generated Knowledge Base for Role Mining AI Detection",
            "source": "Synthetic Generator (LLM-instructed)"
        },
        "redundancy_rules": {},
        "role_definitions": {},
        "account_type_policies": ACCOUNT_TYPE_POLICIES,
        "department_norms": {}
    }

    # --- Generate Redundancy Rules (Target: ~1000 items) ---
    print("Generating redundancy rules...")
    for app in APPS:
        # e.g. SAP_GLOBAL supercedes SAP_IT
        for broad, specifics in REDUNDANCY_PATTERNS.items():
            broad_group = f"{app}_{broad}"
            kb["redundancy_rules"][broad_group] = []
            for spec in specifics:
                spec_group = f"{app}_{spec}"
                kb["redundancy_rules"][broad_group].append(spec_group)

    # Add generic variations
    for i in range(500):
        app = random.choice(APPS)
        kb["redundancy_rules"][f"{app}_SUPERUSER"] = [f"{app}_USER", f"{app}_GUEST"]
        kb["redundancy_rules"][f"{app}_MASTER"] = [f"{app}_SLAVE", f"{app}_FOLLOWER"]
    
    # --- Generate Role Definitions (Target: ~500 items) ---
    print("Generating role definitions...")
    for role, base_apps in ROLE_ARCHETYPES.items():
        # Create levels for each archetype
        for level in ["Junior", "Senior", "Lead", "Principal", "Intern", "Manager"]:
            full_title = f"{level} {role}"
            access = list(base_apps)
            
            # Add random variations
            if level == "Manager":
                access.append("MANAGEMENT_PORTAL")
            if level == "Intern":
                access = access[:3] # Interns get less
            
            # Add specific app permutations
            expanded_access = []
            for a in access:
                expanded_access.append(f"{a}_USER")
                if random.random() > 0.7:
                     expanded_access.append(f"{a}_READ")
            
            kb["role_definitions"][full_title] = expanded_access

    # --- Generate Department Norms (Target: ~500 items) ---
    print("Generating department norms...")
    for dept, base_apps in DEPT_RULES.items():
        # Create sub-departments
        for sub in ["Ops", "Strategy", "Quality", "R&D", "Support"]:
            full_dept = f"{dept} {sub}"
            access = list(base_apps)
            for a in access:
                access.append(f"{a}_{sub.upper()}")
            kb["department_norms"][full_dept] = access

    # --- Fill up to 2000+ total items ---
    total_items = (
        len(kb["redundancy_rules"]) + 
        len(kb["role_definitions"]) + 
        len(kb["department_norms"]) + 
        sum(len(v) for v in kb["account_type_policies"].values())
    )
    
    print(f"Total Knowledge Items Generated: {total_items}")

    with open(OUTPUT_FILE, "w") as f:
        json.dump(kb, f, indent=2)
    
    print(f"Knowledge Base saved to {OUTPUT_FILE}")

if __name__ == "__main__":
    generate_knowledge_base()
