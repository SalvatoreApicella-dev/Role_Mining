# AGENTS.md

## Scope

This file applies to `/Users/salvo/Development/Role_Mining/frontend`.

## Stack

- React 18
- Vite 5
- Entry: `src/app.jsx`

## Setup

- `npm install`

## Build And Verify

- Dev server: `npm run dev`
- Production build: `npm run build`
- Preview build: `npm run preview`

## Frontend Refactoring Rules

1. Preserve user-visible behavior unless explicitly requested.
2. Keep route structure and navigation behavior stable.
3. Prefer extracting reusable components/hooks over large in-place rewrites.
4. Keep state changes explicit; avoid hidden side effects.
5. Validate with a production build after non-trivial edits.

## Source Of Truth

- Edit source files under `src/`.
- Do not manually edit generated output under `dist/`.

