import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";

const FETCH_BATCH = 500;
const PAGE_SIZE = 50;

function norm(v) {
  return String(v || "").trim().toLowerCase();
}

function toHumanDate(ts) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return String(ts);
  return d.toLocaleString("it-IT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function parseDate(ts) {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export default function UsersAdvancedAnalyticsPage() {
  const nav = useNavigate();
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  const [filters, setFilters] = useState({
    q: "",
    accountType: "ALL",
    dataSource: "ALL",
    department: "",
    businessRole: "",
    group: "",
    lastLoginFrom: "",
    lastLoginTo: "",
    minGroups: "",
    maxGroups: "",
  });

  const [sort, setSort] = useState({
    by: "displayName",
    order: "asc",
  });

  async function loadAllUsers() {
    try {
      setErr("");
      setLoading(true);
      let offset = 0;
      let total = Infinity;
      const out = [];

      while (offset < total) {
        const res = await api.users("", FETCH_BATCH, offset, "", "asc", "");
        const items = res.items || [];
        total = Number(res.total || 0);
        out.push(...items);
        offset += FETCH_BATCH;
        if (!items.length) break;
      }

      setAllUsers(out);
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAllUsers();
  }, []);

  const accountTypes = useMemo(() => {
    const set = new Set(allUsers.map((u) => String(u.accountType || u.account_type || "Internal")));
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allUsers]);

  const dataSources = useMemo(() => {
    const set = new Set(allUsers.map((u) => String(u.DataSource || u.dataSource || "N/A")));
    return ["ALL", ...Array.from(set).sort((a, b) => a.localeCompare(b))];
  }, [allUsers]);

  const filtered = useMemo(() => {
    const q = norm(filters.q);
    const dept = norm(filters.department);
    const br = norm(filters.businessRole);
    const grp = norm(filters.group);
    const from = filters.lastLoginFrom ? new Date(`${filters.lastLoginFrom}T00:00:00`) : null;
    const to = filters.lastLoginTo ? new Date(`${filters.lastLoginTo}T23:59:59`) : null;
    const minGroups = filters.minGroups === "" ? null : Number(filters.minGroups);
    const maxGroups = filters.maxGroups === "" ? null : Number(filters.maxGroups);

    const withFilters = allUsers.filter((u) => {
      const username = String(u.username || "");
      const displayName = String(u.displayName || "");
      const accountType = String(u.accountType || u.account_type || "Internal");
      const dataSource = String(u.DataSource || u.dataSource || "N/A");
      const department = String(u.department || "");
      const businessRole = String(u.businessRole || "");
      const groups = Array.isArray(u.groups) ? u.groups : [];
      const groupsCount = groups.length;
      const lastLoginDate = parseDate(u.lastLogin);

      if (q) {
        const hay = `${username} ${displayName} ${department} ${businessRole}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filters.accountType !== "ALL" && accountType !== filters.accountType) return false;
      if (filters.dataSource !== "ALL" && dataSource !== filters.dataSource) return false;
      if (dept && !department.toLowerCase().includes(dept)) return false;
      if (br && !businessRole.toLowerCase().includes(br)) return false;
      if (grp && !groups.some((g) => String(g).toLowerCase().includes(grp))) return false;
      if (from && (!lastLoginDate || lastLoginDate < from)) return false;
      if (to && (!lastLoginDate || lastLoginDate > to)) return false;
      if (minGroups !== null && (!Number.isFinite(minGroups) || groupsCount < minGroups)) return false;
      if (maxGroups !== null && (!Number.isFinite(maxGroups) || groupsCount > maxGroups)) return false;

      return true;
    });

    const sorted = [...withFilters].sort((a, b) => {
      const getVal = (u) => {
        if (sort.by === "groupsCount") return (u.groups || []).length;
        if (sort.by === "lastLoginTs") return parseDate(u.lastLogin)?.getTime() || 0;
        return String(u[sort.by] || "").toLowerCase();
      };
      const av = getVal(a);
      const bv = getVal(b);
      if (av < bv) return sort.order === "asc" ? -1 : 1;
      if (av > bv) return sort.order === "asc" ? 1 : -1;
      return 0;
    });

    return sorted;
  }, [allUsers, filters, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [filters, sort]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  function resetFilters() {
    setFilters({
      q: "",
      accountType: "ALL",
      dataSource: "ALL",
      department: "",
      businessRole: "",
      group: "",
      lastLoginFrom: "",
      lastLoginTo: "",
      minGroups: "",
      maxGroups: "",
    });
    setSort({ by: "displayName", order: "asc" });
    setPage(1);
  }

  function escapeCsvCell(value) {
    const text = String(value ?? "");
    if (text.includes(",") || text.includes('"') || text.includes("\n")) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  }

  function downloadFilteredResultsCsv() {
    const headers = [
      "displayName",
      "username",
      "accountType",
      "department",
      "businessRole",
      "groupsCount",
      "groups",
      "lastLogin",
      "lastLoginHuman",
      "dataSource",
    ];

    const lines = filtered.map((u) => {
      const row = [
        u.displayName || "",
        u.username || "",
        u.accountType || u.account_type || "Internal",
        u.department || "",
        u.businessRole || "Unassigned",
        (u.groups || []).length,
        (u.groups || []).join("; "),
        u.lastLogin || "",
        toHumanDate(u.lastLogin),
        u.DataSource || u.dataSource || "N/A",
      ];
      return row.map(escapeCsvCell).join(",");
    });

    const csv = [headers.join(","), ...lines].join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
    const ts = new Date().toISOString().replace(/[:.]/g, "-");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `users-advanced-analytics-${ts}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="main advanced-users-page">
      <div className="advanced-users-head">
        <div>
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Advanced Analytics</h2>
          <div className="advanced-users-subtitle">Ricerca avanzata utenti con filtri combinabili e ordinamento dinamico.</div>
        </div>
        <div className="advanced-users-head__actions">
          <button onClick={() => nav("/utenti")}>Users</button>
          <button className="primary" onClick={loadAllUsers} disabled={loading}>{loading ? "Refreshing..." : "Refresh"}</button>
          <button onClick={downloadFilteredResultsCsv} disabled={!filtered.length}>Scarica risultati CSV</button>
        </div>
      </div>

      <div className="panel advanced-users-filters">
        <div className="advanced-users-filter-grid">
          <label>
            Search
            <input
              type="search"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
              placeholder="username, display name, department, role"
            />
          </label>
          <label>
            Account Type
            <select
              value={filters.accountType}
              onChange={(e) => setFilters((f) => ({ ...f, accountType: e.target.value }))}
            >
              {accountTypes.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label>
            Data Source
            <select
              value={filters.dataSource}
              onChange={(e) => setFilters((f) => ({ ...f, dataSource: e.target.value }))}
            >
              {dataSources.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label>
            Department
            <input
              value={filters.department}
              onChange={(e) => setFilters((f) => ({ ...f, department: e.target.value }))}
              placeholder="contains..."
            />
          </label>
          <label>
            Business Role
            <input
              value={filters.businessRole}
              onChange={(e) => setFilters((f) => ({ ...f, businessRole: e.target.value }))}
              placeholder="contains..."
            />
          </label>
          <label>
            Group
            <input
              value={filters.group}
              onChange={(e) => setFilters((f) => ({ ...f, group: e.target.value }))}
              placeholder="group contains..."
            />
          </label>
          <label>
            Last Login From
            <input
              type="date"
              value={filters.lastLoginFrom}
              onChange={(e) => setFilters((f) => ({ ...f, lastLoginFrom: e.target.value }))}
            />
          </label>
          <label>
            Last Login To
            <input
              type="date"
              value={filters.lastLoginTo}
              onChange={(e) => setFilters((f) => ({ ...f, lastLoginTo: e.target.value }))}
            />
          </label>
          <label>
            Min Groups
            <input
              type="number"
              min={0}
              value={filters.minGroups}
              onChange={(e) => setFilters((f) => ({ ...f, minGroups: e.target.value }))}
            />
          </label>
          <label>
            Max Groups
            <input
              type="number"
              min={0}
              value={filters.maxGroups}
              onChange={(e) => setFilters((f) => ({ ...f, maxGroups: e.target.value }))}
            />
          </label>
          <label>
            Sort By
            <select value={sort.by} onChange={(e) => setSort((s) => ({ ...s, by: e.target.value }))}>
              <option value="displayName">Display Name</option>
              <option value="username">Username</option>
              <option value="accountType">Account Type</option>
              <option value="department">Department</option>
              <option value="businessRole">Business Role</option>
              <option value="groupsCount">Groups Count</option>
              <option value="lastLoginTs">Last Login</option>
            </select>
          </label>
          <label>
            Order
            <select value={sort.order} onChange={(e) => setSort((s) => ({ ...s, order: e.target.value }))}>
              <option value="asc">Asc</option>
              <option value="desc">Desc</option>
            </select>
          </label>
        </div>
        <div className="advanced-users-filter-actions">
          <div className="advanced-users-metrics">
            <span>Loaded: {allUsers.length}</span>
            <span>Filtered: {filtered.length}</span>
          </div>
          <button onClick={resetFilters}>Reset Filters</button>
        </div>
      </div>

      <div className="panel">
        <table className="table advanced-users-table">
          <thead>
            <tr>
              <th>Display Name</th>
              <th>Username</th>
              <th>Type</th>
              <th>Department</th>
              <th>Business Role</th>
              <th>Groups</th>
              <th>Last Login</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((u) => (
              <tr key={u.username} onClick={() => nav(`/utenti/${encodeURIComponent(u.username)}`)} style={{ cursor: "pointer" }}>
                <td>{u.displayName || "-"}</td>
                <td>{u.username || "-"}</td>
                <td style={{ color: "var(--muted)" }}>{u.accountType || u.account_type || "Internal"}</td>
                <td>{u.department || "-"}</td>
                <td>{u.businessRole || "Unassigned"}</td>
                <td>{(u.groups || []).length}</td>
                <td className="advanced-users-table__date">{toHumanDate(u.lastLogin)}</td>
                <td>{u.DataSource || u.dataSource || "N/A"}</td>
              </tr>
            ))}
            {!loading && !paged.length && (
              <tr>
                <td colSpan={8} className="no-logs">Nessun utente trovato con i filtri correnti</td>
              </tr>
            )}
          </tbody>
        </table>

        <div className="advanced-users-pagination">
          <button disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span>Page {page} / {totalPages}</span>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>Next</button>
        </div>

        {loading && <div style={{ color: "var(--muted)" }}>Caricamento dataset utenti...</div>}
        {err && <div className="err">{err}</div>}
      </div>
    </div>
  );
}
