import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export default function AiDetectionPage() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState("loading"); // loading | not_run | ready | running | error
  const [err, setErr] = useState("");
  const [ts, setTs] = useState(null);

  // popup
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);

  function openAnomalyPopup(item) {
    setSelected(item);
    setOpen(true);
  }

  // On mount: load cached results (instant read)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cached = await api.aiDetectionLast();
        if (cancelled) return;
        if (cached?.status === "ready") {
          setItems(cached.items || []);
          setStats(cached.stats || {});
          setTs(cached.ts || null);
          setStatus("ready");
        } else {
          setStatus("not_run");
        }
      } catch (e) {
        if (!cancelled) {
          setErr(String(e.message || e));
          setStatus("error");
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Run Analysis (on-demand)
  async function handleRunAnalysis() {
    setStatus("running");
    setErr("");
    try {
      const result = await api.aiDetectionRun();
      setItems(result.items || []);
      setStats(result.stats || {});
      setTs(result.ts || null);
      setStatus("ready");
    } catch (e) {
      setErr(String(e.message || e));
      setStatus("error");
    }
  }

  // Close popup with ESC
  useEffect(() => {
    function onKey(e) { if (e.key === "Escape") setOpen(false); }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    return (items || [])
      .map((x) => ({
        ...x,
        ...x,
        // topReason removed from UI
        topConf: x.anomalies?.[0]?.confidence ?? 0,
      }))
      .sort((a, b) => b.anomalyCount - a.anomalyCount || a.username.localeCompare(b.username));
  }, [items]);

  const isRunning = status === "running";

  return (
    <div className="main">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Automatic Detection <span style={{ color: "var(--muted)", fontSize: 13, marginLeft: 10, fontWeight: 400 }}>Smart Anomaly Analysis</span></h2>
        {ts && (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            Ultimo aggiornamento: {new Date(ts).toLocaleString()}
          </span>
        )}
      </div>

      {/* Stats Bar */}
      {status === "ready" && stats && (
        <div className="grid" style={{ marginBottom: 24 }}>
          <StatCard label="Righe Totali" value={stats.totalUsersScanned ?? 0} color="#fff" />
          <StatCard label="Anomaly %" value={`${stats.aiDetection ?? 0}%`} color={(stats.aiDetection ?? 0) > 0 ? "var(--danger)" : "#71ffb2"} />
          <StatCard label="Anomalies" value={stats.totalAnomalies ?? 0} color={(stats.totalAnomalies ?? 0) > 0 ? "var(--danger)" : "#71ffb2"} />
          <StatCard label="Users Affected" value={stats.usersWithAnomaly ?? 0} color={(stats.usersWithAnomaly ?? 0) > 0 ? "var(--danger)" : "#71ffb2"} />
        </div>
      )}

      {/* Action Bar */}
      <div className="panel" style={{ marginBottom: 20, display: "flex", alignItems: "center", gap: 14 }}>
        <button
          className="primary"
          onClick={handleRunAnalysis}
          disabled={isRunning}
          style={{ padding: "10px 24px", borderRadius: 10, fontWeight: 600, opacity: isRunning ? 0.6 : 1 }}
        >
          {isRunning ? "Analisi in corso..." : "Esegui Analisi"}
        </button>

        {status === "not_run" && (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            Nessuna analisi eseguita. Avvia l'analisi per identificare anomalie.
          </span>
        )}
      </div>

      {/* Loading State */}
      {status === "loading" && (
        <div className="panel" style={{ color: "var(--muted)" }}>Caricamento risultati salvati...</div>
      )}

      {/* Error */}
      {err && <div className="err panel" style={{ marginBottom: 20 }}>{err}</div>}

      {/* Results Table */}
      {status === "ready" && (
        <div className="panel">
          <div style={{ color: "var(--muted)", marginBottom: 16, fontSize: 14, textTransform: "uppercase", letterSpacing: 0.5 }}>
            Utenti con anomalie: <b style={{ color: "var(--text)" }}>{rows.length}</b>
          </div>

          {rows.length > 0 ? (
            <table className="table">
              <thead>
                <tr>
                  <th>Utente</th>
                  <th>Business Role</th>
                  <th>Dipartimento</th>
                  <th>Tipo Account</th>
                  <th style={{ textAlign: "center", width: 120 }}>Anomalie</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.username}>
                    <td style={{ fontWeight: 500 }}>{r.displayName || r.username}</td>
                    <td style={{ color: "var(--muted)" }}>{r.businessRole}</td>
                    <td style={{ color: "var(--muted)" }}>{r.department}</td>
                    <td style={{ color: "var(--accent)" }}>{r.accountType || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="primary"
                        style={{ padding: "4px 16px", borderRadius: 8, fontSize: 12, fontWeight: 700 }}
                        onClick={() => openAnomalyPopup(r)}
                      >
                        {r.anomalyCount}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: "#71ffb2", padding: "20px 0", textAlign: "center", background: "rgba(113, 255, 178, 0.05)", borderRadius: 12 }}>
              Nessuna anomalia trovata. Tutti i ruoli sono conformi.
            </div>
          )}
        </div>
      )}

      {/* Anomaly Detail POPUP */}
      {open && selected && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
            display: "grid", placeItems: "center", zIndex: 9999, padding: 16,
            backdropFilter: "blur(4px)"
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel"
            style={{ width: "min(900px, 95vw)", maxHeight: "85vh", overflow: "auto", border: "1px solid rgba(255,255,255,0.15)", boxShadow: "0 24px 64px rgba(0,0,0,0.8)" }}
          >
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 18 }}>
                Anomalie: <span style={{ color: "var(--accent)" }}>{selected.displayName || selected.username}</span>
              </h3>
              <button className="danger" onClick={() => setOpen(false)} style={{ padding: "6px 16px", fontSize: 12 }}>Chiudi</button>
            </div>

            <div style={{ background: "rgba(255,255,255,0.03)", padding: "12px 16px", borderRadius: 10, fontSize: 13, marginBottom: 24, display: "flex", gap: 20 }}>
              <div>Business Role: <b style={{ color: "var(--text)" }}>{selected.businessRole}</b></div>
              <div>Dipartimento: <b style={{ color: "var(--text)" }}>{selected.department}</b></div>
              {selected.accountType && <div>Tipo: <b style={{ color: "var(--text)" }}>{selected.accountType}</b></div>}
            </div>

            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: "25%" }}>Gruppo</th>
                  <th style={{ width: "15%" }}>Score</th>
                  <th style={{ width: "12%" }}>Peer %</th>
                  <th style={{ width: "12%" }}>Dept %</th>
                  <th>Motivazioni Tecniche</th>
                </tr>
              </thead>
              <tbody>
                {(selected.anomalies || []).map((a, i) => (
                  <tr key={`${a.group}-${i}`}>
                    <td style={{ fontWeight: 500, fontFamily: "monospace", fontSize: 13 }}>{a.group}</td>
                    <td>
                      <div style={{ width: "100%", background: "rgba(255,255,255,0.1)", height: 6, borderRadius: 3, marginTop: 8, overflow: "hidden", position: "relative" }}>
                        <div style={{
                          width: `${a.confidence * 100}%`,
                          background: a.confidence >= 0.9 ? "var(--danger)" : a.confidence >= 0.7 ? "#ff9f1c" : "var(--accent)",
                          height: "100%"
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, fontWeight: 700 }}>
                        {(a.confidence * 100).toFixed(0)}% CONFIDENCE
                      </div>
                    </td>
                    <td style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>{(a.peerFreq * 100).toFixed(1)}%</td>
                    <td style={{ color: "var(--muted)", fontFamily: "monospace", fontSize: 12 }}>{(a.deptFreq * 100).toFixed(1)}%</td>
                    <td>
                      <ul style={{ margin: 0, paddingLeft: 12, listStyleType: "none" }}>
                        {(a.reasons || []).map((r, j) => (
                          <li key={j} style={{ color: "var(--muted)", fontSize: 12, marginBottom: 4, borderLeft: "2px solid rgba(255,255,255,0.1)", paddingLeft: 8 }}>
                            {r}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div className="card" style={{ borderLeft: color ? `3px solid ${color}` : undefined, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div className="k" style={{ textTransform: "uppercase", letterSpacing: 1, fontSize: 10 }}>{label}</div>
      <div className="v" style={{ color: color || "var(--text)" }}>{value}</div>
    </div>
  );
}
