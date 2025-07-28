const WebSocket = require('ws');
const express = require('express');
const app = express();
const server = require('http').createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

wss.on('connection', socket => {
  socket.on('message', raw => {
    const msg = JSON.parse(raw);
    const { type, room, payload } = msg;

    rooms[room] = rooms[room] || [];
    if (!rooms[room].includes(socket)) rooms[room].push(socket);

    rooms[room].forEach(client => {
      if (client !== socket && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(payload));
      }
    });
  });

  socket.on('close', () => {
    for (let room in rooms) {
      rooms[room] = rooms[room].filter(s => s !== socket);
    }
  });
});

app.use(express.static('public'));

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`Signaling server running on port ${PORT}`);
});

