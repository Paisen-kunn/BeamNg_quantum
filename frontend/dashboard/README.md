Dashboard
=========

Quick dev run (from repo root):

cd frontend/dashboard
npm install
npm run dev

Open http://localhost:5173

Live BeamNG integration
- Start BeamNG and your scenario, then run the WebSocket server:

```bash
python tools/live_map_server.py
```

This server connects to BeamNG (via `beamngpy`) and streams vehicle positions to the dashboard over `ws://localhost:8765`.

Then open the dashboard in your browser — vehicle icons will appear and update live.
