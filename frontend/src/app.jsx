import { NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import Plot from "react-plotly.js";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import KpiDrilldownPage from "./pages/KpiDrilldownPage";
import { api, clearToken, getToken, setToken } from "./api.js";
import Select from "react-select";
import {importBusinessRolesCsv } from "./api";
import OverprivilegedPage from "./pages/OverprivilegedPage";
import AiDetectionPage from "./pages/AiDetectionPage";

import React, { useEffect, useMemo, useRef, useState } from "react";

const SPLIT_KEY = "cluster_assignments_height_v1";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));


function Sidebar({ onLogout, roles }) {
  const [openCfg, setOpenCfg] = useState(true);
  const [openBr, setOpenBr] = useState(true);
  const [xlsxFile, setXlsxFile] = useState(null);
const [importMsg, setImportMsg] = useState("");
const [csvFile, setCsvFile] = useState(null);



  // const [openAllRoles, setOpenAllRoles] = useState(false);



  return (
    <aside className="sidebar">
      <div className="brand">Role Mining UI</div>
      <div className="menu">
        <NavLink to="/analytics" className={({ isActive }) => (isActive ? "active" : "")}>Analytics</NavLink>
        <NavLink to="/business-roles" className={({ isActive }) => (isActive ? "active" : "")}>Business Roles</NavLink>
        <NavLink to="/cluster" className={({ isActive }) => (isActive ? "active" : "")}>Cluster</NavLink>
        <NavLink to="/utenti" className={({ isActive }) => (isActive ? "active" : "")}>Utenti</NavLink>
        

        <button className="link" onClick={() => setOpenCfg(v => !v)}>
          Configurazioni ▾
        </button>
        {openCfg && (
          <div className="submenu">
            <NavLink to="/config/connettori" className={({ isActive }) => (isActive ? "active" : "")}>Connettori</NavLink>
            <NavLink to="/config/logs" className={({ isActive }) => (isActive ? "active" : "")}>Logs</NavLink>
          </div>
        )}

        <hr className="sep" />
        <button className="danger" onClick={onLogout}>Logout</button>
      </div>
    </aside>
  );
}


function Login() {
  const nav = useNavigate();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [err, setErr] = useState("");

  async function doLogin(e) {
    e.preventDefault();
    setErr("");
    try {
      const res = await api.login(username, password);
      setToken(res.access_token || res.token || "");
      nav("/analytics");
    } catch (e2) {
      setErr(String(e2.message || e2));
    }
  }

  return (
    <div className="main" style={{ display: "grid", placeItems: "center", height: "100vh" }}>
      <div className="panel" style={{ width: 420 }}>
        <h2 style={{ marginTop: 0 }}>Login</h2>
        <p style={{ color: "var(--muted)", marginTop: -6 }}>
          Mock AD: admin / admin123
        </p>
        <form onSubmit={doLogin} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" />
          <button className="primary" type="submit">Entra</button>
          {err && <div className="err">{err}</div>}
        </form>
      </div>
    </div>
  );
}

function Analytics() {

  const [kpi, setKpi] = useState({ totalUsers: 0, clusterQuality: 0, overprivilegedPct: 0, aiDetection: 0 });
  const [err, setErr] = useState("");

  const navigate = useNavigate();

const kpiRouteByLabel = {
  "Cluster Quality": "/kpi/cluster-quality",
  "Overprivileged %": "/overprivileged-users",   // <-- qui
  "AI Detection": "/ai-detection",
};


  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const data = await api.kpi();
        setKpi(data);
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, []);

  const plotData = [
    {
      type: "bar",
      x: ["Cluster Quality", "Overprivileged %", "AI Detection"],
      y: [kpi.clusterQuality, kpi.overprivilegedPct, kpi.aiDetection],
      marker: { color: ["#6aa6ff", "#ff6a6a", "#71ffb2"] }
    }
  ];

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Dashboard KPI</h2>

      <div className="grid">
        <div className="card"><div className="k">Total Users</div><div className="v">{kpi.totalUsers}</div></div>
        <div className="card"><div className="k">Cluster Quality</div><div className="v">{kpi.clusterQuality}%</div></div>
        <div className="card"><div className="k">Overprivileged</div><div className="v">{kpi.overprivilegedPct}%</div></div>
        <div className="card"><div className="k">AI Detection</div><div className="v">{kpi.aiDetection}%</div></div>
      </div>

      <hr className="sep" />

      <div className="panel">
          <Plot
            data={plotData}
            layout={{
              paper_bgcolor: "rgba(0,0,0,0)",
              plot_bgcolor: "rgba(0,0,0,0)",
              font: { color: "#e9eefc" },
              margin: { l: 40, r: 10, t: 20, b: 50 },
              yaxis: { range: [0, 100] }
            }}
            style={{ width: "100%", height: 320 }}
            config={{ displayModeBar: false }}
            onClick={(ev) => {
              const label = ev?.points?.[0]?.x;
              const route = kpiRouteByLabel[label];
              if (route) navigate(route);
            }}
          />

        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}

function Connettori() {
  const [cfg, setCfg] = useState({ server: "mock", bind_user: "", bind_password: "", base_dn: "", auth: "SIMPLE" });
  const [ou, setOu] = useState("OU=Users,DC=example,DC=local");
  const [statusMsg, setStatusMsg] = useState("");
  const [err, setErr] = useState("");

  const [csvFile, setCsvFile] = useState(null);
const [importMsg, setImportMsg] = useState("");



  async function load() {
    try {
      setErr("");
      const c = await api.getConnector();
      setCfg(c);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);

  async function saveCfg() {
    try {
      setErr(""); setStatusMsg("");
      await api.setConnector(cfg);
      setStatusMsg("Configurazione salvata.");
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function doExtract() {
    try {
      setErr(""); setStatusMsg("");
      const res = await api.extract(ou);
      setStatusMsg(`Extract OK: ${res.total_users} utenti, ${res.total_groups} gruppi.`);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  return (
  <div className="main">
    <h2 style={{ marginTop: 0 }}>Connettori</h2>

    {/* CARD 1: AD Connector */}
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Active Directory (Connector)</h3>

      <div className="row">
        <input
          style={{ width: 260 }}
          value={cfg.server}
          onChange={e => setCfg({ ...cfg, server: e.target.value })}
          placeholder="server (es: ad.local o mock)"
        />
        <select
          value={cfg.auth}
          onChange={e => setCfg({ ...cfg, auth: e.target.value })}
        >
          <option value="SIMPLE">SIMPLE</option>
          <option value="NTLM">NTLM</option>
        </select>
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          style={{ width: 260 }}
          value={cfg.bind_user}
          onChange={e => setCfg({ ...cfg, bind_user: e.target.value })}
          placeholder="bind_user"
        />
        <input
          style={{ width: 260 }}
          value={cfg.bind_password}
          onChange={e => setCfg({ ...cfg, bind_password: e.target.value })}
          placeholder="bind_password"
          type="password"
        />
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <input
          style={{ width: 540 }}
          value={cfg.base_dn}
          onChange={e => setCfg({ ...cfg, base_dn: e.target.value })}
          placeholder="base_dn (opzionale qui)"
        />
        <button className="primary" onClick={saveCfg}>Salva</button>
      </div>

      <hr className="sep" />

      <div className="row">
        <input
          style={{ width: 540 }}
          value={ou}
          onChange={e => setOu(e.target.value)}
          placeholder="OU DN"
        />
        <button className="primary" onClick={doExtract}>AD Extract</button>
      </div>

      {statusMsg && <div className="ok">{statusMsg}</div>}
      {err && <div className="err">{err}</div>}
    </div>

    <div style={{ height: 12 }} />

    {/* CARD 2: CSV Import */}
    <div className="panel">
      <h3 style={{ marginTop: 0 }}>Connettore Generico (CSV)</h3>

      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
        Atteso: DisplayName;BusinessRole;Ruoli (con Ruoli separati da virgola)
      </div>

      <div className="row">
        <input
          type="file"
          accept=".csv"
          onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
        />

        <button
          className="primary"
          disabled={!csvFile}
          onClick={async () => {
            if (!csvFile) return;
            try {
              setImportMsg("");
              const out = await importBusinessRolesCsv(csvFile);
              setImportMsg( `Import OK: ${out.newBusinessRoles} Business Roles, ${out.newRoles} Ruoli, ${out.created_users} Utenti`);
            } catch (e) {
              setImportMsg(`Import KO: ${e.message || String(e)}`);
            }
          }}
        >
          Importa CSV
        </button>
      </div>

      {importMsg && <div style={{ marginTop: 10 }}>{importMsg}</div>}
    </div>
  </div>
);



}

function Utenti() {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setErr("");
      const res = await api.users(q);
      setRows(res.users || []);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Utenti</h2>

      <div className="panel">
        <div className="row">
          <input style={{ width: 360 }} value={q} onChange={e => setQ(e.target.value)} placeholder="Filtro (username/displayName)" />
          <button className="primary" onClick={load}>Cerca</button>
        </div>

        <hr className="sep" />

        <table className="table">
          <thead>
            <tr>
              <th>Username</th>
              <th>Display Name</th>
              <th>Groups (memberOf)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.username}>
                <td>{u.username}</td>
                <td>{u.displayName}</td>
                <td style={{ color: "var(--muted)" }}>{(u.groups || []).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}

function Cluster() {
const [roleMetaByRole, setRoleMetaByRole] = useState({});   // { "IT": {color, groups}, ... }
const [groupRoleMap, setGroupRoleMap] = useState({});       // { "VPN": "IT", "Payroll": "HR", ... }
const [usersIndex, setUsersIndex] = useState({});

const containerRef = React.useRef(null);
const SPLIT_KEY = "cluster_assignments_height_v1";
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

const [assignH, setAssignH] = useState(() => {
  const v = Number(localStorage.getItem(SPLIT_KEY));
  return Number.isFinite(v) && v > 0 ? v : 260;
});

useEffect(() => {
  localStorage.setItem(SPLIT_KEY, String(assignH));
}, [assignH]);

function hexToRgba(hex, a) {
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return `rgba(17,26,46,${a})`;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function startDrag(e) {
  e.preventDefault();
  const startY = e.clientY;
  const startH = assignH;

  const onMove = (ev) => {
    const dy = ev.clientY - startY;
    const el = containerRef.current;
    const total = el?.clientHeight || 800;

    const minH = 160;
    const maxH = Math.floor(total * 0.75);

    // trascini su => aumenti assegnazioni; giù => diminuisci
    setAssignH(clamp(startH - dy, minH, maxH));
  };

  const onUp = () => {
    window.removeEventListener("mousemove", onMove);
    window.removeEventListener("mouseup", onUp);
  };

  window.addEventListener("mousemove", onMove);
  window.addEventListener("mouseup", onUp);
}


function textColorForBg(hex) {
  // hex: "#RRGGBB"
  if (!hex || !hex.startsWith("#") || hex.length !== 7) return "#06101e";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  // luminanza semplificata
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 140 ? "#06101e" : "#ffffff";
}

  const [roleSupport, setRoleSupport] = useState(0.5);
  const [nClusters, setNClusters] = useState("");
  const [mining, setMining] = useState(null);
  const [err, setErr] = useState("");

  // filtri UI (NON trasparenti)
  const [quick, setQuick] = useState("");
  const [roleFilter, setRoleFilter] = useState("All");

  const [roleData, setRoleData] = useState({ roles: [], assignments: {} });

  async function loadRoles() {
  const r = await api.businessRoles(); // {roles:[{role,count}], assignments:{user:role}}
  setRoleData(r);

  // carica meta (color + groups) per ogni ruolo
  const roles = (r.roles || []).map(x => x.role);
  const metas = await Promise.all(
    roles.map(async (role) => {
      try {
        const m = await api.businessRoleMeta(role); // {role,color,groups}
        return [role, m];
      } catch {
        return [role, { role, color: "#6aa6ff", groups: [] }];
      }
    })
  );

  const metaObj = Object.fromEntries(metas);
  setRoleMetaByRole(metaObj);

  // costruisce group -> role (se un group è in più ruoli, vince il primo)
  const gmap = {};
  for (const role of roles) {
    const gs = metaObj?.[role]?.groups || [];
    for (const g of gs) {
      if (!gmap[g]) gmap[g] = role;
    }
  }
  setGroupRoleMap(gmap);
}


  async function run() {
    try {
      setErr("");
      const n = nClusters ? Number(nClusters) : null;
      await api.roleMiningRun(Number.isFinite(n) ? n : null, Number(roleSupport));
      const last = await api.roleMiningLast();
      setMining(last);
      const u = await api.users("");
      const idx = {};
      (u.users || []).forEach(x => { idx[x.username] = x.displayName; });
      setUsersIndex(idx);

      await loadRoles();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { run(); }, []);

  const { columnDefs, rowData } = useMemo(() => {
    if (!mining || !mining.matrix || !mining.groups) return { columnDefs: [], rowData: [] };

    const groups = mining.groups;
    const usernames = Object.keys(mining.matrix);

    const clusterByUser = {};
    (mining.clusters || []).forEach(c => (c.members || []).forEach(u => { clusterByUser[u] = c.clusterId; }));

    let rows = usernames.map(u => {
      const businessRole = roleData.assignments?.[u] || "Unassigned";
      const roleColor = roleMetaByRole?.[businessRole]?.color || "#111a2e";

      return {
        username: u,
        displayName: usersIndex?.[u] || u,
        clusterId: clusterByUser[u] ?? -1,
        businessRole,
        roleColor,
        ...mining.matrix[u]
      };
    });


    if (roleFilter !== "All") {
      rows = rows.filter(r => r.businessRole === roleFilter);
    }

    const cols = [
  {
  field: "displayName",
  headerName: "User",
  pinned: "left",
  filter: true,
  width: 220,
  sortable: true,
  comparator: (valueA, valueB, nodeA, nodeB) => {
    const ca = nodeA?.data?.roleColor || "";
    const cb = nodeB?.data?.roleColor || "";
    if (ca === cb) return String(valueA || "").localeCompare(String(valueB || ""));
    return ca.localeCompare(cb);
  },
  cellStyle: (p) => {
    const role = p.data?.businessRole || "Unassigned";
    const bg = roleMetaByRole?.[role]?.color || "#6aa6ff";
    return {
      backgroundColor: bg,
      color: textColorForBg(bg),
      fontWeight: 800,
      borderRight: "1px solid rgba(255,255,255,0.10)"
    };
  }
},
  { field: "clusterId", headerName: "Cluster", pinned: "left", width: 110, hide: true }
];


  const groupsSorted = [...(groups || [])].sort((a, b) => {
  const ra = groupRoleMap?.[a] || "Unassigned";
  const rb = groupRoleMap?.[b] || "Unassigned";

  // 1) prima per Business Role
  const c1 = ra.localeCompare(rb);
  if (c1 !== 0) return c1;

  // 2) poi per nome gruppo
  return a.localeCompare(b);
});

groupsSorted.forEach((g) => {
  cols.push({
  headerName: g,
  field: g,

  valueGetter: (p) => Number(p.data?.[g] || 0),
  valueFormatter: () => "",

  cellStyle: (p) => {
    const v = Number(p.value || 0); // resta 0/1, ma non viene più mostrato
    const roleForGroup = groupRoleMap?.[g];
    const hex = roleMetaByRole?.[roleForGroup]?.color || "#d3ca48";
    const bg = v ? hexToRgba(hex, 0.95) : hexToRgba(hex, 0.10);
    return { backgroundColor: bg };
  },
});

});





    return { columnDefs: cols, rowData: rows };
  }, [mining, roleData, roleFilter]);

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Business Role Model</h2>

      {/* FILTRI NON trasparenti */}
      <div className="filtersBar">
        <div className="row">
          <label>Search</label>
          <input
            style={{ width: 260 }}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Username / Ruolo…"
          />

          <label>Business Role</label>
          {/* <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="All">All</option>
            {(roleData.roles || []).map(r => (
              <option key={r.role} value={r.role}>{r.role}</option>
            ))}
          </select> */}
        
<label>Business Role</label>
<select
  value={roleFilter}
  onChange={(e) => setRoleFilter(e.target.value)}
  style={{
    backgroundColor:
      roleFilter === "All"
        ? "#111a2e"
        : (roleMetaByRole?.[roleFilter]?.color || "#111a2e"),
    color:
      roleFilter === "All"
        ? "#e9eefc"
        : textColorForBg(roleMetaByRole?.[roleFilter]?.color || "#111a2e"),
    border: "1px solid rgba(255,255,255,0.18)",
    borderRadius: 10,
    padding: "10px 12px"
  }}
>
  <option value="All">All</option>
  {(roleData.roles || []).map(x => (
    <option key={x.role} value={x.role}>{x.role}</option>
  ))}
</select>



{/* 
          <label>n_clusters</label>
          <input style={{ width: 110 }} value={nClusters} onChange={e => setNClusters(e.target.value)} placeholder="auto" />

          <label>role_support</label>
          <input style={{ width: 110 }} value={roleSupport} onChange={e => setRoleSupport(e.target.value)} /> */}

          {/* <button className="primary" onClick={run}>Run</button> */}
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div style={{ height: 12 }} />

<div
  ref={containerRef}
  className="panel"
  style={{
    height: "calc(100vh - 190px)",
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  }}
>
  {/* TOP: matrice */}
  <div style={{ flex: "1 1 auto", minHeight: 240, overflow: "hidden" }}>
    <div className="ag-theme-quartz-dark" style={{ height: "100%", width: "100%" }}>
      <AgGridReact
      rowData={rowData}
      columnDefs={columnDefs}
      defaultColDef={{ resizable: true, sortable: true, filter: true }}
      animateRows={true}
      quickFilterText={quick}
      rowHeight={24}
      headerHeight={34}
    />

    </div>
  </div>

  {/* HANDLE */}
  <div
    onMouseDown={startDrag}
    title="Trascina per ridimensionare"
    style={{
      height: 10,
      cursor: "row-resize",
      background: "rgba(255,255,255,0.08)",
      borderTop: "1px solid rgba(255,255,255,0.10)",
      borderBottom: "1px solid rgba(255,255,255,0.10)",
    }}
  />

  {/* BOTTOM: assegnazioni */}
  <div style={{ flex: `0 0 ${assignH}px`, minHeight: 160, overflow: "auto" }}>
    <div style={{ padding: "12px 12px 0 12px" }}>
      <h3 style={{ marginTop: 0 }}>Business Roles (assegnazioni)</h3>
      <div style={{ color: "var(--muted)", fontSize: 12 }}>
        Totale: {Object.keys(roleData.assignments || {}).length}
      </div>
    </div>

    <div style={{ padding: "0 12px 12px 12px" }}>
      <table className="table">
        <thead><tr><th>Display Name</th><th>Business Role</th></tr></thead>
        <tbody>
          {Object.entries(roleData.assignments || {}).map(([u, role]) => {
            const bg = roleMetaByRole?.[role]?.color || "#111a2e";
            const fg = textColorForBg(bg);
            const dn = usersIndex?.[u] || u;

            return (
              <tr key={u}>
                <td>{dn}</td>
                <td>
                  <select
                    value={role}
                    onChange={async (e) => {
                      const newRole = e.target.value;
                      try {
                        await api.businessRoleAddUser(newRole, u);
                        const refreshed = await api.businessRoles();
                        setRoleData(refreshed);
                      } catch (e2) {
                        setErr(String(e2.message || e2));
                      }
                    }}
                    style={{
                      backgroundColor: bg,
                      color: fg,
                      border: "1px solid rgba(255,255,255,0.18)",
                      borderRadius: 10,
                      padding: "10px 12px",
                      minWidth: 110
                    }}
                  >
                    {(roleData.roles || []).map(x => (
                      <option key={x.role} value={x.role}>{x.role}</option>
                    ))}
                  </select>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </div>

  {err && <div className="err">{err}</div>}
</div>


    </div>
  );
}



function Logs() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");

  async function load() {
    try {
      setErr("");
      const res = await api.logs();
      setItems(res.items || []);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Logs</h2>
      <div className="panel">
        <button className="primary" onClick={load}>Refresh</button>
        <hr className="sep" />
        <table className="table">
          <thead>
            <tr><th>Timestamp</th><th>Level</th><th>Message</th></tr>
          </thead>
          <tbody>
            {items.map((x, i) => (
              <tr key={i}>
                <td style={{ color: "var(--muted)" }}>{x.ts}</td>
                <td>{x.level}</td>
                <td>{x.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}

function BusinessRolesHome() {
  const [roles, setRoles] = useState([]);
  const [err, setErr] = useState("");
  const [newRole, setNewRole] = useState("");
  const [ok, setOk] = useState("");
  const [csvFile, setCsvFile] = useState(null);
  const [importMsg, setImportMsg] = useState("");



  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const res = await api.businessRoles();
        setRoles(res.roles || []);
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, []);


    return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Business Roles</h2>

      <div className="panel">
        <div className="row">
          <input
            style={{ width: 260 }}
            value={newRole}
            onChange={(e) => setNewRole(e.target.value)}
            placeholder="Nuovo ruolo (es. Finance)"
          />
          <button
            className="primary"
            onClick={async () => {
              try {
                setErr(""); setOk("");
                await api.businessRoleCreate(newRole);
                setNewRole("");
                setOk("Ruolo creato.");
                const res = await api.businessRoles();
                setRoles(res.roles || []);
              } catch (e) {
                setErr(String(e.message || e));
              }
            }}
          >
            + Crea
          </button>
        </div>

        {ok && <div className="ok">{ok}</div>}
        {err && <div className="err">{err}</div>}

        <hr className="sep" />

        <table className="table">
          <thead><tr><th>Role</th><th>Users</th></tr></thead>
          <tbody>
  {roles.map(r => (
    <tr key={r.role}>
      <td>
        <NavLink
          to={`/business-roles/${encodeURIComponent(r.role)}`}
          className="roleRowLink"
        >
          {r.role}
        </NavLink>
      </td>
      <td>
        <NavLink
          to={`/business-roles/${encodeURIComponent(r.role)}`}
          className="roleRowLink mutedLink"
        >
          {r.count}
        </NavLink>
      </td>
    </tr>
  ))}
</tbody>

        </table>
      </div>
    </div>
  );

}

function BusinessRoleDetail() {
  const { role } = useParams();
  const [detail, setDetail] = useState({ role, users: [] });
  const [allUsers, setAllUsers] = useState([]);
  const [toAdd, setToAdd] = useState("");
  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");


    const [meta, setMeta] = useState({ color: "#00b4ff", groups: [] });
  const [allGroups, setAllGroups] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [suggestions, setSuggestions] = useState([]); // [{group, confidence, evidence}]
  const [suggErr, setSuggErr] = useState("");
  const [suggLoading, setSuggLoading] = useState(false);
  const [autoApplied, setAutoApplied] = useState(false); // evita loop infinito


  const selectStyles = {
  control: (base, state) => ({
    ...base,
    backgroundColor: "#111a2e",
    borderColor: state.isFocused ? "rgba(106,166,255,0.55)" : "rgba(255,255,255,0.18)",
    boxShadow: "none",
    minHeight: 40
  }),
  valueContainer: (base) => ({ ...base, padding: "2px 10px" }),
  singleValue: (base) => ({ ...base, color: "#e9eefc" }),
  input: (base) => ({ ...base, color: "#e9eefc" }),
  placeholder: (base) => ({ ...base, color: "rgba(233,238,252,0.65)" }),
  
  


  menu: (base) => ({
    ...base,
    backgroundColor: "#111a2e",
    border: "1px solid rgba(255,255,255,0.18)",
    boxShadow: "0 18px 55px rgba(0,0,0,0.65)",
    overflow: "hidden"
  }),
  menuList: (base) => ({
    ...base,
    backgroundColor: "#111a2e",
    padding: 6
  }),
  option: (base, state) => ({
    ...base,
    backgroundColor: state.isSelected
      ? "rgba(106,166,255,0.22)"
      : state.isFocused
        ? "rgba(106,166,255,0.14)"
        : "#111a2e",
    color: "#e9eefc",
    borderRadius: 10,
    margin: "2px 0"
  }),

};



      async function autoApplyHighConfidence(role, items, currentGroups) {
    const already = new Set(currentGroups || []);

    const toApply = (items || [])
      .filter(x => {
        const c = Number(x.confidence || 0);
        const c01 = c > 1 ? (c / 100) : c;   // 64 -> 0.64, 0.64 -> 0.64
        return c01 >= 0.80;
      })
      .map(x => x.group)
      .filter(g => g && !already.has(g));

    if (toApply.length === 0) return { applied: 0 };

    for (const g of toApply) {
      await api.businessRoleAddGroup(role, g); // POST /api/businessroles/{role}/groups/add [file:1690]
    }
    return { applied: toApply.length };
  }



    async function load() {
      try {
        setErr(""); setOk("");
        const d = await api.businessRoleDetail(role);
        const u = await api.users("");
        const m = await api.businessRoleMeta(role);
        const g = await api.adGroups();
        setMeta({ color: m.color, groups: m.groups }),

        setSuggErr("");
        setSuggLoading(true);
        let items = [];
        try {
          const s = await api.businessRoleSuggestions(role, 0.60, 50);
          items = s.items || [];
          setSuggestions(items);
        } catch (e3) {
          setSuggestions([]);
          setSuggErr(String(e3?.message || e3));
        } finally {
          setSuggLoading(false);
        }

                if (!autoApplied) {
          try {
            const out = await autoApplyHighConfidence(role, items, m.groups || []);
            if (out.applied > 0) {
              setOk(`Auto-assegnati ${out.applied} gruppi (confidence ≥ 80%).`);
              setAutoApplied(true);
              await load(); // ricarica meta + suggestions aggiornate
              return;
            }
          } catch (e4) {
            setErr(String(e4?.message || e4));
          } finally {
            setAutoApplied(true);
          }
        }

        setDetail(d);
        setAllUsers(u.users || []);
        setMeta({ color: m.color, groups: m.groups || [] });
        setAllGroups(g.groups || []);
      } catch (e) {
        setErr(String(e.message || e));
      }
    }


  useEffect(() => {
  setAutoApplied(false);
  load();
  }, [role]);


  const assigned = new Set((detail.users || []).map(x => x.username));
  const available = (allUsers || []).filter(u => !assigned.has(u.username));

  async function addUser() {
    if (!toAdd) return;
    try {
      setErr(""); setOk("");
      await api.businessRoleAddUser(role, toAdd);
      setToAdd("");
      setOk("Utente aggiunto al ruolo.");
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Business Role: {role}</h2>

      <div className="panel">
        <div className="row" style={{ alignItems: "flex-end" }}>
    <div style={{ width: 360 }}>
  </div>
  </div>

        {ok && <div className="ok">{ok}</div>}
        {err && <div className="err">{err}</div>}

        <hr className="sep" />

        <hr className="sep" />

        <div className="row">
          <label style={{ color: "var(--muted)" }}>Role color</label>
          <input
            type="color"
            value={meta.color}
            onChange={async (e) => {
              const c = e.target.value;
              setMeta(prev => ({ ...prev, color: c }));
              try {
                await api.businessRoleSetColor(role, c);
                setOk("Colore aggiornato.");
              } catch (e2) {
                setErr(String(e2.message || e2));
              }
            }}
            style={{ width: 56, height: 40, padding: 2, background: "#fff" }}
          />
          <div style={{ color: "var(--muted)" }}>{meta.color}</div>
        </div>

        <hr className="sep" />

        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ width: 360 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Aggiungi utente</div>
            <Select
              isSearchable={true}
                styles={selectStyles}
                value={selectedUser}
                onChange={setSelectedUser}
                placeholder="Cerca utente..."
                options={available.map(u => ({ value: u.username, label: u.username }))}
                menuPortalTarget={document.body}
                menuPosition="fixed"
            />
          </div>
          <button
            className="primary"
            onClick={async () => {
              if (!selectedUser?.value) return;
              try {
                setErr(""); setOk("");
                await api.businessRoleAddUser(role, selectedUser.value);
                setSelectedUser(null);
                setOk("Utente aggiunto al ruolo.");
                await load();
              } catch (e2) {
                setErr(String(e2.message || e2));
              }
            }}
          >
            Aggiungi
          </button>
        </div>

        <hr className="sep" />

        <h3 style={{ marginTop: 0 }}>Gruppi AD del ruolo</h3>

        <div className="row" style={{ alignItems: "flex-end" }}>
          <div style={{ width: 420 }}>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 6 }}>Aggiungi gruppo AD</div>
            <Select
              isSearchable={true}
              styles={selectStyles}
              value={selectedGroup}
              onChange={setSelectedGroup}
              placeholder="Cerca gruppo..."
              options={allGroups
                .filter(g => !(meta.groups || []).includes(g))
                .map(g => ({ value: g, label: g }))}
            />
          </div>
          <button
            className="primary"
            onClick={async () => {
              if (!selectedGroup?.value) return;
              try {
                setErr(""); setOk("");
                await api.businessRoleAddGroup(role, selectedGroup.value);
                setSelectedGroup(null);
                setOk("Gruppo aggiunto al ruolo.");
                await load();
              } catch (e2) {
                setErr(String(e2.message || e2));
              }
            }}
          >
            Aggiungi gruppo
          </button>
        </div>

        <div style={{ height: 10 }} />

        <table className="table">
          <thead><tr><th>Group</th><th></th></tr></thead>
          <tbody>
            {(meta.groups || []).map(g => (
              <tr key={g}>
                <td>{g}</td>
                <td>
                  <button
                    className="danger"
                    onClick={async () => {
                      try {
                        setErr(""); setOk("");
                        await api.businessRoleRemoveGroup(role, g);
                        setOk("Gruppo rimosso.");
                        await load();
                      } catch (e2) {
                        setErr(String(e2.message || e2));
                      }
                    }}
                  >
                    Rimuovi
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

            <hr className="sep" />

<h3 style={{ marginTop: 0 }}>AI Suggestion (confidence &gt; 60%)</h3>

{suggLoading && <div style={{ color: "var(--muted)" }}>Caricamento suggestions…</div>}
{suggErr && <div className="err">{suggErr}</div>}

{!suggLoading && !suggErr && (
  <table className="table">
    <thead>
      <tr>
        <th>Group</th>
        <th style={{ width: 140 }}>Confidence</th>
        <th style={{ width: 140 }}></th>
      </tr>
    </thead>
    <tbody>
      {(suggestions || [])
        // safety: se per qualche motivo arriva un gruppo già assegnato, non mostrarlo
        .filter(x => !(meta.groups || []).includes(x.group))
        .map((x) => (
          <tr key={x.group}>
            <td>{x.group}</td>
            <td style={{ color: "var(--muted)" }}>
              {Math.round((Number(x.confidence || 0) * 100))}%
            </td>
            <td>
              <button
                className="primary"
                onClick={async () => {
                  try {
                    setErr(""); setOk("");
                    // riusa il tuo endpoint standard di add group
                    await api.businessRoleAddGroup(role, x.group);
                    setOk("Gruppo assegnato dal suggerimento.");
                    await load();
                  } catch (e2) {
                    setErr(String(e2.message || e2));
                  }
                }}
              >
                Select
              </button>
            </td>
          </tr>
        ))}
    </tbody>
  </table>
)}

{!suggLoading && !suggErr && (suggestions || []).length === 0 && (
  <div style={{ color: "var(--muted)" }}>
    Nessun gruppo suggerito sopra soglia.
  </div>
)}



        <table className="table">
          <thead><tr><th>Username</th><th>Display Name</th><th>Gruppi</th></tr></thead>
          <tbody>
            {(detail.users || []).map(u => (
              <tr key={u.username}>
                <td>{u.username}</td>
                <td>{u.displayName}</td>
                <td style={{ color: "var(--muted)" }}>{(u.groups || []).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}


export default function App() {
  const nav = useNavigate();
  const [ready, setReady] = useState(false);
  const [roles, setRoles] = useState([]);

  useEffect(() => {
  (async () => {
    try { await api.me(); }
    catch { clearToken(); }
    setReady(true);
  })();
}, []);


  useEffect(() => {
    (async () => {
      if (!getToken) return;
      try {
        const r = await api.businessRoles();
        setRoles(r.roles || []);
      } catch {
        // non bloccare la UI
      }
    })();
  }, [ready]);


  function logout() {
    clearToken();
    nav("/login");
  }

  if (!ready) return null;
  const authed = Boolean(getToken());
  if (!authed) {
    return (
      <Routes>
        <Route path="*" element={<Login />} />
      </Routes>
    );
  }

  return (
    <div className="layout">
      <Sidebar onLogout={logout} roles={roles}  />
      <Routes>
        <Route path="/" element={<Analytics />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/cluster" element={<Cluster />} />
        <Route path="/utenti" element={<Utenti />} />
        <Route path="/overprivileged-users" element={<OverprivilegedPage />} />
        <Route path="/config/connettori" element={<Connettori />} />
        <Route path="/config/logs" element={<Logs />} />
        <Route path="*" element={<Analytics />} />
        <Route path="/business-roles" element={<BusinessRolesHome />} />
        <Route path="/business-roles/:role" element={<BusinessRoleDetail />} />
        <Route path="/kpi/:metric" element={<KpiDrilldownPage />} />
        <Route path="/ai-detection" element={<AiDetectionPage />} />

      </Routes>
    </div>
  );
}
