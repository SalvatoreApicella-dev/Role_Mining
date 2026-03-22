const OVERPRIVILEGED_GROUP_THRESHOLD = 8;
const STALE_DAYS_THRESHOLD = 90;

function isStaleUser(row, nowMs) {
  const lastLoginMs = row?.lastLogin ? new Date(row.lastLogin).getTime() : NaN;
  const staleCutoffMs = STALE_DAYS_THRESHOLD * 24 * 60 * 60 * 1000;
  return Number.isFinite(lastLoginMs) && nowMs - lastLoginMs > staleCutoffMs;
}

function isZeroGroupsUser(row) {
  const groups = Array.isArray(row?.groups) ? row.groups : [];
  return groups.length === 0;
}

function isOverprivilegedUser(row) {
  const groups = Array.isArray(row?.groups) ? row.groups : [];
  return groups.length > OVERPRIVILEGED_GROUP_THRESHOLD;
}

export function buildUsersRiskSummary(rows, nowIso = new Date().toISOString()) {
  const list = Array.isArray(rows) ? rows : [];
  const nowMs = new Date(nowIso).getTime();

  return list.reduce(
    (acc, row) => {
      if (isStaleUser(row, nowMs)) {
        acc.staleUsers += 1;
      }
      if (isZeroGroupsUser(row)) {
        acc.zeroGroupsUsers += 1;
      }
      if (isOverprivilegedUser(row)) {
        acc.overprivilegedUsers += 1;
      }
      return acc;
    },
    {
      staleUsers: 0,
      overprivilegedUsers: 0,
      zeroGroupsUsers: 0,
    },
  );
}

export function filterUsersByQuickRisk(rows, quickRisk, nowIso = new Date().toISOString()) {
  const list = Array.isArray(rows) ? rows : [];
  const nowMs = new Date(nowIso).getTime();

  if (!quickRisk) return list;

  return list.filter((row) => {
    if (quickRisk === "stale") return isStaleUser(row, nowMs);
    if (quickRisk === "zero_groups") return isZeroGroupsUser(row);
    if (quickRisk === "overprivileged") return isOverprivilegedUser(row);
    return true;
  });
}

export function selectUsersSummaryRows(pageRows, allRows) {
  const fullList = Array.isArray(allRows) ? allRows : [];
  if (fullList.length) return fullList;
  return Array.isArray(pageRows) ? pageRows : [];
}
