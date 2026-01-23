import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api.js";

export default function OverprivilegedPage() {
  const [items, setItems] = useState([]);
  const [threshold, setThreshold] = useState(null);
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

      // 1) forza ricalcolo KPI e aggiornamento cache drilldown
      await api.kpi(); // necessario perché /api/kpi/drilldown usa lastRoleMiningResult [file:1638]

      // 2) poi prendi drilldown + utenti
      const [dr, u] = await Promise.all([
        api.kpiDrilldown("overprivileged"),
        api.users(""),
      ]);

      const thr = dr?.threshold ?? null;
        const all = dr?.items ?? [];


    //   // filtro robusto: non fidarti solo di isOverprivileged, usa threshold + groupCount
    //   const overOnly =
    //     thr == null ? [] : all.filter((x) => Number(x.groupCount || 0) >= Number(thr || 0)); // groupCount/threshold arrivano dal backend [file:1638]
    const overOnly = all.filter((x) => x.isOverprivileged);


      const map = {};
      (u?.users || []).forEach((usr) => {
        map[usr.username] = usr.displayName || usr.username;
      });

      if (!cancelled) {
        setThreshold(thr);
        setItems(overOnly);
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
    .map((x) => {
      const displayName = usersByUsername[x.username] || x.username;

      const allGroups = x.groups || [];           // colonna "Ruoli"
      const overGroups = x.overGroups || [];      // popup + conteggio

      return {
        key: x.username,
        displayName,
        ruoliText: allGroups.join(", "),
        groupCount: Number(x.groupCount || overGroups.length || 0),
        overGroups,
      };
    })
    .sort((a, b) => (b.groupCount - a.groupCount) || a.displayName.localeCompare(b.displayName));
}, [items, usersByUsername]);


  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Overprivileged users</h2>

      <div className="panel">
        <div style={{ color: "var(--muted)", marginBottom: 10 }}>
          Threshold: <b style={{ color: "var(--text)" }}>{threshold ?? "-"}</b>
          {" "} | Over users: <b style={{ color: "var(--text)" }}>{rows.length}</b>
        </div>

        {loading && <div style={{ color: "var(--muted)" }}>Loading…</div>}
        {err && <div className="err">{err}</div>}

        <div style={{ color: "var(--muted)", marginBottom: 10 }}>
        DEBUG → threshold: <b style={{ color: "var(--text)" }}>{String(threshold)}</b>
        {" | "}items (raw): <b style={{ color: "var(--text)" }}>{items?.length || 0}</b>
        </div>


        <table className="table">
          <thead>
            <tr>
              <th>DisplayName</th>
              <th>Ruoli</th>
              <th>Ruoli in eccesso</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key}>
                <td>{r.displayName}</td>
                <td style={{ color: "var(--muted)" }}>{r.ruoliText}</td>
                <td>
                  <button
                    className="primary"
                    style={{ padding: "6px 10px", borderRadius: 10 }}
                    onClick={() => openRolesPopup(r.displayName, r.overGroups)}

                    title="Mostra lista ruoli"
                  >
                    {r.groupCount}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!loading && !err && rows.length === 0 && (
          <div style={{ color: "var(--muted)" }}>Nessun overprivileged trovato.</div>
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
            style={{ width: "min(760px, 95vw)", maxHeight: "80vh", overflow: "auto" }}
          >
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
              <h3 style={{ margin: 0 }}>Ruoli di {selected?.displayName}</h3>
              <button className="danger" onClick={() => setOpen(false)}>Chiudi</button>
            </div>

            <hr className="sep" />

            <ul style={{ margin: 0, paddingLeft: 18 }}>
              {(selected?.groups || []).map((g) => (
                <li key={g} style={{ margin: "6px 0", color: "var(--muted)" }}>{g}</li>
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
