# AGENTS.md

## Scope

This file applies to `/Users/salvo/Development/Role_Mining/backend`.

## Stack

- Python 3
- FastAPI (`main.py`)
- Local venv in `.venv`

## Setup

- `python3 -m venv .venv`
- `source .venv/bin/activate`
- `pip install -r requirements.txt`

## Run And Verify

- Start API: `.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000`
- Import smoke test: `.venv/bin/python -c "import main"`
- Health: `curl -sS http://127.0.0.1:8000/api/health`

## Backend Refactoring Rules

1. Preserve endpoint contracts and JSON shapes.
2. Keep error semantics stable (status codes and key messages).
3. Refactor in small steps; avoid mixing behavior changes.
4. Add focused regression tests for touched flows when missing.
5. Re-run relevant tests/smoke checks before handoff.

## Data And Artifacts

- Do not modify `data/storage.json` unless requested.
- Do not rewrite large CSV fixtures unless task is data-specific.

