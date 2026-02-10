#!/usr/bin/env python
"""
ML Training Data Generator & Trainer
-------------------------------------
Generates 500+ synthetic training entries and trains the ML model
to achieve 80%+ accuracy on account type classification.
"""

import sys
import os
import random
import json

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from ml_engine import MLEngine

# Account type patterns for synthetic data generation
TRAINING_PATTERNS = {
    "Internal": {
        "display_names": [
            "Mario Rossi", "Luca Bianchi", "Alessandro Verdi", "Giulia Romano",
            "Francesca Costa", "Marco Esposito", "Andrea Ferrari", "Laura Colombo",
            "Stefano Ricci", "Elena Greco", "Paolo Marino", "Chiara Fontana",
            "Giuseppe Bruno", "Martina Pellegrino", "Davide Leone", "Sara Marchetti",
            "Matteo Conti", "Valentina Galli", "Simone Orlando", "Federica Barbieri"
        ],
        "ous": ["IT", "HR", "Finance", "Marketing", "Sales", "Legal", "R&D", "Operations"],
        "employee_types": ["Employee", "Staff", "Worker", "Regular"]
    },
    "External": {
        "display_names": [
            "John Smith", "Jane Doe", "Robert Johnson", "Emily Williams",
            "Michael Brown", "Sarah Davis", "James Wilson", "Jennifer Taylor",
            "David Anderson", "Michelle Thomas", "Ext_Consultant_01", "External_Partner_A"
        ],
        "ous": ["External", "Partners", "Contractors", "Consultants", "Third Party", "Vendor"],
        "employee_types": ["External", "Contractor", "Consultant", "Partner", "Vendor"]
    },
    "BlueCollar": {
        "display_names": [
            "OP_Fabbrica_001", "Operaio Linea A", "Worker Production B", "Tecnico Manutenzione",
            "OP_Magazzino_01", "Operatore CNC", "Assembly Worker 05", "Production Operator"
        ],
        "ous": ["Production", "Warehouse", "Factory", "Manufacturing", "Plant", "Assembly", "Logistics"],
        "employee_types": ["BlueCollar", "Operator", "Worker", "Production", "Factory"]
    },
    "Service": {
        "display_names": [
            "SVC_Backup", "SVC_Database", "SVC_Application", "Service_Monitor",
            "svc_mailrelay", "svc_sync", "app_service_01", "batch_processor",
            "svc_reporting", "system_service", "SVC_Integration", "Service_API"
        ],
        "ous": ["ServiceAccounts", "Services", "System", "Automation", "IT Services"],
        "employee_types": ["Service", "System", "Application", "Bot", "Automated"]
    },
    "Administrative": {
        "display_names": [
            "Admin Reception", "Segretaria Generale", "Office Assistant", "Receptionist1",
            "Administrative Officer", "Back Office", "Document Manager", "Secretary Director"
        ],
        "ous": ["Administration", "Back Office", "Reception", "General Services", "Office Management"],
        "employee_types": ["Admin", "Administrative", "Staff", "Support"]
    },
    "Executive": {
        "display_names": [
            "CEO Franco Neri", "CFO Maria Belli", "CTO Giovanni Ferri", "COO Anna Polo",
            "Managing Director", "Board Member Alpha", "Executive VP Sales", "President Division"
        ],
        "ous": ["Executive", "C-Suite", "Board", "Leadership", "Management", "Direction"],
        "employee_types": ["Executive", "Director", "C-Level", "VP", "President", "Chairman"]
    },
    "Manager": {
        "display_names": [
            "Manager IT", "Team Lead Development", "Supervisor Production", "Head of Marketing",
            "Manager Finance", "Lead Analyst", "Senior Manager HR", "Department Head"
        ],
        "ous": ["Management", "IT", "HR", "Finance", "Marketing", "Sales", "Operations", "R&D"],
        "employee_types": ["Manager", "Lead", "Supervisor", "Head", "Team Lead", "Senior"]
    },
    "Technical": {
        "display_names": [
            "Senior Developer", "System Administrator", "Network Engineer", "DBA Oracle",
            "Software Architect", "DevOps Engineer", "Security Analyst", "Cloud Specialist",
            "Full Stack Dev", "Data Engineer", "ML Engineer", "Tech Lead"
        ],
        "ous": ["IT", "Development", "Infrastructure", "Security", "DevOps", "Data", "Engineering"],
        "employee_types": ["Technical", "Engineer", "Developer", "Specialist", "Architect", "Analyst"]
    },
    "Temporary": {
        "display_names": [
            "TEMP_Intern_2024_01", "Stagista Marketing", "Summer Intern", "Temp_Project_A",
            "Contract Worker 30d", "temp_replacement_HR", "INTERN_IT_001", "Seasonal Worker"
        ],
        "ous": ["Temporary", "Interns", "Contractors", "Projects", "HR", "IT", "Marketing"],
        "employee_types": ["Temp", "Temporary", "Intern", "Stagista", "Seasonal", "Contract"]
    },
    "Shared": {
        "display_names": [
            "Sala Riunioni A", "Reception Shared", "shared_printer_01", "Meeting Room Display",
            "Kiosk Terminal 01", "Info Point Entrance", "shared_workstation_B", "Conference Room"
        ],
        "ous": ["Shared", "Common", "Facilities", "Conference", "Public", "Meeting Rooms"],
        "employee_types": ["Shared", "Kiosk", "Terminal", "Display", "Common"]
    },
    "Application": {
        "display_names": [
            "APP_ERP", "APP_CRM", "WebApp Portal", "API Gateway Service",
            "Integration Hub", "APP_Analytics", "APP_Reporting", "Mobile Backend"
        ],
        "ous": ["Applications", "IT", "Integration", "Systems", "Software"],
        "employee_types": ["Application", "System", "Integration", "API", "Bot"]
    },
    "Security": {
        "display_names": [
            "SEC_Admin", "Security Officer", "SOC Analyst", "Audit User",
            "Compliance Monitor", "Security Scanner", "Vulnerability Scanner", "Privileged Admin"
        ],
        "ous": ["Security", "Compliance", "Audit", "SOC", "InfoSec", "Risk"],
        "employee_types": ["Security", "Audit", "Compliance", "Admin", "Privileged"]
    }
}


def generate_training_data(count_per_type=50):
    """Generate synthetic training data for all account types."""
    training_data = []
    
    for account_type, patterns in TRAINING_PATTERNS.items():
        for i in range(count_per_type):
            # Randomly select or generate variations
            if patterns["display_names"]:
                base_name = random.choice(patterns["display_names"])
                # Add some variations
                if random.random() < 0.3:
                    base_name = f"{base_name}_{random.randint(1, 99):02d}"
            else:
                base_name = f"User_{account_type}_{i:03d}"
            
            ou = random.choice(patterns["ous"]) if patterns["ous"] else ""
            employee_type = random.choice(patterns["employee_types"]) if patterns["employee_types"] else ""
            
            # Add some noise/variations
            if random.random() < 0.1:
                ou = ou.upper()
            if random.random() < 0.1:
                ou = ou.lower()
            
            training_data.append({
                "display_name": base_name,
                "ou": ou,
                "employee_type": employee_type,
                "account_type": account_type
            })
    
    return training_data


def evaluate_accuracy(engine, test_data):
    """Evaluate model accuracy on test data."""
    correct = 0
    total = 0
    confusion = {}
    
    for entry in test_data:
        predicted, confidence, method = engine.classify_account(
            entry["display_name"],
            entry["ou"],
            entry["employee_type"],
            confidence_threshold=0.0  # Always use ML prediction
        )
        
        actual = entry["account_type"]
        if predicted == actual:
            correct += 1
        else:
            key = f"{actual}->{predicted}"
            confusion[key] = confusion.get(key, 0) + 1
        total += 1
    
    accuracy = (correct / total * 100) if total > 0 else 0
    return accuracy, confusion, correct, total


def main():
    print("=" * 60)
    print("ML Training Data Generator & Trainer")
    print("=" * 60)
    
    # Initialize ML engine
    engine = MLEngine()
    
    # Generate training data (50 per type = 600 total for 12 types)
    print("\n[1/5] Generating training data...")
    training_data = generate_training_data(count_per_type=50)
    print(f"✅ Generated {len(training_data)} training entries")
    
    # Shuffle and split into train/test (80/20)
    random.shuffle(training_data)
    split_idx = int(len(training_data) * 0.8)
    train_set = training_data[:split_idx]
    test_set = training_data[split_idx:]
    print(f"   Train set: {len(train_set)}, Test set: {len(test_set)}")
    
    # Train the classifier
    print("\n[2/5] Training ML classifier...")
    result = engine.train_classifier(train_set)
    if result.get("success"):
        print(f"✅ Training completed")
        print(f"   Samples: {result.get('samples', 0)}")
        print(f"   Classes: {result.get('classes', [])}")
    else:
        print(f"❌ Training failed: {result.get('message')}")
        return 1
    
    # Evaluate accuracy
    print("\n[3/5] Evaluating accuracy...")
    accuracy, confusion, correct, total = evaluate_accuracy(engine, test_set)
    print(f"✅ Accuracy: {accuracy:.1f}% ({correct}/{total})")
    
    if confusion:
        print("\n   Confusion (top 10 errors):")
        sorted_conf = sorted(confusion.items(), key=lambda x: -x[1])[:10]
        for key, count in sorted_conf:
            print(f"     {key}: {count}")
    
    # Check if we need more training
    if accuracy < 80:
        print(f"\n⚠️ Accuracy {accuracy:.1f}% is below 80% target")
        print("   Generating additional training data...")
        
        # Generate more data for problematic classes
        additional = generate_training_data(count_per_type=30)
        all_training = train_set + additional
        
        print(f"   Retraining with {len(all_training)} samples...")
        result = engine.train_classifier(all_training)
        
        accuracy, confusion, correct, total = evaluate_accuracy(engine, test_set)
        print(f"✅ New accuracy: {accuracy:.1f}% ({correct}/{total})")
    
    # Save the status
    print("\n[4/5] Saving ML status...")
    status = engine.get_status()
    print(f"✅ ML Status:")
    print(f"   Classifier ready: {status.get('classifier', {}).get('ready', False)}")
    print(f"   Training samples: {status.get('classifier', {}).get('training_samples', 0)}")
    
    # Final result
    print("\n[5/5] Final Result")
    print("=" * 60)
    if accuracy >= 80:
        print(f"✅ SUCCESS: Accuracy {accuracy:.1f}% meets 80% target")
        return 0
    else:
        print(f"❌ FAILED: Accuracy {accuracy:.1f}% below 80% target")
        return 1


if __name__ == "__main__":
    sys.exit(main())
