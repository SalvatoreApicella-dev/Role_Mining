# Piano tecnico di verifica codice per conformita NIS2 e framework analoghi

## Obiettivo

Questo documento definisce una baseline tecnica verificabile per aumentare in
modo sostanziale la probabilita di conformita a NIS2 e framework analoghi.

NIS2 non e una certificazione, e una direttiva. La conformita finale dipende
anche da processi organizzativi, governance, contratti fornitori, formazione,
operativita SOC/incident response e audit esterno. Nessun documento sul solo
codice puo garantire il "superamento certo", ma questa baseline crea evidenze
tecniche forti e auditabili.

Data di riferimento normativa: **February 25, 2026**.

## Fonti normative e standard usati

1. Direttiva (UE) 2022/2555 (NIS2), in particolare Articolo 20, 21, 23.
2. Regolamento di esecuzione (UE) 2024/2690 (requisiti tecnici e metodologici,
   incidenti significativi per alcuni settori NIS2).
3. Italia: Decreto Legislativo 4 settembre 2024, n. 138 (recepimento NIS2).
4. Regolamento (UE) 2022/2554 (DORA), applicabile dal **January 17, 2025**.
5. Regolamento (UE) 2024/2847 (Cyber Resilience Act, CRA).
6. ISO/IEC 27001:2022 (ISMS, certificabile).
7. NIST CSF 2.0 (framework di cyber risk management).
8. SOC 2 (AICPA Trust Services Criteria).
9. PCI DSS 4.0.1 (se presenti dati di pagamento).

## Scope tecnico da verificare sul codice

1. Backend FastAPI/Python.
2. Frontend React/Vite.
3. API, autenticazione, autorizzazione, logging, crittografia applicativa.
4. Dipendenze open-source e supply chain software.
5. Pipeline CI/CD, build artifact, release process.

## Matrice NIS2 -> controlli codice -> evidenze

| Requisito NIS2 (sintesi) | Controlli tecnici da implementare | Verifica oggettiva | Framework analoghi |
|---|---|---|---|
| Art. 21(2)(a) Risk analysis e security policies | Threat modeling per servizio, policy secure coding, hardening baseline | Threat model versionato, policy in repo, check CI obbligatori | ISO 27001 A.5/A.8, NIST CSF GV/RM |
| Art. 21(2)(b) Incident handling | Logging strutturato, correlation id, alerting su eventi critici | Test di detection, runbook IR, simulazione tabletop trimestrale | ISO 27001 A.5.24+, SOC2 CC7 |
| Art. 21(2)(c) Business continuity e backup | Backup cifrati, restore testati, RTO/RPO dichiarati | Evidenza restore test periodici con esito | ISO 22301, ISO 27001 A.5.30 |
| Art. 21(2)(d) Supply chain security | SBOM, pinning/version policy, scan CVE dipendenze, vendor risk rating | Report SBOM firmato, scan SCA in CI con gate | ISO 27001 A.5.19/A.5.21, NIST CSF ID.SC |
| Art. 21(2)(e) Secure development e vuln handling | SAST/DAST, secure code review, disclosure process, patch SLA | Findings tracciati con SLA e remediation verificata | ISO 27001 A.8.25+, SOC2 CC8 |
| Art. 21(2)(f) Effectiveness assessment | KPI/KRI sicurezza, audit tecnico periodico, test regressione security | Dashboard KPI, verbali audit, trend closure findings | NIST CSF ME, SOC2 CC4 |
| Art. 21(2)(g) Cyber hygiene e training | Baseline dev secure coding, training annuale, simulazioni phishing | Registro training, quiz/attestazioni, metriche completamento | ISO 27001 A.6.3 |
| Art. 21(2)(h) Cryptography | TLS moderno, encryption at rest, key rotation, secret manager | Scan config TLS, evidenza KMS e rotation | ISO 27001 A.8.24, PCI DSS 4 |
| Art. 21(2)(i) Access control/asset mgmt | RBAC minimo privilegio, MFA admin, inventario asset | Test autorizzazioni, access review periodica | ISO 27001 A.5.15/A.5.18, SOC2 CC6 |
| Art. 21(2)(j) MFA e secure communications | MFA forzata su ruoli critici, session hardening, canali amministrativi sicuri | Test login policy, config enforcement, audit log accessi | ISO 27001 A.8.5, SOC2 CC6 |
| Art. 23 Incident reporting | Workflow 24h early warning, 72h notification, report finale 1 mese | Drill operativo con timestamp e template compilati | D.Lgs 138/2024 art. 25, DORA incident reporting |

## Step operativi di verifica sul codice

### Step 0 - Definizione perimetro e classificazione

1. Classifica servizi, dati trattati, criticita business.
2. Definisci quali componenti rientrano NIS2 (essential/important entity).
3. Associa owner tecnico e owner di compliance per ogni componente.

Output richiesto:
- `compliance/scope-register.csv`
- `compliance/system-owner-matrix.csv`

### Step 1 - Baseline controlli automatizzati (obbligatori in CI)

Esegui i controlli sotto ad ogni pull request e blocca il merge su failure.

```bash
# 1) Secret scanning
 gitleaks detect --source . --redact --exit-code 1

# 2) Python SAST (backend)
 cd backend && .venv/bin/bandit -r app -f json -o ../compliance/evidence/bandit.json

# 3) Python dependency audit
 cd backend && .venv/bin/pip-audit -r requirements.txt -f json > ../compliance/evidence/pip-audit.json

# 4) Frontend dependency audit
 cd frontend && npm audit --omit=dev --json > ../compliance/evidence/npm-audit.json

# 5) Multi-language SAST ruleset (OWASP/CWE)
 semgrep --config p/owasp-top-ten --json --output compliance/evidence/semgrep.json .

# 6) SBOM generation
 syft dir:. -o cyclonedx-json > compliance/evidence/sbom.cdx.json

# 7) Vulnerability scan from SBOM
 grype sbom:compliance/evidence/sbom.cdx.json -o json > compliance/evidence/grype.json
```

Gate minimi raccomandati:

1. Nessun secret reale in repository.
2. Nessuna vulnerabilita `critical` aperta in produzione.
3. Nessuna `high` senza rischio accettato formalmente e scadenza remediation.
4. Copertura test sicurezza API critica >= soglia definita (per esempio 80%).

### Step 2 - Verifiche architetturali e secure-by-design

1. Threat model per ogni macro-servizio (STRIDE o equivalente).
2. Data flow diagram con trust boundary espliciti.
3. Catalogo superfici di attacco per endpoint/API.
4. Test autorizzativi su ruoli e tenant isolation.

Output richiesto:
- `compliance/threat-models/*.md`
- `compliance/data-flow/*.mmd`
- `compliance/authorization-test-report.md`

### Step 3 - Verifiche specifiche su autenticazione e autorizzazione

1. MFA obbligatoria per admin e utenti privilegiati.
2. RBAC/ABAC con least privilege, segregazione dei doveri.
3. Session policy (timeout, rotation token, revoca).
4. Protezioni brute force/rate limit sugli endpoint di login.

Evidenze tecniche:
- Test automatici per escalation orizzontale/verticale.
- Log di tentativi falliti e lockout policy.

### Step 4 - Crittografia, segreti e hardening

1. Nessun segreto in codice o immagini container.
2. Key management centralizzato (KMS/HSM/secret manager).
3. Rotazione credenziali con periodicita definita.
4. TLS moderno su tutti i canali esterni e amministrativi.

Evidenze tecniche:
- Report scanner TLS/config.
- Registro rotazione chiavi/segreti.

### Step 5 - Logging, detection e incident response readiness

1. Logging strutturato con campi minimi (timestamp, actor, action, result).
2. Correlation id end-to-end tra frontend/backend/job.
3. Alert su eventi critici: auth anomalies, privilege changes, data export massivo.
4. Runbook di risposta con matrice severita.

Obiettivo NIS2 Art. 23:

1. Capacita operativa di invio early warning entro 24 ore.
2. Notifica dettagliata entro 72 ore.
3. Report finale entro 1 mese.

### Step 6 - Business continuity e disaster recovery tecnici

1. Backup cifrati periodici con retention policy.
2. Restore test frequente su ambiente isolato.
3. Verifica RTO/RPO rispetto agli obiettivi di business.

Evidenze:
- Verbali restore test con timestamp e risultato.

### Step 7 - Supply chain e terze parti

1. Inventory dipendenze e licenze (SBOM obbligatoria).
2. Policy di aggiornamento sicurezza (patch cadence).
3. Valutazione fornitori critici (SaaS, cloud, librerie core).
4. Clausole contrattuali minime su incident reporting e vulnerabilita.

### Step 8 - Audit interno tecnico mensile

1. Riesecuzione completa della suite compliance.
2. Riesame findings aperti e SLA remediation.
3. Aggiornamento risk register.
4. Firma digitale del pacchetto evidenze.

Output:
- `compliance/monthly/<YYYY-MM>/evidence-bundle.zip`
- `compliance/monthly/<YYYY-MM>/audit-summary.md`

## Checklist go/no-go pre-audit

Vai in audit solo se tutte vere:

1. Nessuna vulnerabilita `critical` aperta.
2. Nessuna `high` fuori SLA senza risk acceptance formalizzato.
3. Secret scanning pulito su default branch e release branch.
4. SBOM aggiornata per ogni release.
5. Evidenza drill incident reporting (24h/72h/1 mese).
6. Ultimo restore test riuscito entro finestra definita.
7. Test di autorizzazione multi-tenant superati.
8. Registro decisioni rischio approvato dal management.

## Mapping rapido con certificazioni/framework analoghi

1. ISO/IEC 27001:2022: copre governance ISMS, controlli tecnici e organizzativi.
2. SOC 2: rafforza controlli su security, availability, confidentiality.
3. NIST CSF 2.0: utile come struttura operativa continua (Govern/Identify/Protect/
   Detect/Respond/Recover).
4. PCI DSS 4.0.1: obbligatorio se si trattano dati carta; utile per hardening
   autenticazione, logging, vulnerability management.
5. DORA: prioritario per settore finanziario; richiede resilienza ICT e test.
6. CRA: rilevante per produttori/importatori di prodotti digitali con elementi
   software.

## Gap tipici che bloccano la conformita

1. Controlli in CI non bloccanti (solo informativi).
2. Assenza di ownership chiara su vulnerabilita e SLA remediation.
3. Logging non correlabile o non sufficiente per analisi incidenti.
4. Backup esistenti ma mai testati in restore reale.
5. MFA non forzata su account privilegiati.
6. Mancanza di evidenze formalizzate e firmate.

## Roadmap 90 giorni consigliata

1. Giorni 1-15: attiva gate CI minimi + SBOM + secret scanning bloccante.
2. Giorni 16-30: threat model, authorization tests, hardening auth/session.
3. Giorni 31-60: incident drill completo, runbook e reporting NIS2 timing.
4. Giorni 61-90: audit interno end-to-end con evidence bundle firmato.

## Riferimenti ufficiali

1. NIS2 (Direttiva UE 2022/2555):
   https://eur-lex.europa.eu/eli/dir/2022/2555/oj/eng
2. Implementing Regulation (UE) 2024/2690:
   https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2690
3. Italia, D.Lgs. 138/2024 (GU):
   https://www.gazzettaufficiale.it/eli/id/2024/10/01/24G00156/sg
4. DORA (UE 2022/2554):
   https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng
5. Cyber Resilience Act (UE 2024/2847):
   https://eur-lex.europa.eu/eli/reg/2024/2847/oj/eng
6. NIST CSF 2.0:
   https://www.nist.gov/cyberframework
7. ISO/IEC 27001:2022 (overview ufficiale):
   https://www.iso.org/standard/27001
8. SOC 2 / Trust Services Criteria (AICPA):
   https://www.aicpa-cima.com/resources/landing/trust-services-criteria
9. PCI DSS 4.0.1:
   https://www.pcisecuritystandards.org/document_library
10. ENISA NIS2 resources e technical guidance:
   https://www.enisa.europa.eu/topics/nis2-resources
