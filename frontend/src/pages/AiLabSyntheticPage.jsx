import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { downloadCsv } from "./aiLabUtils.js";

export default function AiLabSyntheticPage() {
  const [data, setData] = useState({ templates: [], lastGenerated: [] });
  const [scenario, setScenario] = useState("mixed");
  const [count, setCount] = useState(30);
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");

  async function load() {
    try {
      setErr("");
      setData(await api.aiLabSynthetic());
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function generate() {
    try {
      setErr("");
      await api.aiLabSyntheticGenerate(Number(count || 30), scenario, true);
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);
  const generated = (data.lastGenerated || []).filter((x) => {
    const z = `${x.template} ${x.displayName} ${x.department} ${x.severity}`.toLowerCase();
    return z.includes(q.toLowerCase());
  });

  function exportSyntheticCsv() {
    downloadCsv(
      "ai_lab_synthetic_cases.csv",
      ["id", "template", "displayName", "department", "businessRole", "severity"],
      generated.map((x) => [x.id, x.template, x.displayName, x.department, x.businessRole, x.severity])
    );
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Synthetic Edge-Case Generator</h2>
      <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Genera dataset sintetici con scenari limite controllati per stress test di robustezza e regressione.
      </p>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row">
          <select value={scenario} onChange={(e) => setScenario(e.target.value)}>
            <option value="mixed">mixed</option>
            {(data.templates || []).map((t) => <option key={t.id} value={t.id}>{t.id}</option>)}
          </select>
          <input type="number" value={count} onChange={(e) => setCount(e.target.value)} style={{ width: 120 }} />
          <button className="primary" onClick={generate}>Genera</button>
          <button onClick={load}>Aggiorna</button>
          <button onClick={exportSyntheticCsv}>Esporta CSV</button>
          <input style={{ width: 260 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtra casi generati..." />
        </div>
      </div>
      {err && <div className="err panel">{err}</div>}
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Template disponibili</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Label</th><th>Risk</th></tr></thead>
          <tbody>
            {(data.templates || []).map((t) => <tr key={t.id}><td>{t.id}</td><td>{t.label}</td><td>{t.risk}</td></tr>)}
          </tbody>
        </table>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Ultimi casi generati</h3>
        <table className="table">
          <thead><tr><th>ID</th><th>Template</th><th>DisplayName</th><th>Department</th><th>Severity</th></tr></thead>
          <tbody>
            {generated.map((x) => (
              <tr key={x.id}><td>{x.id}</td><td>{x.template}</td><td>{x.displayName}</td><td>{x.department}</td><td>{x.severity}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
