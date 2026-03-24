# Users KPI click filters implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
implement this plan task-by-task.

**Goal:** Make the Users hero KPIs clickable so they apply a quick filter that
combines with the existing search and type filters.

**Architecture:** Extend the existing pure Users helper with composable risk
predicates and a selected quick-filter state. Use that state to filter the
already loaded page rows client-side, so the behavior remains fast, reversible,
and independent from backend contract changes.

**Tech Stack:** React, Vite, Node test runner

---

### Task 1: Add failing tests for composable Users quick filters

**Files:**
- Modify: `frontend/src/clusterUsersView.js`
- Modify: `frontend/src/tests/ai-visibility.test.mjs`

**Step 1: Write the failing test**

Add coverage for a helper that filters rows by:
- `stale`
- `overprivileged`
- `zero_groups`

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because the filter helper does not exist yet.

**Step 3: Write minimal implementation**

Add a pure helper that accepts rows, quick-filter key, and current date.

**Step 4: Run test to verify it passes**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Wire the quick filter into the Users page

**Files:**
- Modify: `frontend/src/app.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Keep test coverage green**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

**Step 2: Write minimal implementation**

Add:
- selected quick-filter state
- clickable KPI cards
- derived filtered rows for the table
- visible active-filter hint and reset action

Keep search and type filters active and combined with the clicked KPI filter.

**Step 3: Run final verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds
