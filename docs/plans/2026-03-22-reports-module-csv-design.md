# Reports module CSV implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
implement this plan task-by-task.

**Goal:** Add a new `Reports` module as an extra navigation entry, without
removing `Advanced Analytics` or `Logs`, and provide up to ten preconfigured
CSV-ready audit reports.

**Architecture:** Build a pure frontend report catalog helper that derives
report payloads from existing API responses (`users`, `businessRoles`,
`roleMiningLast`, `kpi`, `kpiDrilldown`, `groupCounts`). Render a dedicated
Reports page that loads the datasets once, surfaces the catalog, and triggers
CSV downloads client-side.

**Tech Stack:** React, Vite, Node test runner, CSS

---

### Task 1: Add failing tests for the report catalog helper

**Files:**
- Create: `frontend/src/reportsCatalog.js`
- Modify: `frontend/src/tests/ai-visibility.test.mjs`

**Step 1: Write the failing test**

Cover:
- catalog size is capped at ten reports
- user inventory and stale user reports produce rows
- cluster quality summary report exposes audit-friendly fields

**Step 2: Run test to verify failure**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because the helper does not exist yet.

**Step 3: Implement the minimal helper**

Keep the helper pure and independent from React.

**Step 4: Re-run tests**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Add the Reports page and navigation

**Files:**
- Create: `frontend/src/pages/ReportsPage.jsx`
- Modify: `frontend/src/app.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Implement page data loading**

Load the existing datasets once and build the report catalog client-side.

**Step 2: Render the report hub**

Add:
- page hero
- report cards
- row counts
- CSV download actions
- disabled PDF placeholder action

**Step 3: Wire route and sidebar**

Add a `Reports` nav entry and `/reports` route without changing existing
`Advanced Analytics` or `Logs`.

### Task 3: Verify end-to-end

**Files:**
- None beyond above

**Step 1: Run verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds
