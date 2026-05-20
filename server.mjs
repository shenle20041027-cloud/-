import express from 'express';
import http from 'node:http';
import os from 'node:os';
import { WebSocketServer } from 'ws';
import { createServer as createViteServer } from 'vite';

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/sync' });

let latestState = null;
let clientCount = 0;

const send = (socket, message) => {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(message));
  }
};

const broadcast = (message, except) => {
  for (const client of wss.clients) {
    if (client !== except) {
      send(client, message);
    }
  }
};

wss.on('connection', (socket) => {
  clientCount += 1;
  send(socket, { type: 'sync-status', payload: { connected: clientCount } });

  if (latestState) {
    send(socket, { type: 'screen-state', payload: latestState });
  }

  socket.on('message', (raw) => {
    try {
      const message = JSON.parse(raw.toString());

      if (message.type === 'controller-state') {
        latestState = message.payload;
        broadcast({ type: 'screen-state', payload: latestState }, socket);
      }

      if (message.type === 'screen-hello') {
        send(socket, {
          type: 'sync-status',
          payload: { connected: clientCount, screenId: message.payload?.screenId },
        });
        if (latestState) {
          send(socket, { type: 'screen-state', payload: latestState });
        }
      }
    } catch (error) {
      send(socket, { type: 'sync-error', payload: { message: 'Invalid sync message' } });
    }
  });

  socket.on('close', () => {
    clientCount = Math.max(0, clientCount - 1);
    broadcast({ type: 'sync-status', payload: { connected: clientCount } });
  });
});

app.get('/api/sync/status', (_request, response) => {
  response.json({
    connected: clientCount,
    hasState: Boolean(latestState),
  });
});

app.get('/api/network', (_request, response) => {
  const addresses = [];
  const interfaces = os.networkInterfaces();

  for (const infos of Object.values(interfaces)) {
    for (const info of infos || []) {
      const isBenchmarkRange = info.address.startsWith('198.18.') || info.address.startsWith('198.19.');
      if (info.family === 'IPv4' && !info.internal && !isBenchmarkRange) {
        addresses.push(`http://${info.address}:${port}`);
      }
    }
  }

  response.json({
    local: `http://localhost:${port}`,
    addresses,
  });
});

const vite = await createViteServer({
  server: { middlewareMode: true },
  appType: 'spa',
});

app.use(vite.middlewares);

server.listen(port, host, () => {
  console.log(`NEONPULSE controller: http://localhost:${port}/`);
  console.log(`Screen sync websocket: ws://localhost:${port}/sync`);
});
