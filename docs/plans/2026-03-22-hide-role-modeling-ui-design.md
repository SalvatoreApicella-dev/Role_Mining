# Hide Role Modeling UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide all Role Modeling frontend surfaces behind a single reversible flag without removing the underlying code or backend endpoints.

**Architecture:** Extend the existing frontend feature-flag layer with a dedicated Role Modeling toggle. Derive route exposure, analytics entrypoints, and page reachability from that flag so the sandbox page is not rendered and does not issue API calls when disabled.

**Tech Stack:** React, Vite, Node test runner

---

### Task 1: Add failing test for Role Modeling visibility

**Files:**
- Modify: `frontend/src/tests/ai-visibility.test.mjs`
- Modify: `frontend/src/featureFlags.js`

**Step 1: Write the failing test**

Add coverage asserting:
- Role Modeling flag is disabled
- analytics focus actions do not expose Role Modeling
- role modeling route visibility helper returns false

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because Role Modeling helpers/flag are not implemented yet.

**Step 3: Write minimal implementation**

Add pure helpers in `frontend/src/featureFlags.js` for role-modeling visibility.

**Step 4: Run test to verify it passes**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Hide Role Modeling entrypoints and route

**Files:**
- Modify: `frontend/src/app.jsx`

**Step 1: Extend the failing test if needed**

Keep coverage centered on the pure visibility helpers used by the page.

**Step 2: Run test to verify it fails**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL until UI derives from the new flag.

**Step 3: Write minimal implementation**

Gate:
- analytics "Role Modeling" CTA
- `/role-modeling` route rendering
- any fallback navigation paths that might expose the page

Ensure disabled state prevents the sandbox page from mounting.

**Step 4: Run test to verify it passes**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 3: Verify source-only change

**Files:**
- Modify: `frontend/src/app.jsx`

**Step 1: Run final verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds

**Step 2: Keep diff focused**

Do not include backend runtime state, venvs, or generated logs in the intentional change set.
