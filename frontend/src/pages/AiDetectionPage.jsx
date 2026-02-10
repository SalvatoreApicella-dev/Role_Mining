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
      <h2 style={{ marginTop: 0 }}>AI Detection — Smart Anomaly Analysis</h2>

      {/* Stats Bar */}
      {status === "ready" && stats && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 20 }}>
          <StatCard label="Anomaly %" value={`${stats.aiDetection ?? 0}%`} accent="var(--accent)" />
          <StatCard label="Anomalies" value={stats.totalAnomalies ?? 0} />
          <StatCard label="Users Affected" value={stats.usersWithAnomaly ?? 0} />
          <StatCard label="Total Scanned" value={stats.totalUsersScanned ?? 0} />
        </div>
      )}

      {/* Action Bar */}
      <div className="panel" style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <button
          className="primary"
          onClick={handleRunAnalysis}
          disabled={isRunning}
          style={{ padding: "10px 22px", borderRadius: 10, fontWeight: 600, opacity: isRunning ? 0.6 : 1 }}
        >
          {isRunning ? "⏳ Analisi in corso…" : "🔍 Esegui Analisi"}
        </button>

        {status === "not_run" && (
          <span style={{ color: "var(--muted)" }}>
            Nessuna analisi eseguita. Premi il bottone per avviare.
          </span>
        )}
        {ts && (
          <span style={{ color: "var(--muted)", fontSize: 13 }}>
            Ultimo aggiornamento: {new Date(ts).toLocaleString()}
          </span>
        )}
      </div>

      {/* Loading State */}
      {status === "loading" && (
        <div className="panel" style={{ color: "var(--muted)" }}>Caricamento risultati salvati…</div>
      )}

      {/* Error */}
      {err && <div className="err" style={{ marginBottom: 10 }}>{err}</div>}

      {/* Results Table */}
      {status === "ready" && (
        <div className="panel">
          <div style={{ color: "var(--muted)", marginBottom: 10 }}>
            Utenti con anomalie: <b style={{ color: "var(--text)" }}>{rows.length}</b>
          </div>

          {rows.length > 0 ? (
            <table className="table" style={{ width: "100%" }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Utente</th>
                  <th style={{ textAlign: "left" }}>Business Role</th>
                  <th style={{ textAlign: "left" }}>Dipartimento</th>
                  <th style={{ textAlign: "left" }}>Tipo Account</th>
                  <th style={{ textAlign: "center", width: 100 }}>Anomalie</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.username}>
                    <td>{r.displayName || r.username}</td>
                    <td style={{ color: "var(--muted)" }}>{r.businessRole}</td>
                    <td style={{ color: "var(--muted)" }}>{r.department}</td>
                    <td style={{ color: "var(--muted)" }}>{r.accountType || "—"}</td>
                    <td style={{ textAlign: "center" }}>
                      <button
                        className="primary"
                        style={{ padding: "6px 14px", borderRadius: 10, fontWeight: 600 }}
                        onClick={() => openAnomalyPopup(r)}
                        title="Mostra dettagli anomalie"
                      >
                        {r.anomalyCount}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ color: "var(--muted)", padding: "20px 0" }}>
              ✅ Nessuna anomalia trovata. Tutti i ruoli sono conformi.
            </div>
          )}
        </div>
      )}

      {/* Anomaly Detail POPUP */}
      {open && selected && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)",
            display: "grid", placeItems: "center", zIndex: 9999, padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel"
            style={{ width: "min(820px, 95vw)", maxHeight: "80vh", overflow: "auto" }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>
                Anomalie di {selected.displayName || selected.username}
              </h3>
              <button className="danger" onClick={() => setOpen(false)}>Chiudi</button>
            </div>

            <div style={{ color: "var(--muted)", marginTop: 6, fontSize: 13 }}>
              Business Role: <b>{selected.businessRole}</b> · Dipartimento: <b>{selected.department}</b>
              {selected.accountType && <> · Tipo: <b>{selected.accountType}</b></>}
            </div>

            <hr className="sep" />

            <table className="table">
              <thead>
                <tr>
                  <th>Gruppo</th>
                  <th>Confidence</th>
                  <th>Peer %</th>
                  <th>Dept %</th>
                  <th>Motivi</th>
                </tr>
              </thead>
              <tbody>
                {(selected.anomalies || []).map((a, i) => (
                  <tr key={`${a.group}-${i}`}>
                    <td style={{ fontWeight: 500 }}>{a.group}</td>
                    <td>
                      <span style={{
                        background: a.confidence >= 0.9 ? "var(--danger, #e74c3c)"
                          : a.confidence >= 0.7 ? "var(--warning, #e67e22)"
                            : "var(--accent, #3498db)",
                        color: "#fff", padding: "3px 8px", borderRadius: 8, fontSize: 12,
                      }}>
                        {(a.confidence * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td style={{ color: "var(--muted)" }}>{(a.peerFreq * 100).toFixed(1)}%</td>
                    <td style={{ color: "var(--muted)" }}>{(a.deptFreq * 100).toFixed(1)}%</td>
                    <td>
                      <ul style={{ margin: 0, paddingLeft: 16 }}>
                        {(a.reasons || []).map((r, j) => (
                          <li key={j} style={{ color: "var(--muted)", fontSize: 13, margin: "2px 0" }}>
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

function StatCard({ label, value, accent }) {
  return (
    <div style={{
      background: "var(--card)", border: "1px solid var(--border)",
      borderRadius: 10, padding: "10px 18px", minWidth: 120,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
    }}>
      <div style={{ fontSize: 12, color: "var(--muted)", textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || "var(--text)" }}>{value}</div>
    </div>
  );
}
