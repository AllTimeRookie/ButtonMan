# ButtonMan Desktop (Windows)

This wraps the hosted web UI in a native window using PyWebView and packages it into a Windows .exe with PyInstaller.

Build steps (Windows, PowerShell)
1. Create venv and install deps
2. Build standalone exe

Commands
```powershell
py -m venv .venv
. .venv\Scripts\Activate.ps1
pip install -r ..\requirements.txt
py -m PyInstaller --noconfirm --onefile --windowed --name ButtonMan --icon icon.ico main.py
```

Output: `dist/ButtonMan.exe`

Notes
- Update SERVER_URL in main.py to point to your deployed server (e.g., Render URL).
- If Edge runtime is missing, PyWebView will fallback to available web engines.
 - For best results on Windows, ensure Microsoft Edge WebView2 Runtime is installed (included on most modern Windows 10/11 systems).
