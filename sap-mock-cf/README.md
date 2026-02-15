# SAP Users API (BTP CF)

API utenti deployabile su SAP BTP Cloud Foundry con endpoint di lettura e scrittura (CRUD).
Questa versione sostituisce il mock statico: puoi caricare utenti realmente via API.

## Prerequisiti

- Cloud Foundry CLI installata (`cf`)
- Login a BTP CF fatto (`cf login` o `cf sso`)
- Target space impostato:

```bash
cf target -o <org> -s <space>
```

## Deploy su BTP

Dal path del progetto:

```bash
cd /Users/salvo/Development/Role_Mining/sap-mock-cf
cf push
```

Recupera la route:

```bash
cf app sap-users-mock-cf
```

Nell'output trovi qualcosa tipo:

`routes: sap-users-mock-cf-<suffix>.cfapps.<region>.hana.ondemand.com`

## Endpoint disponibili

- Health: `GET /health`
- Users (formato `value`): `GET /users`
- Singolo utente: `GET /users/:username`
- Create/Upsert utenti: `POST /users`
- Generazione massiva utenti: `POST /users/generate`
- Update parziale: `PATCH /users/:username`
- Upsert singolo: `PUT /users/:username`
- Delete utente: `DELETE /users/:username`
- Reset dataset iniziale: `POST /users/reset`
- OData v2 (compatibilità import): `GET /odata/v2/User`

### Formato `POST /users`

Supporta:

- Oggetto singolo
- Array di oggetti
- Oggetto `{ "value": [ ... ] }`

Campi principali riconosciuti:

- `username` (obbligatorio)
- `displayName`
- `department`
- `businessRole`
- `groups` (stringa CSV oppure array)
- `accountType`
- `lastLogin`

Esempio rapido:

```bash
curl -X POST "https://<route>/users" \
  -H "Content-Type: application/json" \
  -d '{"value":[{"username":"sap.bulk.0001","displayName":"SAP Bulk User 0001","department":"Finance","businessRole":"Analyst","groups":["SAP_BULK_GRP_001","SAP_BULK_GRP_002"]}]}'
```

Esempio generazione 100 utenti con 20 gruppi:

```bash
curl -X POST "https://<route>/users/generate" \
  -H "Content-Type: application/json" \
  -d '{"count":100,"groupsPerUser":20,"department":"Finance","businessRole":"Analyst"}'
```

## Configurazione connettore SAP (Role Mining)

In pagina `Connettori -> SAP Connector`:

- `SAP Base URL`: `https://<route>`
- `SAP Users API Path`: `/users`
- `SAP Auth Mode`: `AUTO` (o `BASIC` se attivi credenziali)
- `SAP Provision Path`: `/users`
- `SAP Provision Method`: `POST`
- `SAP Use CSRF Token`: `false` (se non richiesto dalla tua API)

Poi:

1. `Salva`
2. `SAP Import` (lettura)
3. `Provision` oppure `Upload Bulk Users` (scrittura)

## Persistenza dati

I dati utenti vengono salvati in `data/users.json`.

Nota importante per CF:

- i file nel container possono non essere persistenti tra restage/redeploy.
- per persistenza enterprise usa DB esterno (HANA/Postgres) e collega l'app.

## Basic Auth opzionale

Puoi proteggere gli endpoint impostando env vars:

```bash
cf set-env sap-users-mock-cf BASIC_USER <user>
cf set-env sap-users-mock-cf BASIC_PASS <pass>
cf restage sap-users-mock-cf
```

## Campi utente

- `username`
- `displayName`
- `department`
- `businessRole`
- `groups` (stringa separata da virgole o array)
- `accountType`
- `lastLogin`
