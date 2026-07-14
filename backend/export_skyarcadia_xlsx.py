import os
import sys
from io import BytesIO

# Add backend dir to path to import app.server
backend_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(backend_dir)

from app.server import (
    init_default_state,
    tenant_context,
    state,
    _build_role_modeling_sandbox,
    _build_role_modeling_xlsx,
    RoleModelingSandboxRequest
)

def build_final_structure(business_roles, executed_actions):
    role_meta = {}
    removed_roles = {}

    # 1. Inizializza con i ruoli attuali
    for r in business_roles.get("roles", []):
        role_name = r.get("role")
        if not role_name or role_name == "Unassigned":
            continue
        role_meta[role_name] = {
            "role": role_name,
            "groups": sorted(list(set(r.get("groups") or [])))
        }

    # Helper per dividere l'ID dell'azione
    def parse_action(action):
        aid = action.get("id", "")
        parts = aid.split("::")
        ptype = action.get("proposalType") or action.get("proposal_type")
        return ptype, parts

    # 2. Applica le azioni
    for action in executed_actions:
        ptype, parts = parse_action(action)
        
        if ptype == "role_merge" and len(parts) >= 3:
            keep = parts[1]
            remove = parts[2]
            if not keep or not remove or keep == remove:
                continue
            keep_entry = role_meta.get(keep) or {"role": keep, "groups": []}
            remove_entry = role_meta.get(remove) or {"role": remove, "groups": []}
            merged_groups = sorted(list(set(keep_entry.get("groups", []) + remove_entry.get("groups", []))))
            role_meta[keep] = {"role": keep, "groups": merged_groups}
            if remove in role_meta:
                removed_roles[remove] = {
                    "role": remove,
                    "groups": sorted(list(set(remove_entry.get("groups", [])))),
                    "reason": f"Merged into {keep}"
                }
                del role_meta[remove]

        elif ptype == "group_merge" and len(parts) >= 3:
            keep_group = parts[1]
            remove_group = parts[2]
            if not keep_group or not remove_group or keep_group == remove_group:
                continue
            
            # Sostituisci in tutti i ruoli attivi
            for rname, entry in role_meta.items():
                replaced = [keep_group if g == remove_group else g for g in entry.get("groups", [])]
                entry["groups"] = sorted(list(set(replaced)))
                
            # Sostituisci in tutti i ruoli rimossi
            for rname, entry in removed_roles.items():
                replaced = [keep_group if g == remove_group else g for g in entry.get("groups", [])]
                entry["groups"] = sorted(list(set(replaced)))

        elif ptype == "role_retire":
            role_name = action.get("role")
            if not role_name and len(parts) >= 2:
                role_name = parts[1]
            if not role_name or role_name not in role_meta:
                continue
            
            entry = role_meta[role_name]
            groups = entry.get("groups", [])
            merge_target = action.get("mergeTarget")
            
            if merge_target:
                target_entry = role_meta.get(merge_target) or {"role": merge_target, "groups": []}
                role_meta[merge_target] = {
                    "role": merge_target,
                    "groups": sorted(list(set(target_entry.get("groups", []) + groups)))
                }
                
            removed_roles[role_name] = {
                "role": role_name,
                "groups": sorted(list(set(groups))),
                "reason": f"Retired into {merge_target}" if merge_target else "Retired"
            }
            del role_meta[role_name]

    # 3. Costruisci righe attive
    active_rows = []
    for rname in sorted(role_meta.keys()):
        entry = role_meta[rname]
        groups = entry.get("groups") or [""]
        for g in groups:
            active_rows.append({
                "business_role": rname,
                "role": g,
                "status": "active",
                "highlight": "",
                "note": ""
            })

    # 4. Costruisci righe rimosse
    removed_rows = []
    for rname in sorted(removed_roles.keys()):
        entry = removed_roles[rname]
        groups = entry.get("groups") or [""]
        for g in groups:
            removed_rows.append({
                "business_role": rname,
                "role": g,
                "status": "removed",
                "highlight": "red",
                "note": entry.get("reason", "Removed")
            })

    return active_rows + removed_rows

def main():
    tenant_id = "skyarcadia"
    init_default_state(tenant_id)
    
    with tenant_context(tenant_id):
        # 1. Simula sandbox
        req = RoleModelingSandboxRequest(
            max_suggestions=24,
            min_group_support=0.6,
            redundancy_threshold=0.8,
            ml_weight=0.35
        )
        sandbox_res = _build_role_modeling_sandbox(req)
        proposals = sandbox_res.get("proposals", [])
        
        # Filtriamo le azioni di merge/retire
        executed_actions = [
            p for p in proposals 
            if p.get("proposalType") in ("role_merge", "role_retire", "group_merge")
        ]
        print(f"Trovate {len(proposals)} proposte complessive.")
        print(f"Applicando {len(executed_actions)} azioni di merge/retire per la simulazione Excel.")

        # 2. Otteniamo l'attuale catalogo business roles
        from app.server import businessroles
        roles_res = businessroles()

        # 3. Generiamo la struttura finale
        rows = build_final_structure(roles_res, executed_actions)
        print(f"Righe totali generate per l'Excel: {len(rows)}")
        
        removed_count = sum(1 for r in rows if r.get("status") == "removed")
        print(f"Di cui rimosse (evidenziate in rosso): {removed_count}")

        # 4. Creiamo il buffer XLSX
        xlsx_buffer = _build_role_modeling_xlsx(rows, "Modello Proposto")

        # 5. Salva il file
        artifact_path = "/Users/salvo/.gemini/antigravity-ide/brain/b867f78c-3fd1-4ab5-a820-56fe9f53b2c9/role_modeling_proposed_model_skyarcadia.xlsx"
        os.makedirs(os.path.dirname(artifact_path), exist_ok=True)
        with open(artifact_path, "wb") as f:
            f.write(xlsx_buffer.getbuffer())
        
        print(f"\nExcel generato con successo!")
        print(f"File salvato in: {artifact_path}")
        print(f"Dimensione file: {os.path.getsize(artifact_path)} byte")

if __name__ == "__main__":
    main()
