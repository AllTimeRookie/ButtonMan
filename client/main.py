import os
import sys
import webbrowser


DEFAULT_URL = "https://buttonman.onrender.com"


def resolve_url() -> str:
    # Priority: CLI arg > ENV var > default
    if len(sys.argv) > 1 and sys.argv[1].startswith("http"):
        return sys.argv[1]
    env_url = os.environ.get("BUTTONMAN_SERVER_URL")
    if env_url:
        return env_url
    return DEFAULT_URL


def main():
    title = "ButtonMan"
    url = resolve_url()
    try:
        import webview  # lazy import; may not be present in some environments
        webview.create_window(title, url=url, width=900, height=700)
        webview.start(gui='edgechromium' if sys.platform.startswith('win') else None)
    except Exception:
        # Fallback to system browser if pywebview is not available or fails
        webbrowser.open(url)


if __name__ == "__main__":
    main()
