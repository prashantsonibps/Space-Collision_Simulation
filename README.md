# SpaceGuard 🛡️🚀

### **A Simulation Copilot for Orbital Risk**

> _"Roll out orbital futures before the mission has to commit."_

## Try it out at https://spaceguard-a0dbc.web.app/ 

---

## 🌌 The Problem: The Kessler Syndrome is Unpriced

The space economy is booming ($600B+ today, $1T+ by 2030), but **orbital risk is unmanaged**.

- **25,000+** tracked objects and debris pieces are cluttering Low Earth Orbit (LEO).
- **Satellite Collisions** are becoming statistically inevitable (e.g., Iridium-33 vs Cosmos-2251).
- **Launch Delays** cost millions per day in lost revenue and operational burn.
- **Space Weather** (Solar Flares) can fry electronics instantly.

Currently, insurance is slow, manual, and reactive. **SpaceGuard makes it real-time, algorithmic, and tradable.**

---

## 🛰️ What is SpaceGuard?

SpaceGuard is a **simulation-first mission operations console** that ingests live space data and compares possible futures before an operator acts.

We don't just show you where satellites are; **we simulate what happens next and which intervention path is safest.**

### **Core Modules**

1.  **🌍 Real-Time Orbital Conjunctions**: Uses SGP4 propagation (Skyfield) on live TLE data to detect satellites on collision courses (<10km miss distance).
2.  **🚀 Launch Delay Modeling**: analyzing pad location, live OpenWeather data, and historical provider reliability to estimate T-0 scrub risk.
3.  **☄️ Deep Space & Weather**: Monitoring NASA NeoWs (Asteroids) and DONKI (Space Weather) for external threats.
4.  **🧠 AI Scenario Analyst**: An autonomous copilot that turns raw events into action branches like observe, avoid, or delay, then explains the tradeoffs.

---

## 🧪 Why It Fits World Models

The strongest version of SpaceGuard is not a trading app. It is a **counterfactual simulator for operators**.

1.  **State ingestion**: Pull current orbital, launch, and weather state from live feeds.
2.  **Future rollout**: Compare “do nothing”, “maneuver”, and “replan” branches over the next hours.
3.  **Decision support**: Recommend the branch with the best safety, continuity, and cost tradeoff.

---

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, Framer Motion.
- **Visualization**: Three.js / React Three Fiber (R3F) for the 3D Digital Twin globe.
- **Backend**: Python (FastAPI/Scripts) for orbital mechanics & data ingestion.
- **AI Engine**: Structured scenario reasoning for intervention and rollout analysis.
- **Data**: Firebase Firestore (Real-time sync), CelesTrak (TLEs), NASA NeoWs, OpenWeather, The SpaceDevs.

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/prashantsonibps/SpaceGuard.git
cd SpaceGuard
```

### 2. Backend Setup (The Engine)

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# Add your .env file with:
# MISTRAL_API_KEY=...
# NASA_API_KEY=...
# OPENWEATHER_API_KEY=...
# FIREBASE_CREDENTIALS_PATH=serviceAccountKey.json

python src/main.py
```

### 3. Frontend Setup (The Dashboard)

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to explore the orbital simulation console.

### 4. Hosting the frontend (e.g. Vercel)

On branch `feat/host-frontend`, the UI uses the inline-expand Financial Terminal and betting flow. To deploy the frontend:

1. Set the backend API URL in your host’s environment:
   - **`NEXT_PUBLIC_API_URL`** = your backend base URL (e.g. `https://your-api.fly.dev`).
2. Copy `frontend/.env.example` to `frontend/.env.local` and fill in `NEXT_PUBLIC_API_URL` for local builds, or configure the same variable in your hosting dashboard.
3. Ensure the backend allows your frontend origin in CORS (the default API allows all origins).

Without `NEXT_PUBLIC_API_URL`, the app falls back to `http://localhost:8000` (local dev).

---

## 🚀 Production Deployment (Google Cloud)

**Live:** https://spaceguard-a0dbc.web.app | **API:** https://spaceguard-api-1040980823268.us-central1.run.app

**Redeploy:**
```bash
# Backend
gcloud run deploy spaceguard-api --source ./backend --region us-central1 --project spaceguard-a0dbc --allow-unauthenticated

# Frontend (set backend URL first)
NEXT_PUBLIC_API_URL=https://spaceguard-api-1040980823268.us-central1.run.app npm run build --prefix frontend && firebase deploy --only hosting
```

---

## 🔮 Future Roadmap

- **World Model Rollouts**: Replace heuristic branches with generated future frames and branch scoring.
- **Intervention Search**: Optimize maneuver timing, delay windows, and mission replans automatically.
- **Debris Mapping**: High-fidelity visualization of the 2009 Cosmos collision debris cloud.

---

_Built for the Future of Space._ 🚀
