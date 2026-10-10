# One image for twapza-api, twapza-worker and twapza-scheduler.
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml ./
COPY twapza ./twapza
RUN pip install ".[dev,whisper,scenes]"

# Optional NVIDIA GPU support for faster-whisper (see docker-compose.gpu.yml).
ARG WHISPER_GPU=0
RUN if [ "$WHISPER_GPU" = "1" ]; then \
        pip install nvidia-cublas-cu12 "nvidia-cudnn-cu12==9.*"; \
    fi
COPY tests ./tests

RUN useradd --create-home --uid 1000 twapza && mkdir -p /data && chown twapza /data
USER twapza

EXPOSE 8000
CMD ["uvicorn", "twapza.api.app:app", "--host", "0.0.0.0", "--port", "8000"]
