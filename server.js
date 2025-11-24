// Simple Connecta server (no DB) - in-memory storage
const express = require("express");
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const backgrounds = {};


const app = express();
const server = http.createServer(app);
const io = socketio(server);

const PORT = process.env.PORT || 4000;

// Serve static client
app.use(express.static(path.join(__dirname, "public")));

// In-memory stores
const users = new Map(); // users: { username, sockets: Set() }
const publicMessages = []; // array of {id, from, content, createdAt}
const privateMessages = {}; // { conversationId: [messages...] }

function getConversationId(a, b) {
  return [a, b].sort().join("|");
}

io.on("connection", (socket) => {
  console.log("🟢 Usuario conectado");

  socket.on("join", (payload) => {
    const { username } = payload || {};
    if (!username) return;
    socket.username = username;

    if (!users.has(username)) {
      users.set(username, { username, sockets: new Set() });
    }
    users.get(username).sockets.add(socket.id);

    io.emit("users", Array.from(users.keys()));
    socket.emit("public_history", publicMessages.slice(-200));
  });

  socket.on("public_message", (data) => {
    if (!socket.username) return;
    const msg = {
      id: Date.now() + "-" + Math.floor(Math.random() * 1000),
      from: socket.username,
      content: data.content || "",
      createdAt: new Date().toISOString(),
    };
    publicMessages.push(msg);
    io.emit("new_public_message", msg);
  });

  socket.on("private_message", (data) => {
    if (!socket.username) return;
    const to = data.to;
    if (!to) return;
    const conv = getConversationId(socket.username, to);
    const msg = {
      id: Date.now() + "-" + Math.floor(Math.random() * 1000),
      from: socket.username,
      to,
      content: data.content || "",
      createdAt: new Date().toISOString(),
    };
    if (!privateMessages[conv]) privateMessages[conv] = [];
    privateMessages[conv].push(msg);

    socket.emit("new_private_message", msg);
    const recipient = users.get(to);
    if (recipient) {
      recipient.sockets.forEach((sid) => {
        io.to(sid).emit("new_private_message", msg);
      });
    }
  });

  socket.on("get_private_history", (data) => {
    const withUser = data.with;
    if (!socket.username || !withUser) return;
    const conv = getConversationId(socket.username, withUser);
    const history = privateMessages[conv] || [];
    socket.emit("private_history", { with: withUser, history });
  });

  socket.on("disconnect", () => {
    console.log("🔴 Usuario desconectado");
    if (socket.username) {
      const entry = users.get(socket.username);
      if (entry) {
        entry.sockets.delete(socket.id);
        if (entry.sockets.size === 0) {
          users.delete(socket.username);
        }
        io.emit("users", Array.from(users.keys()));
      }
    }
  });

   socket.on("avatarChange", ({ username, avatar }) => {
    if (!username || !avatar) return;
    avatars[username] = avatar;             // guardar
    io.emit("avatarUpdate", { username, avatar }); // notificar a todos
  });

  socket.on("backgroundUpdate", ({ username, background }) => {
  if (!username || !background) return;
  backgrounds[username] = background;
  io.emit("backgroundUpdate", { username, background });
});

  socket.on("join", (payload) => {
    const { username } = payload || {};
    if (!username) return;
    socket.username = username;

    if (!users.has(username)) {
      users.set(username, { username, sockets: new Set() });
    }
    users.get(username).sockets.add(socket.id);

    // Emitir lista de usuarios
    io.emit("users", Array.from(users.keys()));

    // Enviar historial público
    socket.emit("public_history", publicMessages.slice(-200));

    // Enviar mapa de avatars actuales al que se une para que el cliente lo aplique
    socket.emit("avatars", avatars);

    socket.emit("backgrounds", backgrounds);
  });
});

const avatars = {};

// ✅ Servidor arrancando FUERA del bloque
server.listen(PORT, () => {
  console.log("🚀 Connecta server listening on", PORT);
  console.log("👉 Abre http://localhost:" + PORT + " en tu navegador");
});
