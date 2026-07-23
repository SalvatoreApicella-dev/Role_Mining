function numberOr(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function pluralize(value, singular, plural = `${singular}s`) {
  return numberOr(value, 0) === 1 ? singular : plural;
}

function safeText(value, fallback = "") {
  const text = String(value ?? "").trim();
  return text || fallback;
}

function splitActionId(action) {
  const rawId = safeText(action?.id);
  const parts = rawId.split("::");
  return { rawId, parts };
}

function sortDiscoveryModels(discoveryModels) {
  return [...(discoveryModels || [])].sort((a, b) => {
    const scoreDelta = numberOr(b?.selectionScore, 0) - numberOr(a?.selectionScore, 0);
    if (scoreDelta !== 0) return scoreDelta;
    return numberOr(b?.estimatedModelScore, 0) - numberOr(a?.estimatedModelScore, 0);
  });
}

function normalizeRoleName(value) {
  const text = safeText(value);
  return text && text !== "Unassigned" ? text : "";
}

function normalizeGroupsList(groups) {
  return [...new Set((Array.isArray(groups) ? groups : [])
    .map((group) => safeText(group))
    .filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function parseRoleAction(action) {
  const { parts } = splitActionId(action);
  const proposalType = safeText(action?.proposalType);
  if (proposalType === "role_merge") {
    return {
      type: "role_merge",
      keepRole: normalizeRoleName(parts[1]),
      removeRole: normalizeRoleName(parts[2]),
    };
  }
  if (proposalType === "group_merge") {
    return {
      type: "group_merge",
      keepGroup: safeText(parts[1]),
      removeGroup: safeText(parts[2]),
    };
  }
  if (proposalType === "role_retire") {
    return {
      type: "role_retire",
      role: normalizeRoleName(action?.role || parts[1]),
      mergeTarget: normalizeRoleName(action?.mergeTarget),
    };
  }
  if (proposalType === "assignment_update") {
    return {
      type: "assignment_update",
    };
  }
  return { type: "" };
}

export function buildRoleModelingFinalStructure(businessRolesOrOptions, executedActionsParam) {
  let businessRoles = businessRolesOrOptions;
  let executedActions = executedActionsParam;

  if (
    businessRolesOrOptions &&
    typeof businessRolesOrOptions === "object" &&
    !Array.isArray(businessRolesOrOptions) &&
    executedActionsParam === undefined &&
    ("businessRoles" in businessRolesOrOptions || "executedActions" in businessRolesOrOptions)
  ) {
    businessRoles = businessRolesOrOptions.businessRoles;
    executedActions = businessRolesOrOptions.executedActions;
  }

  const roleMeta = new Map();
  const removedRoles = new Map();

  const rolesList = Array.isArray(businessRoles?.roles)
    ? businessRoles.roles
    : (Array.isArray(businessRoles?.businessRoles?.roles) ? businessRoles.businessRoles.roles : []);

  for (const item of rolesList) {
    const roleName = normalizeRoleName(item?.role);
    if (!roleName) continue;
    roleMeta.set(roleName, {
      role: roleName,
      groups: normalizeGroupsList(item?.groups),
    });
  }

  const orderedActions = Array.isArray(executedActions) ? executedActions : [];

  for (const action of orderedActions) {
    const parsed = parseRoleAction(action);
    if (parsed.type === "role_merge") {
      const keep = parsed.keepRole;
      const remove = parsed.removeRole;
      if (!keep || !remove || keep === remove) continue;
      const keepEntry = roleMeta.get(keep) || { role: keep, groups: [] };
      const removeEntry = roleMeta.get(remove) || { role: remove, groups: [] };
      const mergedGroups = normalizeGroupsList([...(keepEntry.groups || []), ...(removeEntry.groups || [])]);
      roleMeta.set(keep, { role: keep, groups: mergedGroups });
      if (roleMeta.has(remove)) {
        removedRoles.set(remove, {
          role: remove,
          groups: normalizeGroupsList(removeEntry.groups),
          reason: `Merged into ${keep}`,
        });
        roleMeta.delete(remove);
      }
      continue;
    }

    if (parsed.type === "group_merge") {
      const keepGroup = safeText(parsed.keepGroup);
      const removeGroup = safeText(parsed.removeGroup);
      if (!keepGroup || !removeGroup || keepGroup === removeGroup) continue;

      for (const [roleName, entry] of roleMeta.entries()) {
        if ((entry.groups || []).includes(removeGroup)) {
          // Record the removal of the old group for this active role
          const removedEntry = removedRoles.get(roleName) || { role: roleName, groups: [], reasons: [] };
          removedEntry.groups = normalizeGroupsList([...(removedEntry.groups || []), removeGroup]);
          removedEntry.reason = removedEntry.reason 
            ? `${removedEntry.reason}, Group ${removeGroup} merged into ${keepGroup}`
            : `Group ${removeGroup} merged into ${keepGroup}`;
          removedRoles.set(roleName, removedEntry);

          // Replace the group in the active role
          const replaced = (entry.groups || []).map((group) => (group === removeGroup ? keepGroup : group));
          roleMeta.set(roleName, {
            role: roleName,
            groups: normalizeGroupsList(replaced),
          });
        }
      }
      continue;
    }

    if (parsed.type === "role_retire") {
      const roleName = parsed.role;
      if (!roleName) continue;
      const entry = roleMeta.get(roleName);
      if (!entry) continue;
      const mergedGroups = normalizeGroupsList(entry.groups);
      if (parsed.mergeTarget) {
        const targetEntry = roleMeta.get(parsed.mergeTarget) || { role: parsed.mergeTarget, groups: [] };
        roleMeta.set(parsed.mergeTarget, {
          role: parsed.mergeTarget,
          groups: normalizeGroupsList([...(targetEntry.groups || []), ...mergedGroups]),
        });
      }
      removedRoles.set(roleName, {
        role: roleName,
        groups: mergedGroups,
        reason: parsed.mergeTarget ? `Retired into ${parsed.mergeTarget}` : "Retired",
      });
      roleMeta.delete(roleName);
    }
  }

  const activeRows = [...roleMeta.values()]
    .sort((a, b) => a.role.localeCompare(b.role))
    .flatMap((entry) => {
      const groups = entry.groups && entry.groups.length ? entry.groups : [""];
      return groups.map((group) => ({
        business_role: entry.role,
        role: group,
        status: "active",
        highlight: "",
        note: "",
      }));
    });

  const removedRows = [...removedRoles.values()]
    .sort((a, b) => a.role.localeCompare(b.role))
    .flatMap((entry) => {
      const groups = entry.groups && entry.groups.length ? entry.groups : [""];
      return groups.map((group) => ({
        business_role: entry.role,
        role: group,
        status: "removed",
        highlight: "red",
        note: entry.reason || "Removed",
      }));
    });

  return {
    rows: [...activeRows, ...removedRows],
    removedRoles: [...removedRoles.keys()].sort((a, b) => a.localeCompare(b)),
    activeRoles: [...roleMeta.keys()].sort((a, b) => a.localeCompare(b)),
  };
}

export function buildRoleModelingSelectionSummary({ discoveryModels, selectedModel }) {
  const orderedModels = sortDiscoveryModels(discoveryModels);
  const fallbackSelected = orderedModels[0] || null;
  const chosen = selectedModel || fallbackSelected;
  const runnerUp = orderedModels.find((model) => (model?.id || model?.name) !== (chosen?.id || chosen?.name)) || null;
  const selectedName = safeText(chosen?.name, "Target Model");
  const runnerUpName = safeText(runnerUp?.name, "");
  const scoreGap = numberOr(chosen?.selectionScore, 0) - numberOr(runnerUp?.selectionScore, 0);
  const modelGap = numberOr(chosen?.estimatedModelScore, 0) - numberOr(runnerUp?.estimatedModelScore, 0);
  const riskGap = numberOr(runnerUp?.sodRiskIndex, 0) - numberOr(chosen?.sodRiskIndex, 0);
  const coverageGap = numberOr(chosen?.roleCoverage, 0) - numberOr(runnerUp?.roleCoverage, 0);
  const historicalWinRate = numberOr(chosen?.historicalWinRate, 0) * 100;

  const factors = [];
  if (modelGap >= 1) factors.push(`score stimato +${modelGap.toFixed(1)}`);
  if (riskGap >= 1) factors.push(`rischio SoD -${riskGap.toFixed(1)}`);
  if (coverageGap >= 1) factors.push(`copertura +${coverageGap.toFixed(1)}`);
  if (!factors.length && scoreGap > 0) factors.push(`vantaggio ranking +${scoreGap.toFixed(1)}`);

  const qualityLabel = scoreGap >= 6 && historicalWinRate >= 45
    ? "Alta"
    : scoreGap >= 3 || historicalWinRate >= 25
      ? "Media"
      : "Bassa";

  const caution = scoreGap < 3
    ? "I primi modelli sono molto vicini, quindi la scelta è meno robusta."
    : historicalWinRate < 20
      ? "Il ranking ha ancora pochi segnali storici sul modello scelto."
      : chosen?.sodRiskIndex > 65
        ? "Il modello scelto è forte sul consolidamento, ma va tenuto d'occhio il rischio operativo."
        : "";

  const rationale = runnerUpName
    ? `Ho scelto ${selectedName} perché è il miglior compromesso complessivo rispetto a ${runnerUpName}: ${factors.join(", ")}.`
    : `Ho scelto ${selectedName} perché è il miglior compromesso complessivo tra beneficio atteso e rischio operativo.`;

  return {
    selectedName,
    runnerUpName,
    scoreGap: Number(scoreGap.toFixed(1)),
    modelGap: Number(modelGap.toFixed(1)),
    riskGap: Number(riskGap.toFixed(1)),
    coverageGap: Number(coverageGap.toFixed(1)),
    historicalWinRate: Number(historicalWinRate.toFixed(1)),
    qualityLabel,
    rationale,
    caution,
  };
}

export function buildRoleModelingReviewNarrative({
  selectedModel,
  selectionSummary,
  reviewStats,
  conflictMetrics,
  executedActions,
  rejectedActions,
  current,
  proposed,
}) {
  const modelName = safeText(selectedModel?.name, "Target Model");
  const byType = reviewStats?.byType || {};
  const roleMergeCount = numberOr(byType.role_merge, 0);
  const groupMergeCount = numberOr(byType.group_merge, 0);
  const assignmentCount = numberOr(byType.assignment_update, 0);
  const retireCount = numberOr(byType.role_retire, 0);
  const currentScore = numberOr(current?.modelScore, 0);
  const proposedScore = numberOr(selectedModel?.estimatedModelScore, numberOr(proposed?.modelScore || proposed?.executionModelScore, currentScore));
  const beforeConflicts = numberOr(conflictMetrics?.beforeTotal, 0);
  const afterConflicts = numberOr(conflictMetrics?.afterTotal, beforeConflicts);
  const impactedUsers = numberOr(reviewStats?.impactedUsers, 0);
  const acceptedCount = Array.isArray(executedActions) ? executedActions.length : 0;
  const rejectedCount = Array.isArray(rejectedActions) ? rejectedActions.length : 0;
  const topActions = (Array.isArray(executedActions) ? executedActions : [])
    .slice(0, 3)
    .map((action) => safeText(action?.title))
    .filter(Boolean);
  const selectionLine = safeText(selectionSummary?.rationale);
  const cautionLine = safeText(selectionSummary?.caution);

  const description = [
    selectionLine || `Il modello "${modelName}" è stato selezionato per il miglior compromesso tra beneficio atteso e rischio operativo.`,
    `Riduce i conflitti da ${beforeConflicts} a ${afterConflicts} e porta il Model Score da ${currentScore.toFixed(1)}% a ${proposedScore.toFixed(1)}%, coinvolgendo ${impactedUsers} utenti.`,
  ].join(" ");

  const bullets = [
    `Azioni confermate: ${acceptedCount}, scartate: ${rejectedCount}.`,
    `Perché questo modello: ${safeText(selectionSummary?.qualityLabel, "Media")} confidenza${selectionSummary?.scoreGap ? `, gap ranking ${selectionSummary.scoreGap.toFixed(1)}` : ""}.`,
    cautionLine || `Mix operativo: ${roleMergeCount} merge ruoli, ${groupMergeCount} merge gruppi, ${assignmentCount} assegnazioni normalizzate, ${retireCount} ${pluralize(retireCount, "ritiro", "ritiri")}.`,
    topActions.length ? `Prime operazioni: ${topActions.join(" • ")}` : "Prime operazioni: nessuna azione confermata.",
  ];

  return {
    title: `Review: ${modelName}`,
    description,
    bullets,
  };
}

export function buildRoleModelingProposedModelCsv({
  businessRoles,
  selectedModel,
  executedActions,
}) {
  const modelName = safeText(selectedModel?.name, "Target Model");
  const modelId = safeText(selectedModel?.id, modelName).toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const finalStructure = buildRoleModelingFinalStructure(businessRoles, executedActions);
  const headers = ["business_role", "ruolo", "stato", "highlight", "note"];

  return {
    filename: `role_modeling_${modelId || "proposed_model"}.csv`,
    headers,
    rows: finalStructure.rows.map((row) => [
      row.business_role,
      row.role,
      row.status,
      row.highlight,
      row.note,
    ]),
  };
}
