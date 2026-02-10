import React, { useEffect, useState } from "react";
import CreatableSelect from "react-select/creatable";
import Select from "react-select";
import { api } from "../api.js";

const ACCOUNT_TYPES = [
    "Internal", "External", "Service", "Administrative", "BlueCollar",
    "Contractor", "Student", "VIP", "Test", "System", "Shared", "Disabled",
].map(t => ({ value: t, label: t }));

// Initial default fields
const DEFAULT_FIELDS = [
    { value: "display_name", label: "Display Name" },
    { value: "ou", label: "OU (Org Unit)" },
    { value: "employee_type", label: "Employee Type" },
];

const customStyles = {
    control: (base, state) => ({
        ...base,
        background: "rgba(0,0,0,0.3)",
        borderColor: "rgba(255,255,255,0.12)",
        color: "#fff",
        minHeight: 36,
        fontSize: 13,
        boxShadow: state.isFocused ? "0 0 0 1px #3b82f6" : "none",
        "&:hover": { borderColor: "rgba(255,255,255,0.3)" }
    }),
    menu: (base) => ({
        ...base,
        background: "#1e1e1e",
        border: "1px solid rgba(255,255,255,0.1)",
        zIndex: 100
    }),
    option: (base, state) => ({
        ...base,
        background: state.isFocused ? "rgba(255,255,255,0.1)" : "transparent",
        color: "#fff",
        fontSize: 13,
        cursor: "pointer"
    }),
    singleValue: (base) => ({
        ...base,
        color: "#fff",
    }),
    input: (base) => ({
        ...base,
        color: "#fff",
    }),
    placeholder: (base) => ({
        ...base,
        color: "rgba(255,255,255,0.5)",
    }),
};

export default function AiTrainingPage() {
    const [patterns, setPatterns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [ok, setOk] = useState("");

    // New rule form
    const [accountType, setAccountType] = useState(ACCOUNT_TYPES[2]); // Service
    const [adFields, setAdFields] = useState(DEFAULT_FIELDS);
    const [field, setField] = useState(DEFAULT_FIELDS[0]);
    const [regex, setRegex] = useState("");

    useEffect(() => {
        api.getAdFields().then(res => {
            const dynamic = res.fields.map(f => ({ value: f, label: f }));
            setAdFields(dynamic);
            // Optional: if current field is not in dynamic, maybe keep it?
            // For now, valid defaults are likely in the list.
        }).catch(err => console.error("Failed to load AD fields", err));
    }, []);

    async function loadPatterns() {
        try {
            setLoading(true);
            setErr("");
            const res = await api.getPatterns();
            // Backend returns { static: {...}, custom: [...] }
            setPatterns(res.custom || []);
        } catch (e) {
            setErr(String(e.message || e));
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadPatterns(); }, []);

    async function handleAdd(e) {
        e.preventDefault();
        if (!regex.trim()) { setErr("Regex is required"); return; }
        // Validate regex
        try { new RegExp(regex); } catch { setErr("Invalid regex syntax"); return; }
        if (!accountType || !field) { setErr("Account Type and Field are required"); return; }

        try {
            setErr("");
            setOk("");
            // Use .value for react-select objects
            const typeVal = accountType.value || accountType.label || accountType;
            const fieldVal = field.value || field.label || field;

            await api.addPattern(typeVal, fieldVal, regex.trim());
            setOk(`Rule added: ${typeVal} / ${fieldVal} / ${regex}`);
            setRegex("");
            await loadPatterns();
        } catch (e) {
            setErr(String(e.message || e));
        }
    }

    async function handleDelete(index) {
        try {
            setErr("");
            setOk("");
            await api.deletePattern(index);
            setOk("Rule deleted.");
            await loadPatterns();
        } catch (e) {
            setErr(String(e.message || e));
        }
    }

    return (
        <div className="main">
            <h2 style={{ marginTop: 0 }}>
                AI Training — Pattern Rules
            </h2>
            <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 16, fontSize: 13 }}>
                Define regex patterns to classify accounts automatically. Rules are checked <b>before</b> the ML model.
            </p>

            {/* ─── Add Rule Form ─── */}
            <div className="panel">
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Add New Rule</h3>
                <form onSubmit={handleAdd} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 200 }}>
                        <label style={labelStyle}>Account Type</label>
                        <CreatableSelect
                            value={accountType}
                            onChange={setAccountType}
                            options={ACCOUNT_TYPES}
                            styles={customStyles}
                            formatCreateLabel={(val) => `Create "${val}"`}
                        />
                    </div>
                    <div style={{ minWidth: 180 }}>
                        <label style={labelStyle}>Field</label>
                        <CreatableSelect
                            value={field}
                            onChange={setField}
                            options={adFields}
                            styles={customStyles}
                            formatCreateLabel={(val) => `Use Field "${val}"`}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: 200 }}>
                        <label style={labelStyle}>Regex Pattern</label>
                        <input
                            type="text"
                            value={regex}
                            onChange={e => setRegex(e.target.value)}
                            placeholder="e.g. ^SVC_.* or (?i)admin"
                            style={{ ...inputStyle, width: "100%" }}
                            aria-label="Regex Pattern"
                        />
                    </div>
                    <button type="submit" className="primary" style={{ height: 36, padding: "0 24px" }}>
                        Add Rule
                    </button>
                </form>
            </div>

            {/* ─── Feedback ─── */}
            {ok && <div className="ok" style={{ marginTop: 12 }}>{ok}</div>}
            {err && <div className="err" style={{ marginTop: 12 }}>{err}</div>}

            {/* ─── Rules Table ─── */}
            <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>
                    Active Rules ({patterns.length})
                </h3>

                {loading ? (
                    <div style={{ color: "var(--muted)", padding: 20, textAlign: "center" }}>Loading...</div>
                ) : patterns.length === 0 ? (
                    <div style={{ color: "var(--muted)", padding: 20, textAlign: "center", fontSize: 13 }}>
                        No custom rules defined yet. Add one above!
                    </div>
                ) : (
                    <div style={{ maxHeight: 500, overflow: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)" }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Account Type</th>
                                    <th>Field</th>
                                    <th>Regex</th>
                                    <th style={{ width: 80 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {patterns.map((p, i) => (
                                    <tr key={i} style={{
                                        transition: "background 0.2s",
                                    }}>
                                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{i + 1}</td>
                                        <td>
                                            <span style={{
                                                background: typeColor(p.account_type),
                                                color: "#fff",
                                                padding: "2px 10px",
                                                borderRadius: 12,
                                                fontSize: 12,
                                                fontWeight: 500,
                                            }}>
                                                {p.account_type}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 13 }}>{fieldLabel(p.field)}</td>
                                        <td>
                                            <code style={{
                                                background: "rgba(255,255,255,0.06)",
                                                padding: "2px 8px",
                                                borderRadius: 6,
                                                fontSize: 12,
                                                fontFamily: "monospace",
                                            }}>
                                                {p.regex}
                                            </code>
                                        </td>
                                        <td>
                                            <button
                                                className="danger"
                                                style={{ fontSize: 12, padding: "3px 12px" }}
                                                onClick={() => handleDelete(i)}
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* ─── Info Box ─── */}
            <div style={{
                marginTop: 16,
                padding: "12px 16px",
                borderRadius: 10,
                background: "rgba(56,189,248,0.07)",
                border: "1px solid rgba(56,189,248,0.20)",
                fontSize: 13,
                color: "var(--muted)",
                lineHeight: 1.6,
            }}>
                <b style={{ color: "var(--fg)" }}>How it works:</b><br />
                Custom rules are evaluated <b>before</b> the ML model.
                Select an attribute from your Active Directory (or type a new one) and define a regex.
                If the field matches the regex, the account is classified accordingly.
                <br />
                <i>Note: Fields are auto-populated from your latest import.</i>
            </div>
        </div>
    );
}

// ─── Helpers ───

const labelStyle = {
    display: "block",
    fontSize: 11,
    color: "var(--muted)",
    marginBottom: 4,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
};

const inputStyle = {
    height: 36,
    padding: "0 10px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.12)",
    background: "rgba(0,0,0,0.3)",
    color: "var(--fg)",
    fontSize: 13,
};

function fieldLabel(f) {
    const map = { display_name: "Display Name", ou: "OU", employee_type: "Employee Type" };
    return map[f] || f;
}

function typeColor(t) {
    const map = {
        Internal: "#3b82f6", External: "#f59e0b", Service: "#8b5cf6",
        Administrative: "#ef4444", BlueCollar: "#06b6d4", Contractor: "#f97316",
        Student: "#84cc16", VIP: "#ec4899", Test: "#6b7280",
        System: "#64748b", Shared: "#14b8a6", Disabled: "#4b5563",
    };
    return map[t] || "#6b7280";
}
