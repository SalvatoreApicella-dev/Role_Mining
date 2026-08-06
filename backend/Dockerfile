# Stage 1: Build & Cython Compilation
FROM python:3.11-slim AS builder

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential python3-dev \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . /app

# Compile all app modules into binary .so C-extensions
RUN python compile_cython.py build_ext --inplace

# Clean up raw .py source files (keep __init__.py and main.py loader) and .c intermediate files
RUN find app -name "*.py" ! -name "__init__.py" -delete
RUN find app -name "*.c" -delete
RUN rm -f compile_cython.py

# Stage 2: Final Obfuscated Runtime Image
FROM python:3.11-slim

WORKDIR /app
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY --from=builder /usr/local /usr/local
COPY --from=builder /app /app

EXPOSE 8000
CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2} --timeout-keep-alive 30 --no-server-header"]

