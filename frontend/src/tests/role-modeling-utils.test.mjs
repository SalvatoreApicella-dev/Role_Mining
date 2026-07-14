import test from "node:test";
import assert from "node:assert/strict";

import {
  buildRoleModelingFinalStructure,
  buildRoleModelingReviewNarrative,
  buildRoleModelingSelectionSummary,
} from "../roleModelingUtils.js";

test("role modeling review narrative explains the proposed operation clearly", () => {
  const selectionSummary = buildRoleModelingSelectionSummary({
    discoveryModels: [
      {
        id: "balanced-governance",
        name: "Balanced Governance",
        selectionScore: 86.8,
        estimatedModelScore: 81.9,
        sodRiskIndex: 34,
        roleCoverage: 72.5,
        historicalWinRate: 0.52,
      },
      {
        id: "sod-first",
        name: "SoD First Hardening",
        selectionScore: 80.1,
        estimatedModelScore: 78.0,
        sodRiskIndex: 28,
        roleCoverage: 69.1,
        historicalWinRate: 0.28,
      },
    ],
    selectedModel: {
      id: "balanced-governance",
      name: "Balanced Governance",
      selectionScore: 86.8,
      estimatedModelScore: 81.9,
      sodRiskIndex: 34,
      roleCoverage: 72.5,
      historicalWinRate: 0.52,
    },
  });

  assert.equal(selectionSummary.qualityLabel, "Alta");
  assert.match(selectionSummary.rationale, /Balanced Governance/);
  assert.match(selectionSummary.rationale, /miglior compromesso/i);

  const review = buildRoleModelingReviewNarrative({
    selectedModel: {
      name: "Balanced Governance",
      strategy: "Bilancia standardizzazione e continuita operativa.",
    },
    selectionSummary,
    reviewStats: {
      byType: {
        role_merge: 2,
        group_merge: 1,
        assignment_update: 3,
        role_retire: 1,
      },
      startingRoles: 14,
      remainingRoles: 11,
      impactedUsers: 7,
    },
    conflictMetrics: {
      beforeTotal: 24,
      afterTotal: 14,
    },
    executedActions: [
      { title: "Merge Finance AP + Finance AR" },
      { title: "Normalizza assegnazione utente mrossi" },
    ],
    rejectedActions: [
      { title: "Ritira ruolo legacy" },
    ],
    current: {
      modelScore: 72.4,
    },
    proposed: {
      modelScore: 81.9,
    },
  });

  assert.equal(review.title, "Review: Balanced Governance");
  assert.match(review.description, /miglior compromesso/i);
  assert.match(review.description, /SoD First Hardening/);
  assert.match(review.description, /24/);
  assert.match(review.description, /14/);
  assert.deepEqual(review.bullets, [
    "Azioni confermate: 2, scartate: 1.",
    "Perché questo modello: Alta confidenza, gap ranking 6.7.",
    "Mix operativo: 2 merge ruoli, 1 merge gruppi, 3 assegnazioni normalizzate, 1 ritiro.",
    "Prime operazioni: Merge Finance AP + Finance AR • Normalizza assegnazione utente mrossi",
  ]);
});

test("role modeling final structure reflects the post-model business roles", () => {
  const structure = buildRoleModelingFinalStructure({
    businessRoles: {
      roles: [
        { role: "Finance AP", groups: ["SAP_AP", "BANK_AP"] },
        { role: "Finance AR", groups: ["SAP_AR"] },
        { role: "Legacy", groups: ["LEGACY_X"] },
        { role: "Controller", groups: ["POWERBI_READ"] },
      ],
      assignments: {},
    },
    selectedModel: {
      id: "balanced-governance",
      name: "Balanced Governance",
      strategy: "Bilancia standardizzazione e continuita operativa.",
      selectionScore: 84.2,
    },
    executedActions: [
      {
        id: "role-merge::Finance AP::Finance AR",
        title: "Merge Finance AP + Finance AR",
        proposalType: "role_merge",
      },
      {
        id: "role-retire::Legacy",
        title: "Ritira ruolo Legacy",
        proposalType: "role_retire",
      },
      {
        id: "group-merge::SAP_AP::SAP_AR",
        title: "Consolida gruppi SAP_AP / SAP_AR",
        proposalType: "group_merge",
      },
    ],
  });

  assert.deepEqual(structure.activeRoles, ["Controller", "Finance AP"]);
  assert.deepEqual(structure.removedRoles, ["Finance AP", "Finance AR", "Legacy"]);
  assert.equal(structure.rows.length, 6);
  assert.deepEqual(structure.rows[0], { business_role: "Controller", role: "POWERBI_READ", status: "active", highlight: "", note: "" });
  assert.deepEqual(structure.rows[1], { business_role: "Finance AP", role: "BANK_AP", status: "active", highlight: "", note: "" });
  assert.deepEqual(structure.rows[2], { business_role: "Finance AP", role: "SAP_AP", status: "active", highlight: "", note: "" });
  assert.deepEqual(structure.rows[3], { business_role: "Finance AP", role: "SAP_AR", status: "removed", highlight: "red", note: "Group SAP_AR merged into SAP_AP" });
  assert.deepEqual(structure.rows[4], { business_role: "Finance AR", role: "SAP_AR", status: "removed", highlight: "red", note: "Merged into Finance AP" });
  assert.deepEqual(structure.rows[5], { business_role: "Legacy", role: "LEGACY_X", status: "removed", highlight: "red", note: "Retired" });
});
