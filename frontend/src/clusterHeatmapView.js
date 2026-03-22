export function buildClusterHeatmapViewModel({
  rowColorFilter = "All",
  roleLegend = [],
  isHeatmapCollapsed = true,
} = {}) {
  const roles = Array.isArray(roleLegend) ? roleLegend : [];
  const activeFilterLabel = rowColorFilter === "All" ? "All role families" : rowColorFilter;

  return {
    activeFilterLabel,
    activeFilterTone: rowColorFilter === "All" ? "neutral" : "focused",
    isExpanded: !isHeatmapCollapsed,
    roleFamilyCount: roles.length,
    visibilityLabel: isHeatmapCollapsed ? "Legend compact" : "Legend expanded",
    helperCopy: isHeatmapCollapsed
      ? "Expand the guide to inspect role colors and filter the visible user rows."
      : "Rows are users, columns are groups. Select a role family to focus the matrix.",
  };
}
