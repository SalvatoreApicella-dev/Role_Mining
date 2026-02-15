import { NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { AgGridReact } from "ag-grid-react";
import "ag-grid-community/styles/ag-grid.css";
import "ag-grid-community/styles/ag-theme-quartz.css";
import { api, clearToken, getToken, setToken } from "./api.js";
import Select from "react-select";
import ForceGraph2D from "react-force-graph-2d";
import { forceCollide, forceRadial } from "d3-force";
import { importBusinessRolesCsv, exportLastAdExtractCsv } from "./api";

import React, { useEffect, useMemo, useRef, useState, Suspense, lazy } from "react";

// Lazy Load Pages
const KpiDrilldownPage = lazy(() => import("./pages/KpiDrilldownPage"));
const OverprivilegedPage = lazy(() => import("./pages/OverprivilegedPage"));
const ModelQualityPage = lazy(() => import("./pages/ModelQualityPage"));
const AiDetectionPage = lazy(() => import("./pages/AiDetectionPage"));
const AiTrainingPage = lazy(() => import("./pages/AiTrainingPage"));
const AiLabDriftPage = lazy(() => import("./pages/AiLabDriftPage"));
const AiLabTimelinePage = lazy(() => import("./pages/AiLabTimelinePage"));
const AiLabAbPlaygroundPage = lazy(() => import("./pages/AiLabAbPlaygroundPage"));
const AiLabFairnessPage = lazy(() => import("./pages/AiLabFairnessPage"));
const AiLabSyntheticPage = lazy(() => import("./pages/AiLabSyntheticPage"));
const AiLabFeedbackPage = lazy(() => import("./pages/AiLabFeedbackPage"));
const Plot = lazy(() => import("react-plotly.js"));



const SPLIT_KEY = "cluster_assignments_height_v1";
const ACTIVE_PARTICLE_SPEED = 0.0048;
const MAX_GRAPH_NODES = 220;
const OUTER_NODE_RADIUS = 27; // all non-center nodes use the same radius


function Sidebar({ onLogout, roles }) {
  const [openCfg, setOpenCfg] = useState(false);
  const [openAiGym, setOpenAiGym] = useState(false);

  return (
    <aside className="sidebar bip-sidebar">
      <div className="sidebar-utility">
        <NavLink to="/analytics" className="sidebar-overview-btn">
          <img
            src="/BIP-Thumbnail-RED-on-BLUE.png"
            alt="Logo"
            className="sidebar-overview-btn__logo"
          />
          <span className="sidebar-overview-btn__label">Role Modeling</span>
        </NavLink>
      </div>

      <div className="menu">
        <div className="menu-block nav-section">
          <div className="menu-section">Management</div>
          <NavLink to="/business-roles" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
            <span className="nav-item__dot" />
            <span className="nav-item__text">Business Roles</span>
          </NavLink>
          <NavLink to="/cluster" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
            <span className="nav-item__dot" />
            <span className="nav-item__text">Cluster</span>
          </NavLink>
          <NavLink to="/utenti" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
            <span className="nav-item__dot" />
            <span className="nav-item__text">Users</span>
          </NavLink>
        </div>

        <div className="menu-block nav-section">
          <div className="menu-section">System</div>
          <button className={`link nav-toggle ${openAiGym ? "is-open" : ""}`} onClick={() => setOpenAiGym(v => !v)}>
            <span className="nav-toggle__label">
              <span className="nav-item__dot" />
              <span className="nav-item__text">AI Training</span>
            </span>
          </button>
          {openAiGym && (
            <div className="submenu nav-submenu">
              <NavLink to="/ai-training" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Pattern Rules</span>
              </NavLink>
              <NavLink to="/ai-lab/drift" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Data Drift</span>
              </NavLink>
              <NavLink to="/ai-lab/timeline" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Training Timeline</span>
              </NavLink>
              <NavLink to="/ai-lab/ab-playground" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">A/B Playground</span>
              </NavLink>
              <NavLink to="/ai-lab/fairness" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Bias & Fairness</span>
              </NavLink>
              <NavLink to="/ai-lab/synthetic" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Synthetic Cases</span>
              </NavLink>
              <NavLink to="/ai-lab/feedback" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Feedback Loop</span>
              </NavLink>
            </div>
          )}
          <button className={`link nav-toggle ${openCfg ? "is-open" : ""}`} onClick={() => setOpenCfg(v => !v)}>
            <span className="nav-toggle__label">
              <span className="nav-item__dot" />
              <span className="nav-item__text">Configurazioni</span>
            </span>
          </button>
          {openCfg && (
            <div className="submenu nav-submenu">
              <NavLink to="/config/connettori" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Connettori</span>
              </NavLink>
              <NavLink to="/config/logs" className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
                <span className="nav-item__dot" />
                <span className="nav-item__text">Logs</span>
              </NavLink>
            </div>
          )}
        </div>
      </div>

      <div className="sidebar-actions">
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
        <img
          src="/BIP-Thumbnail-RED-on-BLUE.png"
          alt="Logo"
          style={{ width: 320, margin: "0 auto 14px", display: "block" }}
        />

        <h2 style={{ marginTop: 0 }}>Login</h2>
        <p style={{ color: "var(--muted)", marginTop: -6 }}>
          Mock AD: admin / admin123
        </p>
        <form onSubmit={doLogin} className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <input value={username} onChange={e => setUsername(e.target.value)} placeholder="Username" aria-label="Username" />
          <input value={password} onChange={e => setPassword(e.target.value)} placeholder="Password" type="password" aria-label="Password" />
          <button className="primary" type="submit">Entra</button>
          {err && <div className="err">{err}</div>}
        </form>
      </div>
    </div>
  );
}

function SaveLoadingBar() {
  const [pending, setPending] = useState(0);

  useEffect(() => {
    const onStart = () => setPending((n) => n + 1);
    const onEnd = () => setPending((n) => Math.max(0, n - 1));

    window.addEventListener("rm:save:start", onStart);
    window.addEventListener("rm:save:end", onEnd);
    return () => {
      window.removeEventListener("rm:save:start", onStart);
      window.removeEventListener("rm:save:end", onEnd);
    };
  }, []);

  if (pending <= 0) return null;
  return (
    <div className="save-loadingbar" aria-hidden="true">
      <div className="save-loadingbar__fill" />
    </div>
  );
}

function Analytics() {

  const [kpi, setKpi] = useState({ totalUsers: 0, clusterQuality: 0, modelQuality: 0, aiDetection: 0 });
  const [connectorCfg, setConnectorCfg] = useState({ discovery_results: {} });
  const [animatedView, setAnimatedView] = useState({
    totalUsers: 0,
    clusterPct: 0,
    modelPct: 0,
    aiPct: 0,
    overall: 0,
  });
  const [err, setErr] = useState("");
  const rafRef = useRef(0);

  const navigate = useNavigate();


  useEffect(() => {
    (async () => {
      try {
        setErr("");
        const [kpiRes, cfgRes] = await Promise.allSettled([api.kpi(), api.getConnector()]);
        if (kpiRes.status === "fulfilled") {
          const data = kpiRes.value;
          const normalized = (data && typeof data.kpi === "object") ? data.kpi : data;
          setKpi(normalized || {});
        } else {
          throw kpiRes.reason;
        }
        if (cfgRes.status === "fulfilled") {
          setConnectorCfg(cfgRes.value || { discovery_results: {} });
        }
      } catch (e) {
        setErr(String(e.message || e));
      }
    })();
  }, []);

  const pct = (v) => Math.max(0, Math.min(100, Number(v) || 0));
  const clusterPct = pct(
    kpi.clusterQuality ?? kpi.clusteringQuality ?? kpi.cluster_quality ?? kpi.clustering_quality
  );
  const modelPct = pct(kpi.modelQuality ?? kpi.model_quality);
  const aiPct = pct(kpi.aiDetection ?? kpi.ai_detection);
  const rawTotalUsers = Number(kpi.totalUsers ?? 0);

  useEffect(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduceMotion) {
      const overallInstant = Math.round((clusterPct + modelPct + aiPct) / 3);
      setAnimatedView({
        totalUsers: rawTotalUsers,
        clusterPct,
        modelPct,
        aiPct,
        overall: overallInstant,
      });
      return;
    }

    const from = { ...animatedView };
    const to = {
      totalUsers: rawTotalUsers,
      clusterPct,
      modelPct,
      aiPct,
      overall: Math.round((clusterPct + modelPct + aiPct) / 3),
    };
    const durationMs = 900;
    const start = performance.now();
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (ts) => {
      const t = Math.min(1, (ts - start) / durationMs);
      const e = easeOutCubic(t);
      setAnimatedView({
        totalUsers: Math.round(from.totalUsers + (to.totalUsers - from.totalUsers) * e),
        clusterPct: from.clusterPct + (to.clusterPct - from.clusterPct) * e,
        modelPct: from.modelPct + (to.modelPct - from.modelPct) * e,
        aiPct: from.aiPct + (to.aiPct - from.aiPct) * e,
        overall: Math.round(from.overall + (to.overall - from.overall) * e),
      });
      if (t < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [rawTotalUsers, clusterPct, modelPct, aiPct]);

  const animatedClusterPct = pct(animatedView.clusterPct);
  const animatedModelPct = pct(animatedView.modelPct);
  const animatedAiPct = pct(animatedView.aiPct);
  const kpiItems = [
    {
      label: "Cluster Quality",
      value: animatedClusterPct,
      target: 100,
      color: "#75adff",
      route: "/kpi/cluster-quality",
      helper: "Coerenza tra utenti e cluster proposti.",
    },
    {
      label: "Model Score",
      value: animatedModelPct,
      target: 100,
      color: "#ff8ea7",
      route: "/model-quality",
      helper: "Precisione complessiva del modello.",
    },
    {
      label: "AI Detection",
      value: animatedAiPct,
      target: 0,
      color: "#7effc2",
      route: "/ai-detection",
      helper: "Capacita di rilevare anomalie e deviazioni.",
    },
  ];
  const routeByLabel = Object.fromEntries(kpiItems.map((item) => [item.label, item.route]));
  const gapFor = (item) => Math.abs((Number(item.target) || 0) - (Number(item.value) || 0));
  const rankedByGap = [...kpiItems].sort((a, b) => gapFor(b) - gapFor(a));
  const rankedByGapCard = [...kpiItems].sort((a, b) => {
    if (a.label === "Model Score" && b.label !== "Model Score") return -1;
    if (b.label === "Model Score" && a.label !== "Model Score") return 1;
    return gapFor(b) - gapFor(a);
  });
  const railItems = [...rankedByGap];
  const biggestGap = rankedByGap[0];
  const focusItem = biggestGap || kpiItems[0];
  const overall = animatedView.overall;
  const discoveryResults = connectorCfg?.discovery_results || {};
  const connectorMeta = {
    sap: "SAP",
    ad: "AD",
    azure: "Azure AD",
    one_identity: "One Identity",
    sailpoint: "SailPoint",
    saviynt: "Saviynt",
    servicenow: "ServiceNow",
    salesforce: "Salesforce",
    m365: "Microsoft 365",
    csv: "CSV",
  };
  const connectorUsage = Object.entries(discoveryResults)
    .filter(([, value]) => Boolean(value?.last_run_at))
    .map(([key]) => ({
      key,
      label: connectorMeta[key] || key.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const radarData = [
    {
      type: "scatterpolar",
      mode: "lines+markers",
      r: [...kpiItems.map((item) => item.value), kpiItems[0].value],
      theta: [...kpiItems.map((item) => item.label), kpiItems[0].label],
      fill: "toself",
      fillcolor: "rgba(106,166,255,0.24)",
      line: { color: "#8ab8ff", width: 2.2 },
      marker: {
        size: 9,
        color: kpiItems.map((item) => item.color).concat([kpiItems[0].color]),
      },
      customdata: [...kpiItems.map((item) => [gapFor(item), item.helper]), [gapFor(kpiItems[0]), kpiItems[0].helper]],
      hovertemplate:
        "<b>%{theta}</b><br>Score: %{r:.0f}%<br>Gap: %{customdata[0]:.0f}%<br>%{customdata[1]}<extra></extra>",
      showlegend: false,
    },
  ];

  const gapData = [
    {
      type: "bar",
      orientation: "h",
      x: rankedByGapCard.map((item) => gapFor(item)),
      y: rankedByGapCard.map((item) => item.label),
      marker: {
        color: rankedByGapCard.map((item) => item.color),
        line: { color: "rgba(255,255,255,0.28)", width: 1 },
      },
      customdata: rankedByGapCard.map((item) => [item.value]),
      hovertemplate:
        "<b>%{y}</b><br>Gap: %{x:.0f}%<br>Score corrente: %{customdata[0]:.0f}%<extra></extra>",
    },
  ];

  return (
    <div className="main analytics-main">
      <div className="analytics-headline">
        <h2 style={{ marginTop: 0, marginBottom: 6 }}>Analytics</h2>
        <div className="analytics-subtitle">Cockpit KPI orientato all'azione con insight contestuali su hover</div>
      </div>

      <div className="analytics-hero">
        <div className="analytics-widget analytics-widget--hero analytics-card-enter" style={{ "--reveal-delay": "40ms" }}>
          <div className="analytics-widget__label">Total Users</div>
          <div className="analytics-widget__value analytics-widget__value--animated">{animatedView.totalUsers}</div>
          <div className="analytics-hero-meta">
            <span>Overall Score {overall}%</span>
            {connectorUsage.map((c) => (
              <span key={c.key}>{c.label}</span>
            ))}
            <span style={{ color: focusItem.color }}>Focus Area: {focusItem.label} (target {focusItem.target}%)</span>
          </div>
        </div>
        <div className="analytics-widget analytics-widget--focus analytics-card-enter" style={{ "--reveal-delay": "120ms" }}>
          <div className="analytics-widget__label">Current Focus</div>
          <div className="analytics-focus-title">{focusItem.label}</div>
          <div className="analytics-focus-helper">Target operativo: portare il valore verso {focusItem.target}%.</div>
          <div style={{ marginTop: "auto", alignSelf: "flex-start", display: "flex", gap: 10 }}>
            <button className="analytics-focus-btn" style={{ marginTop: 0 }} onClick={() => navigate(focusItem.route)}>
              Apri analisi prioritaria
            </button>
            <button className="analytics-focus-btn" style={{ marginTop: 0 }} onClick={() => navigate("/cluster")}>
              Role Modeling
            </button>
          </div>
        </div>
      </div>

      <div className="analytics-chart-layout">
        <div className="panel analytics-plot-panel analytics-card-enter" style={{ "--reveal-delay": "200ms" }}>
          <div className="analytics-plot-head">
            <div className="analytics-plot-title">KPI Landscape</div>
            <div className="analytics-plot-subtitle">Radar interattivo: hover per dettagli, click sul punto per drill-down.</div>
          </div>
          <Suspense fallback={<div style={{ height: 310 }} />}>
            <Plot
              data={radarData}
              layout={{
                autosize: true,
                paper_bgcolor: "rgba(5,10,20,0)",
                plot_bgcolor: "rgba(7,14,28,0.70)",
                font: { color: "#e9eefc" },
                margin: { l: 26, r: 20, t: 8, b: 14 },
                polar: {
                  bgcolor: "rgba(7,14,28,0.70)",
                  radialaxis: {
                    range: [0, 100],
                    ticksuffix: "%",
                    gridcolor: "rgba(255,255,255,0.12)",
                    linecolor: "rgba(255,255,255,0.15)",
                  },
                  angularaxis: {
                    gridcolor: "rgba(255,255,255,0.10)",
                  },
                },
                showlegend: false,
                transition: { duration: 520, easing: "cubic-in-out" },
              }}
              useResizeHandler
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: 310 }}
              onClick={(ev) => {
                const label = ev?.points?.[0]?.theta;
                const route = routeByLabel[label];
                if (route) navigate(route);
              }}
            />
          </Suspense>
        </div>

        <div className="panel analytics-plot-panel analytics-card-enter" style={{ "--reveal-delay": "280ms" }}>
          <div className="analytics-plot-head">
            <div className="analytics-plot-title">Target Gap Ranking</div>
            <div className="analytics-plot-subtitle">Classifica aree per distanza dal target; priorita in alto.</div>
          </div>
          <Suspense fallback={<div style={{ height: 310 }} />}>
            <Plot
              data={gapData}
              layout={{
                autosize: true,
                paper_bgcolor: "rgba(5,10,20,0)",
                plot_bgcolor: "rgba(7,14,28,0.70)",
                font: { color: "#e9eefc" },
                margin: { l: 124, r: 10, t: 8, b: 30 },
                xaxis: {
                  range: [0, 100],
                  ticksuffix: "%",
                  gridcolor: "rgba(255,255,255,0.10)",
                  zeroline: false,
                },
                yaxis: {
                  autorange: "reversed",
                  automargin: true,
                  ticklabelposition: "outside",
                  ticklabelstandoff: 16,
                  tickfont: { size: 12 },
                },
                showlegend: false,
                transition: { duration: 520, easing: "cubic-in-out" },
              }}
              useResizeHandler
              config={{ displayModeBar: false, responsive: true }}
              style={{ width: "100%", height: 310 }}
              onClick={(ev) => {
                const label = ev?.points?.[0]?.y;
                const route = routeByLabel[label];
                if (route) navigate(route);
              }}
            />
          </Suspense>
        </div>
      </div>

      <div className="analytics-rail">
        {railItems.map((item, idx) => (
          <button
            key={item.label}
            className="analytics-rail-card analytics-widget--clickable analytics-card-enter"
            style={{ "--reveal-delay": `${320 + idx * 70}ms` }}
            onClick={() => navigate(item.route)}
          >
            <div className="analytics-rail-rank">#{idx + 1}</div>
            <div>
              <div className="analytics-rail-label">{item.label}</div>
              <div className="analytics-rail-meta">
                {`Score ${Math.round(Number(item.value) || 0)}% • `}
                {idx === 0 ? "Priorita alta" : idx === railItems.length - 1 ? "Stabile" : "Da monitorare"}
              </div>
            </div>
            <div className="analytics-rail-arrow" style={{ color: item.color }}>Apri</div>
          </button>
        ))}
      </div>

      {err && <div className="err">{err}</div>}
    </div>
  );
}

function Connettori() {
  const [cfg, setCfg] = useState({
    server: "mock",
    bind_user: "",
    bind_password: "",
    base_dn: "",
    auth: "SIMPLE",
    sap_base_url: "",
    sap_auth_mode: "AUTO",
    sap_client: "",
    sap_system: "",
    sap_username: "",
    sap_password: "",
    sap_api_key: "",
    sap_token_url: "",
    sap_client_id: "",
    sap_client_secret: "",
    sap_oauth_scope: "",
    sap_company_id: "",
    sap_users_path: "/sap/opu/odata/sap/ZROLE_MINING_SRV/Users",
    azure_base_url: "https://graph.microsoft.com",
    azure_tenant_id: "",
    azure_client_id: "",
    azure_client_secret: "",
    azure_users_path: "/v1.0/users?$select=id,displayName,userPrincipalName,mail,department,accountEnabled",
    one_identity_base_url: "https://<host>/AppServer",
    one_identity_token_url: "",
    one_identity_client_id: "",
    one_identity_client_secret: "",
    one_identity_username: "",
    one_identity_password: "",
    one_identity_users_path: "/api/entities/person?limit=100",
    sailpoint_base_url: "https://<tenant>.api.identitynow.com/v3",
    sailpoint_token_url: "",
    sailpoint_client_id: "",
    sailpoint_client_secret: "",
    sailpoint_users_path: "/accounts",
    saviynt_base_url: "",
    saviynt_token_url: "",
    saviynt_client_id: "",
    saviynt_client_secret: "",
    saviynt_username: "",
    saviynt_password: "",
    saviynt_users_path: "",
    servicenow_base_url: "",
    servicenow_username: "",
    servicenow_password: "",
    servicenow_users_path: "/api/now/table/sys_user?sysparm_fields=sys_id,user_name,name,email,department,active",
    salesforce_base_url: "",
    salesforce_token_url: "https://login.salesforce.com/services/oauth2/token",
    salesforce_client_id: "",
    salesforce_client_secret: "",
    salesforce_users_path: "/services/data/v60.0/query?q=SELECT+Id,Name,Username,Email,Department,IsActive+FROM+User",
    m365_base_url: "https://graph.microsoft.com",
    m365_tenant_id: "",
    m365_client_id: "",
    m365_client_secret: "",
    m365_users_path: "/v1.0/users?$select=id,displayName,userPrincipalName,mail,department,accountEnabled",
    connector_provisioning: {},
    discovery_schedules: {},
    discovery_results: {},
  });
  const [ou, setOu] = useState("OU=Users,DC=example,DC=local");
  const [statusMsg, setStatusMsg] = useState("");
  const [sapStatusMsg, setSapStatusMsg] = useState("");
  const [cfgStatusMsg, setCfgStatusMsg] = useState("");
  const [err, setErr] = useState("");
  const [adLoading, setAdLoading] = useState(false);
  const [sapLoading, setSapLoading] = useState(false);
  const [adExporting, setAdExporting] = useState(false);
  const [cfgSaving, setCfgSaving] = useState(false);

  const [csvFile, setCsvFile] = useState(null);
  const [importMsg, setImportMsg] = useState("");
  const [csvLoading, setCsvLoading] = useState(false);
  const [discoveryLoadingTarget, setDiscoveryLoadingTarget] = useState("");
  const [provisioningLoadingTarget, setProvisioningLoadingTarget] = useState("");
  const [provisioningMsg, setProvisioningMsg] = useState("");
  const [sapBulkCount, setSapBulkCount] = useState(100);
  const [sapBulkGroups, setSapBulkGroups] = useState(20);
  const [sapBulkDepartment, setSapBulkDepartment] = useState("SAP Bulk Department");
  const [sapBulkLoading, setSapBulkLoading] = useState(false);
  const [sapBulkMsg, setSapBulkMsg] = useState("");
  const [scheduleModal, setScheduleModal] = useState({ open: false, target: "" });
  const [resultModal, setResultModal] = useState({ open: false, target: "" });
  const [scheduleForm, setScheduleForm] = useState({
    frequency: "DAILY",
    time: "09:00",
    day: "MON",
    enabled: true,
  });



  async function load() {
    try {
      setErr("");
      const c = await api.getConnector();
      setCfg((prev) => ({ ...prev, ...(c || {}) }));
      if (c?.base_dn) {
        setOu(c.base_dn);
      }
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);

  const connectorLabels = {
    sap: "SAP",
    ad: "Active Directory",
    azure: "Azure AD",
    one_identity: "One Identity",
    sailpoint: "SailPoint",
    saviynt: "Saviynt",
    servicenow: "ServiceNow",
    salesforce: "Salesforce",
    m365: "Microsoft 365",
    csv: "CSV",
  };

  async function saveCfg(msg = "Configurazione salvata.", opts = {}) {
    const { silent = false, overrideCfg = null } = opts;
    setCfgSaving(true);
    try {
      setErr("");
      if (!silent) setCfgStatusMsg("");
      await api.setConnector(overrideCfg || cfg);
      if (!silent) setCfgStatusMsg(msg);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setCfgSaving(false);
    }
  }

  async function doExtract() {
    setAdLoading(true);
    try {
      setErr(""); setStatusMsg("");
      const res = await api.extract(ou);
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const parts = [
        ["Nuovi utenti", n(res.new_users)],
        ["Nuovi gruppi", n(res.new_groups)],
        ["Utenti aggiornati", n(res.updated_users)],
        ["Aggiornati per displayName", n(res.updated_by_displayname ?? res.updated_users)],
        ["Gruppi aggiornati", n(res.updated_groups)],
      ]
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${label}: ${value}`);
      const message = (
        `Snapshot AD completato.` +
        `${parts.length ? ` ${parts.join(", ")}.` : ""}` +
        ` Logiche in background in esecuzione.`
      );
      setStatusMsg(message);
      return { message, res };
    } catch (e) {
      setErr(String(e.message || e));
      throw e;
    } finally {
      setAdLoading(false);
    }
  }

  async function doSapExtract() {
    setSapLoading(true);
    try {
      setErr(""); setSapStatusMsg("");
      const scope = (cfg.sap_system || "").trim() || "SAP";
      const res = await api.sapExtract(scope);
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const parts = [
        ["Nuovi utenti", n(res.new_users)],
        ["Nuovi gruppi", n(res.new_groups)],
        ["Utenti aggiornati", n(res.updated_users)],
        ["Aggiornati per displayName", n(res.updated_by_displayname ?? res.updated_users)],
        ["Gruppi aggiornati", n(res.updated_groups)],
      ]
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${label}: ${value}`);
      const message = (
        `Snapshot SAP completato.` +
        `${parts.length ? ` ${parts.join(", ")}.` : ""}` +
        ` Logiche in background in esecuzione.`
      );
      setSapStatusMsg(message);
      return { message, res };
    } catch (e) {
      setErr(String(e.message || e));
      throw e;
    } finally {
      setSapLoading(false);
    }
  }

  async function doCsvDiscovery() {
    if (!csvFile) {
      setImportMsg("Seleziona un file CSV prima della Discovery.");
      throw new Error("CSV non selezionato");
    }
    setCsvLoading(true);
    try {
      setImportMsg("");
      const out = await importBusinessRolesCsv(csvFile);
      const n = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);
      const parts = [
        ["Righe importate", n(out.rowsTotal ?? out.csvRowsTotal)],
        ["Nuovi utenti", n(out.addedUsers ?? out.rowsKept)],
        ["Aggiornati per displayName", n(out.updatedByDisplayName ?? out.updatedUsers)],
        ["Valori duplicati", n(out.csvDuplicateDisplayNameRows ?? out.duplicateDisplayName)],
        ["Valori incompleti", n(out.csvRowsMissingBR ?? out.missingBusinessRole)],
      ]
        .filter(([, value]) => value > 0)
        .map(([label, value]) => `${label}: ${value}`);
      const message = (
        `Discovery CSV completata.` +
        `${parts.length ? ` ${parts.join(", ")}.` : ""}` +
        `${out.processingInBackground ? " Logiche in background in esecuzione." : ""}`
      );
      setImportMsg(message);
      return { message, out };
    } catch (e) {
      const msg = `Discovery KO: ${e?.message ?? String(e)}`;
      setImportMsg(msg);
      throw e;
    } finally {
      setCsvLoading(false);
    }
  }

  async function persistDiscoveryResult(target, payload) {
    const { status, message, source = "manual", summary = {}, csv_available = true } = payload || {};
    const nextCfg = {
      ...cfg,
      discovery_results: {
        ...(cfg.discovery_results || {}),
        [target]: {
          status: status || "ok",
          message: message || "",
          summary,
          csv_available: !!csv_available,
          source,
          last_run_at: new Date().toISOString(),
        },
      },
    };
    setCfg(nextCfg);
    await saveCfg("", { silent: true, overrideCfg: nextCfg });
  }

  async function runDiscovery(target) {
    setDiscoveryLoadingTarget(target);
    try {
      setErr("");
      if (target !== "csv") {
        await saveCfg("", { silent: true });
      }
      if (target === "sap") {
        const { message, res } = await doSapExtract();
        await persistDiscoveryResult(target, {
          status: "ok",
          message,
          source: "manual",
          summary: {
            users: Number(res?.total_users || 0),
            groups: Number(res?.total_groups || 0),
            new_users: Number(res?.new_users || 0),
            updated_users: Number(res?.updated_users || 0),
            updated_by_displayname: Number(res?.updated_by_displayname || 0),
            new_groups: Number(res?.new_groups || 0),
            updated_groups: Number(res?.updated_groups || 0),
          },
          csv_available: true,
        });
        return;
      }
      if (target === "ad") {
        const { message, res } = await doExtract();
        await persistDiscoveryResult(target, {
          status: "ok",
          message,
          source: "manual",
          summary: {
            users: Number(res?.total_users || 0),
            groups: Number(res?.total_groups || 0),
            new_users: Number(res?.new_users || 0),
            updated_users: Number(res?.updated_users || 0),
            updated_by_displayname: Number(res?.updated_by_displayname || 0),
            new_groups: Number(res?.new_groups || 0),
            updated_groups: Number(res?.updated_groups || 0),
          },
          csv_available: true,
        });
        return;
      }
      if (target === "csv") {
        const { message, out } = await doCsvDiscovery();
        await persistDiscoveryResult(target, {
          status: "ok",
          message,
          source: "manual",
          summary: {
            rows_imported: Number(out?.rowsTotal ?? out?.csvRowsTotal ?? 0),
            new_users: Number(out?.addedUsers ?? out?.rowsKept ?? 0),
            updated_by_displayname: Number(out?.updatedByDisplayName ?? out?.updatedUsers ?? 0),
            duplicate_values: Number(out?.csvDuplicateDisplayNameRows ?? out?.duplicateDisplayName ?? 0),
            incomplete_values: Number(out?.csvRowsMissingBR ?? out?.missingBusinessRole ?? 0),
          },
          csv_available: true,
        });
        return;
      }
      const res = await api.connectorExtract(target, "");
      const n = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
      const label = connectorLabels[target] || target;
      const msg = (
        `Discovery ${label} completata.` +
        ` Users: ${n(res?.total_users)}.` +
        ` Groups: ${n(res?.total_groups)}.` +
        ` New users: ${n(res?.new_users)}.` +
        ` Updated users: ${n(res?.updated_users)}.`
      );
      setCfgStatusMsg(msg);
      await persistDiscoveryResult(target, {
        status: "ok",
        message: msg,
        source: "manual",
        summary: {
          users: n(res?.total_users),
          groups: n(res?.total_groups),
          new_users: n(res?.new_users),
          updated_users: n(res?.updated_users),
          updated_by_displayname: n(res?.updated_by_displayname),
          new_groups: n(res?.new_groups),
          updated_groups: n(res?.updated_groups),
        },
        csv_available: true,
      });
    } catch (e) {
      const msg = String(e?.message || e);
      await persistDiscoveryResult(target, {
        status: "error",
        message: msg,
        source: "manual",
        summary: {},
        csv_available: false,
      });
    } finally {
      setDiscoveryLoadingTarget("");
    }
  }

  async function runProvisioning(target) {
    setProvisioningLoadingTarget(target);
    try {
      setErr("");
      setProvisioningMsg("");
      const out = await api.connectorProvision(target);
      const changed = Number(out?.changed_users || 0);
      const removed = Number(out?.removed_users || 0);
      const total = Number(out?.total_users || 0);
      const ds = out?.datasource || (connectorLabels[target] || target);
      const summary = [
        `DataSource ${ds}`,
        `Users in scope: ${total}`,
        `Changed: ${changed}`,
        `Removed: ${removed}`,
      ].join(" | ");
      const msg = out?.message ? `${out.message} ${summary}` : summary;
      setProvisioningMsg(msg);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setProvisioningLoadingTarget("");
    }
  }

  async function runSapBulkProvision() {
    setSapBulkLoading(true);
    try {
      setErr("");
      setSapBulkMsg("");
      await saveCfg("", { silent: true });
      const out = await api.sapBulkProvision({
        count: Math.max(1, Number(sapBulkCount) || 100),
        groups_per_user: Math.max(1, Number(sapBulkGroups) || 20),
        department: String(sapBulkDepartment || "SAP Bulk Department").trim() || "SAP Bulk Department",
        business_role: "SAP Bulk Role",
      });
      const uploaded = Number(out?.uploaded_users || 0);
      const failed = Number(out?.failed_users || 0);
      const generated = Number(out?.generated_users || 0);
      const msg = `SAP bulk upload completed. Generated: ${generated} | Uploaded: ${uploaded} | Failed: ${failed}`;
      setSapBulkMsg(msg);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSapBulkLoading(false);
    }
  }

  function openScheduleModal(target) {
    const current = (cfg.discovery_schedules || {})[target] || {};
    setScheduleForm({
      frequency: current.frequency || "DAILY",
      time: current.time || "09:00",
      day: current.day || "MON",
      enabled: current.enabled !== false,
    });
    setScheduleModal({ open: true, target });
  }

  function closeScheduleModal() {
    setScheduleModal({ open: false, target: "" });
  }

  function openResultModal(target) {
    setResultModal({ open: true, target });
  }

  function closeResultModal() {
    setResultModal({ open: false, target: "" });
  }

  async function saveSchedule(e) {
    e.preventDefault();
    const target = scheduleModal.target;
    if (!target) return;
    const nextCfg = {
      ...cfg,
      discovery_schedules: {
        ...(cfg.discovery_schedules || {}),
        [target]: {
          ...scheduleForm,
          updated_at: new Date().toISOString(),
        },
      },
    };
    setCfg(nextCfg);
    await saveCfg(`Schedulazione Discovery salvata per ${connectorLabels[target] || target}.`, { overrideCfg: nextCfg });
    closeScheduleModal();
  }

  function renderConnectorActions(target, saveMessage) {
    const loading = discoveryLoadingTarget === target;
    const provisioningLoading = provisioningLoadingTarget === target;
    return (
      <div className="row connector-form-actions" style={{ marginTop: 10 }}>
        <button className="primary" onClick={() => saveCfg(saveMessage)} disabled={cfgSaving}>Salva</button>
        <button className="primary" onClick={() => runDiscovery(target)} disabled={cfgSaving || loading}>
          {loading ? "Discovery..." : "Discovery"}
        </button>
        <button
          className="primary"
          onClick={() => runProvisioning(target)}
          disabled={cfgSaving || loading || provisioningLoading}
        >
          {provisioningLoading ? "Provisioning..." : "Provision"}
        </button>
        <button className="primary" onClick={() => openScheduleModal(target)} disabled={cfgSaving || loading}>Schedule</button>
        <button className="primary" onClick={() => openResultModal(target)} disabled={cfgSaving}>Esito</button>
      </div>
    );
  }

  const updateCfg = (patch) => setCfg((prev) => ({ ...prev, ...patch }));

  async function downloadLastAdExtractCsv() {
    try {
      setErr("");
      setAdExporting(true);
      const { blob, filename } = await exportLastAdExtractCsv();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || "ad_extract_snapshot.csv";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setAdExporting(false);
    }
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Connettori</h2>
      <div style={{ color: "var(--muted)", marginBottom: 12 }}>
        Lista per categoria con un solo connettore per target.
      </div>

      <details className="connector-category">
        <summary>
          <span>HRIS</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>SAP Connector</h3>
            <div className="row">
              <input
                style={{ width: 360 }}
                value={cfg.sap_base_url || ""}
                onChange={(e) => updateCfg({ sap_base_url: e.target.value })}
                placeholder="SAP Base URL (es: https://sap.company.local)"
                aria-label="SAP Base URL"
              />
              <select
                style={{ width: 140 }}
                value={cfg.sap_auth_mode || "AUTO"}
                onChange={(e) => updateCfg({ sap_auth_mode: e.target.value })}
                aria-label="SAP Auth Mode"
              >
                <option value="AUTO">AUTO</option>
                <option value="OAUTH2">OAUTH2</option>
                <option value="APIKEY">APIKEY</option>
                <option value="BASIC">BASIC</option>
              </select>
              <input
                style={{ width: 120 }}
                value={cfg.sap_client || ""}
                onChange={(e) => updateCfg({ sap_client: e.target.value })}
                placeholder="Client (es: 100)"
                aria-label="SAP Client"
              />
              <input
                style={{ width: 180 }}
                value={cfg.sap_system || ""}
                onChange={(e) => updateCfg({ sap_system: e.target.value })}
                placeholder="System (es: ECC)"
                aria-label="SAP System"
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                style={{ width: 540 }}
                value={cfg.sap_users_path || ""}
                onChange={(e) => updateCfg({ sap_users_path: e.target.value })}
                placeholder="Users API Path (es: /sap/opu/odata/sap/ZROLE_MINING_SRV/Users)"
                aria-label="SAP Users API Path"
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                style={{ width: 260 }}
                value={cfg.sap_username || ""}
                onChange={(e) => updateCfg({ sap_username: e.target.value })}
                placeholder="SAP Username"
                aria-label="SAP Username"
              />
              <input
                style={{ width: 260 }}
                value={cfg.sap_password || ""}
                onChange={(e) => updateCfg({ sap_password: e.target.value })}
                placeholder="SAP Password"
                type="password"
                aria-label="SAP Password"
              />
              <input
                style={{ width: 260 }}
                value={cfg.sap_api_key || ""}
                onChange={(e) => updateCfg({ sap_api_key: e.target.value })}
                placeholder="SAP API Key (opzionale)"
                type="password"
                aria-label="SAP API Key"
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                style={{ width: 360 }}
                value={cfg.sap_token_url || ""}
                onChange={(e) => updateCfg({ sap_token_url: e.target.value })}
                placeholder="OAuth Token URL (es: https://<host>/oauth/token)"
                aria-label="SAP OAuth Token URL"
              />
              <input
                style={{ width: 180 }}
                value={cfg.sap_client_id || ""}
                onChange={(e) => updateCfg({ sap_client_id: e.target.value })}
                placeholder="OAuth Client ID"
                aria-label="SAP OAuth Client ID"
              />
              <input
                style={{ width: 180 }}
                value={cfg.sap_client_secret || ""}
                onChange={(e) => updateCfg({ sap_client_secret: e.target.value })}
                placeholder="OAuth Client Secret"
                type="password"
                aria-label="SAP OAuth Client Secret"
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                style={{ width: 180 }}
                value={cfg.sap_oauth_scope || ""}
                onChange={(e) => updateCfg({ sap_oauth_scope: e.target.value })}
                placeholder="OAuth Scope (opz.)"
                aria-label="SAP OAuth Scope"
              />
              <input
                style={{ width: 180 }}
                value={cfg.sap_company_id || ""}
                onChange={(e) => updateCfg({ sap_company_id: e.target.value })}
                placeholder="SuccessFactors Company ID (opz.)"
                aria-label="SAP SuccessFactors Company ID"
              />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                style={{ width: 120 }}
                type="number"
                min={1}
                value={sapBulkCount}
                onChange={(e) => setSapBulkCount(e.target.value)}
                placeholder="Users"
                aria-label="SAP Bulk Users"
              />
              <input
                style={{ width: 140 }}
                type="number"
                min={1}
                value={sapBulkGroups}
                onChange={(e) => setSapBulkGroups(e.target.value)}
                placeholder="Groups per user"
                aria-label="SAP Bulk Groups"
              />
              <input
                style={{ width: 320 }}
                value={sapBulkDepartment}
                onChange={(e) => setSapBulkDepartment(e.target.value)}
                placeholder="Department"
                aria-label="SAP Bulk Department"
              />
              <button className="primary" onClick={runSapBulkProvision} disabled={cfgSaving || sapBulkLoading}>
                {sapBulkLoading ? "Uploading..." : "Upload Bulk Users"}
              </button>
            </div>
            {renderConnectorActions("sap", "Configurazione SAP salvata.")}
            {sapStatusMsg && <div className="ok">{sapStatusMsg}</div>}
            {sapBulkMsg && <div className="ok">{sapBulkMsg}</div>}
            <div className="connector-loadingbar" aria-hidden="true">
              <div className={`connector-loadingbar__fill${(sapLoading || cfgSaving || sapBulkLoading) ? " is-active" : ""}`} />
            </div>
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>IDP</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Azure AD Connector</h3>
            <div className="row">
              <input style={{ width: 320 }} value={cfg.azure_base_url || ""} onChange={(e) => updateCfg({ azure_base_url: e.target.value })} placeholder="Base URL (es: https://graph.microsoft.com)" />
              <input style={{ width: 220 }} value={cfg.azure_tenant_id || ""} onChange={(e) => updateCfg({ azure_tenant_id: e.target.value })} placeholder="Tenant ID" />
              <input style={{ width: 220 }} value={cfg.azure_client_id || ""} onChange={(e) => updateCfg({ azure_client_id: e.target.value })} placeholder="Client ID" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 320 }} value={cfg.azure_client_secret || ""} onChange={(e) => updateCfg({ azure_client_secret: e.target.value })} placeholder="Client Secret" type="password" />
              <input style={{ width: 540 }} value={cfg.azure_users_path || ""} onChange={(e) => updateCfg({ azure_users_path: e.target.value })} placeholder="Users Path (es: /v1.0/users?$select=...)" />
            </div>
            {renderConnectorActions("azure", "Configurazione Azure AD salvata.")}
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>IGA</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>One Identity Connector</h3>
            <div className="row">
              <input style={{ width: 360 }} value={cfg.one_identity_base_url || ""} onChange={(e) => updateCfg({ one_identity_base_url: e.target.value })} placeholder="Base URL (es: https://<host>/AppServer)" />
              <input style={{ width: 320 }} value={cfg.one_identity_token_url || ""} onChange={(e) => updateCfg({ one_identity_token_url: e.target.value })} placeholder="Token URL (opzionale/OIDC)" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 220 }} value={cfg.one_identity_client_id || ""} onChange={(e) => updateCfg({ one_identity_client_id: e.target.value })} placeholder="Client ID" />
              <input style={{ width: 220 }} value={cfg.one_identity_client_secret || ""} onChange={(e) => updateCfg({ one_identity_client_secret: e.target.value })} placeholder="Client Secret" type="password" />
              <input style={{ width: 220 }} value={cfg.one_identity_username || ""} onChange={(e) => updateCfg({ one_identity_username: e.target.value })} placeholder="Username (opzionale)" />
              <input style={{ width: 220 }} value={cfg.one_identity_password || ""} onChange={(e) => updateCfg({ one_identity_password: e.target.value })} placeholder="Password (opzionale)" type="password" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 620 }} value={cfg.one_identity_users_path || ""} onChange={(e) => updateCfg({ one_identity_users_path: e.target.value })} placeholder="Users Path (es: /api/entities/person?limit=100)" />
            </div>
            {renderConnectorActions("one_identity", "Configurazione One Identity salvata.")}

            <hr className="sep" />

            <h3 style={{ marginTop: 0 }}>SailPoint Connector</h3>
            <div className="row">
              <input style={{ width: 360 }} value={cfg.sailpoint_base_url || ""} onChange={(e) => updateCfg({ sailpoint_base_url: e.target.value })} placeholder="Base URL (es: https://<tenant>.api.identitynow.com/v3)" />
              <input style={{ width: 320 }} value={cfg.sailpoint_token_url || ""} onChange={(e) => updateCfg({ sailpoint_token_url: e.target.value })} placeholder="Token URL (es: https://<tenant>.api.identitynow.com/oauth/token)" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 220 }} value={cfg.sailpoint_client_id || ""} onChange={(e) => updateCfg({ sailpoint_client_id: e.target.value })} placeholder="Client ID" />
              <input style={{ width: 220 }} value={cfg.sailpoint_client_secret || ""} onChange={(e) => updateCfg({ sailpoint_client_secret: e.target.value })} placeholder="Client Secret" type="password" />
              <input style={{ width: 420 }} value={cfg.sailpoint_users_path || ""} onChange={(e) => updateCfg({ sailpoint_users_path: e.target.value })} placeholder="Users Path (es: /accounts)" />
            </div>
            {renderConnectorActions("sailpoint", "Configurazione SailPoint salvata.")}

            <hr className="sep" />

            <h3 style={{ marginTop: 0 }}>Saviynt Connector</h3>
            <div className="row">
              <input style={{ width: 360 }} value={cfg.saviynt_base_url || ""} onChange={(e) => updateCfg({ saviynt_base_url: e.target.value })} placeholder="Base URL (tenant-specific Saviynt API)" />
              <input style={{ width: 320 }} value={cfg.saviynt_token_url || ""} onChange={(e) => updateCfg({ saviynt_token_url: e.target.value })} placeholder="Token URL (tenant-specific, se previsto)" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 220 }} value={cfg.saviynt_client_id || ""} onChange={(e) => updateCfg({ saviynt_client_id: e.target.value })} placeholder="Client ID" />
              <input style={{ width: 220 }} value={cfg.saviynt_client_secret || ""} onChange={(e) => updateCfg({ saviynt_client_secret: e.target.value })} placeholder="Client Secret" type="password" />
              <input style={{ width: 220 }} value={cfg.saviynt_username || ""} onChange={(e) => updateCfg({ saviynt_username: e.target.value })} placeholder="Service Username" />
              <input style={{ width: 220 }} value={cfg.saviynt_password || ""} onChange={(e) => updateCfg({ saviynt_password: e.target.value })} placeholder="Service Password" type="password" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 620 }} value={cfg.saviynt_users_path || ""} onChange={(e) => updateCfg({ saviynt_users_path: e.target.value })} placeholder="Users Path (tenant-specific, vedi doc Saviynt)" />
            </div>
            {renderConnectorActions("saviynt", "Configurazione Saviynt salvata.")}
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>Directories</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Active Directory Connector</h3>
            <div className="row">
              <input
                style={{ width: 260 }}
                value={cfg.server}
                onChange={(e) => updateCfg({ server: e.target.value })}
                placeholder="server (es: ad.local o mock)"
                aria-label="AD Server Address"
              />
              <select value={cfg.auth} onChange={(e) => updateCfg({ auth: e.target.value })}>
                <option value="SIMPLE">SIMPLE</option>
                <option value="NTLM">NTLM</option>
              </select>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input
                type="number"
                style={{ width: 120 }}
                value={cfg.port || ""}
                onChange={(e) => updateCfg({ port: e.target.value })}
                placeholder="Port (389)"
              />
              <label style={{ display: "flex", alignItems: "center", marginLeft: 10, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={!!cfg.use_ssl}
                  onChange={(e) => updateCfg({ use_ssl: e.target.checked })}
                  style={{ marginRight: 6 }}
                />
                Usa SSL
              </label>
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 260 }} value={cfg.bind_user} onChange={(e) => updateCfg({ bind_user: e.target.value })} placeholder="bind_user" />
              <input style={{ width: 260 }} value={cfg.bind_password} onChange={(e) => updateCfg({ bind_password: e.target.value })} placeholder="bind_password" type="password" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 540 }} value={cfg.base_dn} onChange={(e) => updateCfg({ base_dn: e.target.value })} placeholder="base_dn (opzionale qui)" />
            </div>
            {renderConnectorActions("ad", "Configurazione AD salvata.")}
            <hr className="sep" />
            <div className="row">
              <input style={{ width: 540 }} value={ou} onChange={(e) => setOu(e.target.value)} placeholder="OU DN" />
              <button
                className="primary"
                title="Scarica ultima estrazione AD (CSV)"
                aria-label="Scarica ultima estrazione AD in CSV"
                onClick={downloadLastAdExtractCsv}
                disabled={adExporting}
                style={{ padding: "10px 12px", display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 44 }}
              >
                <svg
                  viewBox="0 0 24 24"
                  width="18"
                  height="18"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 3v11" />
                  <path d="m7 10 5 5 5-5" />
                  <path d="M4 21h16" />
                </svg>
              </button>
            </div>
            {statusMsg && <div className="ok">{statusMsg}</div>}
            <div className="connector-loadingbar" aria-hidden="true">
              <div className={`connector-loadingbar__fill${(adLoading || adExporting || cfgSaving) ? " is-active" : ""}`} />
            </div>
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>ITSM</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>ServiceNow Connector</h3>
            <div className="row">
              <input style={{ width: 420 }} value={cfg.servicenow_base_url || ""} onChange={(e) => updateCfg({ servicenow_base_url: e.target.value })} placeholder="Base URL (es: https://instance.service-now.com)" />
              <input style={{ width: 220 }} value={cfg.servicenow_username || ""} onChange={(e) => updateCfg({ servicenow_username: e.target.value })} placeholder="Username" />
              <input style={{ width: 220 }} value={cfg.servicenow_password || ""} onChange={(e) => updateCfg({ servicenow_password: e.target.value })} placeholder="Password" type="password" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 620 }} value={cfg.servicenow_users_path || ""} onChange={(e) => updateCfg({ servicenow_users_path: e.target.value })} placeholder="Users Path (es: /api/now/table/sys_user?sysparm_fields=...)" />
            </div>
            {renderConnectorActions("servicenow", "Configurazione ServiceNow salvata.")}
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>CRM</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Salesforce Connector</h3>
            <div className="row">
              <input style={{ width: 320 }} value={cfg.salesforce_base_url || ""} onChange={(e) => updateCfg({ salesforce_base_url: e.target.value })} placeholder="Instance URL" />
              <input style={{ width: 320 }} value={cfg.salesforce_token_url || ""} onChange={(e) => updateCfg({ salesforce_token_url: e.target.value })} placeholder="Token URL (es: https://login.salesforce.com/services/oauth2/token)" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 240 }} value={cfg.salesforce_client_id || ""} onChange={(e) => updateCfg({ salesforce_client_id: e.target.value })} placeholder="Client ID" />
              <input style={{ width: 240 }} value={cfg.salesforce_client_secret || ""} onChange={(e) => updateCfg({ salesforce_client_secret: e.target.value })} placeholder="Client Secret" type="password" />
              <input style={{ width: 420 }} value={cfg.salesforce_users_path || ""} onChange={(e) => updateCfg({ salesforce_users_path: e.target.value })} placeholder="Users Query Path (es: /services/data/v60.0/query?q=...)" />
            </div>
            {renderConnectorActions("salesforce", "Configurazione Salesforce salvata.")}
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>Collaboration</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Microsoft 365 Connector</h3>
            <div className="row">
              <input style={{ width: 320 }} value={cfg.m365_base_url || ""} onChange={(e) => updateCfg({ m365_base_url: e.target.value })} placeholder="Base URL (es: https://graph.microsoft.com)" />
              <input style={{ width: 220 }} value={cfg.m365_tenant_id || ""} onChange={(e) => updateCfg({ m365_tenant_id: e.target.value })} placeholder="Tenant ID" />
              <input style={{ width: 220 }} value={cfg.m365_client_id || ""} onChange={(e) => updateCfg({ m365_client_id: e.target.value })} placeholder="Client ID" />
            </div>
            <div className="row" style={{ marginTop: 10 }}>
              <input style={{ width: 320 }} value={cfg.m365_client_secret || ""} onChange={(e) => updateCfg({ m365_client_secret: e.target.value })} placeholder="Client Secret" type="password" />
              <input style={{ width: 540 }} value={cfg.m365_users_path || ""} onChange={(e) => updateCfg({ m365_users_path: e.target.value })} placeholder="Users Path (es: /v1.0/users?$select=...)" />
            </div>
            {renderConnectorActions("m365", "Configurazione Microsoft 365 salvata.")}
          </div>
        </div>
      </details>

      <details className="connector-category">
        <summary>
          <span>File-based</span>
        </summary>
        <div className="connector-category__content">
          <div className="panel">
            <h3 style={{ marginTop: 0 }}>Connettore CSV</h3>
            <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
              Atteso: DisplayName;Dipartimento;Ruoli (con Ruoli separati da virgola)
            </div>
            <div className="row">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
              />
            </div>
            <div className="row connector-form-actions" style={{ marginTop: 10 }}>
              <button
                className="primary"
                disabled={!csvFile}
                onClick={() => runDiscovery("csv")}
              >
                {csvLoading ? "Discovery..." : "Discovery"}
              </button>
              <button
                className="primary"
                disabled={csvLoading || provisioningLoadingTarget === "csv"}
                onClick={() => runProvisioning("csv")}
              >
                {provisioningLoadingTarget === "csv" ? "Provisioning..." : "Provision"}
              </button>
              <button className="primary" onClick={() => openScheduleModal("csv")} disabled={csvLoading}>Schedule</button>
              <button className="primary" onClick={() => openResultModal("csv")} disabled={csvLoading}>Esito</button>
            </div>
            {importMsg && <div style={{ marginTop: 10 }}>{importMsg}</div>}
            <div className="connector-loadingbar" aria-hidden="true">
              <div className={`connector-loadingbar__fill${csvLoading ? " is-active" : ""}`} />
            </div>
          </div>
        </div>
      </details>

      {cfgStatusMsg && <div className="ok">{cfgStatusMsg}</div>}
      {provisioningMsg && <div className="ok">{provisioningMsg}</div>}
      {err && <div className="err">{err}</div>}
      {scheduleModal.open && (
        <div className="connector-schedule-overlay" onClick={closeScheduleModal}>
          <div className="panel connector-schedule-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Schedule Discovery - {connectorLabels[scheduleModal.target] || scheduleModal.target}</h3>
            <form onSubmit={saveSchedule}>
              <div className="row">
                <select
                  value={scheduleForm.frequency}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, frequency: e.target.value }))}
                >
                  <option value="HOURLY">Every Hour</option>
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                </select>
                {scheduleForm.frequency === "WEEKLY" && (
                  <select
                    value={scheduleForm.day}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, day: e.target.value }))}
                  >
                    <option value="MON">Monday</option>
                    <option value="TUE">Tuesday</option>
                    <option value="WED">Wednesday</option>
                    <option value="THU">Thursday</option>
                    <option value="FRI">Friday</option>
                    <option value="SAT">Saturday</option>
                    <option value="SUN">Sunday</option>
                  </select>
                )}
                <input
                  type="time"
                  value={scheduleForm.time}
                  onChange={(e) => setScheduleForm((prev) => ({ ...prev, time: e.target.value }))}
                />
                <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <input
                    type="checkbox"
                    checked={!!scheduleForm.enabled}
                    onChange={(e) => setScheduleForm((prev) => ({ ...prev, enabled: e.target.checked }))}
                  />
                  Enabled
                </label>
              </div>
              <div style={{ color: "var(--muted)", fontSize: 12, marginTop: 8 }}>
                La Discovery pianificata viene eseguita automaticamente dal backend, anche a pagina chiusa.
              </div>
              <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
                <button type="button" onClick={closeScheduleModal}>Annulla</button>
                <button className="primary" type="submit">Salva Schedule</button>
              </div>
            </form>
          </div>
        </div>
      )}
      {resultModal.open && (
        <div className="connector-schedule-overlay" onClick={closeResultModal}>
          <div className="panel connector-schedule-modal" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Esito Ultima Discovery - {connectorLabels[resultModal.target] || resultModal.target}</h3>
            {(() => {
              const res = (cfg.discovery_results || {})[resultModal.target] || {};
              const sch = (cfg.discovery_schedules || {})[resultModal.target] || {};
              const status = String(res.status || sch.last_status || "n/a");
              const message = String(res.message || sch.last_message || "Nessuna discovery eseguita.");
              const source = String(res.source || (sch.last_run_at ? "schedule" : "n/a"));
              const ts = String(res.last_run_at || sch.last_run_at || "");
              const summary = (res && typeof res.summary === "object" && res.summary) ? res.summary : {};
              const summaryLabels = {
                users: "Users",
                groups: "Groups",
                new_users: "Nuovi utenti",
                updated_users: "Utenti aggiornati",
                updated_by_displayname: "Aggiornati per displayName",
                new_groups: "Nuovi gruppi",
                updated_groups: "Gruppi aggiornati",
                rows_imported: "Righe importate",
                duplicate_values: "Valori duplicati",
                incomplete_values: "Valori incompleti",
              };
              const summaryItems = Object.entries(summary)
                .filter(([, v]) => Number.isFinite(Number(v)))
                .map(([k, v]) => ({ k, label: summaryLabels[k] || k, value: Number(v) }));
              return (
                <div>
                  {summaryItems.length > 0 && (
                    <div className="row" style={{ marginBottom: 10 }}>
                      {summaryItems.map((x) => (
                        <div key={x.k} className="card" style={{ minWidth: 160 }}>
                          <div className="k">{x.label}</div>
                          <div className="v" style={{ fontSize: 20 }}>{x.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="row">
                    <div className="card" style={{ minWidth: 130 }}>
                      <div className="k">Status</div>
                      <div className="v" style={{ fontSize: 18 }}>{status}</div>
                    </div>
                    <div className="card" style={{ minWidth: 130 }}>
                      <div className="k">Source</div>
                      <div className="v" style={{ fontSize: 18 }}>{source}</div>
                    </div>
                    <div className="card" style={{ minWidth: 240 }}>
                      <div className="k">Last Run</div>
                      <div className="v" style={{ fontSize: 16 }}>{ts || "n/a"}</div>
                    </div>
                  </div>
                  <div className="panel" style={{ marginTop: 12, background: "rgba(0,0,0,0.12)" }}>
                    <div className="k" style={{ color: "var(--muted)", marginBottom: 6 }}>Messaggio</div>
                    <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.35 }}>{message}</div>
                  </div>
                  <div className="row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
                    <button className="primary" onClick={downloadLastAdExtractCsv}>Scarica CSV completo import</button>
                    <button onClick={closeResultModal}>Chiudi</button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

function Utenti() {
  const [q, setQ] = useState("");
  const [typeQ, setTypeQ] = useState("");
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);
  const [err, setErr] = useState("");
  const [csvMsg, setCsvMsg] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [sortBy, setSortBy] = useState("");
  const [sortOrder, setSortOrder] = useState("asc");
  const csvInputRef = useRef(null);
  const nav = useNavigate();


  async function load(currOffset = 0) {
    try {
      setErr("");
      setOffset(currOffset);
      setErr("");
      setOffset(currOffset);
      const res = await api.users(q, limit, currOffset, sortBy, sortOrder, typeQ);
      setRows(res.items || []);
      setTotal(res.total || 0);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(0); }, []);
  useEffect(() => {
    const t = setTimeout(() => { load(0); }, 220);
    return () => clearTimeout(t);
  }, [q, typeQ]);

  function goPrev() {
    if (offset - limit >= 0) load(offset - limit);
  }
  function goNext() {
    if (offset + limit < total) load(offset + limit);
  }

  function handleSort(col) {
    if (sortBy === col) {
      setSortOrder(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortBy(col);
      setSortOrder("asc");
    }
  }
  useEffect(() => { if (sortBy) load(0); }, [sortBy, sortOrder]);

  const sortIcon = (col) => sortBy === col ? (sortOrder === "asc" ? " ▲" : " ▼") : "";

  async function handleUsersCsvImport(file) {
    if (!file) return;
    try {
      setErr("");
      setCsvMsg("");
      setCsvImporting(true);
      await importBusinessRolesCsv(file);
      setCsvMsg("Snapshot CSV completato.");
      await load(0);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setCsvImporting(false);
      if (csvInputRef.current) csvInputRef.current.value = "";
    }
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Utenti ({total})</h2>

      <div className="panel">
        <div className="row">
          <input
            type="search"
            style={{ width: 420 }}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Search users..."
            aria-label="Filter Users"
          />
          <input style={{ width: 140, marginLeft: 10 }} value={typeQ} onChange={e => setTypeQ(e.target.value)} placeholder="Type (es. Service)" aria-label="Filter by Type" />
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={(e) => handleUsersCsvImport(e.target.files?.[0] || null)}
          />
          <button
            className="primary"
            title="Extract CSV"
            aria-label="Extract CSV"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            style={{ marginLeft: 6, width: 42, height: 42, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v11" />
              <path d="m7 10 5 5 5-5" />
              <path d="M4 21h16" />
            </svg>
          </button>
        </div>

        <hr className="sep" />

        <table className="table">
          <thead>
            <tr>
              <th style={{ cursor: "pointer" }} onClick={() => handleSort("displayName")}>Display Name{sortIcon("displayName")}</th>
              <th style={{ cursor: "pointer" }} onClick={() => handleSort("accountType")}>Type{sortIcon("accountType")}</th>
              <th>Business Roles</th>
              <th>Ruoli</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(u => (
              <tr
                key={u.username}
                onClick={() => nav(`/utenti/${encodeURIComponent(u.username)}`)}
                style={{ cursor: "pointer" }}
              >
                <td>{u.displayName}</td>
                <td style={{ color: "var(--muted)", fontSize: 13 }}>{u.accountType || "Internal"}</td>
                <td style={{ color: "var(--muted)" }}>
                  {Array.isArray(u.businessRole)
                    ? (u.businessRole.length ? u.businessRole.join(", ") : "Unassigned")
                    : (u.businessRole || "Unassigned")}
                </td>
                <td style={{ color: "var(--muted)", fontSize: 13 }}>{(u.groups || []).length}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="row" style={{ marginTop: 10, justifyContent: "space-between" }}>
          <button disabled={offset === 0} onClick={goPrev}>Prev</button>
          <span style={{ color: "var(--muted)", alignSelf: "center", fontSize: 13 }}>
            Page {Math.floor(offset / limit) + 1} / {Math.ceil(total / limit) || 1}
          </span>
          <button disabled={offset + limit >= total} onClick={goNext}>Next</button>
        </div>

        {csvMsg && <div className="ok">{csvMsg}</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}

function UserDetail() {
  const { username } = useParams();
  const nav = useNavigate();

  const [user, setUser] = useState(null);
  const [rolesData, setRolesData] = useState({ roles: [], assignments: {} });

  const [selectedRole, setSelectedRole] = useState("Unassigned");
  const [selectedGroups, setSelectedGroups] = useState([]);
  const [accountType, setAccountType] = useState("Internal");
  const [peerStats, setPeerStats] = useState(null);
  const [analyzingPeers, setAnalyzingPeers] = useState(false);
  const [graphSize, setGraphSize] = useState({ width: 0, height: 0 });
  const [hoveredGraphNode, setHoveredGraphNode] = useState(null);
  const [animatingNodeId, setAnimatingNodeId] = useState("");
  const [graphTypeFilter, setGraphTypeFilter] = useState("all"); // all | active | inactive
  const [activationTransition, setActivationTransition] = useState(null); // {id,start,duration}
  const [groupCounts, setGroupCounts] = useState({}); // {groupName: totalUserCount}
  const graphRef = useRef(null);
  const forceGraphRef = useRef(null);
  const nodePositionsRef = useRef(new Map());
  const pendingActiveIdsRef = useRef(new Set());
  const focusTimeoutRef = useRef(null);
  const releaseNodeTimeoutRef = useRef(null);

  const [ok, setOk] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const selectStyles = {
    control: (base, state) => ({
      ...base,
      backgroundColor: "#111a2e",
      borderColor: state.isFocused ? "rgba(106,166,255,0.55)" : "rgba(255,255,255,0.18)",
      boxShadow: "none",
      minHeight: 40,
      borderRadius: 10,
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
      overflow: "hidden",
    }),
    menuList: (base) => ({ ...base, backgroundColor: "#111a2e", padding: 6 }),
    option: (base, state) => ({
      ...base,
      backgroundColor: state.isSelected
        ? "rgba(106,166,255,0.22)"
        : state.isFocused
          ? "rgba(106,166,255,0.14)"
          : "#111a2e",
      color: "#e9eefc",
      borderRadius: 10,
      margin: "2px 0",
    }),
  };


  async function load() {
    try {
      setErr("");
      setOk("");

      const u = await api.get(`/api/users/${encodeURIComponent(username)}`); // {user, allGroups}
      const br = await api.businessRoles(); // {roles, assignments}
      const gc = await api.groupCounts(); // {counts}

      setUser(u.user);
      setRolesData(br);
      setGroupCounts(gc.counts || {});

      setSelectedRole(u.user?.businessRole || "Unassigned");
      setSelectedGroups((u.user?.groups || []).slice().sort());
      setAccountType(u.user?.accountType || "Internal");
      setPeerStats(null);
    } catch (e) {
      setErr(String(e?.message || e));
    }
  }

  useEffect(() => {
    load().then(() => {
      // Auto-run peer analysis after load to populate orbit confidence data
      if (username) {
        (async () => {
          try {
            setAnalyzingPeers(true);
            const res = await api.peerAnalysis(username);
            setPeerStats(res);
          } catch (_e) { /* silent — non-blocking */ }
          finally { setAnalyzingPeers(false); }
        })();
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username]);

  function toggleGroup(g) {
    setSelectedGroups((prev) => {
      const has = prev.includes(g);
      if (has) return prev.filter((x) => x !== g);
      return prev.concat([g]).sort();
    });
  }

  async function runPeerAnalysis() {
    if (!user?.username) return;
    try {
      setAnalyzingPeers(true);
      setPeerStats(null);
      const res = await api.peerAnalysis(user.username);
      setPeerStats(res);
    } catch (e) {
      setErr(e.message);
    } finally {
      setAnalyzingPeers(false);
    }
  }

  async function save() {
    if (!user?.username) return;
    try {
      setSaving(true);
      setErr("");
      setOk("");

      await api.post(`/api/users/${encodeURIComponent(user.username)}/update`, {
        groups: selectedGroups,
        businessRole: selectedRole,
        accountType: accountType,
      });

      setOk("Saved.");
      await load();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setSaving(false);
    }
  }

  const roleGroups = useMemo(() => {
    if (!selectedRole || selectedRole === "Unassigned") return [];
    const roleMeta = (rolesData.roles || []).find((x) => x?.role === selectedRole);
    if (!roleMeta?.groups) return [];
    return Array.from(new Set(roleMeta.groups.map((g) => String(g).trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  }, [rolesData, selectedRole]);

  const groupRoleHints = useMemo(() => {
    const out = {};
    for (const roleMeta of (rolesData.roles || [])) {
      const roleName = String(roleMeta?.role || "").trim();
      if (!roleName) continue;
      for (const group of (roleMeta?.groups || [])) {
        const key = String(group || "").trim();
        if (!key) continue;
        if (!out[key]) out[key] = [];
        out[key].push(roleName);
      }
    }
    return out;
  }, [rolesData]);

  const peerFrequencyByGroup = useMemo(() => {
    const out = {};
    const ingest = (arr, source) => {
      for (const row of (arr || [])) {
        const key = String(row?.group || "").trim();
        if (!key) continue;
        const curr = out[key];
        const next = {
          source,
          frequency: Number(row?.frequency || 0),
          count: Number(row?.count || 0),
          peers: Number(row?.peers || 0),
        };
        if (!curr || next.frequency > curr.frequency) out[key] = next;
      }
    };
    ingest(peerStats?.anomalies, "anomaly");
    ingest(peerStats?.suggestedGroups, "suggested");
    return out;
  }, [peerStats]);

  const forceGraphData = useMemo(() => {
    const selectedSet = new Set((selectedGroups || []).map((g) => String(g)));
    const roleSet = new Set((roleGroups || []).map((g) => String(g)));
    // 1. Build a map of confidence/frequency from peerStats
    // peerStats.suggestedGroups has { group, frequency, count, peers }
    // peerStats.groupFrequencies has { groupName: frequency } for ALL assigned groups
    const freqMap = {};
    const suggestedSet = new Set();
    if (peerStats?.suggestedGroups) {
      for (const sg of peerStats.suggestedGroups) {
        freqMap[sg.group] = sg.frequency; // 0..1
        suggestedSet.add(sg.group);
      }
    }
    // Merge assigned group frequencies from peer analysis
    const assignedFreqMap = peerStats?.groupFrequencies || {};

    // Merge suggested groups into the graph
    // We want to show: Selected Groups + Role Groups + Peer Suggested Groups
    const merged = Array.from(new Set([...selectedSet, ...roleSet, ...suggestedSet]));
    const orderedAll = merged
      .filter((group) => {
        if (graphTypeFilter === "active") return selectedSet.has(group);
        if (graphTypeFilter === "inactive") return !selectedSet.has(group);
        return true;
      })
      .sort((a, b) => {
        const aUser = selectedSet.has(a);
        const bUser = selectedSet.has(b);
        if (aUser !== bUser) return aUser ? -1 : 1;
        return a.localeCompare(b);
      });

    const ordered = orderedAll.slice(0, MAX_GRAPH_NODES);
    const userNodeId = "__user_center__";
    // Also include anomalies if relevant? Usually anomalies are "assigned but weird", so frequency might be low. 
    // But for the atomic model, if it's assigned, it goes to Orbit 1 regardless of frequency.
    // So we primarily care about frequency for UNASSIGNED nodes to place them in outer orbits.

    const nodes = [
      {
        id: userNodeId,
        type: "center",
        isCenter: true,
        label: user?.displayName || user?.username || username,
        fx: 0,
        fy: 0,
        orbitIndex: 0,
      },
      ...ordered.map((group) => {
        const inUser = selectedSet.has(group);
        const f = freqMap[group] || 0;
        let orbitIndex = 5; // default outer
        let confidence = 0;

        if (inUser) {
          // Assigned groups: orbit based on peer confidence
          const peerFreq = assignedFreqMap[group];
          if (peerFreq !== undefined) {
            confidence = peerFreq;
            if (peerFreq >= 0.9) orbitIndex = 1;       // 90-100% → closest
            else if (peerFreq >= 0.7) orbitIndex = 2;  // 70-90%
            else if (peerFreq >= 0.5) orbitIndex = 3;  // 50-70%
            else if (peerFreq >= 0.3) orbitIndex = 4;  // 30-50%
            else orbitIndex = 5;                       // < 30% → farthest (anomaly)
          } else {
            // No peer data yet (analysis not run) → default to orbit 1
            orbitIndex = 1;
            confidence = 1;
          }
        } else {
          // Unassigned
          confidence = f;

          if (f > 0) {
            // It is suggested by peers. 
            // Prioritize this status even if it's also in the Business Role.
            if (f >= 0.8) orbitIndex = 2;       // 80-100%
            else if (f >= 0.6) orbitIndex = 3;  // 60-80%
            else if (f >= 0.4) orbitIndex = 4;  // 40-60%
            else orbitIndex = 5;                // < 40%
          } else {
            // Not suggested by peers. 
            // If it's in the Business Role (roleSet.has(group)), it's a "standard" role for this job.
            // If not in roleSet (but selectedSet has it? covered by inUser), or neither..
            // In our atomic model, standard unassigned roles go to outer orbit.
            orbitIndex = 5;
          }
        }

        return {
          ...(nodePositionsRef.current.get(`group:${group}`) || {}),
          id: `group:${group}`,
          group,
          label: group,
          inUser,
          inRole: roleSet.has(group),
          type: inUser ? "user" : "role",
          orbitIndex,
          confidence,
          isSuggested: f > 0,
        };
      }),
    ];

    const links = ordered.map((group) => ({
      source: userNodeId,
      target: `group:${group}`,
      type: selectedSet.has(group) ? "user" : "role",
      isParticle: false,
    }));

    // Particle links only for assigned (Orbit 1)
    const particleLinks = ordered
      .filter((group) => selectedSet.has(group))
      .flatMap((group) => ([
        {
          source: userNodeId,
          target: `group:${group}`,
          type: "user",
          isParticle: true,
        },
        {
          source: `group:${group}`,
          target: userNodeId,
          type: "user",
          isParticle: true,
        },
      ]));

    return {
      userNodeId,
      nodes,
      links: [...links, ...particleLinks],
      totalRequested: orderedAll.length,
      totalRendered: ordered.length,
      truncated: orderedAll.length > ordered.length,
    };
  }, [selectedGroups, roleGroups, graphTypeFilter, peerStats]);

  const allGraphCounts = useMemo(() => {
    const selectedSet = new Set((selectedGroups || []).map((g) => String(g)));
    const roleSet = new Set((roleGroups || []).map((g) => String(g)));
    const suggestedSet = new Set((peerStats?.suggestedGroups || []).map((sg) => String(sg.group)));

    // The "all" set should match the "merged" set used in forceGraphData
    const merged = Array.from(new Set([...selectedSet, ...roleSet, ...suggestedSet]));

    let active = 0;
    let inactive = 0;
    for (const g of merged) {
      if (selectedSet.has(g)) active += 1;
      else inactive += 1; // If it's in roleSet or suggestedSet but not in selectedGroups, it's inactive
    }
    return { active, inactive };
  }, [selectedGroups, roleGroups, peerStats]);

  const forceNodeById = useMemo(
    () => forceGraphData.nodes.reduce((acc, n) => {
      acc[n.id] = n;
      return acc;
    }, {}),
    [forceGraphData]
  );

  const graphCounts = useMemo(() => {
    let active = 0;
    let inactive = 0;
    for (const n of (forceGraphData.nodes || [])) {
      if (n?.isCenter) continue;
      if (n?.inUser) active += 1;
      else inactive += 1;
    }
    return { active, inactive };
  }, [forceGraphData]);

  const graphGroupsList = useMemo(
    () => (forceGraphData.nodes || [])
      .filter((n) => !n?.isCenter)
      .map((n) => ({ name: n.group, inUser: Boolean(n.inUser), type: n.type }))
      .sort((a, b) => {
        if (a.inUser !== b.inUser) return a.inUser ? -1 : 1;
        return String(a.name).localeCompare(String(b.name));
      }),
    [forceGraphData]
  );

  const graphPerf = useMemo(() => {
    const nodeCount = Math.max(0, (forceGraphData.nodes || []).length - 1); // exclude center
    const heavy = nodeCount > 140;
    const medium = nodeCount > 90;
    return {
      nodeCount,
      particleSpeed: heavy ? 0 : medium ? 0.0024 : ACTIVE_PARTICLE_SPEED,
      particleCount: heavy ? 0 : medium ? 1 : 2,
      autoPauseRedraw: heavy,
      cooldownTicks: heavy ? 120 : 240,
      heavy,
      medium,
    };
  }, [forceGraphData]);

  const captureNodePositions = React.useCallback(() => {
    const fg = forceGraphRef.current;
    if (!fg) return;
    const data = typeof fg.graphData === "function" ? fg.graphData() : null;
    const nodes = data?.nodes || [];
    const nextMap = new Map();

    for (const node of nodes) {
      if (!node || node.isCenter) {
        if (node?.isCenter) {
          node.x = 0;
          node.y = 0;
          node.vx = 0;
          node.vy = 0;
        }
        continue;
      }
      nextMap.set(node.id, {
        x: node.x,
        y: node.y,
        vx: node.vx,
        vy: node.vy,
      });
    }
    nodePositionsRef.current = nextMap;
  }, []);

  useEffect(() => {
    const allowed = new Set((forceGraphData.nodes || []).map((n) => n.id));
    const nextMap = new Map();
    for (const [k, v] of nodePositionsRef.current.entries()) {
      if (allowed.has(k)) nextMap.set(k, v);
    }
    nodePositionsRef.current = nextMap;
  }, [forceGraphData]);

  useEffect(() => {
    const node = graphRef.current;
    if (!node) return;
    const sync = () => setGraphSize({ width: node.clientWidth || 0, height: node.clientHeight || 0 });
    sync();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(sync);
      ro.observe(node);
      return () => ro.disconnect();
    }
    window.addEventListener("resize", sync);
    return () => window.removeEventListener("resize", sync);
  }, []);

  useEffect(() => () => {
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    if (releaseNodeTimeoutRef.current) clearTimeout(releaseNodeTimeoutRef.current);
  }, []);

  useEffect(() => {
    const fg = forceGraphRef.current;
    if (!fg) return;

    // Configurazione visuale delle orbite (raggi)
    const ORBIT_RADII = {
      0: 0,
      1: 130, // Assegnati
      2: 210, // Conf > 80%
      3: 280, // Conf > 60%
      4: 340, // Conf > 40%
      5: 400, // Altri
    };

    fg.centerAt(0, 0, 0);
    fg.zoom(0.63, 0); // Zoom out del 10% supplementare (0.70 -> 0.63) per vedere meglio l'intero modello atomico

    // Charge: repulsione tra i nodi
    const charge = fg.d3Force("charge");
    if (charge && typeof charge.strength === "function") charge.strength(-120);

    // Link: forza elastica — distanza basata sull'orbita del nodo target
    const link = fg.d3Force("link");
    if (link) {
      const ORBIT_RADII_MAP = { 1: 130, 2: 210, 3: 280, 4: 340, 5: 400 };
      if (typeof link.distance === "function") link.distance((l) => {
        if (l?.isParticle) return 0;
        // Use the target node's orbit radius as the ideal link distance
        const targetNode = typeof l.target === 'object' ? l.target : null;
        if (targetNode?.orbitIndex) return ORBIT_RADII_MAP[targetNode.orbitIndex] || 130;
        return 130;
      });
      if (typeof link.strength === "function") link.strength((l) => {
        if (l?.isParticle) return 0;
        if (l?.type === "user") return 0.15; // Slightly lower so radial force dominates
        return 0;
      });
    }

    // Radial: forza principale per il posizionamento atomico
    fg.d3Force(
      "radial",
      forceRadial((node) => {
        if (node?.isCenter) return 0;

        // Se un nodo sta venendo attivato (cliccato), spostalo temporaneamente verso l'orbita target
        // Ma qui semplifichiamo: orbitIndex è già ricalcolato nel render successivo se cambia selectedGroups via toggle.
        // L'animazione "in transito" è gestita più visivamente o dalla transizione di stato.
        // Tuttavia, per fluidità, consideriamo pendingActiveIdsRef.

        const pending = pendingActiveIdsRef.current.has(node?.id);
        if (pending) {
          // Animating toward center during activation
          return 60;
        }

        const idx = node.orbitIndex || 5;
        return ORBIT_RADII[idx] || ORBIT_RADII[5];
      }).strength(0.8) // Forza radiale molto alta per costringere sulle orbite
    );

    fg.d3Force("collide", forceCollide((node) => (node?.isCenter ? 45 : 18)).iterations(2));

    if (typeof fg.d3VelocityDecay === "function") fg.d3VelocityDecay(0.25); // Smorzamento per evitare oscillazioni
    if (typeof fg.d3AlphaDecay === "function") fg.d3AlphaDecay(0.015);

    // Forzare il ri-centramento dopo un piccolo delay per assicurarci che il canvas sia pronto
    const tid = setTimeout(() => {
      fg.centerAt(0, 0, 400); // 400ms transition
      fg.zoom(0.63, 400);
    }, 50);

    fg.d3ReheatSimulation();
    return () => clearTimeout(tid);
  }, [forceGraphData]);

  function handleGraphNodeClick(node) {
    if (!node?.group || node?.isCenter || saving) return;
    captureNodePositions();
    const fg = forceGraphRef.current;
    const isActivating = !Boolean(node?.inUser);
    if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current);
    if (releaseNodeTimeoutRef.current) clearTimeout(releaseNodeTimeoutRef.current);
    setAnimatingNodeId(node.id);

    // Start from center, then let physics push outward to the new target ring.
    nodePositionsRef.current.set(node.id, { x: 0, y: 0, vx: 0, vy: 0 });
    if (fg) {
      node.x = 0;
      node.y = 0;
      node.vx = 0;
      node.vy = 0;
      fg.d3ReheatSimulation();
    }

    if (isActivating) {
      pendingActiveIdsRef.current.add(node.id);
      setActivationTransition({ id: node.id, start: Date.now(), duration: 1200 });
    } else {
      setActivationTransition(null);
    }
    const toggleDelayMs = isActivating ? 260 : 180;
    focusTimeoutRef.current = setTimeout(() => {
      toggleGroup(node.group);
      if (isActivating) pendingActiveIdsRef.current.delete(node.id);
      if (fg) fg.d3ReheatSimulation();
      focusTimeoutRef.current = null;
    }, toggleDelayMs);
    if (fg) fg.d3ReheatSimulation();
    releaseNodeTimeoutRef.current = setTimeout(() => {
      setAnimatingNodeId("");
      setActivationTransition((prev) => (prev?.id === node.id ? null : prev));
      releaseNodeTimeoutRef.current = null;
    }, isActivating ? 1600 : 700);
  }

  const getGraphNodeRadius = React.useCallback((node) => {
    if (!node) return 0;
    const isAnimating = Boolean(animatingNodeId && node?.id === animatingNodeId);
    // Center node bigger. Outer nodes synchronized at radius 9 (same as assigned)
    let baseRadius = node?.isCenter ? 36 : 9;

    return baseRadius + (isAnimating ? 3 : 0);
  }, [animatingNodeId]);


  return (
    <div className="main">
      <div className="row" style={{ justifyContent: "space-between", alignItems: "baseline" }}>
        <div>
          <h2 style={{ marginTop: 0 }}>
            User {user?.displayName || user?.username || username}
          </h2>
        </div>

        <button className="link" onClick={() => nav("/utenti")}>← Back</button>
      </div>

      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Business Role</h3>
        <div className="row">
          <div style={{ width: 420 }}>
            <Select
              isSearchable={true}
              styles={selectStyles}
              value={{ value: selectedRole, label: selectedRole }}
              onChange={(opt) => setSelectedRole(opt?.value || "Unassigned")}
              placeholder="Select role..."
              options={[
                { value: "Unassigned", label: "Unassigned" },
                ...(rolesData.roles || []).map((x) => ({ value: x.role, label: x.role })),
              ]}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </div>



          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>

        {ok ? <div className="ok">{ok}</div> : null}
        {err ? <div className="err">{err}</div> : null}

        <hr className="sep" />

        <h3 style={{ marginTop: 0 }}>Account Classification</h3>
        <div className="row" style={{ alignItems: "center" }}>
          <div style={{ width: 200 }}>
            <Select
              styles={selectStyles}
              value={{ value: accountType, label: accountType }}
              onChange={(opt) => setAccountType(opt?.value || "Internal")}
              options={[
                { value: "Internal", label: "Internal" },
                { value: "External", label: "External" },
                { value: "Service", label: "Service" },
                { value: "Administrative", label: "Administrative" },
                { value: "BlueCollar", label: "BlueCollar" },
                { value: "Administrative", label: "Administrative" }, // potential dupe in original but keeping structure
              ]}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          </div>

          <div style={{ marginLeft: 20, display: "flex", gap: 10, alignItems: "center" }}>
            <button className="secondary" onClick={runPeerAnalysis} disabled={analyzingPeers}>
              {analyzingPeers ? "Remediation..." : "Remediation"}
            </button>
          </div>
        </div>

        {peerStats && (
          <div style={{ marginTop: 15, background: "rgba(0,0,0,0.2)", padding: 10, borderRadius: 8 }}>
            <h4 style={{ marginTop: 0 }}>Remediation Actions</h4>
            <div style={{ fontSize: 13, marginBottom: 10 }}>
              Detected users: <b>{peerStats?.peersCount ?? 0}</b> (same Business Role + same Account Type)
            </div>

            {peerStats?.anomalies?.length > 0 ? (
              <table className="table" style={{ fontSize: 13 }}>
                <thead>
                  <tr>
                    <th>Anomalous Role</th>
                    <th>Freq</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {peerStats.anomalies.map((a, i) => (
                    <tr key={i}>
                      <td style={{ color: "#ff6a6a" }}>{a.group}</td>
                      <td>{(a.frequency * 100).toFixed(0)}%</td>
                      <td>{a.count}/{a.peers}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div style={{ color: "#71ffb2", fontSize: 13 }}>No anomalies found (all roles are consistent with peers).</div>
            )}

            {/* Suggested Roles – green */}
            {peerStats?.suggestedGroups?.length > 0 && (
              <div style={{ marginTop: 14 }}>
                <h4 style={{ marginTop: 0, color: "#4ade80" }}>✅ Suggested Roles</h4>
                <table className="table" style={{ fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th>Suggested Role</th>
                      <th>Freq</th>
                      <th>Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {peerStats.suggestedGroups.map((s, i) => (
                      <tr key={i}>
                        <td style={{ color: "#4ade80", fontWeight: 500 }}>{s.group}</td>
                        <td>{(s.frequency * 100).toFixed(0)}%</td>
                        <td>{s.count}/{s.peers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        <hr className="sep" />

        <h3 style={{ marginTop: 0 }}>Atomic Roles Model</h3>

        <div style={{ height: 12 }} />

        <div className="user-graph-card">
          <div className="user-graph-legend">
            <button
              type="button"
              className={`user-graph-pill is-user ${graphTypeFilter === "active" ? "is-selected" : ""}`}
              onClick={() => setGraphTypeFilter((prev) => (prev === "active" ? "all" : "active"))}
              title="Filter active user roles only"
            >
              Active user roles: {allGraphCounts.active}
            </button>
            <button
              type="button"
              className={`user-graph-pill is-role ${graphTypeFilter === "inactive" ? "is-selected" : ""}`}
              onClick={() => setGraphTypeFilter((prev) => (prev === "inactive" ? "all" : "inactive"))}
              title="Filter inactive roles only"
            >
              Inactive roles: {allGraphCounts.inactive}
            </button>
            <span className="user-graph-pill is-muted">Shown: {graphCounts.active + graphCounts.inactive}</span>
            {forceGraphData.truncated ? (
              <span className="user-graph-pill is-muted">
                Capped to {forceGraphData.totalRendered}/{forceGraphData.totalRequested} for stability
              </span>
            ) : null}
          </div>

          <div className="user-graph-content">
            <div className="user-graph-stage" ref={graphRef}>
              {forceGraphData.nodes.length > 1 ? (
                <ForceGraph2D
                  ref={forceGraphRef}
                  graphData={forceGraphData}
                  width={graphSize.width || 980}
                  height={graphSize.height || 560}
                  backgroundColor="rgba(0,0,0,0)"
                  nodeRelSize={8}
                  cooldownTicks={graphPerf.cooldownTicks}
                  autoPauseRedraw={graphPerf.autoPauseRedraw}
                  enablePanInteraction={false}
                  enableZoomInteraction={false}
                  enableNodeDrag={false}
                  linkWidth={(link) => (link?.isParticle ? 0 : (link?.type === "user" ? 1.8 : 1.3))}
                  linkColor={(link) => (link?.isParticle ? "rgba(0,0,0,0)" : (link?.type === "user" ? "rgba(225,35,55,0.58)" : "rgba(0,75,160,0.52)"))}
                  linkCurvature={0}
                  linkDirectionalParticles={(link) => (link?.isParticle ? graphPerf.particleCount : 0)}
                  linkDirectionalParticleWidth={() => 4.2}
                  linkDirectionalParticleColor={() => "rgba(255,120,133,0.88)"}
                  linkDirectionalParticleSpeed={() => graphPerf.particleSpeed}
                  nodeLabel={() => ""}
                  onNodeHover={(node) => setHoveredGraphNode(node)}
                  onNodeDoubleClick={(node) => {
                    if (!node || node.isCenter) return;
                    toggleGroup(node.group);
                  }}
                  nodePointerAreaPaint={(node, color, ctx) => {
                    // Keep pointer hit-area aligned with custom canvas radius.
                    // Center has white core (r=36) + animated halo; keep hit area larger than both.
                    const pointerRadius = node?.isCenter ? 52 : 13;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, pointerRadius, 0, 2 * Math.PI, false);
                    ctx.fill();
                  }}
                  onRenderFramePre={(ctx) => {
                    // Draw Orbits
                    const ORBIT_RADII = {
                      1: { r: 130, color: "rgba(225, 35, 55, 0.45)", width: 2 },    // Assigned
                      2: { r: 210, color: "rgba(100, 255, 100, 0.35)", width: 1.8 },   // High Conf
                      3: { r: 280, color: "rgba(100, 255, 100, 0.25)", width: 1.5 },
                      4: { r: 340, color: "rgba(100, 255, 100, 0.18)", width: 1.2 },
                      5: { r: 400, color: "rgba(255, 255, 255, 0.12)", width: 1.2 },
                    };

                    ctx.save();
                    ctx.translate(0, 0); // Assuming center is 0,0 via d3 center force

                    Object.values(ORBIT_RADII).forEach(orbit => {
                      ctx.beginPath();
                      ctx.arc(0, 0, orbit.r, 0, 2 * Math.PI, false);
                      ctx.strokeStyle = orbit.color;
                      ctx.lineWidth = orbit.width;
                      ctx.stroke();
                    });

                    ctx.restore();
                  }}
                  nodeCanvasObject={(node, ctx, globalScale) => {
                    const isAnimating = Boolean(animatingNodeId && node?.id === animatingNodeId);
                    const now = Date.now();

                    // Synchronize radius for all non-center nodes
                    const radius = node?.isCenter ? 36 : 11;

                    // Colors
                    // User/Center
                    if (node?.isCenter) {
                      // Nucleus style
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                      ctx.fillStyle = "#ffffff";
                      ctx.fill();

                      // Glow
                      const pulse = 0.5 + 0.5 * Math.sin(now / 800);
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, radius + 4 + pulse * 4, 0, 2 * Math.PI, false);
                      ctx.lineWidth = 2;
                      ctx.strokeStyle = `rgba(255,255,255,${0.1 + pulse * 0.2})`;
                      ctx.stroke();

                      return;
                    }

                    // Group Nodes
                    // Color based on Orbit/Status
                    let fill = "#445566"; // default grey
                    let stroke = "rgba(255,255,255,0.1)";

                    if (node.inUser) {
                      // Assigned (red) - color stays red regardless of orbit
                      fill = "#e12337";
                      stroke = "rgba(255,100,100,0.5)";
                    } else if (node.isSuggested) {
                      // Suggested (Green)
                      if (node.orbitIndex === 2) {
                        fill = "#4ade80"; // Bright Green (High Conf)
                        stroke = "rgba(74, 222, 128, 0.4)";
                      } else if (node.orbitIndex === 3) {
                        fill = "#2f8f5b"; // Muted Green
                      } else if (node.orbitIndex === 4) {
                        fill = "#1d5c3d"; // Dark Green
                      } else {
                        // Orbit 5 but suggested (Low Conf < 40%)
                        fill = "#0f392b"; // Very Dark Green
                        stroke = "rgba(74, 222, 128, 0.2)";
                      }
                    } else if (node.orbitIndex === 5) {
                      // Not suggested, just standard Business Role (Blueish Grey)
                      fill = "#445566";
                    }

                    // Draw Node
                    ctx.beginPath();
                    ctx.arc(node.x, node.y, radius, 0, 2 * Math.PI, false);
                    ctx.fillStyle = fill;
                    ctx.fill();
                    ctx.strokeStyle = stroke;
                    ctx.lineWidth = 1;
                    ctx.stroke();

                    // Label on hover or if center/important? 
                    // Atomic model usually clean. Labels only on hover is existing behavior.

                    // Highlight ring for animating/transitioning
                    if (isAnimating) {
                      ctx.beginPath();
                      ctx.arc(node.x, node.y, radius + 4, 0, 2 * Math.PI, false);
                      ctx.strokeStyle = "#ffffff";
                      ctx.lineWidth = 1.5;
                      ctx.stroke();
                    }
                  }}
                />
              ) : (
                <div className="user-graph-empty">
                  No roles to display with this filter.
                </div>
              )}

              {hoveredGraphNode && forceNodeById[hoveredGraphNode.id] && (() => {
                const node = forceNodeById[hoveredGraphNode.id];
                const fmt = (v, fallback = "n/a") => {
                  const s = String(v ?? "").trim();
                  return s || fallback;
                };

                if (node?.isCenter) {
                  const dataSource = fmt(user?.DataSource ?? user?.datasource, "UNKNOWN");
                  return (
                    <div className="user-graph-tooltip user-graph-tooltip--dock">
                      <div className="user-graph-tooltip__title">{fmt(user?.displayName ?? user?.username ?? node?.label, "User")}</div>
                      <div className="user-graph-tooltip__row">Username: <b>{fmt(user?.username)}</b></div>
                      <div className="user-graph-tooltip__row">DataSource: <b>{dataSource}</b></div>
                      <div className="user-graph-tooltip__row">Business Role: <b>{fmt(selectedRole || user?.businessRole, "Unassigned")}</b></div>
                      <div className="user-graph-tooltip__row">Department: <b>{fmt(user?.department)}</b></div>
                      <div className="user-graph-tooltip__row">Account Type: <b>{fmt(accountType || user?.accountType)}</b></div>
                      <div className="user-graph-tooltip__row">Active groups: <b>{Number(selectedGroups?.length || 0)}</b></div>
                    </div>
                  );
                }

                const roles = groupRoleHints[node.group] || [];
                const freq = peerFrequencyByGroup[node.group];
                const totalUsers = groupCounts[node.group] || 0;
                return (
                  <div className="user-graph-tooltip user-graph-tooltip--dock">
                    <div className="user-graph-tooltip__title">{node.group}</div>
                    <div className="user-graph-tooltip__row">Status: <b>{node.inUser ? "Active" : "Inactive"}</b></div>
                    <div className="user-graph-tooltip__row">
                      Business Role: <b>{roles.length ? roles.join(", ") : "None"}</b>
                    </div>
                    <div className="user-graph-tooltip__row">
                      Peer frequency: <b>{freq ? `${Math.round(freq.frequency * 100)}% (${freq.count}/${freq.peers})` : "n/a"}</b>
                    </div>
                    <div className="user-graph-tooltip__row">
                      Total users with this group: <b>{totalUsers}</b>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="user-graph-list-card">
              <div className="user-graph-list-card__title">Roles in graph</div>
              {graphGroupsList.length > 0 ? (
                <div className="user-graph-list">
                  {graphGroupsList.map((g) => (
                    <div
                      key={g.name}
                      className={`user-graph-list__item ${saving ? "is-disabled" : "is-clickable"}`}
                      role="button"
                      tabIndex={saving ? -1 : 0}
                      onClick={() => {
                        const node = forceNodeById[`group:${g.name}`];
                        if (node) handleGraphNodeClick(node);
                      }}
                      onKeyDown={(e) => {
                        if (saving) return;
                        if (e.key !== "Enter" && e.key !== " ") return;
                        e.preventDefault();
                        const node = forceNodeById[`group:${g.name}`];
                        if (node) handleGraphNodeClick(node);
                      }}
                      aria-label={`${g.inUser ? "Deactivate" : "Activate"} role ${g.name}`}
                    >
                      <span className={`user-graph-list__dot ${g.inUser ? "is-user" : "is-role"}`} />
                      <span className="user-graph-list__name">{g.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="user-graph-empty-list">No visible roles.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ height: 12 }} />

        <div className="row">
          <button className="primary" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save changes"}
          </button>
          <button
            className="link"
            onClick={() => {
              setSelectedRole(user?.businessRole || "Unassigned");
              setSelectedGroups((user?.groups || []).slice().sort());
              setHoveredGraphNode(null);
              setOk("");
              setErr("");
            }}
          >
            Reset
          </button>
        </div>
      </div>
    </div>
  );
}


function Cluster() {
  const [roleMetaByRole, setRoleMetaByRole] = useState({});   // {"IT": {color, groups}, ... }
  const [groupRoleMap, setGroupRoleMap] = useState({});       // {"VPN": "IT", "Payroll": "HR", ... }
  const [usersIndex, setUsersIndex] = useState({});
  const pendingCellTogglesRef = useRef(new Set());

  const containerRef = React.useRef(null);

  function patchMiningCell(prevMining, username, group, enabled) {
    if (!prevMining?.matrix || !username || !group) return prevMining;

    const row = prevMining.matrix?.[username];
    if (row == null) return prevMining;

    const matrix = { ...(prevMining.matrix || {}) };
    if (Array.isArray(row)) {
      const next = new Set(row);
      if (enabled) next.add(group);
      else next.delete(group);
      matrix[username] = Array.from(next).sort();
    } else {
      matrix[username] = { ...(row || {}), [group]: enabled ? 1 : 0 };
    }

    return { ...prevMining, matrix };
  }

  async function onCellDoubleClicked(p) {
    try {
      setErr("");

      const field = p?.colDef?.field;   // nome colonna (group)
      const row = p?.data;              // riga (utente)

      if (!field || !row?.username) return;

      // Non applicare su colonne non-gruppo
      if (
        field === "displayName" ||
        field === "clusterId" ||
        field === "businessRole" ||
        field === "roleColor" ||
        field === "username"
      ) {
        return;
      }

      const v = Number(row[field] ?? 0);
      const enabled = v !== 1;
      const lockKey = `${row.username}::${field}`;
      if (pendingCellTogglesRef.current.has(lockKey)) return;

      pendingCellTogglesRef.current.add(lockKey);

      // Optimistic UI: aggiorna subito solo la cella, senza ricaricare tutta la matrice.
      setMining((prev) => patchMiningCell(prev, row.username, field, enabled));

      await api.post("/api/users/groups/toggle", {
        username: row.username,
        group: field,
        enabled,
      });
    } catch (e) {
      // Rollback locale in caso di errore.
      const field = p?.colDef?.field;
      const row = p?.data;
      if (field && row?.username) {
        const v = Number(row[field] ?? 0);
        const rollbackEnabled = v === 1;
        setMining((prev) => patchMiningCell(prev, row.username, field, rollbackEnabled));
      }
      setErr(String(e?.message || e));
    } finally {
      const field = p?.colDef?.field;
      const row = p?.data;
      if (field && row?.username) {
        pendingCellTogglesRef.current.delete(`${row.username}::${field}`);
      }
    }
  }

  function onCellClicked(p) {
    const field = p?.colDef?.field;
    if (
      !field ||
      field === "displayName" ||
      field === "clusterId" ||
      field === "businessRole" ||
      field === "roleColor" ||
      field === "username"
    ) {
      return;
    }

    const roleForColumn = groupRoleMap?.[field] || "Unassigned";
    setRowColorFilter((prev) => (prev === roleForColumn ? "All" : roleForColumn));
  }


  function hexToRgba(hex, a) {
    if (!hex || !hex.startsWith("#") || hex.length !== 7) return `rgba(17,26,46,${a})`;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${a})`;
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

  function getMatrixDensity(groupCount) {
    if (groupCount >= 180) return { colWidth: 24, minWidth: 20, maxWidth: 30, rowHeight: 24, headerHeight: 30, className: "is-ultra-dense" };
    if (groupCount >= 120) return { colWidth: 28, minWidth: 24, maxWidth: 34, rowHeight: 25, headerHeight: 32, className: "is-dense" };
    if (groupCount >= 80) return { colWidth: 34, minWidth: 30, maxWidth: 40, rowHeight: 26, headerHeight: 34, className: "is-compact" };
    if (groupCount >= 50) return { colWidth: 40, minWidth: 36, maxWidth: 48, rowHeight: 27, headerHeight: 36, className: "is-regular" };
    return { colWidth: 46, minWidth: 42, maxWidth: 54, rowHeight: 28, headerHeight: 38, className: "is-relaxed" };
  }

  const [roleSupport, setRoleSupport] = useState(0.5);
  const [nClusters, setNClusters] = useState("");
  const [mining, setMining] = useState(null);
  const [err, setErr] = useState("");
  const [isRunBusy, setIsRunBusy] = useState(false);

  // filtri UI (NON trasparenti)
  const [quick, setQuick] = useState("");
  const [rowColorFilter, setRowColorFilter] = useState("All");
  const [isHeatmapCollapsed, setIsHeatmapCollapsed] = useState(true);
  const [matrixZoom, setMatrixZoom] = useState(0);
  const [rowColorOrder, setRowColorOrder] = useState([]);

  const [roleData, setRoleData] = useState({ roles: [], assignments: {} });

  async function loadRoles() {
    const r = await api.businessRoles(); // {roles:[{role, count, color, groups}], assignments:{user:role}}
    setRoleData(r);

    // Optimization: Build metaObj directly from the response, avoiding N+1 calls
    const metaObj = {};
    (r.roles || []).forEach(x => {
      metaObj[x.role] = {
        role: x.role,
        color: x.color || "#6aa6ff",
        groups: x.groups || []
      };
    });
    setRoleMetaByRole(metaObj);

    // costruisce group -> role (se un group è in più ruoli, vince il primo)
    const gmap = {};
    for (const x of (r.roles || [])) {
      const gs = x.groups || [];
      for (const g of gs) {
        if (!gmap[g]) gmap[g] = x.role;
      }
    }
    setGroupRoleMap(gmap);
  }


  // Load existing mining data (called on mount - doesn't trigger new mining)
  async function load() {
    try {
      setErr("");
      // Fetch existing mining result (may be cached on backend)
      const last = await api.roleMiningLast();

      if (last.status === "running") {
        // Mining in progress - poll for completion
        setMining({ ...last, isComputing: true });
        let current = last;
        while (current.status === "running") {
          await new Promise(r => setTimeout(r, 1000));
          current = await api.roleMiningLast();
          setMining({ ...current, isComputing: true });
        }
        setMining(current);
        setUsersIndex(current.displayNames || {});
      } else if (last.matrix && Object.keys(last.matrix).length > 0) {
        // Has existing data - use it
        setMining(last);
        setUsersIndex(last.displayNames || {});
      }
      // If no data, leave mining as null (shows empty state)

      await loadRoles();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  // Run new mining (called when user clicks button)
  async function run() {
    if (isRunBusy) return;
    try {
      setIsRunBusy(true);
      setErr("");
      setMining(null); // Clear previous mining to show loading
      const n = nClusters ? Number(nClusters) : null;
      const roleSupportSafe = Number.isFinite(Number(roleSupport)) ? Number(roleSupport) : 0.6;
      await api.roleMiningRun(Number.isFinite(n) ? n : null, roleSupportSafe);

      // Polling
      let last = await api.roleMiningLast();
      while (last.status === "running") {
        setMining({ ...last, isComputing: true });
        await new Promise(r => setTimeout(r, 1000));
        last = await api.roleMiningLast();
      }

      setMining(last);

      // Solution 2: Use displayNames from mining response instead of fetching 10k users
      // The backend now includes displayNames map in the mining result
      const displayNamesFromMining = last.displayNames || {};
      setUsersIndex(displayNamesFromMining);

      await loadRoles();
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setIsRunBusy(false);
    }
  }

  useEffect(() => { load(); }, []);

  const { columnDefs, rowData, matrixDensity } = useMemo(() => {
    if (mining?.isComputing) return { columnDefs: [], rowData: [], matrixDensity: getMatrixDensity(0) };
    if (!mining || !mining.matrix || !mining.groups) return { columnDefs: [], rowData: [], matrixDensity: getMatrixDensity(0) };

    const groups = mining.groups;
    const baseDensity = getMatrixDensity(groups.length);
    const zoomFactor = Math.pow(1.12, matrixZoom);
    const density = {
      ...baseDensity,
      colWidth: Math.max(0.5, baseDensity.colWidth * zoomFactor),
      minWidth: Math.max(0.5, baseDensity.minWidth * zoomFactor),
      maxWidth: Math.max(0.5, baseDensity.maxWidth * zoomFactor),
      rowHeight: Math.max(0.5, baseDensity.rowHeight * zoomFactor),
      headerHeight: Math.max(0.5, baseDensity.headerHeight * zoomFactor),
    };
    const usernames = Object.keys(mining.matrix);

    const clusterByUser = {};
    (mining.clusters || []).forEach(c => (c.members || []).forEach(u => { clusterByUser[u] = c.clusterId; }));

    let rows = usernames.map(u => {
      const businessRole = roleData.assignments?.[u] || "Unassigned";
      const roleColor = roleMetaByRole?.[businessRole]?.color || "#111a2e";

      const userMatrix = mining.matrix[u];
      // Support sparse matrix (List of groups) or legacy dense matrix (Dict)
      const userGroupsSparse = Array.isArray(userMatrix)
        ? new Set(userMatrix)
        : new Set(Object.entries(userMatrix || {}).filter(([k, v]) => v).map(([k]) => k));

      // Construct row object for AG Grid (needs flat properties for columns)
      const rowObj = {
        username: u,
        displayName: usersIndex?.[u] || u,
        clusterId: clusterByUser[u] ?? -1,
        businessRole,
        roleColor,
      };

      // Fill group columns: 1 if present, 0 otherwise
      groups.forEach(g => {
        rowObj[g] = userGroupsSparse.has(g) ? 1 : 0;
      });

      return rowObj;
    });


    if (rowColorFilter !== "All") {
      rows = rows.filter(r => r.businessRole === rowColorFilter);
    }

    const colorOrderIndex = {};
    const visibleRowColorOrder = rowColorOrder.length
      ? rowColorOrder
      : Array.from(new Set(rows.map((r) => String(r?.roleColor || "").toLowerCase())));
    visibleRowColorOrder.forEach((c, i) => {
      colorOrderIndex[String(c).toLowerCase()] = i;
    });

    const cols = [
      {
        field: "displayName",
        headerName: "Users",
        pinned: "left",
        filter: true,
        width: 220,
        headerClass: "cluster-users-header",
        sortable: true,
        comparator: (valueA, valueB, nodeA, nodeB) => {
          const ca = nodeA?.data?.roleColor || "";
          const cb = nodeB?.data?.roleColor || "";
          if (ca === cb) return String(valueA || "").localeCompare(String(valueB || ""));
          return ca.localeCompare(cb);
        },
        cellClass: "cluster-user-cell",
        cellStyle: (p) => {
          const role = p.data?.businessRole || "Unassigned";
          const bg = roleMetaByRole?.[role]?.color || "#6aa6ff";
          return {
            backgroundColor: bg,
            color: textColorForBg(bg),
            fontWeight: 800,
            borderRight: "1px solid rgba(255,255,255,0.10)",
            letterSpacing: "0.01em"
          };
        }
      },
      { field: "clusterId", headerName: "Cluster", pinned: "left", width: 110, hide: true }
    ];


    const groupsSorted = [...(groups || [])].sort((a, b) => {
      const ra = groupRoleMap?.[a] || "Unassigned";
      const rb = groupRoleMap?.[b] || "Unassigned";
      const ca = String(roleMetaByRole?.[ra]?.color || "").toLowerCase();
      const cb = String(roleMetaByRole?.[rb]?.color || "").toLowerCase();

      // Group columns by color blocks following row color order.
      const ia = colorOrderIndex[ca] ?? Number.MAX_SAFE_INTEGER;
      const ib = colorOrderIndex[cb] ?? Number.MAX_SAFE_INTEGER;
      if (ia !== ib) return ia - ib;

      // Stable fallback by color.
      const byColor = ca.localeCompare(cb);
      if (byColor !== 0) return byColor;

      // Then by business role and group name.
      const c1 = ra.localeCompare(rb);
      if (c1 !== 0) return c1;

      return a.localeCompare(b);
    });

    groupsSorted.forEach((g) => {
      cols.push({
        headerName: g,
        field: g,
        width: density.colWidth,
        minWidth: density.minWidth,
        maxWidth: density.maxWidth,
        headerClass: "cluster-group-header",
        cellClass: "cluster-group-cell",
        tooltipValueGetter: (p) => {
          const isOn = Number(p.value || 0) === 1;
          const who = p.data?.displayName || p.data?.username || "User";
          return `${who} • ${g} • ${isOn ? "Enabled" : "Disabled"}`;
        },

        valueGetter: (p) => Number(p.data?.[g] || 0),
        valueFormatter: () => "",

        cellStyle: (p) => {
          const v = Number(p.value || 0);
          const roleForGroup = groupRoleMap?.[g] || "Unassigned";
          const hex = roleMetaByRole?.[roleForGroup]?.color || "#6aa6ff";
          const bg = v ? hexToRgba(hex, 0.92) : hexToRgba(hex, 0.08);
          return {
            backgroundColor: bg,
            boxShadow: v
              ? `inset 0 0 0 1px ${hexToRgba("#ffffff", 0.16)}, inset 0 -12px 24px ${hexToRgba(hex, 0.28)}`
              : `inset 0 0 0 1px ${hexToRgba(hex, 0.18)}`,
            transition: "background-color 140ms ease, box-shadow 140ms ease"
          };
        },
      });

    });





    return { columnDefs: cols, rowData: rows, matrixDensity: density };
  }, [mining, roleData, rowColorFilter, roleMetaByRole, groupRoleMap, matrixZoom, rowColorOrder]);

  const roleCount = (roleData.roles || []).length;
  const usersInMatrix = rowData.length;
  const groupsInMatrix = mining?.groups?.length || 0;
  const roleLegend = (roleData.roles || []).slice().sort((a, b) => String(a.role || "").localeCompare(String(b.role || "")));

  function onGridSortOrFilterChanged(p) {
    const next = [];
    const seen = new Set();
    p.api.forEachNodeAfterFilterAndSort((node) => {
      const c = String(node?.data?.roleColor || "").toLowerCase();
      if (!seen.has(c)) {
        seen.add(c);
        next.push(c);
      }
    });
    setRowColorOrder(next);
  }

  return (
    <div className="main cluster-page">
      <div className="cluster-page__head">
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>
            Cluster Intelligence
            {mining?.isComputing && <span style={{ fontSize: "0.6em", marginLeft: 10, color: "var(--accent)" }}>Computing...</span>}
          </h2>
          <div className="cluster-page__subtitle">
            Matrice utenti-gruppi con codifica colore per Business Role e assegnazioni operative in tempo reale
          </div>
        </div>
      </div>

      <div className="filtersBar cluster-toolbar">
        <div className="row cluster-toolbar__row">
          <label className="cluster-toolbar__label">Search</label>
          <input
            style={{ width: 260 }}
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            placeholder="Username / Ruolo…"
          />
          <div className="cluster-zoom cluster-toolbar__zoom">
            <button
              type="button"
              className="ghost cluster-zoom__btn"
              onClick={() => setMatrixZoom((z) => z - 1)}
              title="Zoom out matrix"
            >
              -
            </button>
            <button
              type="button"
              className="ghost cluster-zoom__btn"
              onClick={() => setMatrixZoom(0)}
              title="Reset zoom matrix"
            >
              =
            </button>
            <button
              type="button"
              className="ghost cluster-zoom__btn"
              onClick={() => setMatrixZoom((z) => z + 1)}
              title="Zoom in matrix"
            >
              +
            </button>
          </div>
          <div className="cluster-kpis cluster-toolbar__kpis">
            <div className="cluster-kpi-chip">Users: <b>{usersInMatrix}</b></div>
            <div className="cluster-kpi-chip">Roles: <b>{groupsInMatrix}</b></div>
            <div className="cluster-kpi-chip">Business Roles: <b>{roleCount}</b></div>
          </div>

          <button className="primary cluster-toolbar__run" onClick={run} disabled={isRunBusy}>
            {isRunBusy ? "Ricalcolo..." : "Ricalcola modello"}
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="panel cluster-shell"
        style={{
          height: "calc(100vh - 220px)",
          display: "flex",
          flexDirection: "column",
          overflow: "auto",
        }}
      >
        <div className="cluster-legend">
          <div className="cluster-legend__main">
            <span className="cluster-legend__title">Association Heatmap</span>
            <div className="cluster-legend__actions">
              {!isHeatmapCollapsed && (
                <span className="cluster-legend__scale">
                  <span className="cluster-legend__dot cluster-legend__dot--off" /> No Access
                  <span className="cluster-legend__dot cluster-legend__dot--on" /> Access Enabled
                </span>
              )}
              <button
                type="button"
                className="ghost cluster-legend__toggle"
                onClick={() => setIsHeatmapCollapsed((v) => !v)}
              >
                {isHeatmapCollapsed ? "Expand" : "Collapse"}
              </button>
            </div>
          </div>
          {!isHeatmapCollapsed && (
            <>
              <div className="cluster-legend__active">
                Row filter:
                <b>{rowColorFilter === "All" ? " All Colors" : ` ${rowColorFilter}`}</b>
                {rowColorFilter !== "All" && (
                  <button className="ghost cluster-legend__clear" onClick={() => setRowColorFilter("All")}>
                    Reset
                  </button>
                )}
              </div>
              <div className="cluster-legend__roles">
                {roleLegend.map((r) => (
                  <button
                    key={r.role}
                    type="button"
                    className={`cluster-role-pill ${rowColorFilter === r.role ? "is-active" : ""}`}
                    onClick={() => setRowColorFilter((prev) => (prev === r.role ? "All" : r.role))}
                    title={`Filtra righe per ${r.role}`}
                  >
                    <span className="cluster-role-pill__swatch" style={{ backgroundColor: r.color || "#6aa6ff" }} />
                    {r.role}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={`cluster-matrix ${matrixDensity.className}`} style={{ flex: "1 1 auto", minHeight: 240, overflow: "auto" }}>
          <div className="ag-theme-quartz-dark" style={{ height: "100%", width: "100%" }}>
            <AgGridReact
              rowData={rowData}
              columnDefs={columnDefs}
              onCellClicked={onCellClicked}
              onCellDoubleClicked={onCellDoubleClicked}
              onSortChanged={onGridSortOrFilterChanged}
              onFilterChanged={onGridSortOrFilterChanged}
              defaultColDef={{
                resizable: true,
                sortable: true,
                filter: true,
                floatingFilter: false,
                suppressHeaderMenuButton: true,
                suppressHeaderFilterButton: true
              }}
              animateRows={true}
              quickFilterText={quick}
              rowHeight={matrixDensity.rowHeight}
              headerHeight={matrixDensity.headerHeight}
              alwaysShowHorizontalScroll={true}
              alwaysShowVerticalScroll={true}
            />
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
  const [searchRole, setSearchRole] = useState("");
  const [err, setErr] = useState("");
  const [newRole, setNewRole] = useState("");
  const [ok, setOk] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [csvImporting, setCsvImporting] = useState(false);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const csvInputRef = useRef(null);


  async function refreshRoles() {
    const res = await api.businessRoles();
    setRoles(res.roles || []);
  }

  useEffect(() => {
    (async () => {
      try {
        setErr("");
        await refreshRoles();
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
            style={{ width: 190 }}
            value={searchRole}
            onChange={(e) => setSearchRole(e.target.value)}
            placeholder="Cerca..."
          />
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
                await refreshRoles();
              } catch (e) {
                setErr(String(e.message || e));
              }
            }}
          >
            + Crea
          </button>
          <button
            className="primary"
            onClick={async () => {
              try {
                setErr(""); setOk("");
                setRecalcBusy(true);
                const res = await api.businessRolesRecalculateGroups();
                setOk(`Assegnazioni gruppi ricalcolate (${res.groupsAssigned} gruppi).`);
                await refreshRoles();
              } catch (e) {
                setErr(String(e.message || e));
              } finally {
                setRecalcBusy(false);
              }
            }}
            disabled={recalcBusy}
          >
            {recalcBusy ? "Ricalcolo..." : "Ricalcola Gruppi"}
          </button>
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv"
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0] || null;
              if (!file) return;
              try {
                setErr("");
                setImportMsg("");
                setCsvImporting(true);
                await importBusinessRolesCsv(file);
                setImportMsg("Import CSV completato.");
                await refreshRoles();
              } catch (e2) {
                setErr(String(e2?.message || e2));
              } finally {
                setCsvImporting(false);
                if (csvInputRef.current) csvInputRef.current.value = "";
              }
            }}
          />
          <button
            className="primary"
            title="Import CSV"
            aria-label="Import CSV"
            onClick={() => csvInputRef.current?.click()}
            disabled={csvImporting}
            style={{ width: 42, height: 42, padding: 0, display: "inline-flex", alignItems: "center", justifyContent: "center" }}
          >
            <svg
              viewBox="0 0 24 24"
              width="18"
              height="18"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 3v11" />
              <path d="m7 10 5 5 5-5" />
              <path d="M4 21h16" />
            </svg>
          </button>
        </div>

        {ok && <div className="ok">{ok}</div>}
        {importMsg && <div className="ok">{importMsg}</div>}
        {err && <div className="err">{err}</div>}

        <hr className="sep" />

        <table className="table">
          <thead><tr><th>Business Role</th><th>Users</th><th>Ruoli</th></tr></thead>
          <tbody>
            {roles
              .filter((r) => String(r?.role || "").toLowerCase().includes(searchRole.trim().toLowerCase()))
              .map(r => (
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
                      className="roleRowLink roleRowLinkCount mutedLink"
                    >
                      {r.count}
                    </NavLink>
                  </td>
                  <td>
                    <NavLink
                      to={`/business-roles/${encodeURIComponent(r.role)}`}
                      className="roleRowLink roleRowLinkCount mutedLink"
                    >
                      {(r.groups || []).length}
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
      const [d, u, m, g] = await Promise.all([
        api.businessRoleDetail(role),
        api.users(""),
        api.businessRoleMeta(role),
        api.adGroups(),
      ]);
      setMeta({ color: m.color, groups: m.groups }),

        setSuggErr("");
      setSuggLoading(true);
      let items = [];
      try {
        const s = await api.businessRoleSuggestions(role, 0.50, 50);
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

  const PAGE_SIZE = 50;
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

        <h3 style={{ marginTop: 0 }}>AI Suggestion (confidence &gt; 50%)</h3>

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
            Nessun gruppo suggerito sopra soglia 50%.
          </div>
        )}

        <hr className="sep" />

        <h3 style={{ marginTop: 0 }}>Utenti Assegnati ({detail.users?.length || 0})</h3>

        <table className="table">
          <thead><tr><th>DisplayName</th><th>Type</th><th>Numero di ruoli</th></tr></thead>
          <tbody>
            {(detail.users || []).slice(0, visibleCount).map(u => (
              <tr key={u.username}>
                <td>
                  <NavLink
                    to={`/utenti/${encodeURIComponent(u.username)}`}
                    className="roleRowLink"
                  >
                    {u.displayName || u.username}
                  </NavLink>
                </td>
                <td style={{ color: "var(--muted)" }}>{u.accountType || "Internal"}</td>
                <td>{(u.groups || []).length}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {detail.users?.length > visibleCount && (
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <button
              className="primary"
              onClick={() => setVisibleCount(prev => prev + PAGE_SIZE)}
            >
              Mostra altri ({detail.users.length - visibleCount} rimanenti)
            </button>
          </div>
        )}
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
      if (!getToken()) return;
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
      <>
        <SaveLoadingBar />
        <Routes>
          <Route path="*" element={<Login />} />
        </Routes>
      </>
    );
  }

  return (
    <>
      <SaveLoadingBar />
      <div className="layout">
        <Sidebar onLogout={logout} roles={roles} />
        <Suspense fallback={<div style={{ display: "grid", placeItems: "center", height: "100vh", color: "var(--muted)" }}>Loading...</div>}>
          <Routes>
            <Route path="/" element={<Analytics />} />
            <Route path="/analytics" element={<Analytics />} />
            <Route path="/cluster" element={<Cluster />} />
            <Route path="/utenti" element={<Utenti />} />
            <Route path="/utenti/:username" element={<UserDetail />} />
            <Route path="/overprivileged-users" element={<OverprivilegedPage />} />
            <Route path="/model-quality" element={<ModelQualityPage />} />
            <Route path="/config/connettori" element={<Connettori />} />
            <Route path="/config/logs" element={<Logs />} />
            <Route path="*" element={<Analytics />} />
            <Route path="/business-roles" element={<BusinessRolesHome />} />
            <Route path="/business-roles/:role" element={<BusinessRoleDetail />} />
            <Route path="/kpi/:metric" element={<KpiDrilldownPage />} />
            <Route path="/ai-detection" element={<AiDetectionPage />} />
            <Route path="/ai-training" element={<AiTrainingPage />} />
            <Route path="/ai-lab/drift" element={<AiLabDriftPage />} />
            <Route path="/ai-lab/timeline" element={<AiLabTimelinePage />} />
            <Route path="/ai-lab/ab-playground" element={<AiLabAbPlaygroundPage />} />
            <Route path="/ai-lab/fairness" element={<AiLabFairnessPage />} />
            <Route path="/ai-lab/synthetic" element={<AiLabSyntheticPage />} />
            <Route path="/ai-lab/feedback" element={<AiLabFeedbackPage />} />
          </Routes>
        </Suspense>
      </div>
    </>
  );
}
