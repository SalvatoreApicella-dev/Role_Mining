const express = require("express");

const app = express();

const USERS = [
  {
    username: "sf.alice.rossi",
    displayName: "Alice Rossi",
    department: "Finance",
    businessRole: "Controller",
    groups: "SAP_FI_DISPLAY,SAP_CO_DISPLAY,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-10T08:12:00Z",
  },
  {
    username: "sf.marco.bianchi",
    displayName: "Marco Bianchi",
    department: "Finance",
    businessRole: "Accountant",
    groups: "SAP_FI_DISPLAY,SAP_FI_POST,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-11T09:45:00Z",
  },
  {
    username: "sf.laura.verdi",
    displayName: "Laura Verdi",
    department: "Procurement",
    businessRole: "Buyer",
    groups: "SAP_MM_DISPLAY,SAP_MM_BUYER,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-09T07:20:00Z",
  },
  {
    username: "sf.giulia.neri",
    displayName: "Giulia Neri",
    department: "Warehouse",
    businessRole: "Warehouse Operator",
    groups: "SAP_MM_DISPLAY,SAP_MM_WM_WRITE,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-12T10:03:00Z",
  },
  {
    username: "sf.andrea.gialli",
    displayName: "Andrea Gialli",
    department: "Sales",
    businessRole: "Sales Rep",
    groups: "SAP_SD_DISPLAY,SAP_SD_ORDER,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-08T12:30:00Z",
  },
  {
    username: "sf.paolo.riva",
    displayName: "Paolo Riva",
    department: "HR",
    businessRole: "HR Specialist",
    groups: "SAP_HCM_DISPLAY,SAP_HCM_WRITE,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-07T11:22:00Z",
  },
  {
    username: "sf.sara.fontana",
    displayName: "Sara Fontana",
    department: "IT",
    businessRole: "IT Operator",
    groups: "SAP_BASIS_MONITOR,SAP_BASIS_SUPPORT,SAP_PORTAL_USER",
    accountType: "Technical",
    lastLogin: "2026-02-13T06:40:00Z",
  },
  {
    username: "sf.luca.conti",
    displayName: "Luca Conti",
    department: "Manufacturing",
    businessRole: "Production Planner",
    groups: "SAP_PP_DISPLAY,SAP_PP_PLAN,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-12T13:11:00Z",
  },
  {
    username: "sf.elena.romano",
    displayName: "Elena Romano",
    department: "Quality",
    businessRole: "Quality Analyst",
    groups: "SAP_QM_DISPLAY,SAP_QM_WRITE,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-10T15:55:00Z",
  },
  {
    username: "sf.fabio.greco",
    displayName: "Fabio Greco",
    department: "Logistics",
    businessRole: "Logistics Specialist",
    groups: "SAP_LE_DISPLAY,SAP_LE_SHIP,SAP_PORTAL_USER",
    accountType: "Internal",
    lastLogin: "2026-02-11T14:27:00Z",
  },
];

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "sap-users-mock-cf" });
});

// Generic endpoint for Role Mining connector
app.get("/users", (_req, res) => {
  res.json({ value: USERS });
});

// Optional SuccessFactors-like route
app.get("/odata/v2/User", (_req, res) => {
  res.json({ d: { results: USERS } });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`sap-users-mock-cf listening on :${port}`);
});
