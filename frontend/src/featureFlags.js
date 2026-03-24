// Central toggle for AI-related frontend surfaces.
// Set to true to restore the UI without reverting code paths.
export const AI_FEATURES_ENABLED = false;
export const ROLE_MODELING_ENABLED = false;
export const ANALYTICS_AUTOMATIC_DETECTION_ENABLED = true;

const ANALYTICS_KPI_ITEMS = [
  {
    label: "Cluster Quality",
    key: "cluster",
    target: 100,
    color: "#75adff",
    route: "/kpi/cluster-quality",
    helper: "Coerenza tra utenti e cluster proposti.",
  },
  {
    label: "Model Score",
    key: "model",
    target: 100,
    color: "#ff8ea7",
    route: "/model-quality",
    helper: "Precisione complessiva del modello.",
  },
  {
    label: "Automatic Detection",
    key: "ai",
    target: 0,
    color: "#7effc2",
    route: "/ai-detection",
    helper: "Capacita di rilevare anomalie e deviazioni.",
    analyticsAutomaticDetectionOnly: true,
  },
];

export function buildAnalyticsKpiItems({ clusterPct, modelPct, aiPct }) {
  const values = {
    cluster: clusterPct,
    model: modelPct,
    ai: aiPct,
  };

  return ANALYTICS_KPI_ITEMS
    .filter((item) => {
      if (item.analyticsAutomaticDetectionOnly) {
        return ANALYTICS_AUTOMATIC_DETECTION_ENABLED;
      }
      return AI_FEATURES_ENABLED || !item.aiOnly;
    })
    .map((item) => ({
      ...item,
      value: values[item.key],
    }));
}

export function getVisibleBusinessRoleSections() {
  return {
    showAiSuggestions: AI_FEATURES_ENABLED,
  };
}

export function getVisibleSystemPermissionKeys(keys) {
  return keys.filter((key) => AI_FEATURES_ENABLED || key !== "can_view_ai_training");
}

export function getAnalyticsFocusActions(primaryRoute) {
  const actions = [
    {
      label: "Apri analisi prioritaria",
      route: primaryRoute,
    },
  ];

  if (ROLE_MODELING_ENABLED) {
    actions.push({
      label: "Role Modeling",
      route: "/role-modeling",
    });
  }

  return actions;
}

export function isRoleModelingRouteEnabled() {
  return ROLE_MODELING_ENABLED;
}
