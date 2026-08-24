const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

// Servir o frontend (pasta dist do Vite)
app.use(express.static(path.join(__dirname, '../client/dist')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

const PORT = process.env.PORT || 3001;

// Map to keep track of users in rooms
// roomID -> Set of socket IDs
const rooms = new Map();

io.on('connection', (socket) => {
  console.log(`[+] User connected: ${socket.id}`);

  // When a user joins a room
  socket.on('join-room', (roomId) => {
    socket.join(roomId);

    if (!rooms.has(roomId)) {
      rooms.set(roomId, new Set());
    }
    rooms.get(roomId).add(socket.id);

    console.log(`[+] User ${socket.id} joined room ${roomId}`);

    // Notify other users in the room
    // Get all other users in this room
    const otherUsers = Array.from(rooms.get(roomId)).filter((id) => id !== socket.id);
    
    // Send the list of existing users to the new user so they can initiate connection
    socket.emit('all-users', otherUsers);
  });

  // Signaling: offer, answer, ice-candidate
  socket.on('offer', (payload) => {
    io.to(payload.target).emit('offer', {
      callerId: socket.id,
      sdp: payload.sdp,
    });
  });

  socket.on('answer', (payload) => {
    io.to(payload.target).emit('answer', {
      callerId: socket.id,
      sdp: payload.sdp,
    });
  });

  socket.on('ice-candidate', (payload) => {
    io.to(payload.target).emit('ice-candidate', {
      callerId: socket.id,
      candidate: payload.candidate,
    });
  });

  // Relay interactions/pranks to the entire room
  socket.on('interaction', (payload) => {
    // payload should contain roomId, type, and optional data
    socket.to(payload.roomId).emit('interaction', {
      type: payload.type,
      data: payload.data,
      from: socket.id,
    });
  });

  socket.on('disconnecting', () => {
    socket.rooms.forEach((roomId) => {
      if (rooms.has(roomId)) {
        rooms.get(roomId).delete(socket.id);
        if (rooms.get(roomId).size === 0) {
          rooms.delete(roomId);
        }
        // Notify others that this user disconnected
        socket.to(roomId).emit('user-disconnected', socket.id);
      }
    });
  });

  socket.on('disconnect', () => {
    console.log(`[-] User disconnected: ${socket.id}`);
  });
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

server.listen(PORT, () => {
  console.log(`🚀 Signaling server running on http://localhost:${PORT}`);
});
