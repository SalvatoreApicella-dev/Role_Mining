import React, { useEffect, useState } from "react";
import CreatableSelect from "react-select/creatable";
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
    const [brPatterns, setBrPatterns] = useState([]);
    const [brAssignmentPatterns, setBrAssignmentPatterns] = useState([]);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState("");
    const [ok, setOk] = useState("");

    // New rule form
    const [accountType, setAccountType] = useState(ACCOUNT_TYPES[2]); // Service
    const [adFields, setAdFields] = useState(DEFAULT_FIELDS);
    const [field, setField] = useState(DEFAULT_FIELDS[0]);
    const [regex, setRegex] = useState("");
    const [brRoles, setBrRoles] = useState([]);
    const [businessRole, setBusinessRole] = useState(null);
    const [brField, setBrField] = useState(DEFAULT_FIELDS[0]);
    const [brRegex, setBrRegex] = useState("");
    const [assignmentBusinessRole, setAssignmentBusinessRole] = useState(null);
    const [assignmentRegex, setAssignmentRegex] = useState("");

    useEffect(() => {
        Promise.all([api.getAdFields(), api.businessRoles()])
            .then(([fieldsRes, rolesRes]) => {
                const fieldsList = Array.isArray(fieldsRes?.fields)
                    ? fieldsRes.fields
                    : Array.isArray(fieldsRes)
                        ? fieldsRes
                        : [];
                const dynamic = fieldsList
                    .filter((f) => typeof f === "string" && f.trim())
                    .map((f) => ({ value: f, label: f }));
                if (dynamic.length > 0) {
                    setAdFields(dynamic);
                    setField(dynamic[0]);
                    setBrField(dynamic[0]);
                }
                const rolesList = Array.isArray(rolesRes?.roles)
                    ? rolesRes.roles
                    : Array.isArray(rolesRes?.items)
                        ? rolesRes.items
                        : Array.isArray(rolesRes)
                            ? rolesRes
                            : [];
                const roleOptions = rolesList
                    .map((role) => {
                        if (typeof role === "string") {
                            const name = role.trim();
                            return name ? { value: name, label: name } : null;
                        }
                        if (role && typeof role === "object") {
                            const name = String(role.role || role.name || "").trim();
                            if (!name) return null;
                            const count = Number(role.count || 0);
                            return {
                                value: name,
                                label: count > 0 ? `${name} (${count})` : name,
                            };
                        }
                        return null;
                    })
                    .filter(Boolean);
                setBrRoles(roleOptions);
                if (roleOptions.length > 0) {
                    setBusinessRole(roleOptions[0]);
                    setAssignmentBusinessRole(roleOptions[0]);
                }
            })
            .catch((loadErr) => console.error("Failed to load AI Training selectors", loadErr));
    }, []);

    async function loadPatterns() {
        try {
            setLoading(true);
            setErr("");
            const [res, brRes, brAssignRes] = await Promise.all([
                api.getPatterns(),
                api.getBrPatterns(),
                api.getBrAssignmentPatterns(),
            ]);
            const safePatterns = Array.isArray(res?.custom)
                ? res.custom.filter((p) => p && typeof p === "object")
                : [];
            const safeBrPatterns = Array.isArray(brRes?.custom)
                ? brRes.custom.filter((p) => p && typeof p === "object")
                : [];
            const safeBrAssignmentPatterns = Array.isArray(brAssignRes?.custom)
                ? brAssignRes.custom.filter((p) => p && typeof p === "object")
                : [];
            setPatterns(safePatterns);
            setBrPatterns(safeBrPatterns);
            setBrAssignmentPatterns(safeBrAssignmentPatterns);
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

    async function handleAddBrRule(e) {
        e.preventDefault();
        if (!brRegex.trim()) { setErr("Regex is required"); return; }
        if (!businessRole || !brField) { setErr("Business Role and Field are required"); return; }
        try { new RegExp(brRegex); } catch { setErr("Invalid regex syntax"); return; }

        try {
            setErr("");
            setOk("");
            const roleVal = businessRole.value || businessRole.label || businessRole;
            const fieldVal = brField.value || brField.label || brField;
            await api.addBrPattern(roleVal, fieldVal, brRegex.trim());
            setOk(`Business Role rule added: ${roleVal} / ${fieldVal} / ${brRegex}`);
            setBrRegex("");
            await loadPatterns();
        } catch (e) {
            setErr(String(e.message || e));
        }
    }

    async function handleDeleteBrRule(index) {
        try {
            setErr("");
            setOk("");
            await api.deleteBrPattern(index);
            setOk("Business Role rule deleted.");
            await loadPatterns();
        } catch (e) {
            setErr(String(e.message || e));
        }
    }

    async function handleAddBrAssignmentRule(e) {
        e.preventDefault();
        if (!assignmentRegex.trim()) { setErr("Regex is required"); return; }
        if (!assignmentBusinessRole) {
            setErr("Business Role is required");
            return;
        }
        try { new RegExp(assignmentRegex); } catch { setErr("Invalid regex syntax"); return; }
        try {
            setErr("");
            setOk("");
            const businessRoleVal = assignmentBusinessRole.value || assignmentBusinessRole.label || assignmentBusinessRole;
            await api.addBrAssignmentPattern(businessRoleVal, assignmentRegex.trim());
            setOk(`Role Assignment rule added: ${businessRoleVal} / ${assignmentRegex}`);
            setAssignmentRegex("");
            await loadPatterns();
        } catch (e) {
            setErr(String(e.message || e));
        }
    }

    async function handleDeleteBrAssignmentRule(index) {
        try {
            setErr("");
            setOk("");
            await api.deleteBrAssignmentPattern(index);
            setOk("Role Assignment rule deleted.");
            await loadPatterns();
        } catch (e) {
            setErr(String(e.message || e));
        }
    }

    return (
        <div className="main">
            <h2 style={{ marginTop: 0 }}>
                Pattern Rules
            </h2>
            <p style={{ color: "var(--muted)", marginTop: -4, marginBottom: 16, fontSize: 13 }}>
                Definisce regole regex deterministiche applicate in pre-classificazione, prima dell'inferenza del modello ML.
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

            <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Add Business Role Rule</h3>
                <form onSubmit={handleAddBrRule} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 220 }}>
                        <label style={labelStyle}>Business Role</label>
                        <CreatableSelect
                            value={businessRole}
                            onChange={setBusinessRole}
                            options={brRoles}
                            styles={customStyles}
                            formatCreateLabel={(val) => `Create "${val}"`}
                            placeholder="Select or type role..."
                        />
                    </div>
                    <div style={{ minWidth: 180 }}>
                        <label style={labelStyle}>Field</label>
                        <CreatableSelect
                            value={brField}
                            onChange={setBrField}
                            options={adFields}
                            styles={customStyles}
                            formatCreateLabel={(val) => `Use Field "${val}"`}
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <label style={labelStyle}>Regex Pattern</label>
                        <input
                            type="text"
                            value={brRegex}
                            onChange={(e) => setBrRegex(e.target.value)}
                            placeholder="e.g. ^fin_.* or procurement"
                            style={{ ...inputStyle, width: "100%" }}
                            aria-label="Business Role Regex Pattern"
                        />
                    </div>
                    <button type="submit" className="primary" style={{ height: 36, padding: "0 24px" }}>
                        Add BR Rule
                    </button>
                </form>
            </div>

            <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>Add Role Assignment Rule</h3>
                <form onSubmit={handleAddBrAssignmentRule} style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
                    <div style={{ minWidth: 220 }}>
                        <label style={labelStyle}>Business Roles</label>
                        <CreatableSelect
                            value={assignmentBusinessRole}
                            onChange={setAssignmentBusinessRole}
                            options={brRoles}
                            styles={customStyles}
                            formatCreateLabel={(val) => `Create "${val}"`}
                            placeholder="Select or type business role..."
                        />
                    </div>
                    <div style={{ flex: 1, minWidth: 220 }}>
                        <label style={labelStyle}>Role Regex Pattern</label>
                        <input
                            type="text"
                            value={assignmentRegex}
                            onChange={(e) => setAssignmentRegex(e.target.value)}
                            placeholder="e.g. ^SAP.*"
                            style={{ ...inputStyle, width: "100%" }}
                            aria-label="Role Regex Pattern"
                        />
                    </div>
                    <button type="submit" className="primary" style={{ height: 36, padding: "0 24px" }}>
                        Add Assignment Rule
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
                                                background: typeColor(String(p?.account_type || "Unknown")),
                                                color: "#fff",
                                                padding: "2px 10px",
                                                borderRadius: 12,
                                                fontSize: 12,
                                                fontWeight: 500,
                                            }}>
                                                {String(p?.account_type || "Unknown")}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 13 }}>{fieldLabel(String(p?.field || ""))}</td>
                                        <td>
                                            <code style={{
                                                background: "rgba(255,255,255,0.06)",
                                                padding: "2px 8px",
                                                borderRadius: 6,
                                                fontSize: 12,
                                                fontFamily: "monospace",
                                            }}>
                                                {String(p?.regex || "")}
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

            <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>
                    Active Business Role Rules ({brPatterns.length})
                </h3>

                {loading ? (
                    <div style={{ color: "var(--muted)", padding: 20, textAlign: "center" }}>Loading...</div>
                ) : brPatterns.length === 0 ? (
                    <div style={{ color: "var(--muted)", padding: 20, textAlign: "center", fontSize: 13 }}>
                        No Business Role rules defined yet. Add one above.
                    </div>
                ) : (
                    <div style={{ maxHeight: 420, overflow: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)" }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Business Role</th>
                                    <th>Field</th>
                                    <th>Regex</th>
                                    <th style={{ width: 80 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {brPatterns.map((p, i) => (
                                    <tr key={`${String(p?.business_role || "")}-${String(p?.field || "")}-${i}`}>
                                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{i + 1}</td>
                                        <td>
                                            <span style={pillStyle}>
                                                {String(p?.business_role || "Unknown")}
                                            </span>
                                        </td>
                                        <td style={{ fontSize: 13 }}>{fieldLabel(String(p?.field || ""))}</td>
                                        <td>
                                            <code style={codeStyle}>
                                                {String(p?.regex || "")}
                                            </code>
                                        </td>
                                        <td>
                                            <button
                                                className="danger"
                                                style={{ fontSize: 12, padding: "3px 12px" }}
                                                onClick={() => handleDeleteBrRule(i)}
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

            <div className="panel" style={{ marginTop: 16 }}>
                <h3 style={{ marginTop: 0, fontSize: 15 }}>
                    Active Role Assignment Rules ({brAssignmentPatterns.length})
                </h3>

                {loading ? (
                    <div style={{ color: "var(--muted)", padding: 20, textAlign: "center" }}>Loading...</div>
                ) : brAssignmentPatterns.length === 0 ? (
                    <div style={{ color: "var(--muted)", padding: 20, textAlign: "center", fontSize: 13 }}>
                        No Role Assignment rules defined yet. Add one above.
                    </div>
                ) : (
                    <div style={{ maxHeight: 420, overflow: "auto", borderRadius: 10, border: "1px solid rgba(255,255,255,0.10)" }}>
                        <table className="table">
                            <thead>
                                <tr>
                                    <th style={{ width: 40 }}>#</th>
                                    <th>Business Roles</th>
                                    <th>Role Regex Pattern</th>
                                    <th style={{ width: 80 }}>Action</th>
                                </tr>
                            </thead>
                            <tbody>
                                {brAssignmentPatterns.map((p, i) => (
                                    <tr key={`${String(p?.business_role || "")}-${String(p?.regex || "")}-${i}`}>
                                        <td style={{ color: "var(--muted)", fontSize: 12 }}>{i + 1}</td>
                                        <td>
                                            <span style={pillStyle}>
                                                {String(p?.business_role || "Unknown")}
                                            </span>
                                        </td>
                                        <td>
                                            <code style={codeStyle}>
                                                {String(p?.regex || "")}
                                            </code>
                                        </td>
                                        <td>
                                            <button
                                                className="danger"
                                                style={{ fontSize: 12, padding: "3px 12px" }}
                                                onClick={() => handleDeleteBrAssignmentRule(i)}
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
                <i>Note: Role Assignment rules evaluate regex on group names and add weighted evidence in automatic Business Role assignment.</i>
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

const codeStyle = {
    background: "rgba(255,255,255,0.06)",
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontFamily: "monospace",
};

const pillStyle = {
    background: "rgba(59,130,246,0.25)",
    color: "#fff",
    padding: "2px 10px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 500,
};
