# Hide AI UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Hide all AI-related frontend entry points and embedded UI sections behind a single reversible flag without removing the underlying code.

**Architecture:** Introduce a centralized frontend feature flag and derive visible navigation, KPI cards, ranking widgets, and embedded role-detail sections from that flag. Keep backend routes and business logic untouched so Docker/runtime behavior stays stable and restoration is a one-line toggle.

**Tech Stack:** React, Vite, Vitest, Testing Library

---

### Task 1: Add failing tests for AI-hidden UI behavior

**Files:**
- Create: `frontend/src/tests/ai-visibility.test.jsx`
- Modify: `frontend/src/app.jsx`

**Step 1: Write the failing test**

Add tests that expect:
- AI feature flag exported as disabled
- AI KPI/ranking entries filtered out
- AI business-role suggestions hidden

**Step 2: Run test to verify it fails**

Run: `npm.cmd test -- frontend/src/tests/ai-visibility.test.jsx`
Expected: FAIL because the exported helpers/flag do not exist yet.

**Step 3: Write minimal implementation**

Export a centralized flag and pure helper functions from `frontend/src/app.jsx`.

**Step 4: Run test to verify it passes**

Run: `npm.cmd test -- frontend/src/tests/ai-visibility.test.jsx`
Expected: PASS

### Task 2: Hide AI entry points from sidebar, routes, and analytics layout

**Files:**
- Modify: `frontend/src/app.jsx`

**Step 1: Write/update failing test**

Extend the test coverage around derived visible KPI/ranking lists if needed.

**Step 2: Run test to verify it fails**

Run: `npm.cmd test -- frontend/src/tests/ai-visibility.test.jsx`
Expected: FAIL until UI derivation logic is updated.

**Step 3: Write minimal implementation**

Gate:
- sidebar AI menu
- AI routes
- analytics KPI/focus/ranking data
- route fallback when AI is disabled

Recompose analytics layout so no empty card/slot remains.

**Step 4: Run test to verify it passes**

Run: `npm.cmd test -- frontend/src/tests/ai-visibility.test.jsx`
Expected: PASS

### Task 3: Hide embedded AI sections and verify app behavior

**Files:**
- Modify: `frontend/src/app.jsx`

**Step 1: Write/update failing test**

Cover the hidden business-role AI suggestion section with the flag.

**Step 2: Run test to verify it fails**

Run: `npm.cmd test -- frontend/src/tests/ai-visibility.test.jsx`
Expected: FAIL until role-detail section is gated.

**Step 3: Write minimal implementation**

Keep suggestion logic in code but stop rendering the AI suggestion UI when the flag is disabled.

**Step 4: Run verification**

Run:
- `npm.cmd test -- frontend/src/tests/ai-visibility.test.jsx`
- `npm.cmd run build`

Expected:
- targeted tests PASS
- frontend build succeeds
