import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { downloadCsv } from "./aiLabUtils.js";

export default function AiLabDriftPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [severityFilter, setSeverityFilter] = useState("all");

  async function load() {
    try {
      setErr("");
      setData(await api.aiLabDrift());
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);

  const s = data?.summary || {};
  const signals = (data?.signals || []).filter((x) => severityFilter === "all" || x.severity === severityFilter);

  function exportSignalsCsv() {
    downloadCsv(
      "ai_lab_drift_signals.csv",
      ["id", "label", "severity", "psi", "delta"],
      (data?.signals || []).map((x) => [x.id, x.label, x.severity, x.psi ?? "", x.delta ?? ""])
    );
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Data Drift Monitor</h2>
      <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Confronta baseline e distribuzione corrente delle feature operative tramite PSI e variazioni aggregate.
      </p>
      <div className="row" style={{ gap: 10, marginBottom: 14 }}>
        <button className="primary" onClick={load}>Aggiorna</button>
        <select value={severityFilter} onChange={(e) => setSeverityFilter(e.target.value)}>
          <option value="all">Severity: Tutte</option>
          <option value="high">Severity: High</option>
          <option value="medium">Severity: Medium</option>
          <option value="low">Severity: Low</option>
        </select>
        <button onClick={exportSignalsCsv}>Esporta CSV</button>
      </div>
      {err && <div className="err panel">{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 16 }}>
        <div className="card"><div className="k">Popolazione</div><div className="v">{s.population ?? 0}</div></div>
        <div className="card"><div className="k">PSI Account Type</div><div className="v">{s.psi_account_type ?? 0}</div></div>
        <div className="card"><div className="k">PSI Department</div><div className="v">{s.psi_department ?? 0}</div></div>
        <div className="card"><div className="k">Delta Gruppi Medi</div><div className="v">{s.mean_groups_delta ?? 0}</div></div>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Segnali Drift</h3>
        <table className="table">
          <thead><tr><th>Segnale</th><th>Severity</th><th>PSI/Delta</th><th style={{ width: 220 }}>Intensita</th></tr></thead>
          <tbody>
            {signals.map((x) => {
              const score = Math.abs(Number(x.psi ?? x.delta ?? 0));
              const width = Math.max(4, Math.min(100, score * 100));
              return (
              <tr key={x.id}>
                <td>{x.label}</td>
                <td>{x.severity.toUpperCase()}</td>
                <td>{x.psi ?? x.delta ?? "-"}</td>
                <td>
                  <div style={{ background: "rgba(255,255,255,0.06)", borderRadius: 8, height: 10 }}>
                    <div style={{ width: `${width}%`, height: "100%", borderRadius: 8, background: "var(--accent)" }} />
                  </div>
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
