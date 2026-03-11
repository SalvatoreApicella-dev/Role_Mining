# Report tecnico esecuzione test - February 25, 2026

## Executive summary

In questa sessione sono stati eseguiti tutti i test effettivamente
rilevabili nel repository e tutte le smoke/build/compliance check disponibili
nell'ambiente locale.

Test discovery totale:

- 20 file di test rilevati (`*.py` con prefisso `test` e `*.test.jsx`).

Risultato complessivo:

- Test backend script (`backend/test_*.py`): 16 eseguiti, 11 passati, 5 falliti.
- Test standalone root (`test_custom_fields.py`): eseguito, passato.
- Test root in `tests/` (pytest): non eseguibili per dipendenza mancante
  (`pytest` non installabile in ambiente senza rete).
- Test frontend unit (`vitest`): non eseguibile per assenza rete
  (`npx` non riesce a scaricare `vitest`).
- Build frontend: riuscita.
- Compliance strict gate: fallito per tool mancanti (`detect-secrets` non
  presente).

Aggiornamento rerun (stessa data, `domain=example.internal`):

- Test legacy di login aggiornati con `domain`.
- Rerun mirato dei test falliti/non eseguiti:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/rerun-2026-02-25-v3/rerun-summary.tsv`
- Esito rerun:
  - passati: `health_8002`, `test_persistence_py`, `test_suite_full_py`,
    `frontend_smoke_5173`
  - falliti: `test_business_role_uat_py`, `test_final_uat_py`,
    `test_merge_logic_py_retry`, `pytest_root_suite_fixed`,
    `frontend_vitest_kpi_fixed`
  - timeout/fail tecnico: `compliance_strict_retry` (exit code 142, timeout 60s)

## Ambiente di esecuzione

- Workspace: `/Users/salvo/Development/Role_Mining`
- Data test run: February 25, 2026
- Backend runtime usato dai test API: `127.0.0.1:8002` (script UAT hardcoded)
- Backend runtime usato da smoke: `127.0.0.1:8000`

## Comandi e risultati

### Backend script tests (`backend/test_*.py`)

Fonte: `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/backend-script-tests-summary.tsv`

| Test | Exit code | Esito | Durata (s) |
|---|---:|---|---:|
| `test_business_role_uat.py` | 1 | FAIL | 1 |
| `test_clean_merge.py` | 0 | PASS | 0 |
| `test_debug.py` | 0 | PASS | 0 |
| `test_features.py` | 0 | PASS | 1 |
| `test_final_uat.py` | 1 | FAIL | 0 |
| `test_final_verify.py` | 0 | PASS | 0 |
| `test_fresh_import.py` | 0 | PASS | 0 |
| `test_isolated.py` | 0 | PASS | 0 |
| `test_merge_logic.py` | 1 | FAIL | 0 |
| `test_merge_uat.py` | 0 | PASS | 0 |
| `test_ml_suggestions.py` | 0 | PASS | 1 |
| `test_perf_csv.py` | 0 | PASS | 0 |
| `test_persistence.py` | 1 | FAIL | 2 |
| `test_replace.py` | 0 | PASS | 0 |
| `test_suite_full.py` | 1 | FAIL | 0 |
| `test_trace.py` | 0 | PASS | 0 |

### Root standalone tests

Fonte: `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/root/root-standalone-tests-summary.tsv`

| Test | Exit code | Esito | Durata (s) |
|---|---:|---|---:|
| `test_custom_fields.py` | 0 | PASS | 1 |

### System, build e compliance checks

Fonte: `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/system-tests-summary.tsv`

| Check | Exit code | Esito | Durata (s) |
|---|---:|---|---:|
| `backend_import_smoke` | 0 | PASS | 2 |
| `backend_health_8000` | 7 | FAIL | 0 |
| `pytest_root_suite` | 1 | FAIL | 0 |
| `frontend_build` | 0 | PASS | 19 |
| `frontend_vitest_kpi` | 1 | FAIL | 70 |
| `compliance_strict` | 1 | FAIL | 0 |
| `frontend_system_smoke_5173` | 7 | FAIL | 0 |

### Health checks validati nel contesto rete corretto

| Check | Esito | Evidenza |
|---|---|---|
| Backend health `8000` | PASS | `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/backend_health_8000_escalated.out` |
| Backend health `8002` | PASS | `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/backend_health_8002_escalated.out` |

## Analisi dei fallimenti

### 1) Login tests non allineati al nuovo contratto auth

Failing tests:

- `backend/test_business_role_uat.py`
- `backend/test_merge_logic.py`
- `backend/test_suite_full.py`
- parte di `backend/test_final_uat.py`
- `backend/test_persistence.py`

Causa tecnica osservata:

- Endpoint login ora richiede `domain` obbligatorio.
- I test inviano solo `username/password` e ricevono `400`.

Evidenza diretta:

- `{"detail":"Dominio cliente obbligatorio"}`

Output raw:

- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/test_business_role_uat.py.out`
- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/test_suite_full.py.out`
- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/test_merge_logic.py.out`
- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/test_final_uat.py.out`
- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/test_persistence.py.out`

### 2) Test root pytest non eseguibili

Failing check:

- `pytest_root_suite`

Causa tecnica:

- `pytest` non presente nel venv e installazione fallita per assenza rete.

Evidenza:

- `No module named pytest`

Output raw:

- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/pytest_root_suite.out`

### 3) Frontend unit test non eseguibile (`vitest`)

Failing check:

- `frontend_vitest_kpi`

Causa tecnica:

- `npx` tenta download di `vitest` da `registry.npmjs.org`, rete non disponibile.

Evidenza:

- `ENOTFOUND registry.npmjs.org`

Output raw:

- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/frontend_vitest_kpi.out`

### 4) Compliance strict fallita per tool mancanti

Failing check:

- `compliance_strict`

Causa tecnica:

- Mancanza del tool richiesto (`detect-secrets`) in strict mode.

Evidenza:

- `[compliance][error] Comando richiesto non trovato: detect-secrets`

Output raw:

- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/compliance_strict.out`

### 5) Frontend system smoke su 5173 fallito

Failing check:

- `frontend_system_smoke_5173`

Causa tecnica:

- Nessun server frontend attivo su `127.0.0.1:5173` durante la run.

Output raw:

- `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/frontend_system_smoke_5173.out`

## Evidenze generate

- Summary backend script tests:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/backend-script-tests-summary.tsv`
- Raw outputs backend script tests:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/backend/*.out`
- Summary system/build/compliance checks:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/system-tests-summary.tsv`
- Raw outputs system/build/compliance checks:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/system/*.out`
- Summary root standalone tests:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/root/root-standalone-tests-summary.tsv`
- Raw output root standalone tests:
  `/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/root/test_custom_fields.py.out`

## Conclusioni tecniche

La base applicativa e buildabile (frontend build PASS, buona parte degli script
backend PASS), ma la suite non e ancora verde end-to-end per tre ragioni
principali:

1. Aggiornamento contratto login multi-tenant non riflesso nei test legacy
   (manca `domain`).
2. Dipendenze test (`pytest`, `vitest`) non installabili nel contesto rete
   corrente.
3. Compliance strict non eseguibile senza tool security richiesti.

## Rerun con dominio example.internal

Questa sezione riporta il rerun esplicito richiesto su test falliti/non
eseguiti con login aggiornato a `domain=example.internal`.

### Modifiche test applicate per il rerun

Sono stati aggiornati i payload di login nei test backend legacy per includere
`"domain": "example.internal"`.

### Esiti rerun mirato

Fonte:
`/Users/salvo/Development/Role_Mining/compliance/evidence/test-runs/rerun-2026-02-25-v3/rerun-summary.tsv`

| Check/Test | Exit code | Esito | Durata (s) |
|---|---:|---|---:|
| `health_8002` | 0 | PASS | 0 |
| `test_business_role_uat_py` | 1 | FAIL | 11 |
| `test_final_uat_py` | 1 | FAIL | 93 |
| `test_merge_logic_py_retry` | 1 | FAIL | 28 |
| `test_persistence_py` | 0 | PASS | 16 |
| `test_suite_full_py` | 0 | PASS | 62 |
| `pytest_root_suite_fixed` | 1 | FAIL | 2 |
| `frontend_vitest_kpi_fixed` | 1 | FAIL | 2 |
| `compliance_strict_retry` | 142 | FAIL/TIMEOUT | 60 |
| `frontend_smoke_5173` | 0 | PASS | 0 |

### Delta rispetto alla prima run

1. `test_suite_full.py`: da FAIL a PASS.
2. `test_persistence.py`: da FAIL a PASS.
3. `pytest` root suite: da non eseguibile a eseguibile (1 failed, 6 passed).
4. `vitest` frontend: da non eseguibile a eseguibile (fallisce per ambiente
   test browser: `window is not defined`).
5. Compliance strict: ora parte ma va in timeout nello scan `detect-secrets`
   (evidenza: `BrokenPipeError` nel file output).

### Cause residue dei fail nel rerun

1. `test_business_role_uat_py`: failure funzionale, utenti attesi non trovati
   nel dataset corrente dopo import.
2. `test_final_uat_py`: assertion non allineata al comportamento attuale di
   role mining asincrono (`{"status":"started"}` al posto di `clusters`
   immediati).
3. `test_merge_logic_py_retry`: script legacy assume shape risposta con chiave
   `users` che non sempre e presente nel path verificato.
4. `pytest_root_suite_fixed`: mismatch aspettativa test (`modelQuality`
   atteso 70.0, ottenuto 60.0).
5. `frontend_vitest_kpi_fixed`: test usa componenti che richiedono ambiente DOM
   browser-like (serve setup `jsdom`/mock adeguato per `window`).
