# AGENTS.md

## Project Overview

Role_Mining is a full-stack app with:
- `backend/`: FastAPI + Python business logic and data processing.
- `frontend/`: React + Vite UI.

Primary local ports:
- Backend: `127.0.0.1:8000`
- Frontend: `127.0.0.1:5173`

## Setup Commands

Backend setup:
- `cd backend`
- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -r requirements.txt`

Frontend setup:
- `cd frontend`
- `npm install`

Full app helper (starts backend + frontend):
- `./run_action.sh`

## Build And Test Commands

Frontend:
- `cd frontend && npm run build`

Backend smoke checks:
- `cd backend && .venv/bin/python -c "import main"`
- `curl -sS http://127.0.0.1:8000/api/health`

System smoke check:
- `curl -s http://127.0.0.1:5173`

## Code Style Guidelines

- Keep changes minimal and local to the requested scope.
- Preserve API contracts and response shapes unless explicitly asked to change them.
- Prefer small functions with clear names over deep nesting.
- Do not edit generated/minified artifacts in `frontend/dist/`; update source files in `frontend/src/`.
- Avoid touching large CSV datasets in `backend/` unless the task is data-specific.

## Refactoring Instructions

When the user asks for refactoring:
1. Preserve behavior first (I/O, side effects, error handling).
2. Make incremental, reversible edits (extract/rename/split in small steps).
3. Run relevant checks after each logical step.
4. Add focused regression tests if the touched behavior was previously untested.
5. Report exactly what was refactored, files changed, and checks run.

## PR / Change Hygiene

- Keep diffs focused; avoid unrelated cleanup.
- Mention residual risks and follow-ups explicitly.
- If a command cannot run locally, state it clearly in the handoff.
