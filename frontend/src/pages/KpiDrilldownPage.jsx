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
    <div style={{ padding: 16 }}>
      <Link to="/">← Back</Link>
      <h2>Drilldown: {metric}</h2>
      {err && <div style={{ color: "red" }}>{err}</div>}
      {!data && !err && <div>Loading...</div>}

      {metric === "overprivileged" && data && (
        <>
          <div>Soglia (top 10%): {data.threshold}</div>
          <table border="1" cellPadding="6">
            <thead>
              <tr>
                <th>User</th>
                <th>#Gruppi</th>
                <th>Over?</th>
                <th>Gruppi</th>
              </tr>
            </thead>
            <tbody>
              {(data.items || []).map((x, i) => (
                <tr key={i}>
                  <td>{x.username}</td>
                  <td>{x.groupCount}</td>
                  <td>{String(x.isOverprivileged)}</td>
                  <td>{(x.groups || []).join(", ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {metric === "ai-detection" && data && (
        <table border="1" cellPadding="6">
          <thead>
            <tr>
              <th>User</th>
              <th>Family</th>
              <th>Ridondanti</th>
              <th>Da tenere</th>
              <th>#</th>
            </tr>
          </thead>
          <tbody>
            {(data.items || []).map((x, i) => (
              <tr key={i}>
                <td>{x.username}</td>
                <td>{x.family}</td>
                <td>{(x.redundantRoles || []).join(", ")}</td>
                <td>{(x.keptRoles || []).join(", ")}</td>
                <td>{x.redundantCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {metric === "cluster-quality" && data && (
        <div className="panel">
          <div style={{ marginBottom: 20 }}>
            <h3>Data Quality Summary</h3>
            <div style={{ display: "flex", gap: 20 }}>
              <div>Total Rows: {data.stats?.rowsTotal || 0}</div>
              <div style={{ color: "#f43f5e" }}>Duplicates: {data.stats?.duplicateDisplayName || 0}</div>
              <div style={{ color: "#f43f5e" }}>Missing Dept: {data.stats?.missingDepartment || 0}</div>
            </div>
          </div>

          {(data.items || []).map((section, idx) => (
            <div key={idx} style={{ marginBottom: 24 }}>
              <h4 style={{ color: "var(--muted)" }}>{section.type} ({section.count})</h4>
              {section.count > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th>Identifier</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section.users || []).map((u, i) => (
                      <tr key={i}>
                        <td>{typeof u === 'string' ? u : (u.displayName || u.username || JSON.stringify(u))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p style={{ color: "#10b981", fontSize: 13 }}>No issues found</p>
              )}
            </div>
          ))}

          {data.rejects?.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <h4 style={{ color: "#ef4444" }}>Rejected Rows</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th>Username</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rejects.map((r, i) => (
                    <tr key={i}>
                      <td>{r.username}</td>
                      <td>{r.reason}</td>
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
