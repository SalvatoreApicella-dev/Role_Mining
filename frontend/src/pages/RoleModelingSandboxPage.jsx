import React, { useEffect, useMemo, useRef, useState } from "react";
import { api, exportRoleModelingXlsx } from "../api.js";
import {
  buildRoleModelingFinalStructure,
  buildRoleModelingReviewNarrative,
  buildRoleModelingSelectionSummary,
} from "../roleModelingUtils.js";

const DEFAULT_FORM = {
  max_suggestions: 24,
  min_group_support: 0.6,
  redundancy_threshold: 0.8,
  ml_weight: 0.35,
};

const FORM_LIMITS = {
  max_suggestions: { min: 8, max: 120, step: 1, fallback: DEFAULT_FORM.max_suggestions },
  min_group_support: { min: 0.3, max: 0.95, step: 0.05, fallback: DEFAULT_FORM.min_group_support },
  redundancy_threshold: { min: 0.5, max: 0.95, step: 0.05, fallback: DEFAULT_FORM.redundancy_threshold },
  ml_weight: { min: 0, max: 0.8, step: 0.05, fallback: DEFAULT_FORM.ml_weight },
};

function toPercent(v) {
  return `${Math.round(Number(v) || 0)}%`;
}

function toPercentOne(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0.0%";
  return `${n.toFixed(1)}%`;
}

function numberOr(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function deltaLabel(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10) / 10;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

function normalizeFormValue(key, value) {
  const cfg = FORM_LIMITS[key];
  if (!cfg) return value;
  const raw = Number(value);
  const base = Number.isFinite(raw) ? raw : cfg.fallback;
  const clamped = Math.max(cfg.min, Math.min(cfg.max, base));
  if (cfg.step === 1) return Math.round(clamped);
  return Number(clamped.toFixed(2));
}

function severityLabel(v) {
  const s = String(v || "").toLowerCase();
  if (s === "high") return "Alta";
  if (s === "medium") return "Media";
  return "Bassa";
}

function actionPriorityOrderForModel(modelId) {
  const id = String(modelId || "").toLowerCase();
  if (id.includes("aggressive") || id.includes("business-role")) {
    return ["role_merge", "role_retire", "group_merge", "assignment_update"];
  }
  if (id.includes("entitlement") || id.includes("federated")) {
    return ["group_merge", "role_merge", "assignment_update", "role_retire"];
  }
  if (id.includes("least-privilege") || id.includes("exception")) {
    return ["assignment_update", "role_retire", "group_merge", "role_merge"];
  }
  if (id.includes("sod") || id.includes("risk")) {
    return ["assignment_update", "group_merge", "role_retire", "role_merge"];
  }
  return ["role_merge", "role_retire", "assignment_update", "group_merge"];
}

function sortActionsByModel(actions, modelId) {
  const order = actionPriorityOrderForModel(modelId);
  const orderMap = new Map(order.map((t, i) => [t, i]));
  return [...(actions || [])].sort((a, b) => {
    const aType = String(a?.proposalType || "");
    const bType = String(b?.proposalType || "");
    const aRank = orderMap.has(aType) ? orderMap.get(aType) : order.length;
    const bRank = orderMap.has(bType) ? orderMap.get(bType) : order.length;
    if (aRank !== bRank) return aRank - bRank;
    const byPriority = Number(b?.priorityScore || 0) - Number(a?.priorityScore || 0);
    if (byPriority !== 0) return byPriority;
    return Number(b?.confidence || 0) - Number(a?.confidence || 0);
  });
}

export default function RoleModelingSandboxPage() {
  const [form, setForm] = useState(DEFAULT_FORM);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pendingApply, setPendingApply] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState(null);
  const [fallbackKpi, setFallbackKpi] = useState({});
  const [fallbackMining, setFallbackMining] = useState({});
  const [businessRolesSnapshot, setBusinessRolesSnapshot] = useState(null);
  const [appliedDiscoveryModelId, setAppliedDiscoveryModelId] = useState("");
  const [activeLane, setActiveLane] = useState("discovery");
  const [actionDecisions, setActionDecisions] = useState({});
  const [actionSubmitting, setActionSubmitting] = useState({});
  const [conflictTimeline, setConflictTimeline] = useState([]);
  const [applySubmitting, setApplySubmitting] = useState(false);
  const [applyMessage, setApplyMessage] = useState("");
  const [adoptionDisplayScore, setAdoptionDisplayScore] = useState(0);
  const [applyToast, setApplyToast] = useState(null);
  const hasMountedRef = useRef(false);
  const requestSeqRef = useRef(0);
  const completedWaveKeyRef = useRef("");

  async function run(options = {}) {
    const resetFlow = Boolean(options.resetFlow ?? true);
    const clearToast = Boolean(options.clearToast ?? false);
    const requestSeq = requestSeqRef.current + 1;
    requestSeqRef.current = requestSeq;
    setLoading(true);
    setErr("");
    try {
      const [res, rolesRes] = await Promise.all([
        api.roleModelingSandbox({
          max_suggestions: numberOr(form.max_suggestions, DEFAULT_FORM.max_suggestions),
          min_group_support: numberOr(form.min_group_support, DEFAULT_FORM.min_group_support),
          redundancy_threshold: numberOr(form.redundancy_threshold, DEFAULT_FORM.redundancy_threshold),
          ml_weight: numberOr(form.ml_weight, DEFAULT_FORM.ml_weight),
        }),
        api.businessRoles().catch(() => null),
      ]);
      if (requestSeq !== requestSeqRef.current) return;
      setResult(res || null);
      if (rolesRes && typeof rolesRes === "object") {
        setBusinessRolesSnapshot(rolesRes);
      }
      const hasUsers = numberOr(res?.summary?.users, 0) > 0;
      const hasCurrentScore = Number.isFinite(Number(res?.comparison?.current?.modelScore));
      if (!hasUsers || !hasCurrentScore) {
        Promise.allSettled([
          !hasCurrentScore ? api.kpi() : Promise.resolve(fallbackKpi || {}),
          !hasUsers ? api.roleMiningLast() : Promise.resolve(fallbackMining || {}),
        ]).then((results) => {
          if (requestSeq !== requestSeqRef.current) return;
          const [kpiResult, miningResult] = results;
          if (kpiResult?.status === "fulfilled") setFallbackKpi(kpiResult.value || {});
          if (miningResult?.status === "fulfilled") setFallbackMining(miningResult.value || {});
        });
      }
      if (resetFlow) {
        setAppliedDiscoveryModelId("");
        setActiveLane("discovery");
        setActionDecisions({});
        setActionSubmitting({});
        setConflictTimeline([]);
        setApplySubmitting(false);
        setApplyMessage("");
        completedWaveKeyRef.current = "";
        if (clearToast) setApplyToast(null);
      }
      setPendingApply(false);
    } catch (e) {
      if (requestSeq !== requestSeqRef.current) return;
      setErr(String(e.message || e));
      setPendingApply(false);
    } finally {
      if (requestSeq !== requestSeqRef.current) return;
      setLoading(false);
    }
  }

  async function feedback(item, accepted) {
    const itemId = String(item?.id || "");
    if (!itemId) return;
    if (actionDecisions[itemId] || actionSubmitting[itemId]) return;
    setActionSubmitting((prev) => ({ ...prev, [itemId]: true }));
    try {
      await api.roleModelingFeedback(item.id, item.proposalType, accepted);
    } catch {
      // best effort only
    } finally {
      setActionDecisions((prev) => ({ ...prev, [itemId]: accepted ? "accepted" : "rejected" }));
      setActionSubmitting((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  useEffect(() => {
    run();
  }, []);

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true;
      return undefined;
    }
    setPendingApply(true);
    const timer = setTimeout(() => {
      run();
    }, 500);
    return () => clearTimeout(timer);
  }, [form.max_suggestions, form.min_group_support, form.redundancy_threshold, form.ml_weight]);

  function updateFormValue(key, value) {
    setForm((prev) => ({ ...prev, [key]: normalizeFormValue(key, value) }));
  }

  const summary = result?.summary || {};
  const current = result?.comparison?.current || {};
  const proposed = result?.comparison?.proposed || {};
  const improvement = result?.comparison?.improvement || {};
  const freshness = result?.dataFreshness || {};
  const normalizedFallbackKpi = useMemo(
    () => ((fallbackKpi && typeof fallbackKpi?.kpi === "object") ? fallbackKpi.kpi : (fallbackKpi || {})),
    [fallbackKpi],
  );

  const allActions = useMemo(() => result?.proposals || [], [result]);
  const discoveryModels = useMemo(() => result?.discoveryModels || [], [result]);
  const discoveryCatalog = useMemo(() => result?.discoveryModelCatalog || [], [result]);
  const selectedDiscoveryModel = useMemo(
    () => discoveryModels.find((m) => (m?.id || m?.name) === appliedDiscoveryModelId) || null,
    [discoveryModels, appliedDiscoveryModelId],
  );
  const optimizationActions = useMemo(() => {
    if (!allActions.length) return [];
    if (!appliedDiscoveryModelId) return allActions.slice(0, 8);
    return sortActionsByModel(allActions, appliedDiscoveryModelId).slice(0, 8);
  }, [allActions, appliedDiscoveryModelId]);
  const optimizationActionIds = useMemo(
    () => optimizationActions.map((item) => String(item?.id || "")).filter(Boolean),
    [optimizationActions],
  );
  const reviewedCount = useMemo(
    () => optimizationActionIds.filter((id) => Boolean(actionDecisions[id])).length,
    [optimizationActionIds, actionDecisions],
  );
  const allActionsReviewed = optimizationActionIds.length > 0 && reviewedCount === optimizationActionIds.length;
  const executedActions = useMemo(
    () => optimizationActions.filter((item) => actionDecisions[String(item?.id || "")] === "accepted"),
    [optimizationActions, actionDecisions],
  );
  const rejectedActions = useMemo(
    () => optimizationActions.filter((item) => actionDecisions[String(item?.id || "")] === "rejected"),
    [optimizationActions, actionDecisions],
  );
  const reviewStats = useMemo(() => {
    const byType = {
      role_merge: 0,
      group_merge: 0,
      assignment_update: 0,
      role_retire: 0,
    };
    for (const action of executedActions) {
      const t = String(action?.proposalType || "");
      if (Object.prototype.hasOwnProperty.call(byType, t)) byType[t] += 1;
    }
    const startingRoles = Math.max(1, numberOr(selectedDiscoveryModel?.startingRoleCount, summary.businessRoles || 0));
    const minFeasibleRoles = startingRoles >= 6 ? 6 : 1;
    const remainingRoles = Math.max(minFeasibleRoles, startingRoles - byType.role_merge - byType.role_retire);
    const rawModelTargetRoles = numberOr(selectedDiscoveryModel?.projectedRoleCount, remainingRoles);
    // Guardrail: avoid showing unrealistic "1 role" targets on real catalogs.
    const safeModelTargetRoles = (startingRoles >= 10 && rawModelTargetRoles <= 1)
      ? remainingRoles
      : Math.max(minFeasibleRoles, rawModelTargetRoles);
    return {
      byType,
      startingRoles,
      remainingRoles,
      modelTargetRoles: safeModelTargetRoles,
      impactedUsers: executedActions.reduce((acc, item) => acc + numberOr(item?.affectedUsers, 0), 0),
    };
  }, [executedActions, selectedDiscoveryModel, summary.businessRoles]);
  const lmSelection = result?.lmSelection || {};
  const sodMatrix = useMemo(() => result?.sodMatrix || [], [result]);
  const workflow = useMemo(() => result?.workflow || [], [result]);
  const workflowDisplay = useMemo(
    () => (workflow || []).map((w) => {
      const title = String(w?.title || "").toLowerCase();
      if (title === "optimization") {
        if (!appliedDiscoveryModelId) {
          return {
            ...w,
            status: "pending",
            detail: "Seleziona un modello in Access Model Discovery per applicare la regola.",
          };
        }
        if (allActionsReviewed) {
          return {
            ...w,
            status: "done",
            detail: `Valutate ${reviewedCount}/${optimizationActionIds.length} azioni (${executedActions.length} eseguite).`,
          };
        }
        return {
          ...w,
          status: "in_progress",
          detail: `Valutate ${reviewedCount}/${optimizationActionIds.length || optimizationActions.length} azioni.`,
        };
      }
      if (title === "review") {
        if (!appliedDiscoveryModelId) {
          return {
            ...w,
            status: "pending",
            detail: "Review disponibile dopo la valutazione completa delle optimization.",
          };
        }
        if (activeLane === "adoption") {
          return {
            ...w,
            status: "done",
            detail: `Review completata: ${executedActions.length} azioni eseguite, ${rejectedActions.length} scartate.`,
          };
        }
        if (allActionsReviewed) {
          return {
            ...w,
            status: "in_progress",
            detail: `Review completa pronta: ${executedActions.length} azioni eseguite, ${rejectedActions.length} scartate.`,
          };
        }
      }
      if (title === "adoption") {
        if (activeLane === "adoption") {
          return {
            ...w,
            status: "in_progress",
            detail: "Conferma finale in corso: pronta applicazione al modello reale.",
          };
        }
      }
      return w;
    }),
    [workflow, appliedDiscoveryModelId, allActionsReviewed, reviewedCount, optimizationActionIds.length, optimizationActions.length, executedActions.length, rejectedActions.length, activeLane],
  );
  const trend = useMemo(() => result?.trend || [], [result]);
  const miningMatrixUsers = Object.keys(fallbackMining?.matrix || {}).length;
  const usersDisplay =
    Number(summary.users || 0) ||
    Number(normalizedFallbackKpi?.totalUsers || 0) ||
    Number(miningMatrixUsers || 0);
  const currentScoreDisplay =
    Number(current.modelScore || 0) ||
    Number(normalizedFallbackKpi?.modelQuality || 0);
  const executionScoreDisplay =
    Number(selectedDiscoveryModel?.estimatedModelScore || 0) ||
    Number(proposed.executionModelScore || 0) ||
    Number(proposed.modelScore || 0);
  const proposedScoreDisplay =
    Number(selectedDiscoveryModel?.estimatedModelScore || 0) ||
    Number(proposed.modelScore || 0) ||
    (executionScoreDisplay > 0 ? Math.min(100, executionScoreDisplay) : (currentScoreDisplay > 0 ? Math.min(100, currentScoreDisplay + 5) : 0));
  const improvementScoreDisplay =
    (proposedScoreDisplay > 0 && currentScoreDisplay > 0)
      ? Number((proposedScoreDisplay - currentScoreDisplay).toFixed(2))
      : (Number(improvement.modelScoreDelta || 0) || 0);
  const targetDeltaDisplay =
    currentScoreDisplay > 0
      ? Number((100 - currentScoreDisplay).toFixed(2))
      : (Number(improvement.targetModelScoreDelta || 0) || 0);

  const maxTrend = Math.max(1, ...trend.map((t) => Number(t.score) || 0));
  const extractTsLabel = freshness?.extractTs ? new Date(freshness.extractTs).toLocaleString() : "n/d";
  const sourceLabel = freshness?.extractSource ? String(freshness.extractSource).toUpperCase() : "N/D";
  const generatedAtLabel = result?.generatedAt ? new Date(result.generatedAt).toLocaleString() : "n/d";
  const appliedParams = result?.appliedParameters || {};
  const optimizationLaneTitle = selectedDiscoveryModel?.name || "Optimization Actions";
  const laneTitle = activeLane === "adoption"
    ? "Adoption"
    : activeLane === "review"
      ? "Review"
      : activeLane === "optimization"
        ? "Optimization"
        : "Access Model Discovery";
  const laneMeta = activeLane === "review"
    ? `${executedActions.length} eseguite • ${rejectedActions.length} scartate`
    : activeLane === "adoption"
      ? "Conferma finale e scrittura su modello reale"
    : activeLane === "optimization"
      ? `${reviewedCount}/${optimizationActionIds.length || optimizationActions.length} azioni valutate`
      : `${discoveryModels.length}/${discoveryCatalog.length || discoveryModels.length} modelli suggeriti`;
  const laneTrackClass = activeLane === "adoption"
    ? "is-adoption"
    : activeLane === "review"
      ? "is-review"
      : activeLane === "optimization"
        ? "is-optimization"
        : "";
  const conflictMetrics = useMemo(() => {
    const redundancyProblems = Math.max(
      0,
      numberOr(current.redundantRolePairs, 0) + numberOr(current.redundantGroupPairs, 0),
    );
    const orphanRoleProblems = Math.max(0, numberOr(summary.orphanBusinessRoles, 0));
    const overprivilegeProblems = Math.max(
      0,
      numberOr(normalizedFallbackKpi.overprivilegedUsers, numberOr(current.driftedUsers, 0)),
    );
    const sodProblems = Math.max(0, numberOr(sodMatrix.length, 0));
    const beforeTotal = redundancyProblems + orphanRoleProblems + overprivilegeProblems + sodProblems;

    const acceptedByType = reviewStats.byType || {};
    const acceptedTotal = executedActions.length;
    const reviewPool = Math.max(1, optimizationActionIds.length || acceptedTotal || 1);
    const coverageRatio = acceptedTotal / reviewPool;
    const structuralReduction = Math.min(
      0.68,
      numberOr(acceptedByType.role_merge, 0) * 0.038
      + numberOr(acceptedByType.group_merge, 0) * 0.042
      + numberOr(acceptedByType.assignment_update, 0) * 0.026
      + numberOr(acceptedByType.role_retire, 0) * 0.034
      + coverageRatio * 0.20,
    );

    const afterTotal = Math.max(0, Math.round(beforeTotal * (1 - structuralReduction)));
    const deltaUsers = Math.max(0, beforeTotal - afterTotal);
    const deltaPct = beforeTotal > 0 ? (deltaUsers / beforeTotal) * 100 : 0;

    return {
      beforeTotal,
      afterTotal,
      deltaUsers,
      deltaPct,
    };
  }, [current.redundantRolePairs, current.redundantGroupPairs, current.driftedUsers, summary.orphanBusinessRoles, normalizedFallbackKpi.overprivilegedUsers, sodMatrix.length, reviewStats, executedActions.length, optimizationActionIds.length]);

  useEffect(() => {
    if (!allActionsReviewed || !appliedDiscoveryModelId) return;
    const signature = `${appliedDiscoveryModelId}:${conflictMetrics.afterTotal}:${executedActions.length}:${rejectedActions.length}`;
    if (completedWaveKeyRef.current === signature) return;
    completedWaveKeyRef.current = signature;
    setConflictTimeline((prev) => [
      ...prev,
      {
        label: `Bonifica ${prev.length + 1}`,
        value: conflictMetrics.afterTotal,
      },
    ]);
  }, [allActionsReviewed, appliedDiscoveryModelId, conflictMetrics.afterTotal, executedActions.length, rejectedActions.length]);

  const conflictWave = useMemo(() => {
    const pointsData = [{ label: "Baseline", value: conflictMetrics.beforeTotal, kind: "baseline" }, ...conflictTimeline.map((p) => ({ ...p, kind: "checkpoint" }))];
    const lastCommittedValue = pointsData[pointsData.length - 1]?.value;
    if (!allActionsReviewed || lastCommittedValue !== conflictMetrics.afterTotal) {
      pointsData.push({
        label: allActionsReviewed ? `Bonifica ${conflictTimeline.length + 1}` : "Nuovo valore",
        value: conflictMetrics.afterTotal,
        kind: "current",
      });
    }

    const width = 520;
    const height = 150;
    const padX = 18;
    const padY = 16;
    const baselineY = height - padY;
    const maxValue = Math.max(1, ...pointsData.map((p) => numberOr(p.value, 0)));
    const step = pointsData.length > 1 ? (width - padX * 2) / (pointsData.length - 1) : 0;
    const points = pointsData.map((item, idx) => ({
      ...item,
      x: padX + idx * step,
      y: baselineY - (numberOr(item.value, 0) / maxValue) * (height - padY * 2),
    }));

    let linePath = "";
    if (points.length) {
      linePath = `M ${points[0].x} ${points[0].y}`;
      for (let i = 1; i < points.length; i += 1) {
        const prev = points[i - 1];
        const curr = points[i];
        const controlX = (prev.x + curr.x) / 2;
        linePath += ` Q ${controlX} ${prev.y} ${curr.x} ${curr.y}`;
      }
    }
    const areaPath = points.length
      ? `${linePath} L ${points[points.length - 1].x} ${baselineY} L ${points[0].x} ${baselineY} Z`
      : "";

    return {
      points,
      linePath,
      areaPath,
      maxValue,
      baselineTotal: conflictMetrics.beforeTotal,
      latestTotal: points.length ? numberOr(points[points.length - 1].value, 0) : conflictMetrics.afterTotal,
      deltaUsers: Math.max(0, conflictMetrics.beforeTotal - (points.length ? numberOr(points[points.length - 1].value, 0) : conflictMetrics.afterTotal)),
      deltaPct: conflictMetrics.beforeTotal > 0
        ? (Math.max(0, conflictMetrics.beforeTotal - (points.length ? numberOr(points[points.length - 1].value, 0) : conflictMetrics.afterTotal)) / conflictMetrics.beforeTotal) * 100
        : 0,
    };
  }, [conflictMetrics, conflictTimeline, allActionsReviewed]);

  const selectionSummary = useMemo(
    () => buildRoleModelingSelectionSummary({
      discoveryModels,
      selectedModel: selectedDiscoveryModel,
    }),
    [discoveryModels, selectedDiscoveryModel],
  );

  const reviewNarrative = useMemo(
    () => buildRoleModelingReviewNarrative({
      selectedModel: selectedDiscoveryModel,
      selectionSummary,
      reviewStats,
      conflictMetrics,
      executedActions,
      rejectedActions,
      current,
      proposed,
    }),
    [selectedDiscoveryModel, selectionSummary, reviewStats, conflictMetrics, executedActions, rejectedActions, current, proposed],
  );

  const proposedModelStructure = useMemo(
    () => buildRoleModelingFinalStructure(
      businessRolesSnapshot,
      executedActions,
    ),
    [businessRolesSnapshot, executedActions],
  );

  function applyDiscoveryModel(model) {
    const modelId = model?.id || model?.name;
    if (!modelId) return;
    setAppliedDiscoveryModelId(modelId);
    setActionDecisions({});
    setActionSubmitting({});
    setActiveLane("optimization");
  }

  useEffect(() => {
    if (activeLane !== "optimization") return undefined;
    if (!allActionsReviewed) return undefined;
    const timer = setTimeout(() => {
      setActiveLane("review");
    }, 420);
    return () => clearTimeout(timer);
  }, [activeLane, allActionsReviewed]);

  useEffect(() => {
    const start = Math.max(0, Math.min(100, Number(currentScoreDisplay) || 0));
    const target = Math.max(start, Math.min(100, Number(executionScoreDisplay || proposedScoreDisplay) || 0));
    if (activeLane !== "adoption") {
      setAdoptionDisplayScore(start);
      return;
    }
    setAdoptionDisplayScore(start);
    const t = setTimeout(() => setAdoptionDisplayScore(target), 90);
    return () => clearTimeout(t);
  }, [activeLane, currentScoreDisplay, executionScoreDisplay, proposedScoreDisplay]);

  async function applyBonificheToModel() {
    if (!executedActions.length || applySubmitting) return;
    setApplySubmitting(true);
    setApplyMessage("");
    try {
      const res = await api.roleModelingApply({
        actions: executedActions,
        applied_model_id: selectedDiscoveryModel?.id || appliedDiscoveryModelId || "",
        target_model_score: Number(executionScoreDisplay || proposedScoreDisplay || 0),
      });
      const impacted = numberOr(res?.impactedUsers, 0);
      const applied = res?.applied || {};
      const details = [
        `Role merge: ${numberOr(applied.role_merge, 0)}`,
        `Group merge: ${numberOr(applied.group_merge, 0)}`,
        `Assignment update: ${numberOr(applied.assignment_update, 0)}`,
        `Role retire: ${numberOr(applied.role_retire, 0)}`,
      ];
      setApplyMessage(`Bonifiche applicate con successo (${impacted} utenti impattati).`);
      setApplyToast({
        type: "success",
        title: "Bonifiche salvate",
        message: `Scrittura completata su modello reale (${impacted} utenti impattati).`,
        details,
      });
      await run({ resetFlow: false, clearToast: false });
    } catch (e) {
      const errorText = `Errore applicazione: ${String(e?.message || e)}`;
      setApplyMessage(errorText);
      setApplyToast({
        type: "error",
        title: "Applicazione fallita",
        message: errorText,
        details: [],
      });
    } finally {
      setApplySubmitting(false);
    }
  }

  async function handleDownloadProposedModelXlsx() {
    if (!proposedModelStructure.rows.length) return;
    const { blob, filename } = await exportRoleModelingXlsx({
      filename: `role_modeling_${String(selectedDiscoveryModel?.id || selectedDiscoveryModel?.name || "proposed_model").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}.xlsx`,
      sheet_name: selectedDiscoveryModel?.name || "Proposed Model",
      rows: proposedModelStructure.rows,
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="main role-modeling-modern">
      <section className="panel rm-hero">
        <div>
          <h2 style={{ margin: 0 }}>Role Modeling</h2>
          <p className="rm-subtitle">
            Nuovo modello suggerito dal tuo ambiente reale con priorita operative, controlli di rischio e roadmap di adozione.
          </p>
          <div className="rm-freshness">Dati ambiente: {extractTsLabel} • Fonte: {sourceLabel}</div>
          <div className="rm-freshness">Analisi generata: {generatedAtLabel}</div>
          <div className="rm-freshness">
            Parametri applicati: max {appliedParams.maxSuggestions ?? numberOr(form.max_suggestions, DEFAULT_FORM.max_suggestions)} •
            support {appliedParams.templateSupport ?? numberOr(form.min_group_support, DEFAULT_FORM.min_group_support)} •
            threshold {appliedParams.redundancyThreshold ?? numberOr(form.redundancy_threshold, DEFAULT_FORM.redundancy_threshold)} •
            ml {appliedParams.mlWeight ?? numberOr(form.ml_weight, DEFAULT_FORM.ml_weight)}
            {pendingApply ? " • aggiornamento in corso..." : ""}
          </div>
        </div>
        <div className="rm-hero-actions">
          <button className="primary" onClick={run} disabled={loading}>{loading ? "Aggiornamento..." : "Rigenera analisi"}</button>
        </div>
      </section>
      {applyToast ? (
        <div className={`rm-toast rm-toast--${applyToast.type}`} role="status" aria-live="polite">
          <button type="button" className="rm-toast-close" onClick={() => setApplyToast(null)} aria-label="Chiudi notifica">×</button>
          <div className="rm-toast-title">{applyToast.title}</div>
          <div className="rm-toast-message">{applyToast.message}</div>
          {Array.isArray(applyToast.details) && applyToast.details.length > 0 ? (
            <div className="rm-toast-details">
              {applyToast.details.map((d) => <span key={d}>{d}</span>)}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className="rm-controls-single">
        <button onClick={() => setShowAdvanced((v) => !v)}>{showAdvanced ? "Nascondi opzioni" : "Mostra opzioni"}</button>
      </section>

      {showAdvanced && (
        <section className="panel rm-advanced">
          <label>
            Numero suggerimenti
            <input type="number" min={8} max={120} step={1} value={form.max_suggestions} onChange={(e) => updateFormValue("max_suggestions", e.target.value)} />
          </label>
          <label>
            Conservativita
            <input type="range" min={0.5} max={0.95} step={0.05} value={form.redundancy_threshold} onChange={(e) => updateFormValue("redundancy_threshold", e.target.value)} />
            <small>{numberOr(form.redundancy_threshold, DEFAULT_FORM.redundancy_threshold).toFixed(2)}</small>
          </label>
          <label>
            Peso feedback ML
            <input type="range" min={0} max={0.8} step={0.05} value={form.ml_weight} onChange={(e) => updateFormValue("ml_weight", e.target.value)} />
            <small>{numberOr(form.ml_weight, DEFAULT_FORM.ml_weight).toFixed(2)}</small>
          </label>
          <label>
            Supporto template
            <input type="range" min={0.3} max={0.95} step={0.05} value={form.min_group_support} onChange={(e) => updateFormValue("min_group_support", e.target.value)} />
            <small>{numberOr(form.min_group_support, DEFAULT_FORM.min_group_support).toFixed(2)}</small>
          </label>
        </section>
      )}

      <section className="rm-kpis">
        <div className="panel rm-kpi-card"><span>Model Score attuale</span><strong>{toPercentOne(currentScoreDisplay)}</strong></div>
        <div className="panel rm-kpi-card"><span>Model Score proposto</span><strong>{selectedDiscoveryModel ? toPercentOne(proposedScoreDisplay) : "--"}</strong></div>
        <div className="panel rm-kpi-card">
          <span>Miglioramento atteso</span>
          <strong>{selectedDiscoveryModel ? `${deltaLabel(improvementScoreDisplay)}%` : "--"}</strong>
          <small>Delta verso target 100: {selectedDiscoveryModel ? `${deltaLabel(targetDeltaDisplay)}%` : "--"}</small>
        </div>
        <div className="panel rm-kpi-card"><span>Utenti analizzati</span><strong>{usersDisplay || 0}</strong></div>
      </section>

      <section className="panel rm-trend-horizontal-card">
        <div className="rm-section-head"><h3>Model Score Trend</h3><span>Current → Target</span></div>
        <div className="rm-trend-horizontal">
          {trend.map((p) => {
            const width = Math.max(6, Math.round(((Number(p.score) || 0) / maxTrend) * 100));
            return (
              <div key={`h-${p.label}`} className="rm-trend-horizontal-row">
                <div className="rm-trend-horizontal-label">{p.label}</div>
                <div className="rm-trend-horizontal-track">
                  <div className="rm-trend-horizontal-fill" style={{ width: `${width}%` }} />
                </div>
                <div className="rm-trend-horizontal-score">{toPercentOne(p.score)}</div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rm-grid-2">
        <div className="panel">
          <div className="rm-section-head">
            <h3>{laneTitle}</h3>
            <span>{laneMeta}</span>
          </div>
          {lmSelection?.datasetCount ? (
            <div className="rm-workflow-detail" style={{ marginBottom: 8 }}>
              Ranking LM calibrato su {lmSelection.datasetCount} dataset sintetici.
            </div>
          ) : null}
          <div className="rm-discovery-slider">
            <div className={`rm-discovery-track ${laneTrackClass}`}>
              <div className="rm-discovery-pane">
                <div className="rm-discovery-list">
                  {discoveryModels.map((m) => (
                    <article
                      key={m.id || m.name}
                      className={`rm-discovery-item ${appliedDiscoveryModelId === (m.id || m.name) ? "is-selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => applyDiscoveryModel(m)}
                      onKeyDown={(ev) => {
                        if (ev.key === "Enter" || ev.key === " ") {
                          ev.preventDefault();
                          applyDiscoveryModel(m);
                        }
                      }}
                    >
                      <div>
                        <div className="rm-discovery-title">{m.name}</div>
                        <div className="rm-discovery-meta">{m.strategy}</div>
                        <div className="rm-discovery-metrics">
                          <span>Ruoli: {numberOr(m.startingRoleCount, summary.businessRoles || 0)} → {numberOr(m.projectedRoleCount, 0)}</span>
                          <span>Riduzione: -{numberOr(m.roleReduction, Math.max(0, numberOr(m.startingRoleCount, summary.businessRoles || 0) - numberOr(m.projectedRoleCount, 0)))} ({toPercentOne(numberOr(m.roleReductionPct, 0))})</span>
                          <span>Merge: {numberOr(m.mergedRolePairs, 0)}</span>
                          <span>Ritiri: {numberOr(m.retiredRoles, 0)}</span>
                          <span>Consolidamenti: {numberOr(m.groupConsolidations, 0)}</span>
                          <span>Score stimato: {toPercentOne(m.estimatedModelScore)}</span>
                        </div>
                        <div className="rm-discovery-bars">
                          <div className="rm-discovery-bar">
                            <label>Maintainability</label>
                            <div><i style={{ width: `${Math.min(100, Math.max(0, Number(m.maintainabilityScore) || 0))}%` }} /></div>
                          </div>
                          <div className="rm-discovery-bar">
                            <label>Least Privilege</label>
                            <div><i style={{ width: `${Math.min(100, Math.max(0, Number(m.leastPrivilegeScore) || 0))}%` }} /></div>
                          </div>
                          <div className="rm-discovery-bar rm-discovery-bar--risk">
                            <label>SoD Risk</label>
                            <div><i style={{ width: `${Math.min(100, Math.max(0, Number(m.sodRiskIndex) || 0))}%` }} /></div>
                          </div>
                        </div>
                      </div>
                      <div className="rm-chip-row">
                        {(m.mergeExamples || []).slice(0, 2).map((g) => <span key={`m-${m.id}-${g}`} className="rm-chip">{g}</span>)}
                        {(m.retireExamples || []).slice(0, 2).map((g) => <span key={`r-${m.id}-${g}`} className="rm-chip rm-chip--warn">Retire {g}</span>)}
                        <span className="rm-chip rm-chip--action">Applica modello</span>
                      </div>
                    </article>
                  ))}
                  {!loading && discoveryModels.length === 0 && <div className="rm-empty">Nessun candidato disponibile su questo snapshot.</div>}
                </div>
              </div>

              <div className="rm-discovery-pane">
                <div className="rm-discovery-pane-head">
                  <div>
                    <div className="rm-discovery-title">{optimizationLaneTitle}</div>
                    <div className="rm-workflow-detail">
                      {appliedDiscoveryModelId ? "Regola applicata. Ottimizzazioni ordinate per priorita del modello." : "Seleziona un modello discovery."}
                    </div>
                  </div>
                  <button type="button" onClick={() => setActiveLane("discovery")}>Torna ai modelli</button>
                </div>
                <div className="rm-actions">
                  {optimizationActions.map((item) => (
                    <div key={`lane-${item.id}`} className="rm-action-item">
                      <div>
                        <div className="rm-action-title">{item.title}</div>
                        <div className="rm-workflow-detail">{item.rationale}</div>
                        <div className="rm-workflow-detail">Impatto: {item.affectedUsers || 0} utenti</div>
                      </div>
                      <div className="role-modeling-actions">
                        <button
                          className={`rm-feedback-btn ${actionDecisions[String(item?.id || "")] === "accepted" ? "is-accepted" : actionDecisions[String(item?.id || "")] ? "is-muted" : "is-idle"}`}
                          onClick={() => feedback(item, true)}
                          disabled={Boolean(actionDecisions[String(item?.id || "")]) || Boolean(actionSubmitting[String(item?.id || "")])}
                        >
                          {actionSubmitting[String(item?.id || "")] ? "..." : actionDecisions[String(item?.id || "")] === "accepted" ? "Eseguita" : "Utile"}
                        </button>
                        <button
                          className={`rm-feedback-btn ${actionDecisions[String(item?.id || "")] === "rejected" ? "is-rejected" : actionDecisions[String(item?.id || "")] ? "is-muted" : "is-idle"}`}
                          onClick={() => feedback(item, false)}
                          disabled={Boolean(actionDecisions[String(item?.id || "")]) || Boolean(actionSubmitting[String(item?.id || "")])}
                        >
                          {actionSubmitting[String(item?.id || "")] ? "..." : actionDecisions[String(item?.id || "")] === "rejected" ? "Scartata" : "Non utile"}
                        </button>
                      </div>
                    </div>
                  ))}
                  {!loading && optimizationActions.length === 0 && (
                    <div className="rm-empty">Nessuna optimization disponibile per il modello selezionato.</div>
                  )}
                  {!loading && optimizationActions.length > 0 && (
                    <div className="rm-workflow-detail">
                      Avanzamento valutazione: <strong>{reviewedCount}/{optimizationActions.length}</strong>
                    </div>
                  )}
                  {appliedDiscoveryModelId && (
                    <div className="rm-workflow-detail">
                      Regola attiva: <strong>{selectedDiscoveryModel?.name || appliedDiscoveryModelId}</strong>
                    </div>
                  )}
                  {!appliedDiscoveryModelId && !loading && (
                    <div className="rm-empty">Clicca un Access Model Discovery per applicare la regola.</div>
                  )}
                </div>
              </div>

              <div className="rm-discovery-pane">
                <div className="rm-discovery-pane-head">
                  <div>
                    <div className="rm-discovery-title">Review Completa</div>
                    <div className="rm-workflow-detail">
                      Modifiche applicate in sandbox, merge effettuati e ruoli residui.
                    </div>
                  </div>
                  <div className="row" style={{ gap: 8 }}>
                    <button
                      type="button"
                      className="primary"
                      onClick={handleDownloadProposedModelXlsx}
                      disabled={!proposedModelStructure.rows.length}
                    >
                      Scarica XLSX nuovo modello
                    </button>
                    <button type="button" onClick={() => setActiveLane("optimization")}>Torna a optimization</button>
                  </div>
                </div>

                <div className="panel" style={{ marginBottom: 16, background: "rgba(255,255,255,0.03)" }}>
                  <div className="rm-section-head" style={{ marginBottom: 10 }}>
                    <h3 style={{ margin: 0 }}>{reviewNarrative.title}</h3>
                    <span>Descrizione generata automaticamente</span>
                  </div>
                  <div className="rm-workflow-detail" style={{ marginBottom: 8 }}>
                    Qualità ranking: <strong>{selectionSummary.qualityLabel}</strong>
                    {selectionSummary.runnerUpName ? ` • Alternativa principale: ${selectionSummary.runnerUpName}` : ""}
                    {selectionSummary.scoreGap ? ` • Gap score: ${selectionSummary.scoreGap.toFixed(1)}` : ""}
                  </div>
                  {selectionSummary.caution ? (
                    <div className="rm-empty" style={{ marginBottom: 10 }}>
                      {selectionSummary.caution}
                    </div>
                  ) : null}
                  <p style={{ marginTop: 0, color: "var(--text)", lineHeight: 1.6 }}>
                    {reviewNarrative.description}
                  </p>
                  <div className="rm-toast-details">
                    {reviewNarrative.bullets.map((bullet) => (
                      <span key={bullet}>{bullet}</span>
                    ))}
                  </div>
                </div>

                <div className="rm-review-grid">
                  <div className="rm-review-kpi">
                    <span>Azioni eseguite</span>
                    <strong>{executedActions.length}</strong>
                  </div>
                  <div className="rm-review-kpi">
                    <span>Merge effettuati</span>
                    <strong>{reviewStats.byType.role_merge + reviewStats.byType.group_merge}</strong>
                  </div>
                  <div className="rm-review-kpi">
                    <span>Ruoli rimasti a sistema</span>
                    <strong>{reviewStats.remainingRoles}</strong>
                    <small>Target modello: {reviewStats.modelTargetRoles}</small>
                  </div>
                  <div className="rm-review-kpi">
                    <span>Utenti impattati</span>
                    <strong>{reviewStats.impactedUsers}</strong>
                  </div>
                </div>

                  <div className="rm-review-wave">
                  <div className="rm-review-wave-head">
                    <span>Conflict Wave</span>
                    <small>
                      Riduzione stimata: -{conflictWave.deltaUsers} conflitti ({toPercentOne(conflictWave.deltaPct)})
                    </small>
                  </div>
                  <div className="rm-conflict-wave-legend">
                    <span><i className="before" />Baseline</span>
                    <span><i className="after" />Nuovo valore</span>
                    <span><i className="impr" />Storico bonifiche</span>
                  </div>
                  <svg viewBox="0 0 520 150" className="rm-conflict-wave" role="img" aria-label="Conflict wave">
                    {conflictWave.areaPath ? <path d={conflictWave.areaPath} className="rm-conflict-wave-flow-area" /> : null}
                    {conflictWave.linePath ? <path d={conflictWave.linePath} className="rm-conflict-wave-flow-line" /> : null}
                    {conflictWave.points.map((p, idx) => (
                      <g key={`pt-${idx}`}>
                        <circle cx={p.x} cy={p.y} r={p.kind === "baseline" ? "3.4" : p.kind === "current" ? "3.8" : "3.1"} className={`rm-conflict-wave-dot ${p.kind}`}>
                          <title>{`${p.label}: ${p.value}`}</title>
                        </circle>
                        <text x={p.x} y={144} textAnchor={idx === 0 ? "start" : idx === conflictWave.points.length - 1 ? "end" : "middle"} className="rm-conflict-wave-xlabel">
                          {p.label}
                        </text>
                      </g>
                    ))}
                  </svg>
                  <div className="rm-conflict-wave-summary">
                    <span>Totale baseline: <b>{conflictWave.baselineTotal}</b></span>
                    <span>Ultimo valore: <b>{conflictWave.latestTotal}</b></span>
                    <span>Picco baseline: <b>{conflictWave.maxValue}</b></span>
                  </div>
                  <div className="rm-adoption-next">
                    <button type="button" className="primary" onClick={() => setActiveLane("adoption")}>
                      Next
                    </button>
                  </div>
                </div>

              </div>

              <div className="rm-discovery-pane">
                <div className="rm-discovery-pane-head">
                  <div>
                    <div className="rm-discovery-title">Adoption</div>
                    <div className="rm-workflow-detail">
                      Applica le bonifiche confermate al modello reale del sistema.
                    </div>
                  </div>
                  <button type="button" onClick={() => setActiveLane("review")}>Torna a review</button>
                </div>
                <div className="rm-adoption-stage">
                  <div className="rm-adoption-chart">
                    <div className="rm-adoption-plot">
                      <div className="rm-adoption-yaxis">
                        {[100, 75, 50, 25, 0].map((tick) => (
                          <div key={`tick-${tick}`} className="rm-adoption-yaxis-row">
                            <span>{tick}</span>
                            <i />
                          </div>
                        ))}
                      </div>
                      <div className="rm-adoption-column-track">
                        <div className="rm-adoption-column" style={{ height: `${Math.max(0, Math.min(100, adoptionDisplayScore))}%` }} />
                      </div>
                    </div>
                    <div className="rm-adoption-labels">
                      <span>Model score attuale</span>
                      <strong>{toPercentOne(adoptionDisplayScore)}</strong>
                    </div>
                    <div className="rm-adoption-target">
                      Da {toPercentOne(currentScoreDisplay)} a {toPercentOne(executionScoreDisplay || proposedScoreDisplay)}
                    </div>
                  </div>
                  <div className="rm-adoption-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={applyBonificheToModel}
                      disabled={applySubmitting || !executedActions.length}
                    >
                      {applySubmitting ? "Applicazione..." : "Applica al modello"}
                    </button>
                    {!executedActions.length && (
                      <small>Seleziona almeno una optimization utile per applicare.</small>
                    )}
                    {applyMessage ? <div className="rm-workflow-detail">{applyMessage}</div> : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="rm-section-head"><h3>Workflow</h3><span>Stato processo</span></div>
          <div className="rm-workflow-list">
            {workflowDisplay.map((w) => (
              <div key={w.title} className="rm-workflow-item">
                <div className={`rm-status-dot ${w.status}`} />
                <div>
                  <div className="rm-workflow-title">{w.title}</div>
                  <div className="rm-workflow-detail">{w.detail}</div>
                </div>
              </div>
            ))}
            {!loading && workflow.length === 0 && <div className="rm-empty">Workflow non disponibile per questo snapshot.</div>}
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="rm-section-head"><h3>SoD Matrix Alerts</h3><span>{sodMatrix.length} alert</span></div>
        <table className="table">
          <thead>
            <tr>
              <th>Conflitto</th>
              <th>Utenti</th>
              <th>Severita</th>
              <th>Azione</th>
            </tr>
          </thead>
          <tbody>
            {sodMatrix.map((s, idx) => (
              <tr key={`${s.groupA}-${s.groupB}-${idx}`}>
                <td>{s.groupA} × {s.groupB}</td>
                <td>{s.users}</td>
                <td><span className={`rm-pill ${String(s.severity).toLowerCase()}`}>{severityLabel(s.severity)}</span></td>
                <td>{s.recommendation}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!loading && sodMatrix.length === 0 && <div className="rm-empty">Nessun conflitto SoD rilevato.</div>}
      </section>

      {err && <div className="err panel">Errore: {err}</div>}
    </div>
  );
}
