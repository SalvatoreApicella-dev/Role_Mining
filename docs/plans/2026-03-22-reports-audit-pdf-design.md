# Reports audit PDF implementation plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to
implement this plan task-by-task.

**Goal:** Upgrade the Reports cards visually, replace text actions with clear
download icons, and implement a real client-side audit PDF export.

**Architecture:** Keep CSV export logic in the Reports page, add a pure
`reportAuditPdf` helper that derives an audit-oriented PDF model and serializes
it into a minimal multi-section PDF without adding new dependencies. The page
will use that helper for PDF downloads and expose icon-only actions with
accessible labels.

**Tech Stack:** React, Vite, Node test runner, CSS, custom PDF serializer

---

### Task 1: Add failing tests for the audit PDF helper

**Files:**
- Create: `frontend/src/reportAuditPdf.js`
- Modify: `frontend/src/tests/ai-visibility.test.mjs`

**Step 1: Write the failing test**

Cover:
- audit PDF model summary fields
- generated PDF bytes start with `%PDF-`
- output contains sanitized report title content

**Step 2: Run the test to verify failure**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: FAIL because helper does not exist yet.

**Step 3: Implement minimal helper**

Build:
- `buildAuditPdfModel(report, generatedAtIso)`
- `buildAuditPdfBytes(model)`

**Step 4: Re-run tests**

Run: `node --test src/tests/ai-visibility.test.mjs`
Expected: PASS

### Task 2: Upgrade Reports card actions

**Files:**
- Modify: `frontend/src/pages/ReportsPage.jsx`
- Modify: `frontend/src/styles.css`

**Step 1: Replace action buttons with icon buttons**

Use clear CSV/PDF download affordances with accessible labels and tooltips.

**Step 2: Improve card visual hierarchy**

Add stronger card chrome, stat chips, action rail, and hover polish.

### Task 3: Wire PDF export and verify

**Files:**
- Modify: `frontend/src/pages/ReportsPage.jsx`

**Step 1: Connect PDF helper to page**

Download a real audit report PDF for each report card.

**Step 2: Run verification**

Run:
- `node --test src/tests/ai-visibility.test.mjs`
- `npm.cmd run build`

Expected:
- tests PASS
- frontend build succeeds
