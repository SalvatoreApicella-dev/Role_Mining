import React, { useEffect, useState } from "react";
import { api } from "../api.js";

const StatCard = ({ label, value, color }) => (
    <div className="card" style={{ borderLeft: `4px solid ${color}` }}>
        <div className="k">{label}</div>
        <div className="v">{value}</div>
    </div>
);

export default function ModelQualityPage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [err, setErr] = useState("");
    const [activeTab, setActiveTab] = useState("groups");

    const load = async () => {
        try {
            setLoading(true);
            setErr("");
            const [kpi, res] = await Promise.all([
                api.kpi(),
                api.kpiDrilldown("model-quality")
            ]);
            // Backend returns modelQuality in top-level kpi, and detailed stats in drilldown
            setData({ ...res, modelQualityScore: kpi.modelQuality });
        } catch (e) {
            setErr(String(e.message || e));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    if (loading) return <div className="main"><h2 style={{ marginTop: 0 }}>Model Quality</h2><div className="panel" style={{ color: "var(--muted)" }}>Loading Model Quality data...</div></div>;
    if (err) return <div className="main"><h2 style={{ marginTop: 0 }}>Model Quality</h2><div className="err">Error: {err}</div></div>;

    const score = data?.modelQualityScore ?? 0;

    // Calculate counts for stats
    const orphanCount = (data?.groupsIssues || []).length;
    const staleCount = (data?.staleAccounts || []).length;
    const zeroCount = (data?.zeroGroupsUsers || []).length;
    const overCount = (data?.overprivilegedUsers || []).length;
    const totalUserIssues = staleCount + zeroCount + overCount;

    return (
        <div className="main">
            <div className="row" style={{ justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                <h2 style={{ margin: 0 }}>Model Quality Details</h2>
                <button className="primary" onClick={load}>Refresh</button>
            </div>

            {/* Stats Cards - BIP Style */}
            <div className="grid" style={{ marginBottom: 24 }}>
                <StatCard label="Model Quality Score" value={`${score}%`} color={score > 80 ? "#71ffb2" : score > 50 ? "#ff9f1c" : "#ff6a6a"} />
                <StatCard label="Orphan Groups" value={orphanCount} color="#ff9f1c" />
                <StatCard label="Stale Accounts" value={staleCount} color="#ff6a6a" />
                <StatCard label="Users Issues" value={totalUserIssues} color="#6aa6ff" />
            </div>

            <div className="panel">
                <div className="tabs" style={{ display: "flex", gap: 20, marginBottom: 20, borderBottom: "1px solid rgba(255,255,255,0.1)" }}>
                    <button
                        className={`tab ${activeTab === "groups" ? "active" : ""}`}
                        onClick={() => setActiveTab("groups")}
                        style={{
                            background: "none", border: "none",
                            borderBottom: activeTab === "groups" ? "2px solid var(--primary)" : "2px solid transparent",
                            color: activeTab === "groups" ? "var(--text)" : "var(--muted)",
                            padding: "10px 20px", cursor: "pointer", fontSize: "1rem"
                        }}
                    >
                        Group Issues
                    </button>
                    <button
                        className={`tab ${activeTab === "users" ? "active" : ""}`}
                        onClick={() => setActiveTab("users")}
                        style={{
                            background: "none", border: "none",
                            borderBottom: activeTab === "users" ? "2px solid var(--primary)" : "2px solid transparent",
                            color: activeTab === "users" ? "var(--text)" : "var(--muted)",
                            padding: "10px 20px", cursor: "pointer", fontSize: "1rem"
                        }}
                    >
                        User Issues
                    </button>
                </div>

                {activeTab === "groups" && (
                    <div>
                        <h3 style={{ marginTop: 0 }}>Orphan Groups (0 Members)</h3>
                        {orphanCount === 0 ? <div style={{ color: "var(--muted)" }}>No orphan groups found.</div> : (
                            <table className="table">
                                <thead><tr><th>Group Name</th><th style={{ width: 100 }}>User Count</th></tr></thead>
                                <tbody>
                                    {(data?.groupsIssues || []).map((g, i) => (
                                        <tr key={i}>
                                            <td>{g.groupName}</td>
                                            <td style={{ textAlign: "center" }}>{g.userCount}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {activeTab === "users" && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 40 }}>
                        <section>
                            <h3 style={{ marginTop: 0 }}>Stale Accounts ({">"} 1 year inactive)</h3>
                            {staleCount === 0 ? <div style={{ color: "var(--muted)" }}>No stale accounts found.</div> : (
                                <table className="table">
                                    <thead><tr><th>DisplayName</th><th>Username</th><th>Last Logon</th></tr></thead>
                                    <tbody>
                                        {(data?.staleAccounts || []).map((u, i) => (
                                            <tr key={i}>
                                                <td>{u.displayName}</td>
                                                <td style={{ color: "var(--muted)" }}>{u.username}</td>
                                                <td style={{ color: "#ff6a6a" }}>{u.lastLogon}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section>
                            <h3 style={{ marginTop: 0 }}>Users with Zero Groups</h3>
                            {zeroCount === 0 ? <div style={{ color: "var(--muted)" }}>No users without groups.</div> : (
                                <table className="table">
                                    <thead><tr><th>DisplayName</th><th>Username</th></tr></thead>
                                    <tbody>
                                        {(data?.zeroGroupsUsers || []).map((u, i) => (
                                            <tr key={i}>
                                                <td>{u.displayName}</td>
                                                <td style={{ color: "var(--muted)" }}>{u.username}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </section>

                        <section>
                            <h3 style={{ marginTop: 0 }}>Overprivileged Users (Top 10%)</h3>
                            {overCount === 0 ? <div style={{ color: "var(--muted)" }}>No overprivileged users found.</div> : (
                                <table className="table">
                                    <thead><tr><th>DisplayName</th><th>Username</th><th>Excess Groups</th></tr></thead>
                                    <tbody>
                                        {(data?.overprivilegedUsers || []).map((u, i) => (
                                            <tr key={i}>
                                                <td>{usersByUsername[u.username] || u.username}</td>
                                                {/* Note: username might be key, need to handle display properly or just show username if display unavailable in object */}
                                                <td style={{ color: "var(--muted)" }}>{u.username}</td>
                                                <td>{u.groupCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                            <div style={{ marginTop: 10, fontSize: "0.9em", color: "var(--muted)" }}>
                                * For full details, see the <a href="/overprivileged-users" style={{ color: "var(--primary)" }}>Overprivileged Analysis</a> page.
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </div>
    );
}

// Helper (in case we need to map usernames in the future, currently just using raw data)
const usersByUsername = {}; 
