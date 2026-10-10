.PHONY: up up-gpu down logs test test-backend test-frontend test-docker dev-api dev-worker dev-web

up:            ## build and start everything (http://localhost:8080)
	docker compose up --build -d

up-gpu:        ## same, with GPU transcription (needs NVIDIA Container Toolkit)
	docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

test: test-backend test-frontend

test-backend:
	cd backend && python -m pytest -q

test-frontend:
	cd frontend && npm test && npm run typecheck

test-docker:   ## run backend tests inside the backend image
	docker compose run --rm --no-deps twapza-api python -m pytest -q

# --- Local development without Docker (needs redis-server + ffmpeg installed) ---
dev-api:
	cd backend && uvicorn twapza.api.app:app --reload --port 8000

dev-worker:
	cd backend && python -m twapza.workers

dev-web:
	cd frontend && npm run dev
