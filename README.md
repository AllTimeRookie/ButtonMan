# ButtonMan (Python)

Python FastAPI version of the ButtonMan signaling server and static site.

How to run
- Create a virtual environment (recommended)
- Install Python dependencies from requirements.txt
- Start the server on port 3000

Commands (fish shell)
```fish
python -m venv .venv
source .venv/bin/activate.fish
pip install -r requirements.txt
python app.py
```

Then open http://localhost:3000/ in your browser.

Project notes
- WebSocket endpoint: ws://<host>:3000/ws
- Static files are served from public/
- In-memory rooms; not suitable for multiple processes or persistence.

Deploy to Render
- Add this repo to Render as a Web Service.
- Render will detect render.yaml and use uvicorn. Ensure PYTHON_VERSION is set.

Windows desktop client
- See client/main.py and client/README.md. It wraps the hosted URL in a native window.
- GitHub Actions workflow .github/workflows/windows-build.yml builds a ButtonMan.exe artifact.