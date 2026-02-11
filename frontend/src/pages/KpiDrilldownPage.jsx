import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  getDuplicateDisplayNameConflicts,
  chooseDuplicateDisplayName,
  api, // <-- aggiungi questo import
} from "../api";

export default function KpiDrilldownPage() {
  const { metric } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr("");
      setData(null);

      try {
        const res = await api.kpiDrilldown(metric);

        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      }
    }

    load();
    return () => { cancelled = true; };
  }, [metric]);

  return (
    <div className="main">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0 }}>Drilldown: <span style={{ color: "var(--accent)", textTransform: "capitalize" }}>{metric.replace("-", " ")}</span></h2>
        <Link to="/" className="primary" style={{ display: "inline-flex", alignItems: "center", padding: "8px 16px", borderRadius: 10, border: "1px solid var(--border)", background: "rgba(255,255,255,0.05)" }}>
          Indietro al Dashboard
        </Link>
      </div>

      {err && <div className="err panel">{err}</div>}
      {!data && !err && <div className="panel" style={{ color: "var(--muted)" }}>Caricamento dati in corso...</div>}

      {metric === "overprivileged" && data && (
        <div className="panel">
          <div className="row" style={{ marginBottom: 20 }}>
            <div className="card" style={{ flex: 1 }}>
              <div className="k">Soglia (top 10%)</div>
              <div className="v">{data.threshold}</div>
            </div>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>User</th>
                <th>Gruppi</th>
                <th>Overprivileged?</th>
                <th>Dettaglio Gruppi</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((x, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{x.username}</td>
                  <td>{x.groupCount}</td>
                  <td>
                    <span style={{ color: x.isOverprivileged ? "var(--danger)" : "#71ffb2" }}>
                      {x.isOverprivileged ? "Yes" : "No"}
                    </span>
                  </td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{(x.groups || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metric === "ai-detection" && data && (
        <div className="panel">
          <table className="table">
            <thead>
              <tr>
                <th>Utente</th>
                <th>Famiglia</th>
                <th>Ruoli Ridondanti</th>
                <th>Mantenuti</th>
                <th style={{ textAlign: "center" }}>Conteggio</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((x, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 500 }}>{x.username}</td>
                  <td style={{ color: "var(--accent)" }}>{x.family}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{(x.redundantRoles || []).join(", ")}</td>
                  <td style={{ color: "var(--muted)", fontSize: 13 }}>{(x.keptRoles || []).join(", ")}</td>
                  <td style={{ textAlign: "center", fontWeight: 700 }}>{x.redundantCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {metric === "cluster-quality" && data && (
        <div className="panel">
          <div style={{ marginBottom: 24 }}>
            <h3 style={{ marginTop: 0, fontSize: 16, textTransform: "uppercase", letterSpacing: 1 }}>Riepilogo Qualità Dati</h3>
            <div className="grid">
              <div className="card">
                <div className="k">Righe Totali</div>
                <div className="v">{data.stats?.rowsTotal || 0}</div>
              </div>
              <div className="card" style={{ borderLeft: "3px solid var(--danger)" }}>
                <div className="k">Duplicati</div>
                <div className="v" style={{ color: "var(--danger)" }}>{data.stats?.duplicateDisplayName || 0}</div>
              </div>
              <div className="card" style={{ borderLeft: "3px solid var(--danger)" }}>
                <div className="k">Dept Mancanti</div>
                <div className="v" style={{ color: "var(--danger)" }}>{data.stats?.missingDepartment || 0}</div>
              </div>
            </div>
          </div>

          {(data.items || []).map((section, idx) => (
            <div key={idx} style={{ marginBottom: 32 }}>
              <h4 style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 16 }}>
                {section.type} <span style={{ float: "right", fontSize: 12 }}>Conteggio: {section.count}</span>
              </h4>
              {section.count > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Identificativo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section.users || []).map((u, i) => (
                      <tr key={i}>
                        <td style={{ fontFamily: "monospace", fontSize: 13 }}>
                          {typeof u === 'string' ? u : (u.displayName || u.username || JSON.stringify(u))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: "#71ffb2", fontSize: 13, background: "rgba(113, 255, 178, 0.05)", padding: 10, borderRadius: 8 }}>
                  Nessun problema riscontrato per questa categoria.
                </div>
              )}
            </div>
          ))}

          {data.rejects?.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h4 style={{ color: "var(--danger)", textTransform: "uppercase", fontSize: 14 }}>Righe Scartate</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Motivo dello scarto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rejects.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{r.username}</td>
                      <td style={{ color: "var(--muted)" }}>{r.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
