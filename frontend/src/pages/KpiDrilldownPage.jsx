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
        const res =
          metric === "cluster-quality"
            ? await getDuplicateDisplayNameConflicts()
            : await api.kpiDrilldown(metric); // <-- invece di fetch diretto

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
        <div
          className="panel"
          style={{
            position: "relative",
            zIndex: 999999,
            pointerEvents: "auto",
          }}
        >
          <table className="table" style={{ pointerEvents: "auto" }}>
            <thead>
              <tr>
                <th>DisplayName</th>
                <th>BusinessRole</th>
                <th>Ruoli</th>
                <th></th>
              </tr>
            </thead>

            <tbody>
              {(data.items || []).flatMap((grp) =>
                (grp.rows || []).flatMap((r) => {
                  const selected = grp.chosenCandidateId === r.candidateId;

                  const doChoose = async () => {
                    setErr("");
                    try {
                      await chooseDuplicateDisplayName(grp.displayName, r.candidateId);
                      const refreshed = await getDuplicateDisplayNameConflicts();
                      setData(refreshed);
                    } catch (e) {
                      setErr(String(e));
                    }
                  };

                  return [
                    <tr
                      key={`main-${grp.displayName}-${r.candidateId}`}
                      onClick={doChoose}
                      style={{
                        cursor: "pointer",
                        background: selected ? "rgba(106,166,255,0.15)" : "transparent",
                      }}
                    >
                      <td>{r.displayName}</td>
                      <td>{r.businessRole}</td>
                      <td style={{ color: "var(--muted)" }}>
                        {(r.roles || []).join(", ")}
                      </td>
                      <td>
                        <button
                          type="button"
                          style={{
                            pointerEvents: "auto",
                            position: "relative",
                            zIndex: 1000000,
                          }}
                          onClick={(e) => {
                            e.stopPropagation();
                            doChoose();
                          }}
                        >
                          Seleziona
                        </button>
                      </td>
                    </tr>,

                    <tr key={`raw-${grp.displayName}-${r.candidateId}`}>
                      <td colSpan={4} style={{ color: "var(--muted)", fontSize: 12 }}>
                        {r.rawLine}
                      </td>
                    </tr>,
                  ];
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
