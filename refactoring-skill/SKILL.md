---
name: refactoring-skill
description: Use when the user asks to refactor code structure, reduce complexity, improve readability/maintainability, or extract reusable components without changing behavior.
---

# Refactoring Skill

Use this skill for behavior-preserving code improvements.

## When To Use

Activate this skill when requests include terms such as:
- `refactor`
- `clean up`
- `simplify`
- `reduce complexity`
- `improve maintainability`
- `extract function/component/module`

Do not use this skill for net-new feature work unless the request explicitly includes refactoring.

## Operating Rules

- Preserve observable behavior unless the user explicitly asks for behavior changes.
- Prefer small, reversible changes over broad rewrites.
- Keep public APIs stable unless the user approves a breaking change.
- If tests are missing around touched behavior, add focused characterization/regression tests first.

## Refactoring Workflow

1. Define scope and invariants
- Identify what must stay the same: I/O contracts, side effects, error shapes, and performance constraints.
- Note boundaries that should not change (public interfaces, schema, wire formats).

2. Establish baseline
- Run existing tests/lint/type checks for the impacted area.
- Capture current behavior for risky paths (tests or reproducible command outputs).

3. Plan minimal transformations
- Break work into atomic changes (rename, extract function, split module, remove duplication).
- Order changes so each step stays buildable and testable.

4. Execute incremental edits
- Apply one logical transformation at a time.
- Keep naming explicit and consistent.
- Remove dead code only after references are verified.

5. Verify after each step
- Re-run targeted tests and static checks.
- Expand to broader project checks before finishing.

6. Final quality gate
- Confirm no behavior drift in critical paths.
- Confirm readability actually improved (smaller functions, reduced nesting, clearer responsibilities).

## Output Format

When reporting results:
- State what was refactored and why.
- List files changed.
- List validation commands run and pass/fail outcomes.
- Call out residual risks or follow-up opportunities.
