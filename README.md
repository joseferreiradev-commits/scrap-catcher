# Scrap Catcher

A private, local-first PWA for noticing money that was planned but not spent.

## MVP

- Three fixed buckets: Breakfast, Lunch, Dinner
- Onboarding and Settings for default planned amounts
- Per-day planned overrides
- Live daily Scrap total: planned minus actual spending
- Past dates editable; future dates unavailable
- IndexedDB browser storage only; no account, sync, or money API integration

## Run locally

Open `index.html` directly for basic use, or serve the folder with any static file server for full PWA install/service-worker support.

No Python, PHP, backend, account, or API is required. The app entry point is the root `index.html`, and money data stays in the browser's IndexedDB.
