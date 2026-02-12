import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { downloadCsv } from "./aiLabUtils.js";
import Select from "react-select";

export default function AiLabFeedbackPage() {
  const [data, setData] = useState({ total: 0, byCorrectedType: [], items: [] });
  const [users, setUsers] = useState([]);
  const [accountTypes, setAccountTypes] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [form, setForm] = useState({
    username: "",
    predicted_type: "Internal",
    corrected_type: "Service",
    confidence: 0.5,
    note: "",
  });
  const [err, setErr] = useState("");
  const [qEvents, setQEvents] = useState("");
  const [qHistory, setQHistory] = useState("");
  const [saving, setSaving] = useState(false);

  async function loadInitial() {
    try {
      setErr("");
      const [fb, ures, tRes] = await Promise.all([api.aiLabFeedback(), api.users("", 500, 0), api.mlAccountTypes()]);
      setData(fb);
      setUsers(ures.items || []);
      setAccountTypes((tRes.types || []).map((t) => ({ value: t, label: t })));
      if (!form.username && (ures.items || []).length > 0) {
        const first = ures.items[0];
        setSelectedUser({
          value: first.username,
          label: `${first.displayName || first.username} (${first.username})`,
          accountType: first.accountType || "Internal",
        });
        setForm((prev) => ({
          ...prev,
          username: first.username,
          predicted_type: first.accountType || "Internal",
        }));
      }
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function refreshFeedbackOnly() {
    try {
      setErr("");
      const fb = await api.aiLabFeedback();
      setData(fb);
    } catch (e) {
      setErr(String(e.message || e));
    }
  }

  async function submitFeedback() {
    try {
      setErr("");
      setSaving(true);
      const res = await api.aiLabFeedbackAdd({
        username: form.username,
        predicted_type: form.predicted_type,
        corrected_type: form.corrected_type,
        confidence: Number(form.confidence || 0),
        note: form.note,
      });
      // Optimistic UI update for fast perceived save.
      if (res?.event) {
        setData((prev) => {
          const nextItems = [res.event, ...(prev.items || [])].slice(0, 200);
          const nextHistory = res?.manualEvent
            ? [res.manualEvent, ...(prev.history || [])].slice(0, 500)
            : (prev.history || []);
          return {
            ...prev,
            total: Number(prev.total || 0) + 1,
            items: nextItems,
            history: nextHistory,
          };
        });
      }
      setForm((prev) => ({ ...prev, note: "" }));
      // Background refresh to keep aggregate counters aligned without blocking UX.
      setTimeout(() => { refreshFeedbackOnly(); }, 200);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { loadInitial(); }, []);
  const filteredItems = (data.items || []).filter((x) => {
    const z = `${x.username} ${x.predicted_type} ${x.corrected_type} ${x.author} ${x.note || ""}`.toLowerCase();
    return z.includes(qEvents.toLowerCase());
  });

  function exportFeedbackCsv() {
    downloadCsv(
      "ai_lab_feedback_events.csv",
      ["ts", "username", "predicted_type", "corrected_type", "confidence", "author", "note"],
      filteredItems.map((x) => [x.ts, x.username, x.predicted_type, x.corrected_type, x.confidence, x.author, x.note || ""])
    );
  }

  function exportHistoryCsv() {
    const rows = (data.history || []).map((x) => [
      x.ts,
      x.displayName || "",
      x.username || "",
      x.action || "",
      x.source || "",
      x.actor || "",
      JSON.stringify(x.details || {}),
    ]);
    downloadCsv("ai_lab_feedback_history.csv", ["ts", "displayName", "username", "action", "source", "actor", "details"], rows);
  }

  const userOptions = users.map((u) => ({
    value: u.username,
    label: `${u.displayName || u.username} (${u.username})`,
    accountType: u.accountType || "Internal",
  }));
  const filteredHistory = (data.history || []).filter((x) => {
    const z = `${x.displayName || ""} ${x.username || ""} ${x.action || ""} ${x.source || ""} ${x.actor || ""}`.toLowerCase();
    return z.includes(qHistory.toLowerCase());
  });

  return (
    <div className="main">
      <h2 style={{ marginTop: 0 }}>Human Feedback Loop</h2>
      <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 14, fontSize: 13 }}>
        Registra correzioni umane sulle predizioni e alimenta un flusso continuo di miglioramento supervisionato.
      </p>
      <div className="panel" style={{ marginBottom: 16 }}>
        <h3 style={{ marginTop: 0 }}>Nuovo feedback</h3>
        <div className="row" style={{ flexWrap: "wrap" }}>
          <div style={{ minWidth: 360 }}>
            <Select
              value={selectedUser}
              options={userOptions}
              onChange={(opt) => {
                setSelectedUser(opt);
                setForm((prev) => ({
                  ...prev,
                  username: opt?.value || "",
                  predicted_type: opt?.accountType || prev.predicted_type,
                }));
              }}
              isSearchable
              placeholder="Cerca DisplayName..."
              styles={{
                control: (base) => ({ ...base, minHeight: 40, background: "#111a2e", borderColor: "var(--border)" }),
                menu: (base) => ({ ...base, background: "#111a2e", zIndex: 30 }),
                option: (base, state) => ({ ...base, background: state.isFocused ? "rgba(255,255,255,0.08)" : "#111a2e", color: "var(--text)" }),
                singleValue: (base) => ({ ...base, color: "var(--text)" }),
                input: (base) => ({ ...base, color: "var(--text)" }),
              }}
            />
          </div>
          <select value={form.predicted_type} onChange={(e) => setForm({ ...form, predicted_type: e.target.value })} style={{ width: 180 }}>
            {accountTypes.map((t) => <option key={`p-${t.value}`} value={t.value}>{t.label}</option>)}
          </select>
          <select value={form.corrected_type} onChange={(e) => setForm({ ...form, corrected_type: e.target.value })} style={{ width: 180 }}>
            {accountTypes.map((t) => <option key={`c-${t.value}`} value={t.value}>{t.label}</option>)}
          </select>
          <input type="number" min="0" max="1" step="0.01" value={form.confidence} onChange={(e) => setForm({ ...form, confidence: e.target.value })} style={{ width: 100 }} />
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Nota" style={{ width: 260 }} />
          <button className="primary" onClick={submitFeedback} disabled={saving}>{saving ? "Salvataggio..." : "Salva feedback"}</button>
        </div>
      </div>
      {err && <div className="err panel">{err}</div>}
      <div className="grid" style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))", marginBottom: 16 }}>
        <div className="card"><div className="k">Feedback Totali</div><div className="v">{data.total}</div></div>
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Eventi recenti</h3>
        <div className="row" style={{ marginBottom: 10 }}>
          <input style={{ width: 260 }} value={qEvents} onChange={(e) => setQEvents(e.target.value)} placeholder="Filtra eventi..." />
          <button onClick={refreshFeedbackOnly}>Aggiorna</button>
          <button onClick={exportFeedbackCsv}>Esporta CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>TS</th><th>User</th><th>Predicted</th><th>Corrected</th><th>Confidence</th><th>Author</th></tr></thead>
          <tbody>
            {filteredItems.map((x) => (
              <tr key={x.id}><td>{x.ts}</td><td>{x.username}</td><td>{x.predicted_type}</td><td>{x.corrected_type}</td><td>{x.confidence}</td><td>{x.author}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ marginTop: 16 }}>
        <h3 style={{ marginTop: 0 }}>History Modifiche Manuali (globale)</h3>
        <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 8 }}>
          Include le modifiche manuali intercettate dai moduli applicativi a partire dall'attivazione del tracking.
        </div>
        <div className="row" style={{ marginBottom: 10 }}>
          <input style={{ width: 320 }} value={qHistory} onChange={(e) => setQHistory(e.target.value)} placeholder="Filtra history per utente/azione/source..." />
          <button onClick={exportHistoryCsv}>Esporta History CSV</button>
        </div>
        <table className="table">
          <thead><tr><th>TS</th><th>DisplayName</th><th>Username</th><th>Azione</th><th>Source</th><th>Actor</th></tr></thead>
          <tbody>
            {filteredHistory.map((h) => (
              <tr key={h.id}>
                <td>{h.ts}</td>
                <td>{h.displayName || "-"}</td>
                <td>{h.username || "-"}</td>
                <td>{h.action || "-"}</td>
                <td>{h.source || "-"}</td>
                <td>{h.actor || "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
