The API lives in `api/` — a Python FastAPI server backed by SQLite (`data/catchup.db`).
The mobile app lives in `mobile/` — a React Native Expo app.

**Always use `bun` instead of `npm`/`npx` for installing packages and running scripts.**

Run the API: `cd api && uvicorn main:app --reload`
Seed articles: `cd api && python seed.py`
