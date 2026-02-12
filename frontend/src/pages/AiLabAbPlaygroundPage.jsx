import React, { useMemo, useState } from "react";
import { aiLabAbCompareUpload } from "../api.js";
import { downloadCsv } from "./aiLabUtils.js";

export default function AiLabAbPlaygroundPage() {
  const [fileA, setFileA] = useState(null);
  const [fileB, setFileB] = useState(null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [trendFilter, setTrendFilter] = useState("all");

  async function runCompare() {
    if (!fileA || !fileB) {
      setErr("Seleziona entrambi i file CSV.");
      return;
    }
    try {
      setErr("");
      setLoading(true);
      setData(await aiLabAbCompareUpload(fileA, fileB));
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  const rows = useMemo(() => {
    const all = data?.comparison || [];
    if (trendFilter === "all") return all;
    return all.filter((r) => r.trend === trendFilter);
  }, [data, trendFilter]);

  function exportComparisonCsv() {
    if (!data) return;
    downloadCsv(
      "ai_lab_ab_csv_compare.csv",
      ["metric", "label", "datasetA", "datasetB", "diff", "trend"],
      (data.comparison || []).map((r) => [r.metric, r.label, r.a, r.b, r.diff, r.trend])
    );
  }

  const scoreA = Number(data?.datasetA?.score || 0);
  const scoreB = Number(data?.datasetB?.score || 0);

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>A/B Model Playground</h2>
      <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Carica due CSV, esegue le stesse logiche di valutazione su entrambi e confronta automaticamente miglioramenti e regressioni.
      </p>

      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="row">
          <label style={{ color: "var(--muted)", fontSize: 13 }}>CSV A</label>
          <input type="file" accept=".csv" onChange={(e) => setFileA(e.target.files?.[0] || null)} />
          <label style={{ color: "var(--muted)", fontSize: 13 }}>CSV B</label>
          <input type="file" accept=".csv" onChange={(e) => setFileB(e.target.files?.[0] || null)} />
          <button className="primary" onClick={runCompare} disabled={loading}>{loading ? "Analisi..." : "Confronta CSV"}</button>
          <button onClick={exportComparisonCsv} disabled={!data}>Esporta CSV</button>
        </div>
      </div>

      {err && <div className="err panel">{err}</div>}

      {data && (
        <>
          <div className="grid" style={{ gridTemplateColumns: "repeat(4, minmax(0, 1fr))", marginBottom: 16 }}>
            <div className="card">
              <div className="k">Score Dataset A</div>
              <div className="v">{scoreA}</div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{data.datasetA?.name}</div>
            </div>
            <div className="card">
              <div className="k">Score Dataset B</div>
              <div className="v">{scoreB}</div>
              <div style={{ color: "var(--muted)", fontSize: 12 }}>{data.datasetB?.name}</div>
            </div>
            <div className="card">
              <div className="k">Differenza Score</div>
              <div className="v" style={{ color: Number(data.scoreDiff) >= 0 ? "#71ffb2" : "var(--danger)" }}>{data.scoreDiff}</div>
            </div>
            <div className="card">
              <div className="k">Winner</div>
              <div className="v">{data.winner}</div>
            </div>
          </div>

          <div className="panel" style={{ marginBottom: 16 }}>
            <h3 style={{ marginTop: 0 }}>Sintesi confronto</h3>
            <div className="row">
              <div className="card" style={{ minWidth: 180 }}><div className="k">Migliorati</div><div className="v" style={{ color: "#71ffb2" }}>{data.summary?.improved ?? 0}</div></div>
              <div className="card" style={{ minWidth: 180 }}><div className="k">Peggiorati</div><div className="v" style={{ color: "var(--danger)" }}>{data.summary?.worsened ?? 0}</div></div>
              <div className="card" style={{ minWidth: 180 }}><div className="k">Invariati</div><div className="v">{data.summary?.unchanged ?? 0}</div></div>
            </div>
          </div>

          <div className="panel">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Confronto Parametri</h3>
              <select value={trendFilter} onChange={(e) => setTrendFilter(e.target.value)}>
                <option value="all">Tutti</option>
                <option value="improved">Migliorati</option>
                <option value="worsened">Peggiorati</option>
                <option value="unchanged">Invariati</option>
              </select>
            </div>
            <table className="table">
              <thead>
                <tr>
                  <th>Parametro</th>
                  <th>CSV A</th>
                  <th>CSV B</th>
                  <th>Diff (B-A)</th>
                  <th>Trend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.metric}>
                    <td>{r.label}</td>
                    <td>{r.a}</td>
                    <td>{r.b}</td>
                    <td>{r.diff}</td>
                    <td style={{ color: r.trend === "improved" ? "#71ffb2" : (r.trend === "worsened" ? "var(--danger)" : "var(--muted)"), fontWeight: 600 }}>
                      {r.trend}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
