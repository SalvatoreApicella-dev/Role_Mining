"""Compatibility entrypoint.

All backend implementation now lives in `app.server`.
This file keeps `uvicorn main:app` and legacy `import main` usage working.
"""

from app.server import *  # noqa: F401,F403
from app.server import app


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=False)
