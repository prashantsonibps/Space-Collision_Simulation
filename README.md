# SpaceGuard

### Globe-First Satellite Collision Simulation

SpaceGuard is a simulation-first mission console for orbital collision risk.

The product flow is simple:
- open the globe
- select a critical conjunction
- see the possible collision on the globe
- run a scenario
- compare future branches like `Observe Only`, `Avoidance Burn`, and `Mission Replan`

This project is focused on simulation, not prediction markets.

## What It Does

SpaceGuard helps an operator answer one question:

`What should we do before two objects get dangerously close in orbit?`

The app combines:
- a live globe for orbital risk exploration
- branch-based collision response scenarios
- World Labs generated future visuals for selected branches
- Firebase-backed caching so generated sims can load instantly during a demo

## Current Demo Flow

1. Start on the globe view.
2. Select a critical satellite event from the risk monitor.
3. Watch the selected conjunction highlight on the globe.
4. Click `RUN SCENARIO`.
5. Open the simulation console and compare branches.
6. Generate or reload a future simulation view.
7. Open the result full-screen or in Marble 3D.

## Core Experience

### 1. Globe View
- 3D Earth with orbital markers
- highlighted critical conjunction selection
- globe-first landing experience

### 2. Scenario Lab
- `Observe Only`
- `Avoidance Burn`
- `Mission Replan`
- branch tradeoffs for miss distance, collision risk, fuel, and delay

### 3. World Model Output
- generated future visuals from World Labs
- full-screen simulation presentation
- Marble world handoff for richer 3D viewing

## Tech Stack

- Frontend: Next.js 14, Tailwind CSS, Framer Motion
- 3D UI: Three.js, React Three Fiber, Drei
- Backend: FastAPI, Python
- Data: Firebase Firestore
- World Generation: World Labs API

## Local Setup

### Backend

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env` and add:

```bash
WORLDLABS_API_KEY=your_key_here
GEMINI_API_KEY=your_key_here
```

Then run:

```bash
venv/bin/uvicorn src.api:app --host 127.0.0.1 --port 8003
```

### Frontend

```bash
cd frontend
npm install
NEXT_PUBLIC_API_URL=http://127.0.0.1:8003 npm run dev -- --hostname 127.0.0.1 --port 3204
```

Open:

- Frontend: `http://127.0.0.1:3204`
- Backend: `http://127.0.0.1:8003`

## Notes

- The first World Labs generation can take a bit.
- Completed simulations are cached so later loads are instant.
- If a generated world has no thumbnail, the app falls back to the returned panorama.

## Project Direction

This repo is intentionally centered on one strong use case:

`satellite collision simulation and intervention planning`

That means the app is optimized around:
- conjunction visibility
- counterfactual branch comparison
- realistic simulation presentation

Instead of:
- trading flows
- portfolio views
- generic prediction interfaces

## Demo Pitch

SpaceGuard turns orbital risk from a static alert into a simulated decision.

Instead of only telling an operator that a conjunction is dangerous, it shows:
- where the risk is on the globe
- what the likely future looks like
- which intervention path is safest

Built for simulation-heavy decision support in space operations.
