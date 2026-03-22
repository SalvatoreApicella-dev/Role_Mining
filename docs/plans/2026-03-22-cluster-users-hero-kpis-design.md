# Cluster and users hero KPI implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
implement this plan task-by-task.

**Goal:** Add a coherent hero section with three quick KPIs to the Cluster and
Users pages, while preserving existing flows and interactions.

**Architecture:** Introduce a pure helper for Users risk KPI snapshots and reuse
existing Cluster page metrics already present in the component state. Update the
layout in place so the pages gain a stronger visual hierarchy without changing
backend requests or operational actions.

**Tech Stack:** React, Vite, Node test runner, CSS

---

### Task 1: Add failing tests for Users risk KPI helper

**Files:**
- Create: `frontend/src/clusterUsersView.js`
- Modify: `frontend/src/tests/ai-visibility.test.mjs`

**Step 1: Write the failing test**

Add coverage for a helper that computes:
- stale users
- overprivileged users
- zero-group users

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because the helper does not exist yet.

**Step 3: Write minimal implementation**

Create the helper and keep thresholds explicit in one place.

**Step 4: Run test to verify it passes**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Add the Cluster hero and KPI summary

**Files:**
- Modify: `frontend/src/app.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Keep test coverage green**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

**Step 2: Write minimal implementation**

Add a summary hero above the existing Cluster toolbar and surface the current
Cluster KPIs in a cleaner header.

**Step 3: Run verification**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 3: Add the Users hero and KPI summary

**Files:**
- Modify: `frontend/src/app.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Write minimal implementation**

Use the helper to show a Users hero with three risk-focused KPIs and keep the
table and filters intact.

**Step 2: Run final verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds
