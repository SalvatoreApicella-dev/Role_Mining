---
marp: true
theme: default
paginate: true
header: 'Role Builder AI - Architettura Tecnica'
footer: 'Proprietà Riservata - Servizio di Role Mining'
style: |
  section {
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-size: 25px;
    padding: 40px;
  }
  h1 {
    color: #2c3e50;
    border-bottom: 4px solid #3498db;
  }
  h2 {
    color: #2980b9;
    margin-top: 20px;
  }
  table {
    width: 100%;
    font-size: 20px;
  }
  th {
    background-color: #f2f2f2;
  }
  footer {
    font-size: 15px;
  }
---

# Role Builder AI
## Architettura Tecnica e Piano di Hosting

---

### 1. Cosa fa il programma (Product Overview)

**Role Builder AI** è un tool specializzato nell'offrire un servizio avanzato di **Role Mining**, progettato specificamente per l'**analisi approfondita dell'ambiente di un cliente**.

L'obiettivo primario del software è quello di mappare lo stato attuale dei permessi per:
- **Predisporre l'ambiente ad un AD Cleanup** (bonifica di Active Directory).
- Facilitare la successiva fase di **Role Modeling**.

---

### 2. Architettura ad Alto Livello e Networking

Il sistema opera in un ambiente Cloud isolato suddiviso in sottoreti per massimizzare la sicurezza (Zero Trust).

![bg right:50% fit](architecture.png)

---

### 3. Requisiti Hardware (Main Server All-in-One)

L'intera infrastruttura si riduce a un'unica macchina virtuale principale, ipotizzando l'utilizzo di un Domain Controller già esistente.

| Parametro | Specifica |
|-----------|-----------|
| **Ruolo** | App, API, Motore AI, Dev IDE & Deploy |
| **OS** | Windows Server 2022 |
| **vCPU** | 16 Core |
| **RAM** | 32 GB |
| **Storage** | 256 GB SSD NVMe |
| **GPU** | NVIDIA T4 / A10 (Essenziale per Llama) |

---

### 4. Networking e Porte (Senza Sottoreti)

La rete è semplificata in un'unica zona piatta (flat network).

| Sorgente | Destinazione | Porta | Scopo |
|----------|--------------|-------|-------|
| Client (PC) | Main Server | 443 | Accesso al Servizio (HTTPS) |
| Main Server | Active Directory | 636 / 389 | Sincronizzazione Dati / AD Cleanup |
| Admin (PC) | Main Server | 3389 | Manutenzione (RDP) |

---

### 5. Ciclo di Vita Funzionale

1. **Data Cleanup**: Bonifica overprivileged e qualità del dato in AD.
2. **Role Mining**: Scoperta pattern ML validati semanticamente da AI.
3. **Role Modeling**: Definizione Business Roles e monitoraggio Role Drift.

---

### 6. Accessibilità (Chrome Optimization)

Per garantire un'esperienza fluida sui **PC aziendali tramite Chrome**:
- **SSL Trusted**: Certificato emesso dalla CA aziendale.
- **FQDN**: Accesso via URL dedicato (es. `https://rolemining.it`).
- **SSO**: Integrazione Windows Auth per Single Sign-On.
