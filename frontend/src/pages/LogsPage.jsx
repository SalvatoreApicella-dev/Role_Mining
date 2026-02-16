import React, { useEffect, useMemo, useState } from "react";
import { api } from "../api";

export default function LogsPage() {
  const PAGE_SIZE = 50;
  const MESSAGE_PREVIEW_MAX = 110;
  const [logs, setLogs] = useState([]);
  const [levelFilter, setLevelFilter] = useState("ALL");
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState("");
  const [detailOpen, setDetailOpen] = useState(false);
  const [err, setErr] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      setErr("");
      setLoading(true);
      const data = await api.logs();
      const normalized = (data.items || []).map((entry, idx) => ({
        ...entry,
        _id: `${entry?.ts || "n/a"}::${entry?.level || "N/A"}::${idx}`,
      }));
      setLogs(normalized);
      setSelectedId((prev) => prev || normalized[0]?._id || "");
    } catch (e) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  const levels = useMemo(() => {
    const unique = new Set(logs.map((x) => String(x?.level || "INFO").toUpperCase()));
    return ["ALL", ...Array.from(unique)];
  }, [logs]);

  const filteredLogs = useMemo(() => {
    if (levelFilter === "ALL") return logs;
    return logs.filter((log) => String(log?.level || "INFO").toUpperCase() === levelFilter);
  }, [logs, levelFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / PAGE_SIZE));
  const pageStart = (page - 1) * PAGE_SIZE;
  const pagedLogs = useMemo(
    () => filteredLogs.slice(pageStart, pageStart + PAGE_SIZE),
    [filteredLogs, pageStart]
  );

  useEffect(() => {
    setPage(1);
  }, [levelFilter]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  useEffect(() => {
    if (!pagedLogs.length) {
      setSelectedId("");
      setDetailOpen(false);
      return;
    }
    if (!pagedLogs.some((x) => x._id === selectedId)) {
      setSelectedId(pagedLogs[0]._id);
    }
  }, [pagedLogs, selectedId]);

  useEffect(() => {
    if (!detailOpen) return undefined;
    const onKeyDown = (ev) => {
      if (ev.key === "Escape") setDetailOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [detailOpen]);

  const selectedLog = pagedLogs.find((x) => x._id === selectedId) || null;

  function formatMessagePreview(message) {
    const text = String(message || "-");
    if (text.length <= MESSAGE_PREVIEW_MAX) return text;
    return `${text.slice(0, MESSAGE_PREVIEW_MAX - 3)}...`;
  }

  function formatHumanTs(ts) {
    if (!ts) return "-";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return String(ts);
    return d.toLocaleString("it-IT", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  }

  return (
    <div className="main logs-page">
      <h2 style={{ marginTop: 0 }}>Logs</h2>
      <div className="panel logs-panel">
        <div className="logs-toolbar">
          <button className="primary" onClick={loadLogs} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          <div className="logs-toolbar__controls">
            <label htmlFor="logs-level-filter">Level</label>
            <select
              id="logs-level-filter"
              value={levelFilter}
              onChange={(e) => setLevelFilter(e.target.value)}
            >
              {levels.map((level) => (
                <option key={level} value={level}>{level}</option>
              ))}
            </select>
          </div>
        </div>
        <hr className="sep" />
        <div className="logs-grid">
          <div className="logs-table-wrap">
            <div className="logs-helper">Click on a row to view details</div>
            <table className="table logs-table">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Level</th>
                  <th>Message</th>
                </tr>
              </thead>
              <tbody>
                {pagedLogs.map((log) => {
                  const lvl = String(log.level || "INFO").toUpperCase();
                  return (
                    <tr
                      key={log._id}
                      className={selectedId === log._id ? "is-active" : ""}
                      onClick={() => {
                        setSelectedId(log._id);
                        setDetailOpen(true);
                      }}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          setSelectedId(log._id);
                          setDetailOpen(true);
                        }
                      }}
                    >
                      <td className="logs-ts">{formatHumanTs(log.ts)}</td>
                      <td>
                        <span className={`logs-level-badge logs-level-badge--${lvl.toLowerCase()}`}>{lvl}</span>
                      </td>
                      <td className="logs-message-cell">{formatMessagePreview(log.message)}</td>
                    </tr>
                  );
                })}
                {pagedLogs.length === 0 && (
                  <tr>
                    <td colSpan={3} className="no-logs">Nessun log disponibile</td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="logs-pagination">
              <div className="logs-pagination__meta">
                Log {filteredLogs.length === 0 ? 0 : pageStart + 1}-{Math.min(pageStart + PAGE_SIZE, filteredLogs.length)} di {filteredLogs.length}
              </div>
              <div className="logs-pagination__actions">
                <button
                  className="logs-pagination__btn"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  Precedente
                </button>
                <span className="logs-pagination__page">Pagina {page} / {totalPages}</span>
                <button
                  className="logs-pagination__btn"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                >
                  Successiva
                </button>
              </div>
            </div>
          </div>
        </div>
        {err && <div className="err">{err}</div>}
      </div>
      {detailOpen && selectedLog && (
        <div className="logs-modal-backdrop" onClick={() => setDetailOpen(false)}>
          <div className="logs-modal" onClick={(ev) => ev.stopPropagation()}>
            <div className="logs-modal__head">
              <div className="logs-detail__title">Dettaglio log</div>
              <button className="logs-modal__close" onClick={() => setDetailOpen(false)} aria-label="Chiudi dettaglio log">x</button>
            </div>
            <div className="logs-detail__meta">
              <span>{formatHumanTs(selectedLog.ts)}</span>
              <span className={`logs-level-badge logs-level-badge--${String(selectedLog.level || "INFO").toLowerCase()}`}>
                {String(selectedLog.level || "INFO").toUpperCase()}
              </span>
            </div>
            <div className="logs-detail__raw-ts">Timestamp raw: {selectedLog.ts || "-"}</div>
            <div className="logs-detail__message">{selectedLog.message || "-"}</div>
            <div className="logs-detail__json-title">Payload</div>
            <pre className="logs-detail__json">
              {JSON.stringify(
                {
                  ts: selectedLog.ts || "-",
                  human_time: formatHumanTs(selectedLog.ts),
                  level: selectedLog.level || "INFO",
                  message: selectedLog.message || "-",
                },
                null,
                2
              )}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
