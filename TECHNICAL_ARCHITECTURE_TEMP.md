# Architettura Tecnica e Piano di Hosting: Role Builder AI

Questo documento definisce gli obiettivi del software, l'architettura omnicomprensiva, i requisiti infrastrutturali Cloud/Windows e il ciclo di vita funzionale del sistema **Role Builder AI**.

---

## 1. Cosa fa il programma (Product Overview)

**Role Builder AI** è un tool specializzato nell'offrire un servizio avanzato di **Role Mining**, progettato specificamente per l'**analisi approfondita dell'ambiente di un cliente**. L'obiettivo primario del software è quello di mappare lo stato attuale dei permessi per **predisporre l'ambiente ad un AD Cleanup** (bonifica di Active Directory) e alla successiva fase di **Role Modeling**.

---

## 2. Architettura ad Alto Livello e Networking

Il sistema opera in un ambiente Cloud isolato suddiviso in sottoreti per massimizzare la sicurezza (Zero Trust).

![Architettura ad Alto Livello](data:image/png;base64,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)

---

## 3. Requisiti Hardware (Minimo Definitivo)

L'intera infrastruttura si riduce a un'unica macchina virtuale principale, ipotizzando l'utilizzo di un Domain Controller già esistente nella rete del cliente.

### 3.1 Main Server (All-in-One)
| Parametro | Specifica |
|-----------|-----------|
| **Ruolo** | App, API, Motore AI, Dev IDE & Deploy |
| **OS** | Windows Server 2022 |
| **vCPU** | 16 Core |
| **RAM** | 32 GB |
| **Storage** | 256 GB SSD NVMe |
| **GPU** | NVIDIA T4 / A10 (Essenziale per Llama) |

---

## 4. Networking e Porte (Senza Sottoreti)

La rete è semplificata in un'unica zona piatta (flat network).

| Sorgente | Destinazione | Porta | Scopo |
|----------|--------------|-------|-------|
| Client (PC) | Main Server | 443 | Accesso al Servizio (HTTPS) |
| Main Server | Active Directory | 636 / 389 | Sincronizzazione Dati / AD Cleanup |
| Admin (PC) | Main Server | 3389 | Manutenzione (RDP) |

---

## 5. Punti Chiave dell'Ecosistema

1. **Integrazione AD**: Il server si collega direttamente all'Active Directory del cliente per l'analisi e la predisposizione al cleanup.
2. **Llama Self-Hosted**: L'AI gira localmente sul server per garantire la massima privacy dei dati sensibili del cliente.
3. **Chrome Ready**: Accesso immediato da qualsiasi browser Chrome aziendale tramite IP o nome DNS semplice.

---

## 6. Ciclo di Vita Funzionale: Cleanup, Mining & Modeling

1. **Data Cleanup**: Bonifica overprivileged e qualità del dato in AD.
2. **Role Mining**: Scoperta pattern ML validati semanticamente da AI.
3. **Role Modeling**: Definizione Business Roles e monitoraggio Role Drift.

---

> [!TIP]
> Questa architettura "All-in-One" è ideale per analisi rapide on-site o piccoli/medi ambienti, garantendo tutte le funzionalità di Role Mining senza la necessità di gestire un'infrastruttura multi-server complessa.
