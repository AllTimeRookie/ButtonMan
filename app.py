from __future__ import annotations

import asyncio
import json
from typing import Dict, List, Set

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.staticfiles import StaticFiles


app = FastAPI(title="ButtonMan (Python)")


# In-memory room registry: room_id -> set of websockets
rooms: Dict[str, Set[WebSocket]] = {}


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
	await ws.accept()
	joined_rooms: Set[str] = set()
	try:
		while True:
			raw = await ws.receive_text()
			try:
				msg = json.loads(raw)
			except json.JSONDecodeError:
				# Ignore malformed messages
				continue

			room = msg.get("room")
			payload = msg.get("payload")

			if not room or payload is None:
				# Ignore messages without required shape
				continue

			# Join room on first message for that room
			if room not in rooms:
				rooms[room] = set()
			if ws not in rooms[room]:
				rooms[room].add(ws)
				joined_rooms.add(room)

			# Relay only the payload to other peers in the same room
			dead: List[WebSocket] = []
			for client in rooms.get(room, set()):
				if client is ws:
					continue
				try:
					await client.send_text(json.dumps(payload))
				except Exception:
					# Track clients that can no longer be written to
					dead.append(client)
			# Cleanup any sockets that errored during send
			for d in dead:
				for r in list(rooms.keys()):
					rooms[r].discard(d)
					if not rooms[r]:
						rooms.pop(r, None)
	except WebSocketDisconnect:
		pass
	finally:
		# Remove this socket from all rooms on disconnect
		for r in list(rooms.keys()):
			rooms[r].discard(ws)
			if not rooms[r]:
				rooms.pop(r, None)


# Serve the frontend from / (public/ as web root)
app.mount("/", StaticFiles(directory="public", html=True), name="static")


if __name__ == "__main__":
	import uvicorn

	uvicorn.run("app:app", host="0.0.0.0", port=3000, reload=True)

