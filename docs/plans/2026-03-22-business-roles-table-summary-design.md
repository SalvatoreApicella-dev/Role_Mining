# Business roles table summary implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
implement this plan task-by-task.

**Goal:** Refresh the Business Roles home page with a stronger summary header,
a clearer action toolbar, and a more legible premium table without changing
existing workflows.

**Architecture:** Keep the existing page structure and API calls, but introduce
a small pure helper for summary metrics and filtered role data. Use that data to
render a richer header and a more polished table layout in the current page.

**Tech Stack:** React, Vite, Node test runner, CSS

---

### Task 1: Add failing tests for business role summary helpers

**Files:**
- Create: `frontend/src/businessRolesView.js`
- Modify: `frontend/src/tests/ai-visibility.test.mjs`

**Step 1: Write the failing test**

Add tests for a helper that computes:
- total roles
- total assigned users
- average groups per role
- filtered role list based on the search query

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Create the pure helper module with summary and filtering logic.

**Step 4: Run test to verify it passes**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Restyle the Business Roles home page

**Files:**
- Modify: `frontend/src/app.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Keep test coverage green**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS before layout changes.

**Step 2: Write minimal implementation**

Add:
- summary hero with KPI chips
- better grouped toolbar for search, create, recalc, and import
- upgraded table shell with better headers, counts, and empty state

Keep navigation, create, recalc, and import behavior unchanged.

**Step 3: Run verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds
