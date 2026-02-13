import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import {
  chooseDuplicateDisplayName,
  api,
} from "../api";

const IDENTITY_INDICATOR_DESCRIPTIONS = {
  invalid_identity_keys: "Rileva valori non validi in email, UPN o employeeId. Questi errori riducono affidabilita nella correlazione tra sorgenti identitarie.",
  identity_collisions: "Rileva chiavi identitarie duplicate su utenti diversi (email, UPN o employeeId). E un rischio alto per governance e assegnazioni corrette.",
  invalid_lastlogon: "Rileva LastLogon non parseabile o data futura. Questo degrada analisi temporali e prioritizzazione remediation.",
  department_vocab_drift: "Rileva varianti lessicali dello stesso dipartimento (es. IT, I.T., Information Technology), che frammentano clustering e reporting.",
  businessrole_vocab_drift: "Rileva naming incoerente dei business role che aumenta rumore nel modello e riduce precisione delle regole.",
  orphan_references: "Rileva riferimenti a manager/owner non presenti nel dataset, con impatto su ownership e flussi approvativi.",
  inactive_source_mismatch: "Rileva mismatch di stato tra AD e HR (es. AD attivo ma HR terminated), segnale di sincronizzazione sorgenti incompleta.",
  import_reject_rate: "Misura righe scartate o incoerenti in ingestione. Valori alti indicano feed sorgente da normalizzare a monte.",
};

export default function KpiDrilldownPage() {
  const { metric } = useParams();
  const [data, setData] = useState(null);
  const [err, setErr] = useState("");
  const [expanded, setExpanded] = useState({});
  const [pendingChoice, setPendingChoice] = useState({});
  const [savingDn, setSavingDn] = useState("");
  const [dqRules, setDqRules] = useState(null);
  const [dqLoading, setDqLoading] = useState(false);
  const [dqApplying, setDqApplying] = useState("");
  const [openSections, setOpenSections] = useState({});
  const [indicatorPopup, setIndicatorPopup] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setErr("");
      setData(null);
      setExpanded({});
      setPendingChoice({});
      setOpenSections({});
      setDqRules(null);

      try {
        const res = await api.kpiDrilldown(metric);
        if (metric === "cluster-quality") {
          setDqLoading(true);
          const rules = await api.dataQualityRuleSuggestions();
          if (!cancelled) setDqRules(rules);
        }

        if (!cancelled) setData(res);
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      } finally {
        if (!cancelled) setDqLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [metric]);

  function formatCandidateLabel(c) {
    if (!c) return "";
    const parts = [];
    if (c.businessRole) parts.push(`BR: ${c.businessRole}`);
    if (c.department) parts.push(`Dept: ${c.department}`);
    if (Array.isArray(c.roles)) parts.push(`Gruppi: ${c.roles.length}`);
    if (c.lastLogin) parts.push(`LastLogin: ${c.lastLogin}`);
    return parts.join(" | ");
  }

  async function applyDuplicateChoice(displayName, fallbackCandidateId) {
    const candidateId = pendingChoice[displayName] || fallbackCandidateId;
    if (!candidateId) return;
    setSavingDn(displayName);
    setErr("");
    try {
      await chooseDuplicateDisplayName(displayName, candidateId);
      const res = await api.kpiDrilldown(metric);
      setData(res);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setSavingDn("");
    }
  }

  function handleCandidateRowClick(displayName, candidateId) {
    const current = pendingChoice[displayName];
    if (current === candidateId) {
      applyDuplicateChoice(displayName, candidateId);
      return;
    }
    setPendingChoice((prev) => ({ ...prev, [displayName]: candidateId }));
  }

  async function applyRule(ruleId) {
    if (!ruleId) return;
    setErr("");
    setDqApplying(ruleId);
    try {
      await api.applyDataQualityRuleSuggestion(ruleId);
      const [rules, res] = await Promise.all([
        api.dataQualityRuleSuggestions(),
        api.kpiDrilldown(metric),
      ]);
      setDqRules(rules);
      setData(res);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setDqApplying("");
    }
  }

  function renderKv(obj) {
    return Object.entries(obj || {}).map(([k, v]) => (
      <div key={k} style={{ fontSize: 12, color: "var(--muted)" }}>
        <span style={{ color: "var(--text)" }}>{k}</span>: {typeof v === "object" ? JSON.stringify(v) : String(v)}
      </div>
    ));
  }

  function csvEscape(v) {
    const s = String(v ?? "");
    if (s.includes(",") || s.includes("\"") || s.includes("\n")) return `"${s.replace(/"/g, "\"\"")}"`;
    return s;
  }

  function downloadCsv(filename, headers, rows) {
    const lines = [];
    lines.push((headers || []).map(csvEscape).join(","));
    (rows || []).forEach((r) => lines.push((r || []).map(csvEscape).join(",")));
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function sectionLabel(type) {
    if (type === "Duplicates") return "Duplicati";
    if (type === "Missing Business Role") return "Business Role Mancante";
    if (type === "Missing Department") return "Dipartimento Mancante";
    if (type === "Identity Integrity") return "Integrita Identita";
    return String(type || "Sezione");
  }

  function toggleSection(type) {
    setOpenSections((prev) => ({ ...prev, [type]: !prev[type] }));
  }

  function openSectionFromCard(type) {
    setOpenSections((prev) => ({ ...prev, [type]: true }));
  }

  function exportSectionCsv(section) {
    const type = section?.type || "section";
    if (type === "Duplicates") {
      const rows = [];
      (section.users || []).forEach((u, i) => {
        const dn = u.displayName || `dup-${i}`;
        const chosen = u.chosen || {};
        const alternatives = u.alternatives || [];
        const allCandidates = [chosen, ...alternatives].filter((x) => x && x.candidateId);
        allCandidates.forEach((c) => {
          rows.push([
            dn,
            c.candidateId || "",
            c.businessRole || "",
            c.department || "",
            (c.roles || []).length,
            c.lastLogin || "",
            (u.chosenCandidateId || chosen.candidateId || "") === c.candidateId ? "selected" : "",
          ]);
        });
      });
      downloadCsv(
        "cluster_quality_duplicati.csv",
        ["displayName", "candidateId", "businessRole", "department", "groupCount", "lastLogin", "status"],
        rows
      );
      return;
    }
    if (type === "Identity Integrity") {
      const rows = [];
      (section.cases || []).forEach((c) => {
        if ((c.users || []).length === 0) {
          rows.push([c.label, c.count || 0, c.rate || "", "", ""]);
          return;
        }
        (c.users || []).forEach((u) => {
          rows.push([c.label, c.count || 0, c.rate || "", u.displayName || "", u.username || ""]);
        });
      });
      downloadCsv(
        "cluster_quality_integrita_identita.csv",
        ["indicatore", "count", "rate", "displayName", "username"],
        rows
      );
      return;
    }
    const rows = (section.users || []).map((u) => [typeof u === "string" ? u : (u.displayName || u.username || "")]);
    downloadCsv(
      `cluster_quality_${String(type).toLowerCase()}.csv`,
      ["username"],
      rows
    );
  }

  const visibleClusterSections = (data?.items || []).filter(
    (s) => s?.type === "Duplicates" || s?.type === "Missing Business Role" || s?.type === "Identity Integrity" || s?.type === "Missing Department"
  );

  return (
    <div className="main">
      <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
        {metric === "cluster-quality" ? (
          <h2 style={{ margin: 0 }}>Cluster quality</h2>
        ) : (
          <h2 style={{ margin: 0 }}>Drilldown: <span style={{ color: "var(--accent)", textTransform: "capitalize" }}>{metric.replace("-", " ")}</span></h2>
        )}
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
            <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              <div className="card">
                <div className="k">Righe Totali</div>
                <div className="v">{data.stats?.rowsTotal || 0}</div>
              </div>
              <div
                className="card"
                onClick={() => openSectionFromCard("Duplicates")}
                style={{
                  borderLeft: "3px solid " + ((data.stats?.duplicateDisplayName || 0) > 0 ? "var(--danger)" : "#71ffb2"),
                  cursor: "pointer",
                }}
              >
                <div className="k">Duplicati</div>
                <div className="v" style={{ color: (data.stats?.duplicateDisplayName || 0) > 0 ? "var(--danger)" : "#71ffb2" }}>{data.stats?.duplicateDisplayName || 0}</div>
              </div>
              <div
                className="card"
                onClick={() => openSectionFromCard("Missing Business Role")}
                style={{
                  borderLeft: "3px solid " + ((data.stats?.missingBusinessRole || 0) > 0 ? "var(--danger)" : "#71ffb2"),
                  cursor: "pointer",
                }}
              >
                <div className="k">Missing Business Roles</div>
                <div className="v" style={{ color: (data.stats?.missingBusinessRole || 0) > 0 ? "var(--danger)" : "#71ffb2" }}>{data.stats?.missingBusinessRole || 0}</div>
              </div>
              <div
                className="card"
                onClick={() => openSectionFromCard("Identity Integrity")}
                style={{
                  borderLeft: "3px solid " + ((data.stats?.identityIntegrityIssues || 0) > 0 ? "var(--danger)" : "#71ffb2"),
                  cursor: "pointer",
                }}
              >
                <div className="k">Integrita Identita</div>
                <div className="v" style={{ color: (data.stats?.identityIntegrityIssues || 0) > 0 ? "var(--danger)" : "#71ffb2" }}>{data.stats?.identityIntegrityIssues || 0}</div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h3 style={{ marginTop: 0, fontSize: 15, textTransform: "uppercase", letterSpacing: 1 }}>Suggerimenti Regole Data Quality</h3>
            {dqLoading && <div style={{ color: "var(--muted)" }}>Analisi suggerimenti in corso...</div>}
            {!dqLoading && !dqRules?.items?.length && (
              <div style={{ color: "#71ffb2", fontSize: 13, background: "rgba(113, 255, 178, 0.05)", padding: 10, borderRadius: 8 }}>
                Nessun suggerimento disponibile al momento.
              </div>
            )}
            {!dqLoading && (dqRules?.items || []).length > 0 && (
              <div style={{ display: "grid", gap: 10 }}>
                {(dqRules.items || []).map((r) => (
                  <div key={r.ruleId} style={{ border: "1px solid var(--border)", borderRadius: 10, padding: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center", marginBottom: 6 }}>
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={{ color: "var(--muted)", fontSize: 12 }}>Confidenza: {Math.round((r.confidence || 0) * 100)}%</div>
                    </div>
                    <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 10 }}>{r.description}</div>
                    <div style={{ marginBottom: 10 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Perche suggerita</div>
                      {renderKv(r.impact)}
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                      <div style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Stato attuale</div>
                        {renderKv(r.current)}
                      </div>
                      <div style={{ background: "rgba(113,255,178,0.06)", border: "1px solid rgba(113,255,178,0.25)", borderRadius: 8, padding: 8 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Dopo applicazione</div>
                        {renderKv(r.preview)}
                      </div>
                    </div>
                    <button
                      className="primary"
                      onClick={() => applyRule(r.ruleId)}
                      disabled={r.alreadyApplied || dqApplying === r.ruleId}
                    >
                      {r.alreadyApplied ? "Gia applicata" : (dqApplying === r.ruleId ? "Applicazione..." : "Applica regola")}
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {visibleClusterSections.map((section, idx) => (
            <div key={idx} style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, borderBottom: "1px solid var(--border)", paddingBottom: 8, marginBottom: 16 }}>
                <button
                  onClick={() => toggleSection(section.type)}
                  style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}
                >
                  <h4 style={{ color: "var(--muted)", margin: 0 }}>
                    {sectionLabel(section.type)} <span style={{ marginLeft: 8, fontSize: 12 }}>Conteggio: {section.count}</span>
                  </h4>
                </button>
                <button
                  onClick={() => exportSectionCsv(section)}
                  title="Esporta CSV"
                  aria-label="Esporta CSV"
                  style={{
                    width: 42,
                    height: 42,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "none",
                    border: "1px solid var(--border)",
                    borderRadius: 10,
                    color: "var(--text)",
                    cursor: "pointer",
                    flexShrink: 0,
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 3v11" />
                    <path d="m7 10 5 5 5-5" />
                    <path d="M4 20h16" />
                  </svg>
                </button>
              </div>
              {openSections[section.type] && (section.type === "Duplicates" ? (
                section.count > 0 ? (
                  <div style={{ display: "grid", gap: 10 }}>
                    {(section.users || []).map((u, i) => {
                      const dn = u.displayName || `dup-${i}`;
                      const isOpen = !!expanded[dn];
                      const chosen = u.chosen || {};
                      const alternatives = u.alternatives || [];
                      const allCandidates = [chosen, ...alternatives].filter((x) => x && x.candidateId);
                      const selectedId = pendingChoice[dn] || u.chosenCandidateId || chosen.candidateId || "";
                      const isManual = u.autoChosenCandidateId && u.chosenCandidateId && u.autoChosenCandidateId !== u.chosenCandidateId;
                      return (
                        <div key={dn} style={{ border: "1px solid var(--border)", borderRadius: 10, overflow: "hidden" }}>
                          <button
                            onClick={() => setExpanded((prev) => ({ ...prev, [dn]: !prev[dn] }))}
                            style={{
                              width: "100%",
                              border: 0,
                              textAlign: "left",
                              padding: "12px 14px",
                              cursor: "pointer",
                              background: "rgba(255,255,255,0.02)",
                              color: "var(--text)",
                            }}
                          >
                            <span style={{ fontWeight: 600 }}>{dn}</span>
                            <span style={{ marginLeft: 10, color: "var(--muted)", fontSize: 12 }}>
                              {isManual ? "Selezione manuale" : "Auto-selezionato"}
                            </span>
                          </button>

                          {isOpen && (
                            <div style={{ padding: 12, borderTop: "1px solid var(--border)" }}>
                              <div style={{ marginBottom: 8, color: "var(--muted)", fontSize: 13 }}>
                                Corrente: <span style={{ color: "var(--text)", fontWeight: 600 }}>{chosen.candidateId || "-"}</span>
                                <span style={{ marginLeft: 8 }}>{formatCandidateLabel(chosen)}</span>
                              </div>

                              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                                <select
                                  value={selectedId}
                                  onChange={(e) => setPendingChoice((prev) => ({ ...prev, [dn]: e.target.value }))}
                                  style={{ minWidth: 360, background: "#111a2e", color: "#e9eefc", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
                                >
                                  {allCandidates.map((c) => (
                                    <option key={c.candidateId} value={c.candidateId}>
                                      {c.candidateId} - {formatCandidateLabel(c)}
                                    </option>
                                  ))}
                                </select>
                                <button
                                  className="primary"
                                  onClick={() => applyDuplicateChoice(dn, chosen.candidateId)}
                                  disabled={!selectedId || savingDn === dn}
                                >
                                  {savingDn === dn ? "Salvataggio..." : "Applica scelta"}
                                </button>
                              </div>

                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Candidate ID</th>
                                    <th>Business Role</th>
                                    <th>Department</th>
                                    <th>Gruppi</th>
                                    <th>Last Login</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {allCandidates.map((c) => {
                                    const isSelected = selectedId === c.candidateId;
                                    return (
                                      <tr
                                        key={c.candidateId}
                                        onClick={() => handleCandidateRowClick(dn, c.candidateId)}
                                        title={isSelected ? "Secondo click per salvare questo candidato" : "Primo click per selezionare questo candidato"}
                                        style={{
                                          cursor: "pointer",
                                          background: isSelected ? "rgba(106, 166, 255, 0.16)" : "transparent",
                                        }}
                                      >
                                        <td style={{ fontWeight: 600 }}>{c.candidateId}</td>
                                        <td>{c.businessRole || "-"}</td>
                                        <td>{c.department || "-"}</td>
                                        <td style={{ color: "var(--muted)" }}>{(c.roles || []).join(", ") || "-"}</td>
                                        <td>{c.lastLogin || "-"}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ color: "#71ffb2", fontSize: 13, background: "rgba(113, 255, 178, 0.05)", padding: 10, borderRadius: 8 }}>
                    Nessun problema riscontrato per questa categoria.
                  </div>
                )
              ) : section.type === "Identity Integrity" ? (
                (section.cases || []).length > 0 ? (
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Indicatore</th>
                        <th style={{ width: 120 }}>Count</th>
                        <th style={{ width: 140 }}>Rate (%)</th>
                        <th>Utenti impattati</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(section.cases || []).map((c) => (
                        <tr key={c.id}>
                          <td>
                            <button
                              onClick={() => setIndicatorPopup({ id: c.id, label: c.label })}
                              style={{
                                background: "none",
                                border: "none",
                                padding: 0,
                                margin: 0,
                                color: "var(--text)",
                                fontWeight: 600,
                                cursor: "pointer",
                                textAlign: "left",
                              }}
                            >
                              {c.label}
                            </button>
                          </td>
                          <td>{c.count || 0}</td>
                          <td>{c.rate ?? "-"}</td>
                          <td style={{ color: "var(--muted)", fontSize: 13 }}>
                            {(c.users || []).slice(0, 8).map((u) => u.displayName || u.username).join(", ") || "-"}
                            {(c.users || []).length > 8 ? ` (+${(c.users || []).length - 8})` : ""}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div style={{ color: "#71ffb2", fontSize: 13, background: "rgba(113, 255, 178, 0.05)", padding: 10, borderRadius: 8 }}>
                    Nessun problema riscontrato per questa categoria.
                  </div>
                )
              ) : section.count > 0 ? (
                <table className="table">
                  <thead>
                    <tr>
                      <th style={{ width: "40%" }}>Username</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(section.users || []).map((u, i) => (
                      <tr key={i}>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>
                          {typeof u === 'string' ? u : (u.displayName || u.username)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div style={{ color: "#71ffb2", fontSize: 13, background: "rgba(113, 255, 178, 0.05)", padding: 10, borderRadius: 8 }}>
                  Nessun problema riscontrato per questa categoria.
                </div>
              ))}
            </div>
          ))}

          {indicatorPopup && (
            <div
              onClick={() => setIndicatorPopup(null)}
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(3, 8, 20, 0.66)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 80,
                padding: 16,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: "min(560px, 96vw)",
                  background: "#0f1a2d",
                  border: "1px solid var(--border)",
                  borderRadius: 12,
                  boxShadow: "0 20px 60px rgba(0,0,0,0.45)",
                  padding: 16,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, marginBottom: 10 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{indicatorPopup.label}</div>
                  <button
                    onClick={() => setIndicatorPopup(null)}
                    style={{ background: "none", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 8, padding: "4px 8px", cursor: "pointer" }}
                  >
                    Chiudi
                  </button>
                </div>
                <div style={{ color: "var(--muted)", lineHeight: 1.5, fontSize: 13 }}>
                  {IDENTITY_INDICATOR_DESCRIPTIONS[indicatorPopup.id] || "Descrizione non disponibile."}
                </div>
              </div>
            </div>
          )}

          {data.rejects?.length > 0 && (
            <div style={{ marginTop: 40 }}>
              <h4 style={{ color: "var(--danger)", textTransform: "uppercase", fontSize: 14 }}>Righe Scartate</h4>
              <table className="table">
                <thead>
                  <tr>
                    <th style={{ width: "40%" }}>Username</th>
                    <th style={{ width: "60%" }}>Motivo dello scarto</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rejects.map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 500 }}>{r.user?.displayName || r.user?.username || r.username || "Utente Sconosciuto"}</td>
                      <td style={{ color: "var(--muted)", lineHeight: "1.4" }}>{r.reason}</td>
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
