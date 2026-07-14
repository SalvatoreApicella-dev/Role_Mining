import test from "node:test";
import assert from "node:assert/strict";

import {
  AI_FEATURES_ENABLED,
  ANALYTICS_AUTOMATIC_DETECTION_ENABLED,
  buildAnalyticsKpiItems,
  getVisibleBusinessRoleSections,
  ROLE_MODELING_ENABLED,
  getAnalyticsFocusActions,
  isRoleModelingRouteEnabled,
} from "../featureFlags.js";
import { buildBusinessRolesViewModel } from "../businessRolesView.js";
import { buildClusterHeatmapViewModel } from "../clusterHeatmapView.js";
import { buildAuditPdfBytes, buildAuditPdfModel } from "../reportAuditPdf.js";
import { buildUsersRiskSummary, filterUsersByQuickRisk, selectUsersSummaryRows } from "../clusterUsersView.js";
import { buildReportsCatalog } from "../reportsCatalog.js";

test("AI features are disabled in analytics KPI collections", () => {
  assert.equal(AI_FEATURES_ENABLED, false);
  assert.equal(ANALYTICS_AUTOMATIC_DETECTION_ENABLED, true);

  const items = buildAnalyticsKpiItems({
    clusterPct: 88,
    modelPct: 91,
    aiPct: 7,
  });

  assert.deepEqual(
    items.map((item) => item.label),
    ["Cluster Quality", "Model Score", "Automatic Detection"],
  );
  assert.equal(items.some((item) => item.label === "Automatic Detection"), true);
});

test("AI suggestions are hidden in business role detail sections", () => {
  assert.deepEqual(getVisibleBusinessRoleSections(), {
    showAiSuggestions: false,
  });
});

test("Role Modeling is enabled in visible analytics actions and route exposure", () => {
  assert.equal(ROLE_MODELING_ENABLED, true);

  const actions = getAnalyticsFocusActions("/model-quality");
  assert.deepEqual(actions, [
    {
      label: "Apri analisi prioritaria",
      route: "/model-quality",
    },
    {
      label: "Role Modeling",
      route: "/role-modeling",
    },
  ]);

  assert.equal(isRoleModelingRouteEnabled(), true);
});

test("Business Roles view model computes summary KPIs and filtered rows", () => {
  const view = buildBusinessRolesViewModel([
    { role: "Finance", count: 8, groups: ["SAP_AP", "SAP_AR"] },
    { role: "Engineering", count: 12, groups: ["GIT_READ", "JIRA_WRITE", "CI_VIEW"] },
    { role: "HR", count: 4, groups: [] },
  ], "fin");

  assert.deepEqual(view.summary, {
    totalRoles: 3,
    totalAssignments: 24,
    avgGroupsPerRole: "1.7",
  });
  assert.deepEqual(view.filteredRoles.map((item) => item.role), ["Finance"]);
});

test("Users risk summary computes stale, overprivileged, and zero-group counts", () => {
  const summary = buildUsersRiskSummary([
    { username: "a", lastLogin: "2025-01-01T00:00:00Z", groups: ["g1"] },
    { username: "b", lastLogin: "2026-03-20T00:00:00Z", groups: [] },
    { username: "c", lastLogin: "2026-03-10T00:00:00Z", groups: ["1","2","3","4","5","6","7","8","9"] },
  ], "2026-03-22T00:00:00Z");

  assert.deepEqual(summary, {
    staleUsers: 1,
    overprivilegedUsers: 1,
    zeroGroupsUsers: 1,
  });
});

test("Users quick risk filter combines client-side categories", () => {
  const rows = [
    { username: "stale", lastLogin: "2025-01-01T00:00:00Z", groups: ["g1"] },
    { username: "zero", lastLogin: "2026-03-20T00:00:00Z", groups: [] },
    { username: "over", lastLogin: "2026-03-10T00:00:00Z", groups: ["1","2","3","4","5","6","7","8","9"] },
  ];

  assert.deepEqual(
    filterUsersByQuickRisk(rows, "stale", "2026-03-22T00:00:00Z").map((row) => row.username),
    ["stale"],
  );
  assert.deepEqual(
    filterUsersByQuickRisk(rows, "zero_groups", "2026-03-22T00:00:00Z").map((row) => row.username),
    ["zero"],
  );
  assert.deepEqual(
    filterUsersByQuickRisk(rows, "overprivileged", "2026-03-22T00:00:00Z").map((row) => row.username),
    ["over"],
  );
});

test("Users summary prefers the full loaded dataset over the current page rows", () => {
  const pageRows = [{ username: "page-only" }];
  const allRows = [{ username: "full-a" }, { username: "full-b" }];

  assert.deepEqual(
    selectUsersSummaryRows(pageRows, allRows).map((row) => row.username),
    ["full-a", "full-b"],
  );
});

test("Cluster heatmap view model exposes guided legend state", () => {
  const view = buildClusterHeatmapViewModel({
    rowColorFilter: "Finance",
    roleLegend: [{ role: "Finance" }, { role: "HR" }, { role: "Ops" }],
    isHeatmapCollapsed: false,
  });

  assert.deepEqual(view, {
    activeFilterLabel: "Finance",
    activeFilterTone: "focused",
    isExpanded: true,
    roleFamilyCount: 3,
    visibilityLabel: "Legend expanded",
    helperCopy: "Rows are users, columns are groups. Select a role family to focus the matrix.",
  });
});

test("Reports catalog stays within the configured limit and exposes audit rows", () => {
  const reports = buildReportsCatalog(
    {
      users: [
        {
          username: "mrossi",
          displayName: "Mario Rossi",
          accountType: "Internal",
          department: "Finance",
          businessRole: "Controller",
          groups: ["SAP_READ", "POWERBI_READ"],
          lastLogin: "2025-01-01T00:00:00Z",
          DataSource: "AD",
        },
        {
          username: "svc_payroll",
          displayName: "svc_payroll",
          accountType: "Service",
          department: "HR",
          businessRole: "Unassigned",
          groups: [],
          lastLogin: "2026-03-20T00:00:00Z",
          DataSource: "CSV",
        },
      ],
      businessRoles: {
        roles: [{ role: "Controller", count: 1, color: "#123456", groups: ["SAP_READ"] }],
        assignments: { mrossi: "Controller", svc_payroll: "Unassigned" },
      },
      mining: {
        ts: "2026-03-22T00:00:00Z",
        groups: ["SAP_READ", "POWERBI_READ"],
        matrix: {
          mrossi: ["SAP_READ", "POWERBI_READ"],
          svc_payroll: [],
        },
        clusters: [{ clusterId: 2, members: ["mrossi"] }],
        displayNames: { mrossi: "Mario Rossi", svc_payroll: "svc_payroll" },
      },
      aiDetection: {
        status: "ready",
        ts: "2026-03-22T00:00:00Z",
        stats: {
          aiDetection: 50,
          totalAnomalies: 1,
          totalAssignments: 2,
          usersWithAnomaly: 1,
          totalUsersScanned: 2,
        },
        items: [
          {
            username: "mrossi",
            displayName: "Mario Rossi",
            businessRole: "Controller",
            department: "Finance",
            accountType: "Internal",
            anomalyCount: 1,
            anomalies: [
              {
                group: "POWERBI_READ",
                confidence: 0.91,
                peerFreq: 0.05,
                deptFreq: 0.1,
                reasons: ["Peer: only 5% of 'Controller' have this"],
              },
            ],
          },
        ],
      },
      kpi: {
        totalUsers: 2,
        clusterQuality: 91,
        modelQuality: 88,
        staleAccountCount: 1,
        zeroGroupCount: 1,
        overprivilegedCount: 0,
      },
      clusterQuality: {
        summaryCards: [
          { label: "Duplicates", value: 3, tone: "risk", helper: "Duplicate usernames found" },
        ],
      },
      groupCounts: {
        counts: {
          SAP_READ: 1,
          POWERBI_READ: 1,
        },
      },
    },
    "2026-03-22T00:00:00Z",
  );

  assert.equal(reports.length, 11);
  assert.equal(reports.some((report) => report.id === "users_inventory"), true);
  assert.equal(reports.some((report) => report.id === "stale_users"), true);
  assert.equal(reports.some((report) => report.id === "overprivileged_users_with_roles"), true);

  const overprivileged = reports.find((report) => report.id === "overprivileged_users");
  assert.deepEqual(overprivileged.rows, [
    {
      displayName: "Mario Rossi",
      username: "mrossi",
      businessRole: "Controller",
      imputedBusinessRole: "Controller",
      department: "Finance",
      accountType: "Internal",
      anomalyCount: 1,
      anomalousGroups: "POWERBI_READ",
      topAnomaly: "POWERBI_READ",
      topConfidence: 0.91,
      topReasons: "Peer: only 5% of 'Controller' have this",
    },
  ]);

  const stale = reports.find((report) => report.id === "stale_users");
  assert.deepEqual(stale.rows.map((row) => row.username), ["mrossi"]);

  const clusterQuality = reports.find((report) => report.id === "cluster_quality_summary");
  assert.deepEqual(clusterQuality.rows, [
    {
      label: "Duplicates",
      value: 3,
      tone: "risk",
      helper: "Duplicate usernames found",
    },
  ]);
});

test("Audit PDF helper builds a visual summary document", () => {
  const model = buildAuditPdfModel({
    title: "Users Inventory",
    description: "Inventario completo utenti",
    audience: "Audit Core",
    filename: "report_users_inventory.csv",
    rows: Array.from({ length: 120 }, (_, index) => ({
      username: `user-${index}`,
      department: index % 2 === 0 ? "Finance" : "Engineering Backend",
      groupsCount: index,
    })),
  }, "2026-03-22T00:00:00Z");

  assert.deepEqual(model.highlights, [
    "Rows exported: 120",
    "Columns included: 3",
    "Audience: Audit Core",
  ]);

  const bytes = buildAuditPdfBytes(model);
  const text = new TextDecoder().decode(bytes);

  assert.equal(text.startsWith("%PDF-1.4"), true);
  assert.equal(text.includes("Users Inventory"), true);
  assert.equal(text.includes("/Count 7"), true);
  assert.equal(text.includes("user-119"), true);
  assert.equal(text.includes("..."), false);
});
