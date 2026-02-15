const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(express.json({ limit: "2mb" }));

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "users.json");

const INITIAL_USERS = [
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

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_USERS, null, 2));
  }
}

function readUsers() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    return [];
  }
  return parsed;
}

function writeUsers(users) {
  ensureDataFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(users, null, 2));
}

function normalizeGroups(raw) {
  if (!raw) {
    return [];
  }
  if (Array.isArray(raw)) {
    return [...new Set(raw.map((x) => String(x || "").trim()).filter(Boolean))].sort();
  }
  return [
    ...new Set(
      String(raw)
        .split(/[;,|]/)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  ].sort();
}

function normalizeUser(input) {
  const username = String(input.username || input.userName || input.id || "").trim();
  if (!username) {
    return null;
  }
  const groups = normalizeGroups(input.groups);
  return {
    username,
    displayName: String(input.displayName || input.name || username).trim() || username,
    department: String(input.department || "Unknown").trim() || "Unknown",
    businessRole: String(input.businessRole || input.role || "Unassigned").trim() || "Unassigned",
    groups: groups.join(","),
    accountType: String(input.accountType || "Internal").trim() || "Internal",
    lastLogin: String(input.lastLogin || new Date().toISOString()).trim(),
  };
}

function upsertUsers(payloadUsers) {
  const users = readUsers();
  const byUsername = new Map(users.map((u) => [String(u.username), u]));
  let created = 0;
  let updated = 0;

  for (const raw of payloadUsers) {
    const norm = normalizeUser(raw);
    if (!norm) {
      continue;
    }
    if (byUsername.has(norm.username)) {
      byUsername.set(norm.username, { ...byUsername.get(norm.username), ...norm });
      updated += 1;
    } else {
      byUsername.set(norm.username, norm);
      created += 1;
    }
  }

  const out = Array.from(byUsername.values()).sort((a, b) =>
    String(a.username).localeCompare(String(b.username)),
  );
  writeUsers(out);
  return { created, updated, total: out.length };
}

function authGuard(req, res, next) {
  const user = process.env.BASIC_USER || "";
  const pass = process.env.BASIC_PASS || "";
  if (!user && !pass) {
    return next();
  }
  const auth = String(req.headers.authorization || "");
  if (!auth.startsWith("Basic ")) {
    res.setHeader("WWW-Authenticate", 'Basic realm="sap-users-api"');
    return res.status(401).json({ error: "Unauthorized" });
  }
  const blob = Buffer.from(auth.slice(6), "base64").toString("utf8");
  const idx = blob.indexOf(":");
  const inUser = idx >= 0 ? blob.slice(0, idx) : "";
  const inPass = idx >= 0 ? blob.slice(idx + 1) : "";
  if (inUser !== user || inPass !== pass) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  return next();
}

ensureDataFile();

app.get("/health", (_req, res) => {
  const users = readUsers();
  res.json({ ok: true, service: "sap-users-api-cf", users: users.length });
});

app.get("/users", authGuard, (_req, res) => {
  const users = readUsers();
  res.json({ value: users });
});

app.get("/users/:username", authGuard, (req, res) => {
  const users = readUsers();
  const username = String(req.params.username || "").trim();
  const user = users.find((u) => String(u.username) === username);
  if (!user) {
    return res.status(404).json({ error: "User not found" });
  }
  return res.json(user);
});

app.post("/users", authGuard, (req, res) => {
  const body = req.body || {};
  const payloadUsers = Array.isArray(body)
    ? body
    : Array.isArray(body.value)
      ? body.value
      : [body];
  const stats = upsertUsers(payloadUsers);
  return res.status(201).json({ ok: true, ...stats });
});

app.post("/users/generate", authGuard, (req, res) => {
  const body = req.body || {};
  const count = Math.max(1, Number(body.count || 100));
  const groupsPerUser = Math.max(1, Number(body.groupsPerUser || 20));
  const department = String(body.department || "SAP Bulk Department").trim() || "SAP Bulk Department";
  const businessRole = String(body.businessRole || "SAP Bulk Role").trim() || "SAP Bulk Role";
  const usernamePrefix = String(body.usernamePrefix || "sap.bulk").trim() || "sap.bulk";
  const displayPrefix = String(body.displayPrefix || "SAP Bulk User").trim() || "SAP Bulk User";
  const groupPrefix = String(body.groupPrefix || "SAP_BULK_GRP").trim() || "SAP_BULK_GRP";
  const startIndex = Math.max(1, Number(body.startIndex || 1));
  const poolSize = Math.max(groupsPerUser, Number(body.groupPoolSize || 100));

  const pool = Array.from({ length: poolSize }, (_, i) => `${groupPrefix}_${String(i + 1).padStart(3, "0")}`);
  const generated = [];
  for (let i = 0; i < count; i += 1) {
    const index = startIndex + i;
    const groups = [];
    const base = index % poolSize;
    for (let j = 0; j < groupsPerUser; j += 1) {
      groups.push(pool[(base + j) % poolSize]);
    }
    generated.push({
      username: `${usernamePrefix}.${String(index).padStart(4, "0")}`,
      displayName: `${displayPrefix} ${String(index).padStart(4, "0")}`,
      department,
      businessRole,
      groups,
      accountType: "Internal",
      lastLogin: new Date().toISOString(),
    });
  }

  const stats = upsertUsers(generated);
  return res.status(201).json({ ok: true, generated: count, groupsPerUser, ...stats });
});

app.patch("/users/:username", authGuard, (req, res) => {
  const username = String(req.params.username || "").trim();
  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }
  const users = readUsers();
  const idx = users.findIndex((u) => String(u.username) === username);
  if (idx < 0) {
    return res.status(404).json({ error: "User not found" });
  }
  const current = users[idx];
  const merged = { ...current, ...req.body, username };
  const norm = normalizeUser(merged);
  if (!norm) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  users[idx] = norm;
  writeUsers(users);
  return res.json({ ok: true, user: norm });
});

app.put("/users/:username", authGuard, (req, res) => {
  const username = String(req.params.username || "").trim();
  if (!username) {
    return res.status(400).json({ error: "Missing username" });
  }
  const norm = normalizeUser({ ...(req.body || {}), username });
  if (!norm) {
    return res.status(400).json({ error: "Invalid payload" });
  }
  const users = readUsers();
  const idx = users.findIndex((u) => String(u.username) === username);
  if (idx >= 0) {
    users[idx] = norm;
  } else {
    users.push(norm);
  }
  writeUsers(users);
  return res.json({ ok: true, user: norm, upserted: true });
});

app.delete("/users/:username", authGuard, (req, res) => {
  const username = String(req.params.username || "").trim();
  const users = readUsers();
  const next = users.filter((u) => String(u.username) !== username);
  if (next.length === users.length) {
    return res.status(404).json({ error: "User not found" });
  }
  writeUsers(next);
  return res.json({ ok: true, removed: username, total: next.length });
});

app.post("/users/reset", authGuard, (_req, res) => {
  writeUsers(INITIAL_USERS);
  return res.json({ ok: true, reset: true, total: INITIAL_USERS.length });
});

app.get("/odata/v2/User", authGuard, (_req, res) => {
  const users = readUsers();
  res.json({ d: { results: users } });
});

const port = Number(process.env.PORT || 8080);
app.listen(port, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`sap-users-api-cf listening on :${port}`);
});
