import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export default function AiDetectionPage() {
  const [items, setItems] = useState([]);
  const [usersByUsername, setUsersByUsername] = useState({});
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  // popup
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null); // { displayName, groups: [] }

  function openRolesPopup(displayName, groups) {
    setSelected({ displayName, groups: groups || [] });
    setOpen(true);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        setErr("");
        setLoading(true);

        // forza ricalcolo KPI/cache, come fai nell'altra pagina
        await api.kpi();

        const [dr, u] = await Promise.all([
          api.kpiDrilldown("ai-detection"),
          api.users(""),
        ]);

        const all = dr?.items ?? [];

        // QUI il backend ritorna item con redundantCount/redundantRoles, NON isOverprivileged
        const onlyWithRedundancy = all.filter(
          (x) => Number(x.redundantCount || 0) > 0
        );

        const map = {};
        (u?.users || []).forEach((usr) => {
          map[usr.username] = usr.displayName || usr.username;
        });

        if (!cancelled) {
          setItems(onlyWithRedundancy);
          setUsersByUsername(map);
        }
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // chiudi con ESC
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const rows = useMemo(() => {
    return (items || [])
      .map((x, idx) => {
        const displayName = usersByUsername[x.username] || x.username;

        const redundantRoles = x.redundantRoles || [];
        const keptRoles = x.keptRoles || [];
        const family = x.family || "-";

        return {
          key: `${x.username}__${family}__${idx}`,
          displayName,
          family,
          keptText: keptRoles.join(", "),
          redundantCount: Number(x.redundantCount || redundantRoles.length || 0),
          redundantRoles,
        };
      })
      .sort(
        (a, b) =>
          (b.redundantCount - a.redundantCount) ||
          a.displayName.localeCompare(b.displayName)
      );
  }, [items, usersByUsername]);

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>AI detection (ridondanze)</h2>

      <div className="panel">
        <div style={{ color: "var(--muted)", marginBottom: 10 }}>
          Items: <b style={{ color: "var(--text)" }}>{rows.length}</b>
        </div>

        {loading && <div style={{ color: "var(--muted)" }}>Loading…</div>}
        {err && <div className="err">{err}</div>}

        <table className="table">
          <thead>
            <tr>
              <th>DisplayName</th>
              <th>Famiglia</th>
              <th>Kept roles</th>
              <th>Ruoli ridondanti</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.displayName}</td>
                <td style={{ color: "var(--muted)" }}>{r.family}</td>
                <td style={{ color: "var(--muted)" }}>{r.keptText}</td>
                <td>
                  <button
                    className="primary"
                    style={{ padding: "6px 10px", borderRadius: 10 }}
                    onClick={() => openRolesPopup(r.displayName, r.redundantRoles)}
                    title="Mostra ruoli ridondanti"
                  >
                    {r.redundantCount}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && !err && rows.length === 0 && (
          <div style={{ color: "var(--muted)" }}>
            Nessuna ridondanza trovata.
          </div>
        )}
      </div>

      {/* POPUP */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.55)",
            display: "grid",
            placeItems: "center",
            zIndex: 9999,
            padding: 16,
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="panel"
            style={{
              width: "min(760px, 95vw)",
              maxHeight: "80vh",
              overflow: "auto",
            }}
          >
            <div
              className="row"
              style={{ justifyContent: "space-between", alignItems: "center" }}
            >
              <h3 style={{ margin: 0 }}>
                Ruoli ridondanti di {selected?.displayName}
              </h3>
              <button className="danger" onClick={() => setOpen(false)}>
                Chiudi
              </button>
            </div>

            <hr className="sep" />

            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(selected?.groups || []).map((g) => (
                <li key={g} style={{ margin: "6px 0", color: "var(--muted)" }}>
                  {g}
                </li>
              ))}
            </ul>

            {(selected?.groups || []).length === 0 && (
              <div style={{ color: "var(--muted)" }}>Nessun ruolo.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
