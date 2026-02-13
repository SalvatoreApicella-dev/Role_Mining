# SAP Mock Users API (BTP CF)

Mock minimale con 10 utenti per testare il flusso completo di import SAP nel progetto Role Mining.

## Prerequisiti

- Cloud Foundry CLI installata (`cf`)
- Login a BTP CF fatto (`cf login` o `cf sso`)
- Target space impostato:

```bash
cf target -o <org> -s <space>
```

## Deploy

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
- Users (formato OData v2): `GET /odata/v2/User`

## Configurazione nel connettore SAP (Role Mining)

In pagina `Connettori -> SAP Connector`:

- `SAP Base URL`: `https://<route>`
- `SAP Users API Path`: `/users`
- `SAP Auth Mode`: `BASIC` (o `AUTO`)
- `SAP Username`: `demo`
- `SAP Password`: `demo`

Nota: questo mock non valida le credenziali, quindi i valori servono solo per compatibilita con il connettore.

Poi:

1. `Salva`
2. `SAP Import`

## Formato dati restituito

Il connettore riconosce questi campi per utente:

- `username`
- `displayName`
- `department`
- `businessRole`
- `groups` (stringa separata da virgole o array)
- `accountType`
- `lastLogin`
