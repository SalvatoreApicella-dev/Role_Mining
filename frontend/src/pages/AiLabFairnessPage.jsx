import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { downloadCsv } from "./aiLabUtils.js";

export default function AiLabFairnessPage() {
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    try {
      setErr("");
      setData(await api.aiLabFairness());
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);
  const byDept = (data?.byDepartment || []).filter((x) => String(x.group || "").toLowerCase().includes(q.toLowerCase()));
  const byType = (data?.byAccountType || []).filter((x) => String(x.group || "").toLowerCase().includes(q.toLowerCase()));

  function exportFairnessCsv() {
    const rows = [];
    byDept.forEach((x) => rows.push(["department", x.group, x.size, x.errorRate, x.gapVsOverall]));
    byType.forEach((x) => rows.push(["accountType", x.group, x.size, x.errorRate, x.gapVsOverall]));
    downloadCsv("ai_lab_fairness.csv", ["dimension", "group", "size", "errorRate", "gapVsOverall"], rows);
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Bias & Fairness Checks</h2>
      <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Misura gap di errore per dipartimento e account type rispetto al baseline globale del modello.
      </p>
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="primary" onClick={load}>Aggiorna</button>
        <button onClick={exportFairnessCsv}>Esporta CSV</button>
        <input style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtra gruppo..." />
      </div>
      {err && <div className="err panel">{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 16 }}>
        <div className="card"><div className="k">Overall Error Rate</div><div className="v">{data?.overallErrorRate ?? 0}</div></div>
      </div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Gap per Department</h3>
        <table className="table">
          <thead><tr><th>Department</th><th>Size</th><th>Error Rate</th><th>Gap vs Overall</th></tr></thead>
          <tbody>
            {byDept.map((x) => (
              <tr key={`d-${x.group}`}><td>{x.group}</td><td>{x.size}</td><td>{x.errorRate}</td><td>{x.gapVsOverall}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Gap per Account Type</h3>
        <table className="table">
          <thead><tr><th>Account Type</th><th>Size</th><th>Error Rate</th><th>Gap vs Overall</th></tr></thead>
          <tbody>
            {byType.map((x) => (
              <tr key={`t-${x.group}`}><td>{x.group}</td><td>{x.size}</td><td>{x.errorRate}</td><td>{x.gapVsOverall}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
