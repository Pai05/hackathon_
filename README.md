# Glow Research

Project is now split into two parts:

- frontend: Vite + React + TypeScript app
- backend: Express API server

## Folder Structure

- frontend/
- backend/

## Run Frontend

1. cd frontend
2. npm install
3. npm run dev

## Run Backend

1. cd backend
2. npm install
3. copy .env.example .env
4. npm run dev

## Agent Integration (Non-invasive)

The project now includes additive frontend and backend agent layers without changing the existing folder structure or auth flows.

- Backend agents: [query planner, paper search, evidence analyzer, synthesis writer]
- Frontend agents runtime: backend runtime + demo runtime fallback
- Existing research flow remains compatible through /api/research/\* aliases

### Optional Frontend Env Flags

- VITE_AGENT_MODE=demo | backend
- VITE_AGENT_API_URL=http://127.0.0.1:5000
