# One image for twapza-api, twapza-worker and twapza-scheduler.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY twapza ./twapza
RUN pip install ".[dev]"
COPY tests ./tests

RUN useradd --create-home --uid 1000 twapza && mkdir -p /data && chown twapza /data
USER twapza

EXPOSE 8000
CMD ["uvicorn", "twapza.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
