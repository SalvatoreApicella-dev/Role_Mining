import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { downloadCsv } from "./aiLabUtils.js";

export default function AiLabTimelinePage() {
  const [data, setData] = useState({ items: [], learningHistory: [] });
  const [modelName, setModelName] = useState("candidate-v2");
  const [note, setNote] = useState("");
  const [err, setErr] = useState("");
  const [q, setQ] = useState("");
  const [qLearning, setQLearning] = useState("");

  async function load() {
    try {
      setErr("");
      const res = await api.aiLabTimeline();
      setData({ items: res.items || [], learningHistory: res.learningHistory || [] });
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function runSimulated() {
    try {
      setErr("");
      await api.aiLabTimelineRun(modelName, note);
      setNote("");
      await load();
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  useEffect(() => { load(); }, []);
  const filtered = (data.items || []).filter((r) => {
    const z = `${r.modelName} ${r.triggeredBy} ${r.status} ${r.ts}`.toLowerCase();
    return z.includes(q.toLowerCase());
  });
  const filteredLearning = (data.learningHistory || []).filter((r) => {
    const z = `${r.signalType || ""} ${r.source || ""} ${r.entity || ""} ${r.actor || ""} ${JSON.stringify(r.details || {})}`.toLowerCase();
    return z.includes(qLearning.toLowerCase());
  });

  function exportTimelineCsv() {
    downloadCsv(
      "ai_lab_training_timeline.csv",
      ["ts", "modelName", "status", "accuracy", "f1", "precision", "recall", "triggeredBy", "datasetSize", "note"],
      filtered.map((r) => [r.ts, r.modelName, r.status, r.metrics?.accuracy, r.metrics?.f1, r.metrics?.precision, r.metrics?.recall, r.triggeredBy, r.datasetSize, r.note || ""])
    );
  }

  function exportLearningCsv() {
    downloadCsv(
      "ai_lab_learning_history.csv",
      ["ts", "signalType", "source", "entity", "actor", "details"],
      filteredLearning.map((r) => [r.ts, r.signalType, r.source, r.entity, r.actor, JSON.stringify(r.details || {})])
    );
  }

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Training Timeline</h2>
      <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Traccia run di training, metriche principali e metadata di esecuzione per audit e comparazione storica.
      </p>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row">
          <input style={{ width: 220 }} value={modelName} onChange={(e) => setModelName(e.target.value)} placeholder="Nome modello" />
          <input style={{ width: 360 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Nota run (opzionale)" />
          <button className="primary" onClick={runSimulated}>Nuovo Run</button>
          <button onClick={load}>Aggiorna</button>
          <button onClick={exportTimelineCsv}>Esporta CSV</button>
          <input style={{ width: 220 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtra timeline..." />
        </div>
      </div>
      {err && <div className="err panel">{err}</div>}
      <div className="panel">
        <table className="table">
          <thead><tr><th>Timestamp</th><th>Model</th><th>Status</th><th>Accuracy</th><th>F1</th><th>By</th></tr></thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>{r.ts}</td>
                <td>{r.modelName}</td>
                <td>{r.status}</td>
                <td>{r.metrics?.accuracy ?? "-"}</td>
                <td>{r.metrics?.f1 ?? "-"}</td>
                <td>{r.triggeredBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Nuove Informazioni Apprese dal Modello</h3>
          <div className="row">
            <input style={{ width: 260 }} value={qLearning} onChange={(e) => setQLearning(e.target.value)} placeholder="Filtra learning history..." />
            <button onClick={exportLearningCsv}>Esporta CSV</button>
          </div>
        </div>
        <table className="table">
          <thead><tr><th>TS</th><th>Signal Type</th><th>Source</th><th>Entity</th><th>Actor</th><th>Details</th></tr></thead>
          <tbody>
            {filteredLearning.map((x) => (
              <tr key={x.id}>
                <td>{x.ts}</td>
                <td>{x.signalType}</td>
                <td>{x.source}</td>
                <td>{x.entity || "-"}</td>
                <td>{x.actor}</td>
                <td style={{ color: "var(--muted)", fontSize: 12 }}>{JSON.stringify(x.details || {})}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
