const STALE_DAYS_THRESHOLD = 90;

function toIsoDate(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : "";
}

function isStaleUser(user, nowMs) {
  const lastLoginMs = user?.lastLogin ? new Date(user.lastLogin).getTime() : NaN;
  const staleCutoffMs = STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
  return Number.isFinite(lastLoginMs) && nowMs - lastLoginMs > staleCutoffMs;
}

function normalizeUsers(users) {
  return Array.isArray(users) ? users : [];
}

function normalizeRoles(roles) {
  return Array.isArray(roles) ? roles : [];
}

function normalizeObject(value) {
  return value && typeof value === "object" ? value : {};
}

function userBaseRow(user) {
  const groups = Array.isArray(user?.groups) ? user.groups : [];
  return {
    displayName: user?.displayName || "",
    username: user?.username || "",
    accountType: user?.accountType || user?.account_type || "Internal",
    department: user?.department || "",
    businessRole: user?.businessRole || "Unassigned",
    groupsCount: groups.length,
    groups: groups.join("; "),
    lastLogin: user?.lastLogin || "",
    dataSource: user?.DataSource || user?.dataSource || "N/A",
  };
}

function buildClusterMembershipRows(mining, assignments = {}, displayNames = {}) {
  const groups = Array.isArray(mining?.groups) ? mining.groups : [];
  const matrix = normalizeObject(mining?.matrix);
  const clusterByUser = {};

  (Array.isArray(mining?.clusters) ? mining.clusters : []).forEach((cluster) => {
    (Array.isArray(cluster?.members) ? cluster.members : []).forEach((username) => {
      clusterByUser[username] = cluster?.clusterId ?? "";
    });
  });

  return Object.keys(matrix)
    .sort((a, b) => a.localeCompare(b))
    .map((username) => {
      const grants = Array.isArray(matrix[username])
        ? matrix[username]
        : groups.filter((group) => matrix?.[username]?.[group]);

      return {
        username,
        displayName: displayNames?.[username] || username,
        clusterId: clusterByUser[username] ?? "",
        businessRole: assignments?.[username] || "Unassigned",
        enabledGroupsCount: grants.length,
        enabledGroups: grants.join("; "),
      };
    });
}

function buildOverprivilegedRows(aiDetection) {
  const items = Array.isArray(aiDetection?.items) ? aiDetection.items : [];

  return items.map((item) => {
    const anomalies = Array.isArray(item?.anomalies) ? item.anomalies : [];
    const topAnomaly = anomalies[0] || {};
    const anomalousGroups = anomalies.map((anomaly) => anomaly?.group || "").filter(Boolean);
    const topReasons = Array.isArray(topAnomaly?.reasons) ? topAnomaly.reasons : [];

    return {
      displayName: item?.displayName || "",
      username: item?.username || "",
      businessRole: item?.businessRole || "Unassigned",
      imputedBusinessRole: item?.businessRole || "Unassigned",
      department: item?.department || "",
      accountType: item?.accountType || "Internal",
      anomalyCount: Number(item?.anomalyCount || anomalies.length || 0),
      anomalousGroups: anomalousGroups.join("; "),
      topAnomaly: topAnomaly?.group || "",
      topConfidence: Number(topAnomaly?.confidence || 0),
      topReasons: topReasons.join("; "),
    };
  });
}

export function buildReportsCatalog(
  {
    users = [],
    businessRoles = { roles: [], assignments: {} },
    mining = {},
    aiDetection = {},
    kpi = {},
    clusterQuality = {},
    groupCounts = {},
  } = {},
  nowIso = new Date().toISOString(),
) {
  const safeUsers = normalizeUsers(users);
  const roleItems = normalizeRoles(businessRoles?.roles);
  const assignments = normalizeObject(businessRoles?.assignments);
  const safeAiDetection = normalizeObject(aiDetection);
  const safeKpi = normalizeObject(kpi);
  const safeClusterQuality = normalizeObject(clusterQuality);
  const safeCounts = normalizeObject(groupCounts?.counts);
  const nowMs = new Date(nowIso).getTime();

  const usersInventory = safeUsers.map(userBaseRow);
  const staleUsers = safeUsers.filter((user) => isStaleUser(user, nowMs)).map(userBaseRow);
  const overprivilegedUsers = buildOverprivilegedRows(safeAiDetection);
  const overprivilegedUsersWithRoles = overprivilegedUsers.map((row) => ({
    ...row,
    roleSource: "ai-detection",
  }));
  const zeroGroupUsers = safeUsers
    .filter((user) => (Array.isArray(user?.groups) ? user.groups.length : 0) === 0)
    .map(userBaseRow);
  const businessRolesSummary = roleItems.map((role) => ({
    role: role?.role || "",
    usersCount: Number(role?.count || 0),
    groupsCount: Array.isArray(role?.groups) ? role.groups.length : 0,
    groups: Array.isArray(role?.groups) ? role.groups.join("; ") : "",
    color: role?.color || "",
  }));
  const businessRoleAssignments = safeUsers.map((user) => ({
    displayName: user?.displayName || "",
    username: user?.username || "",
    businessRole: assignments?.[user?.username] || user?.businessRole || "Unassigned",
    department: user?.department || "",
    accountType: user?.accountType || user?.account_type || "Internal",
    groupsCount: Array.isArray(user?.groups) ? user.groups.length : 0,
  }));
  const clusterQualitySummary = (Array.isArray(safeClusterQuality?.summaryCards) ? safeClusterQuality.summaryCards : []).map((card) => ({
    label: card?.label || "",
    value: card?.value ?? "",
    tone: card?.tone || "",
    helper: card?.helper || "",
  }));
  const clusterMembership = buildClusterMembershipRows(mining, assignments, normalizeObject(mining?.displayNames));
  const roleCoverageGaps = safeUsers
    .filter((user) => {
      const role = String(assignments?.[user?.username] || user?.businessRole || "").trim();
      return !role || role === "Unassigned";
    })
    .map((user) => ({
      displayName: user?.displayName || "",
      username: user?.username || "",
      department: user?.department || "",
      accountType: user?.accountType || user?.account_type || "Internal",
      groupsCount: Array.isArray(user?.groups) ? user.groups.length : 0,
      lastLogin: user?.lastLogin || "",
    }));
  const accessByGroup = Object.entries(safeCounts)
    .sort((a, b) => Number(b[1] || 0) - Number(a[1] || 0) || a[0].localeCompare(b[0]))
    .map(([group, usersCount]) => ({
      group,
      usersCount: Number(usersCount || 0),
    }));
  const controlSummary = [
    {
      metric: "Total Users",
      value: Number(safeKpi?.totalUsers || safeUsers.length || 0),
      source: "KPI",
    },
    {
      metric: "Cluster Quality",
      value: Number(safeKpi?.clusterQuality || 0),
      source: "KPI",
    },
    {
      metric: "Model Quality",
      value: Number(safeKpi?.modelQuality || 0),
      source: "KPI",
    },
    {
      metric: "Stale Accounts",
      value: Number(safeKpi?.staleAccountCount || staleUsers.length || 0),
      source: "KPI",
    },
    {
      metric: "Zero Group Users",
      value: Number(safeKpi?.zeroGroupCount || zeroGroupUsers.length || 0),
      source: "KPI",
    },
    {
      metric: "Overprivileged Users",
      value: Number(safeKpi?.overprivilegedCount || overprivilegedUsers.length || 0),
      source: "KPI",
    },
    {
      metric: "Business Roles",
      value: roleItems.length,
      source: "Derived",
    },
    {
      metric: "Groups Catalog",
      value: Object.keys(safeCounts).length,
      source: "Derived",
    },
    {
      metric: "Mining Timestamp",
      value: toIsoDate(mining?.ts),
      source: "Mining",
    },
  ];

  const reports = [
    {
      id: "users_inventory",
      title: "Users Inventory",
      description: "Inventario completo utenti con attributi chiave e gruppi assegnati.",
      audience: "Audit Core",
      filename: "report_users_inventory.csv",
      rows: usersInventory,
    },
    {
      id: "stale_users",
      title: "Stale Users",
      description: "Account con ultimo login oltre 90 giorni.",
      audience: "Access Review",
      filename: "report_stale_users.csv",
      rows: staleUsers,
    },
    {
      id: "overprivileged_users",
      title: "Overprivileged Users",
      description: "Utenti con anomalie rilevate da AI Detection.",
      audience: "Risk",
      filename: "report_overprivileged_users.csv",
      rows: overprivilegedUsers,
    },
    {
      id: "overprivileged_users_with_roles",
      title: "Overprivileged Users + Imputed Roles",
      description: "Utenti con anomalie, ruolo imputato e dettaglio del gruppo anomalo principale.",
      audience: "Risk",
      filename: "report_overprivileged_users_with_roles.csv",
      rows: overprivilegedUsersWithRoles,
    },
    {
      id: "zero_group_users",
      title: "Users Without Groups",
      description: "Utenti senza alcun gruppo associato.",
      audience: "Cleanup",
      filename: "report_zero_group_users.csv",
      rows: zeroGroupUsers,
    },
    {
      id: "business_roles_summary",
      title: "Business Roles Summary",
      description: "Sintesi dei Business Role con utenti, gruppi e colore associato.",
      audience: "IAM Governance",
      filename: "report_business_roles_summary.csv",
      rows: businessRolesSummary,
    },
    {
      id: "business_role_assignments",
      title: "Business Role Assignments",
      description: "Mappa utente -> Business Role per revisione delle assegnazioni.",
      audience: "Certification",
      filename: "report_business_role_assignments.csv",
      rows: businessRoleAssignments,
    },
    {
      id: "cluster_quality_summary",
      title: "Cluster Quality Summary",
      description: "Indicatori di qualita cluster e data quality pronti per audit.",
      audience: "Audit Metrics",
      filename: "report_cluster_quality_summary.csv",
      rows: clusterQualitySummary,
    },
    {
      id: "cluster_membership",
      title: "Cluster Membership Export",
      description: "Vista utenti, cluster e gruppi abilitati nella matrice di mining.",
      audience: "Role Mining",
      filename: "report_cluster_membership.csv",
      rows: clusterMembership,
    },
    {
      id: "role_coverage_gaps",
      title: "Role Coverage Gaps",
      description: "Utenti senza Business Role assegnato o con copertura incompleta.",
      audience: "Coverage",
      filename: "report_role_coverage_gaps.csv",
      rows: roleCoverageGaps,
    },
    {
      id: "access_by_group",
      title: "Access by Group",
      description: "Volume utenti per gruppo per evidenziare concentrazioni di accesso.",
      audience: "Entitlement Review",
      filename: "report_access_by_group.csv",
      rows: accessByGroup,
    },
    {
      id: "control_summary",
      title: "Control Summary",
      description: "Cruscotto sintetico con KPI di controllo e mining corrente.",
      audience: "Management",
      filename: "report_control_summary.csv",
      rows: controlSummary,
    },
  ];

  return reports.slice(0, 11);
}
