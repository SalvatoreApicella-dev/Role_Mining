import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";
import { buildAuditPdfBytes, buildAuditPdfModel } from "../reportAuditPdf.js";
import { buildReportsCatalog } from "../reportsCatalog.js";

const FETCH_BATCH = 500;

function csvEscape(value) {
  const text = String(value ?? "");
  if (text.includes(",") || text.includes('"') || text.includes("\n")) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function downloadCsv(filename, rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  const headers = safeRows.length ? Object.keys(safeRows[0]) : [];
  const lines = safeRows.map((row) => headers.map((header) => csvEscape(row?.[header])).join(","));
  const csv = [headers.join(","), ...lines].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function downloadPdf(report) {
  const model = buildAuditPdfModel(report);
  const bytes = buildAuditPdfBytes(model);
  const blob = new Blob([bytes], { type: "application/pdf" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = model.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function CsvIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 17h8M12 10v6m0 0-2.5-2.5M12 16l2.5-2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
      <path d="M7.5 20.5h9" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
    </svg>
  );
}

function PdfIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M14 3v6h6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M8 16.5h8M8 13.5h8M8 10.5h4" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="1.6" />
      <path d="M12 18.5v-2.5m0 2.5-2-2m2 2.5 2-2" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.6" />
    </svg>
  );
}

async function loadAllUsers() {
  let offset = 0;
  let total = Infinity;
  const out = [];

  while (offset < total) {
    const res = await api.users("", FETCH_BATCH, offset, "", "asc", "");
    const items = Array.isArray(res?.items) ? res.items : [];
    total = Number(res?.total || 0);
    out.push(...items);
    offset += FETCH_BATCH;
    if (!items.length) break;
  }

  return out;
}

export default function ReportsPage() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [catalogFilter, setCatalogFilter] = useState("");
  const [snapshot, setSnapshot] = useState({
    users: [],
    businessRoles: { roles: [], assignments: {} },
    mining: {},
    kpi: {},
    clusterQuality: {},
    groupCounts: {},
  });

  async function load() {
    try {
      setLoading(true);
      setErr("");

      const [users, businessRoles, mining, kpi, clusterQuality, groupCounts] = await Promise.all([
        loadAllUsers(),
        api.businessRoles(),
        api.roleMiningLast(),
        api.kpi(),
        api.kpiDrilldown("cluster-quality").catch(() => ({ summaryCards: [] })),
        api.groupCounts(),
      ]);

      setSnapshot({
        users,
        businessRoles,
        mining,
        kpi,
        clusterQuality,
        groupCounts,
      });
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const reports = useMemo(() => buildReportsCatalog(snapshot), [snapshot]);

  const visibleReports = useMemo(() => {
    const q = String(catalogFilter || "").trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((report) => {
      const haystack = `${report.title} ${report.description} ${report.audience}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [catalogFilter, reports]);

  const totalRows = useMemo(
    () => reports.reduce((sum, report) => sum + (Array.isArray(report.rows) ? report.rows.length : 0), 0),
    [reports],
  );

  return (
    <div className="main reports-page">
      <section className="reports-hero panel">
        <div className="reports-hero__copy">
          <h2 style={{ marginTop: 0, marginBottom: 6 }}>Reports</h2>
          <div className="reports-hero__subtitle">
            Catalogo audit-ready con report preconfigurati esportabili in CSV. La struttura e gia pronta
            per aggiungere export PDF visuali in una seconda fase.
          </div>
        </div>
        <div className="reports-summary">
          <div className="reports-summary__card">
            <span>Configured reports</span>
            <strong>{reports.length}</strong>
          </div>
          <div className="reports-summary__card">
            <span>Total export rows</span>
            <strong>{totalRows}</strong>
          </div>
          <div className="reports-summary__card">
            <span>Data sources</span>
            <strong>Users + Mining</strong>
          </div>
        </div>
      </section>

      <div className="panel reports-toolbar">
        <div className="reports-toolbar__search">
          <label className="reports-toolbar__label">Search report</label>
          <input
            type="search"
            value={catalogFilter}
            onChange={(e) => setCatalogFilter(e.target.value)}
            placeholder="users, cluster, business role..."
          />
        </div>
        <div className="reports-toolbar__actions">
          <button className="primary" onClick={load} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh datasets"}
          </button>
        </div>
      </div>

      <section className="reports-grid">
        {visibleReports.map((report) => (
          <article key={report.id} className="panel reports-card">
            <div className="reports-card__head">
              <div>
                <span className="reports-card__eyebrow">{report.audience}</span>
                <h3 className="reports-card__title">{report.title}</h3>
              </div>
              <span className="reports-card__badge">{(report.rows || []).length} rows</span>
            </div>
            <p className="reports-card__desc">{report.description}</p>
            <div className="reports-card__stats">
              <div className="reports-card__stat">
                <span>Rows</span>
                <strong>{(report.rows || []).length}</strong>
              </div>
              <div className="reports-card__stat">
                <span>Format</span>
                <strong>CSV + PDF</strong>
              </div>
            </div>
            <div className="reports-card__meta">
              <span>CSV ready</span>
              <span>Audit PDF</span>
              <span>Preconfigured schema</span>
            </div>
            <div className="reports-card__actions">
              <button
                className="reports-card__icon-btn reports-card__icon-btn--csv"
                onClick={() => downloadCsv(report.filename, report.rows || [])}
                disabled={loading || !(report.rows || []).length}
                title="Download CSV"
                aria-label={`Download CSV for ${report.title}`}
              >
                <CsvIcon />
              </button>
              <button
                type="button"
                className="reports-card__icon-btn reports-card__icon-btn--pdf"
                onClick={() => downloadPdf(report)}
                disabled={loading || !(report.rows || []).length}
                title="Download PDF"
                aria-label={`Download PDF for ${report.title}`}
              >
                <PdfIcon />
              </button>
            </div>
          </article>
        ))}
      </section>

      {!loading && !visibleReports.length && (
        <div className="panel reports-empty">Nessun report corrisponde ai filtri correnti.</div>
      )}

      {loading && <div style={{ color: "var(--muted)" }}>Caricamento dataset reports...</div>}
      {err && <div className="err">{err}</div>}
    </div>
  );
}
