# Cluster heatmap guided-clarity implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
implement this plan task-by-task.

**Goal:** Make the Cluster heatmap easier to read visually without changing the
underlying matrix behavior, filtering, or data flow.

**Architecture:** Add a small pure helper that builds the heatmap guidance
view-model from existing state. Use it to render a stronger legend header,
active filter status, and concise reading instructions above the matrix.

**Tech Stack:** React, Vite, Node test runner, CSS

---

### Task 1: Add failing tests for the heatmap guidance helper

**Files:**
- Create: `frontend/src/clusterHeatmapView.js`
- Modify: `frontend/src/tests/ai-visibility.test.mjs`

**Step 1: Write the failing test**

Cover:
- active filter label
- expanded/collapsed status copy
- count of visible role families

**Step 2: Run tests to verify failure**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because the helper does not exist yet.

**Step 3: Implement the minimal helper**

Keep it pure and driven only by current frontend state.

**Step 4: Re-run tests**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Redesign the heatmap framing

**Files:**
- Modify: `frontend/src/app.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Use the helper in Cluster**

Add a guided legend shell with:
- title and short explainer
- matrix status cards
- stronger active filter state

**Step 2: Improve matrix separation**

Add a framed matrix container with clearer spacing and visual hierarchy.

**Step 3: Run final verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds
