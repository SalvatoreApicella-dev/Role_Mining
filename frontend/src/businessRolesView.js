export function buildBusinessRolesViewModel(roles, searchRole) {
  const list = Array.isArray(roles) ? roles : [];
  const query = String(searchRole || "").trim().toLowerCase();

  const filteredRoles = list.filter((item) =>
    String(item?.role || "").toLowerCase().includes(query),
  );

  const totalRoles = list.length;
  const totalAssignments = list.reduce(
    (sum, item) => sum + (Number(item?.count) || 0),
    0,
  );
  const avgGroupsPerRole = totalRoles
    ? (
        list.reduce(
          (sum, item) => sum + (Array.isArray(item?.groups) ? item.groups.length : 0),
          0,
        ) / totalRoles
      ).toFixed(1)
    : "0.0";

  return {
    filteredRoles,
    summary: {
      totalRoles,
      totalAssignments,
      avgGroupsPerRole,
    },
  };
}
