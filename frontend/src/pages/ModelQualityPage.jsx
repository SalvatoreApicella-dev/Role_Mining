import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const INDICATOR_DESCRIPTIONS = {
    role_entropy: "Misura quanto sono eterogenei i gruppi assegnati agli utenti dello stesso ruolo. Un valore alto indica che il ruolo non ha un profilo di accessi stabile e che la segmentazione del modello e poco coerente.",
    template_coverage: "Misura la quota di gruppi attesi dal template di ruolo che risultano mancanti sugli utenti assegnati a quel ruolo. Un valore alto indica ruoli incompleti o assegnazioni parziali.",
    noise_ratio: "Misura la percentuale di gruppi assegnati agli utenti che non appartengono al template del loro ruolo. Un valore alto indica permessi fuori standard e maggiore rischio operativo.",
    ambiguity: "Misura quanti utenti hanno una confidenza bassa nella classificazione del ruolo. Un valore alto indica che il modello fatica a distinguere chiaramente il ruolo corretto per molti utenti.",
    temporal_drift: "Misura quanto gli accessi recenti si discostano dai pattern storici del ruolo. Un valore alto indica deriva del comportamento e necessita di aggiornare policy o template.",
    matrix_density: "Misura il rischio dovuto a una matrice permessi troppo sparsa o troppo densa. Entrambi gli estremi riducono la qualita del modello e la sua capacita di generalizzare.",
    orphan_weighted: "Misura i gruppi orfani (senza utenti) con peso maggiore per gruppi critici. Un valore alto segnala configurazioni inutilizzate o incoerenti, con impatto su governance e manutenzione.",
    overprivileged: "Misura la concentrazione di utenti con numero di gruppi molto alto rispetto alla baseline. Un valore alto aumenta la superficie di rischio e riduce il principio del least privilege.",
    stale_access: "Misura la quota di account con ultimo accesso molto vecchio ma ancora dotati di permessi. Un valore alto indica possibile accumulo di accessi non necessari o obsoleti.",
    policy_violation: "Misura la frequenza di combinazioni di permessi in conflitto con regole di policy (es. pattern SoD). Un valore alto indica rischio di non conformita e separazione dei compiti insufficiente.",
    manual_override: "Misura quanto il processo dipende da correzioni manuali rispetto alle decisioni automatiche. Un valore alto indica che il modello non e ancora sufficientemente affidabile in autonomia.",
    generalization: "Misura il gap di generalizzazione del modello su utenti reali. Un valore alto indica che la confidenza media e bassa e che il modello potrebbe degradare su nuovi dati.",
};

const StatCard = ({ label, value, color, onClick }) => (
    <div
        className="card"
        onClick={onClick}
        style={{
            borderLeft: `3px solid ${color}`,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            cursor: onClick ? "pointer" : "default",
        }}
    >
        <div className="k" style={{ textTransform: "uppercase", letterSpacing: 1, fontSize: 10 }}>{label}</div>
        <div className="v" style={{ color: color }}>{value}</div>
    </div>
);

const ExportCsvButton = ({ onClick }) => (
    <button
        onClick={(e) => {
            e.stopPropagation();
            onClick();
        }}
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
);

export default function ModelQualityPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [activeTab, setActiveTab] = useState("groups");
    const [groupsOpen, setGroupsOpen] = useState(true);
    const [openUserSection, setOpenUserSection] = useState("stale");
    const [indicatorPopup, setIndicatorPopup] = useState(null);

    const load = async () => {
        try {
            setLoading(true);
            setErr("");
            const [kpi, res] = await Promise.all([
                api.kpi(),
                api.kpiDrilldown("model-quality")
            ]);
            setData({ ...res, modelQualityScore: kpi.modelQuality });
        } catch (e) {
            setErr(String(e.message || e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    if (loading) return (
        <div className="main">
            <h2 style={{ marginTop: 0 }}>Model Score</h2>
            <div className="panel" style={{ color: "var(--muted)" }}>Caricamento dati Model Score...</div>
        </div>
    );

    if (err) return (
        <div className="main">
            <h2 style={{ marginTop: 0 }}>Model Score</h2>
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

    function toggleUserSection(key) {
        setOpenUserSection((prev) => (prev === key ? null : key));
    }

    function csvEscape(v) {
        const s = String(v ?? "");
        if (s.includes(",") || s.includes("\"") || s.includes("\n")) {
            return `"${s.replace(/"/g, "\"\"")}"`;
        }
        return s;
    }

    function downloadCsv(filename, headers, rows) {
        const lines = [];
        lines.push((headers || []).map(csvEscape).join(","));
        (rows || []).forEach((r) => {
            lines.push((r || []).map(csvEscape).join(","));
        });
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

    function openFromCard(target) {
        if (target === "groups") {
            setActiveTab("groups");
            setGroupsOpen(true);
            return;
        }
        if (target === "indicators") {
            setActiveTab("indicators");
            return;
        }
        setActiveTab("users");
        if (target === "users") {
            setOpenUserSection("stale");
        } else {
            setOpenUserSection(target);
        }
    }

    return (
        <div className="main">
            <div className="row" style={{ justifyContent: "space-between", marginBottom: 24 }}>
                <h2 style={{ margin: 0 }}>Model Score</h2>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <button className="primary" onClick={load} style={{ padding: "8px 20px", borderRadius: 10 }}>Aggiorna</button>
                </div>
            </div>

            <div className="grid" style={{ marginBottom: 24, gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 }}>
                <StatCard label="Model Score" value={`${score}%`} color={score > 80 ? "#71ffb2" : score > 50 ? "#ff9f1c" : "#ff6a6a"} onClick={() => openFromCard("indicators")} />
                <StatCard label="Gruppi Orfani" value={orphanCount} color={orphanCount > 0 ? "var(--danger)" : "#71ffb2"} onClick={() => openFromCard("groups")} />
                <StatCard label="Account Stale" value={staleCount} color={staleCount > 0 ? "var(--danger)" : "#71ffb2"} onClick={() => openFromCard("stale")} />
                <StatCard label="Issue Utenti" value={totalUserIssues} color={totalUserIssues > 0 ? "var(--danger)" : "#71ffb2"} onClick={() => openFromCard("users")} />
                <StatCard label="Policy Violations" value={policyCount} color={policyCount > 0 ? "var(--danger)" : "#71ffb2"} onClick={() => openFromCard("policy")} />
                <StatCard label="Utenti Ambigui" value={ambiguousCount} color={ambiguousCount > 0 ? "var(--danger)" : "#71ffb2"} onClick={() => openFromCard("ambiguous")} />
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
                        Gruppi Impattati
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
                        Utenti Impattati
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
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                            <button
                                onClick={() => setGroupsOpen((x) => !x)}
                                style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}
                            >
                                <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 0 }}>Gruppi Orfani (0 Membri)</h3>
                            </button>
                            <ExportCsvButton
                                onClick={() =>
                                    downloadCsv(
                                        "gruppi_impattati.csv",
                                        ["groupName", "userCount"],
                                        (data?.groupsIssues || []).map((g) => [g.groupName, g.userCount])
                                    )
                                }
                            />
                        </div>
                        {groupsOpen && (
                            <>
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
                            </>
                        )}
                    </div>
                )}

                {activeTab === "users" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 48 }}>
                        <section>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                                <button onClick={() => toggleUserSection("stale")} style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
                                    <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 0 }}>Account Stale (&gt; 1 anno inattivi)</h3>
                                </button>
                                <ExportCsvButton
                                    onClick={() =>
                                        downloadCsv(
                                            "utenti_impattati_stale.csv",
                                            ["displayName", "username", "lastLogon"],
                                            (data?.staleAccounts || []).map((u) => [u.displayName, u.username, u.lastLogon])
                                        )
                                    }
                                />
                            </div>
                            {openUserSection === "stale" && (
                                <>
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
                                </>
                            )}
                        </section>

                        <section>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                                <button onClick={() => toggleUserSection("zero")} style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
                                    <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 0 }}>Utenti senza Gruppi</h3>
                                </button>
                                <ExportCsvButton
                                    onClick={() =>
                                        downloadCsv(
                                            "utenti_impattati_senza_gruppi.csv",
                                            ["displayName", "username"],
                                            (data?.zeroGroupsUsers || []).map((u) => [u.displayName, u.username])
                                        )
                                    }
                                />
                            </div>
                            {openUserSection === "zero" && (
                                <>
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
                                </>
                            )}
                        </section>

                        <section>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                                <button onClick={() => toggleUserSection("over")} style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
                                    <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 0 }}>Utenti Overprivileged (Top 10%)</h3>
                                </button>
                                <ExportCsvButton
                                    onClick={() =>
                                        downloadCsv(
                                            "utenti_impattati_overprivileged.csv",
                                            ["username", "groupCount"],
                                            (data?.overprivilegedUsers || []).map((u) => [u.username, u.groupCount])
                                        )
                                    }
                                />
                            </div>
                            {openUserSection === "over" && (
                                <>
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
                                </>
                            )}
                        </section>

                        <section>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                                <button onClick={() => toggleUserSection("policy")} style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
                                    <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 0 }}>Policy Violations</h3>
                                </button>
                                <ExportCsvButton
                                    onClick={() =>
                                        downloadCsv(
                                            "utenti_impattati_policy_violations.csv",
                                            ["username", "conflicts"],
                                            (data?.policyViolations || []).map((u) => [u.username, (u.conflicts || []).join(" | ")])
                                        )
                                    }
                                />
                            </div>
                            {openUserSection === "policy" && (
                                <>
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
                                </>
                            )}
                        </section>

                        <section>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                                <button onClick={() => toggleUserSection("ambiguous")} style={{ background: "none", border: "none", padding: 0, margin: 0, cursor: "pointer", textAlign: "left", color: "inherit" }}>
                                    <h3 style={{ marginTop: 0, fontSize: 15, color: "var(--muted)", textTransform: "uppercase", marginBottom: 0 }}>Utenti Ambigui (Confidenza bassa)</h3>
                                </button>
                                <ExportCsvButton
                                    onClick={() =>
                                        downloadCsv(
                                            "utenti_impattati_ambigui.csv",
                                            ["displayName", "username", "confidence"],
                                            (data?.ambiguousUsers || []).map((u) => [u.displayName, u.username, u.confidence])
                                        )
                                    }
                                />
                            </div>
                            {openUserSection === "ambiguous" && (
                                <>
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
                                </>
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
                                        <tr key={i} onClick={() => setIndicatorPopup(x)} style={{ cursor: "pointer" }}>
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

            {indicatorPopup && (
                <div
                    onClick={() => setIndicatorPopup(null)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "grid",
                        placeItems: "center",
                        zIndex: 1000,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            width: "min(560px, 92vw)",
                            background: "#111a2e",
                            border: "1px solid var(--border)",
                            borderRadius: 12,
                            padding: 16,
                            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                            <h4 style={{ margin: 0, color: "var(--text)" }}>{indicatorPopup.label}</h4>
                            <button className="link" onClick={() => setIndicatorPopup(null)}>Chiudi</button>
                        </div>
                        <div style={{ color: "var(--muted)", lineHeight: 1.45, fontSize: 14 }}>
                            {INDICATOR_DESCRIPTIONS[indicatorPopup.id] || "Indicatore di qualità del modello utilizzato per stimare il contributo al punteggio complessivo."}
                        </div>
                        <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)" }}>
                            Valore: <b style={{ color: "var(--text)" }}>{indicatorPopup.value}</b> | Peso: <b style={{ color: "var(--text)" }}>{indicatorPopup.weight}</b> | Contributo penalty: <b style={{ color: "var(--text)" }}>{indicatorPopup.contribution}</b>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

// Helper (in case we need to map usernames in the future, currently just using raw data)
const usersByUsername = {}; 
