import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const StatCard = ({ label, value, color }) => (
    <div className="card" style={{ borderLeft: `3px solid ${color}`, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div className="k" style={{ textTransform: "uppercase", letterSpacing: 1, fontSize: 10 }}>{label}</div>
        <div className="v" style={{ color: color }}>{value}</div>
    </div>
);

export default function ModelQualityPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [activeTab, setActiveTab] = useState("groups");
    const [presetInfo, setPresetInfo] = useState(null);
    const [selectedPreset, setSelectedPreset] = useState("manufacturing");
    const [applyingPreset, setApplyingPreset] = useState(false);

    const load = async () => {
        try {
            setLoading(true);
            setErr("");
            const [kpi, res] = await Promise.all([
                api.kpi(),
                api.kpiDrilldown("model-quality")
            ]);
            setData({ ...res, modelQualityScore: kpi.modelQuality });
            const p = await api.modelQualityPresets();
            setPresetInfo(p);
            setSelectedPreset(p?.activePreset || res?.modelPreset || "manufacturing");
        } catch (e) {
            setErr(String(e.message || e));
        } finally {
            setLoading(false);
        }
    };

    async function applyPreset() {
        if (!selectedPreset) return;
        try {
            setApplyingPreset(true);
            setErr("");
            await api.applyModelQualityPreset(selectedPreset);
            await load();
        } catch (e) {
            setErr(String(e.message || e));
        } finally {
            setApplyingPreset(false);
        }
    }

    useEffect(() => { load(); }, []);

    if (loading) return (
        <div className="main">
            <h2 style={{ marginTop: 0 }}>Model Score Details</h2>
            <div className="panel" style={{ color: "var(--muted)" }}>Caricamento dati Model Score...</div>
        </div>
    );

    if (err) return (
        <div className="main">
            <h2 style={{ marginTop: 0 }}>Model Score Details</h2>
            <div className="err panel">Errore: {err}</div>
        </div>
    );

    const score = data?.modelQualityScore ?? 0;
    const orphanCount = (data?.groupsIssues || []).length;
    const staleCount = (data?.staleAccounts || []).length;
    const zeroCount = (data?.zeroGroupsUsers || []).length;
    const overCount = (data?.overprivilegedUsers || []).length;
    const policyCount = (data?.policyViolations || []).length;
    const ambiguousCount = (data?.ambiguousUsers || []).length;
    const indicatorsCount = (data?.qualityIndicators || []).length;
    const totalUserIssues = staleCount + zeroCount + overCount;

    return (
        <div className="main">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>Dettagli <span style={{ color: "var(--accent)" }}>Model Score</span></h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <select
                        value={selectedPreset}
                        onChange={(e) => setSelectedPreset(e.target.value)}
                        style={{ background: "#111a2e", color: "#e9eefc", border: "1px solid var(--border)", borderRadius: 8, padding: "8px 10px" }}
                    >
                        {((presetInfo?.availablePresets) || (data?.availableModelPresets) || ["banking", "manufacturing", "retail"]).map((p) => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                    <button className="primary" onClick={applyPreset} disabled={applyingPreset} style={{ padding: "8px 14px", borderRadius: 10 }}>
                        {applyingPreset ? "Applicazione..." : "Applica Preset"}
                    </button>
                    <button className="primary" onClick={load} style={{ padding: "8px 20px", borderRadius: 10 }}>Aggiorna</button>
                </div>
            </div>
            <div style={{ marginBottom: 12, color: "var(--muted)", fontSize: 13 }}>
                Preset attivo: <b style={{ color: "var(--text)" }}>{data?.modelPreset || presetInfo?.activePreset || "-"}</b>
            </div>

            <div className="grid" style={{ marginBottom: 24 }}>
                <StatCard label="Model Score" value={`${score}%`} color={score > 80 ? "#71ffb2" : score > 50 ? "#ff9f1c" : "#ff6a6a"} />
                <StatCard label="Gruppi Orfani" value={orphanCount} color={orphanCount > 0 ? "var(--danger)" : "#71ffb2"} />
                <StatCard label="Account Stale" value={staleCount} color={staleCount > 0 ? "var(--danger)" : "#71ffb2"} />
                <StatCard label="Issue Utenti" value={totalUserIssues} color={totalUserIssues > 0 ? "var(--danger)" : "#71ffb2"} />
                <StatCard label="Policy Violations" value={policyCount} color={policyCount > 0 ? "var(--danger)" : "#71ffb2"} />
                <StatCard label="Utenti Ambigui" value={ambiguousCount} color={ambiguousCount > 0 ? "var(--danger)" : "#71ffb2"} />
            </div>

            <div className="panel">
                <div className="tabs" style={{ display: "flex", gap: 32, marginBottom: 24, borderBottom: "1px solid var(--border)" }}>
                    <button
                        onClick={() => setActiveTab("groups")}
                        style={{
                            background: "none", border: "none",
                            borderBottom: activeTab === "groups" ? "2px solid var(--accent)" : "2px solid transparent",
                            color: activeTab === "groups" ? "var(--text)" : "var(--muted)",
                            padding: "12px 4px", cursor: "pointer", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
                            transition: "all 0.2s"
                        }}
                    >
                        Issue Gruppi
                    </button>
                    <button
                        onClick={() => setActiveTab("users")}
                        style={{
                            background: "none", border: "none",
                            borderBottom: activeTab === "users" ? "2px solid var(--accent)" : "2px solid transparent",
                            color: activeTab === "users" ? "var(--text)" : "var(--muted)",
                            padding: "12px 4px", cursor: "pointer", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
                            transition: "all 0.2s"
                        }}
                    >
                        Issue Utenti
                    </button>
                    <button
                        onClick={() => setActiveTab("indicators")}
                        style={{
                            background: "none", border: "none",
                            borderBottom: activeTab === "indicators" ? "2px solid var(--accent)" : "2px solid transparent",
                            color: activeTab === "indicators" ? "var(--text)" : "var(--muted)",
                            padding: "12px 4px", cursor: "pointer", fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5,
                            transition: "all 0.2s"
                        }}
                    >
                        Indicatori
                    </button>
                </div>

                {activeTab === "groups" && (
                    <div>
                        <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Gruppi Orfani (0 Membri)</h3>
                        {orphanCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Nessun gruppo orfano trovato.</div> : (
                            <table className="table">
                                <thead><tr><th>Nome Gruppo</th><th style={{ width: 120, textAlign: "center" }}>Utenti</th></tr></thead>
                                <tbody>
                                    {(data?.groupsIssues || []).map((g, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{g.groupName}</td>
                                            <td style={{ textAlign: "center", fontFamily: "monospace" }}>{g.userCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === "users" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
                        <section>
                            <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Account Stale (&gt; 1 anno inattivi)</h3>
                            {staleCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Nessun account stale trovato.</div> : (
                                <table className="table">
                                    <thead><tr><th>Nome Visualizzato</th><th>Username</th><th>Ultimo Accesso</th></tr></thead>
                                    <tbody>
                                        {(data?.staleAccounts || []).map((u, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>{u.displayName}</td>
                                                <td style={{ color: "var(--accent)", fontFamily: "monospace", fontSize: 13 }}>{u.username}</td>
                                                <td style={{ color: "var(--danger)", fontWeight: 600 }}>{u.lastLogon}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section>
                            <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Utenti senza Gruppi</h3>
                            {zeroCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Nessun utente orfano trovato.</div> : (
                                <table className="table">
                                    <thead><tr><th>Nome Visualizzato</th><th>Username</th></tr></thead>
                                    <tbody>
                                        {(data?.zeroGroupsUsers || []).map((u, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>{u.displayName}</td>
                                                <td style={{ color: "var(--accent)", fontFamily: "monospace", fontSize: 13 }}>{u.username}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section>
                            <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Utenti Overprivileged (Top 10%)</h3>
                            {overCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Nessun utente overprivileged trovato.</div> : (
                                <table className="table">
                                    <thead><tr><th>Username</th><th>Conteggio Gruppi</th></tr></thead>
                                    <tbody>
                                        {(data?.overprivilegedUsers || []).map((u, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500, fontFamily: "monospace" }}>{u.username}</td>
                                                <td style={{ color: "var(--danger)", fontWeight: 600 }}>{u.groupCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <div style={{ marginTop: 16, fontSize: 13, color: "var(--muted)", fontStyle: "italic" }}>
                                * Per i dettagli completi, consulta la pagina di <a href="/kpi/overprivileged" style={{ color: "var(--accent)", textDecoration: "underline" }}>Analisi Overprivileged</a>.
                            </div>
                        </section>

                        <section>
                            <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Policy Violations</h3>
                            {policyCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Nessuna violazione rilevata.</div> : (
                                <table className="table">
                                    <thead><tr><th>Username</th><th>Conflitti</th></tr></thead>
                                    <tbody>
                                        {(data?.policyViolations || []).map((u, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500, fontFamily: "monospace" }}>{u.username}</td>
                                                <td style={{ color: "var(--danger)" }}>{(u.conflicts || []).join(", ")}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section>
                            <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Utenti Ambigui (Confidenza bassa)</h3>
                            {ambiguousCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Nessun utente ambiguo.</div> : (
                                <table className="table">
                                    <thead><tr><th>Display Name</th><th>Username</th><th>Confidence</th></tr></thead>
                                    <tbody>
                                        {(data?.ambiguousUsers || []).map((u, i) => (
                                            <tr key={i}>
                                                <td style={{ fontWeight: 500 }}>{u.displayName}</td>
                                                <td style={{ color: "var(--accent)", fontFamily: "monospace", fontSize: 13 }}>{u.username}</td>
                                                <td style={{ color: "var(--danger)", fontWeight: 600 }}>{u.confidence}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>
                    </div>
                )}

                {activeTab === "indicators" && (
                    <div>
                        <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 16 }}>Driver Qualita Modello</h3>
                        {indicatorsCount === 0 ? <div style={{ color: "#71ffb2", fontSize: 13 }}>Indicatori non disponibili.</div> : (
                            <table className="table">
                                <thead><tr><th>Indicatore</th><th>Valore</th><th>Peso</th><th>Contributo Penalty</th></tr></thead>
                                <tbody>
                                    {(data?.qualityIndicators || []).map((x, i) => (
                                        <tr key={i}>
                                            <td style={{ fontWeight: 500 }}>{x.label}</td>
                                            <td>{x.value}</td>
                                            <td>{x.weight}</td>
                                            <td style={{ color: Number(x.contribution || 0) > 5 ? "var(--danger)" : "var(--muted)", fontWeight: 600 }}>{x.contribution}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <div style={{ marginTop: 14, fontSize: 13, color: "var(--muted)" }}>
                            Matrix Density: <b style={{ color: "var(--text)" }}>{data?.density ?? 0}</b> | Generalization Confidence: <b style={{ color: "var(--text)" }}>{data?.avgGeneralizationConfidence ?? 0}</b> | Manual Override Events: <b style={{ color: "var(--text)" }}>{data?.manualOverrideEvents ?? 0}</b>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper (in case we need to map usernames in the future, currently just using raw data)
const usersByUsername = {}; 
