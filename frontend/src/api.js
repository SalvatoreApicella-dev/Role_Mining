const API_BASE = "";
// const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:8000";

export function getToken() {
  return localStorage.getItem("rm_token") || "";
}

export function setToken(t) {
  localStorage.setItem("rm_token", t);
}

export function clearToken() {
  localStorage.removeItem("rm_token");
}

export async function getConnector() {
  const res = await fetch(`${API_BASE}/api/config/connector`, {
    headers: { Authorization: `Bearer ${getToken()}` },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}


export async function importBusinessRolesCsv(file) {
  const form = new FormData();
  form.append("file", file);

  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/import/csv`, {
    method: "POST",
    headers,
    body: form
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(txt); // es: {"detail":"..."}
  }

  return await res.json();
}


export async function chooseCsvDuplicateRow(displayNameRaw, rowId) {
  return apiFetch("/api/csv/duplicates/choose", {
    method: "POST",
    body: JSON.stringify({ displayNameRaw, rowId }),
  });
}



async function request(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      msg = data?.detail || msg;
    } catch { }
    throw new Error(msg);
  }



  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}





export const api = {
  health: () => request("/api/health"),
  login: (username, password) => request("/api/auth/login", { method: "POST", body: { username, password } }),
  me: () => request("/api/me"),

  adGroups: () => request("/api/ad/groups"),
  businessRoleMeta: (role) => request(`/api/businessroles/${encodeURIComponent(role)}/meta`),
  businessRoleSuggestions,

  businessRoleSetColor: (role, color) =>
    request(`/api/businessroles/${encodeURIComponent(role)}/color`, { method: "POST", body: { color } }),
  businessRoleAddGroup: (role, group) =>
    request(`/api/businessroles/${encodeURIComponent(role)}/groups/add`, { method: "POST", body: { group } }),
  businessRoleRemoveGroup: (role, group) =>
    request(`/api/businessroles/${encodeURIComponent(role)}/groups/remove`, { method: "POST", body: { group } }),

  overprivilegedUsers: (nclusters = 8, rolesupport = 0.1) =>
    request(
      `/api/drilldown/overprivileged?nclusters=${encodeURIComponent(nclusters)}&rolesupport=${encodeURIComponent(rolesupport)}`
    ),



  getConnector: () => request("/api/config/connector"),
  setConnector: (cfg) => request("/api/config/connector", { method: "POST", body: cfg }),

  extract: (ou) => request("/api/ad/extract", { method: "POST", body: { ou } }),
  users: (q = "", limit = 100, offset = 0, sortBy = "", order = "asc", typeQ = "") => {
    let url = `/api/users?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`;
    if (sortBy) url += `&sort_by=${encodeURIComponent(sortBy)}&order=${encodeURIComponent(order)}`;
    if (typeQ) url += `&type_q=${encodeURIComponent(typeQ)}`;
    return request(url);
  },

  roleMiningRun: (n_clusters, role_support) =>
    request("/api/rolemining/run", { method: "POST", body: { n_clusters, role_support } }),
  roleMiningLast: () => request("/api/rolemining/last"),

  kpiDrilldown: (metric) => request(`/api/kpi/drilldown?metric=${encodeURIComponent(metric)}`),

  kpi: () => request("/api/kpi"),
  logs: () => request("/api/logs"),
  businessRoles: () => request("/api/businessroles"),
  businessRoleCreate: (role) =>
    request("/api/businessroles/create", { method: "POST", body: { role } }),
  businessRoleDetail: (role) => request(`/api/businessroles/${encodeURIComponent(role)}`),
  businessRoleAddUser: (role, username) =>
    request(`/api/businessroles/${encodeURIComponent(role)}/add`, { method: "POST", body: { username } }),

  updateAccountType: (username, accountType) => request(`/api/users/${encodeURIComponent(username)}/update`, { method: "POST", body: { accountType } }),
  peerAnalysis: (username) => request(`/api/users/${encodeURIComponent(username)}/peer-analysis`),

  // Pattern rules (AI Training)
  getPatterns: () => request("/api/ml/patterns"),
  addPattern: (account_type, field, regex) => request("/api/ml/patterns", { method: "POST", body: { account_type, field, regex } }),
  deletePattern: (index) => request(`/api/ml/patterns/${index}`, { method: "DELETE" }),

  // ML
  mlStatus: () => request("/api/ml/status"),
  mlAccountTypes: () => request("/api/ml/account-types"),
  getAdFields: () => request("/api/config/ad-fields"),

  async get(path) {
    const res = await fetch(path, {
      method: "GET",
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  },

  async post(path, body) {
    const res = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${getToken()}`,
      },
      body: JSON.stringify(body ?? {}),
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  },


};

// AI/BRDB suggestions: gruppi consigliati per questo Business Role
async function businessRoleSuggestions(role, minConf = 0.6, limit = 50) {
  const r = encodeURIComponent(role);
  return request(`/api/businessroles/${r}/suggestions?min_conf=${minConf}&limit=${limit}`);
}




export async function apiFetch(path, options = {}) {
  const res = await fetch(path, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.headers || {}),
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) return res.json();
  return res.text();
}


export async function getDuplicateDisplayNameConflicts() {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${API_BASE}/api/ingest/conflicts/duplicate-displayname`, {
    headers,
    credentials: "include",
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function chooseDuplicateDisplayName(displayName, candidateId) {
  const headers = { "Content-Type": "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const r = await fetch(`${API_BASE}/api/ingest/conflicts/duplicate-displayname/choose`, {
    method: "POST",
    credentials: "include",
    headers,
    body: JSON.stringify({ displayName, candidateId }),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}



// --- AI role suggestion (online) ---
export async function suggestBusinessRoleOnline(payload) {
  // payload: { group: string, source: "AD"|"Azure"|"SAP"|"SuccessFactors"|..., context?: object }
  return request("/api/ai/suggest-business-role-online", {
    method: "POST",
    body: payload,
  });
}

export async function suggestBusinessRoleHybrid(payload) {
  return request("/api/ai/suggest-business-role-hybrid", {
    method: "POST",
    body: payload,
  });
}

// (opzionale) health
export async function aiHealth() {
  return request("/api/ai/health");
}
