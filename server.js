// Simple Connecta server (no DB) - in-memory storage
const express = require("express");
const http = require("http");
const path = require("path");
const socketio = require("socket.io");
const backgrounds = {};
const avatars = {};

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

  socket.on("join", ({ username }) => {
    if (!username) return;
    socket.username = username;

    if (!users.has(username)) {
      users.set(username, {
        username,
        sockets: new Set(),
        lastSeen: null,
        online: true,
      });
    }

    const user = users.get(username);
    user.sockets.add(socket.id);
    user.online = true;
    user.lastSeen = null;

    // enviar usuarios conectados + estados
    io.emit(
      "users_status",
      Array.from(users.values()).map((u) => ({
        username: u.username,
        online: u.online,
        lastSeen: u.lastSeen,
      }))
    );

    // historial público
    socket.emit("public_history", publicMessages.slice(-200));

    // avatares
    socket.emit("avatars", avatars);

    // fondos
    socket.emit("backgrounds", backgrounds);
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

  // Reaccionar a un mensaje
  socket.on("react_message", ({ msgId, reaction, scope, withUser }) => {
    if (!socket.username || !msgId || !reaction) return;

    // scope: 'public' or 'private'
    if (scope === "public") {
      const msg = publicMessages.find((m) => m.id === msgId);
      if (msg) {
        msg.reactions = msg.reactions || {}; // { emoji: [user1, user2...] }
        msg.reactions[reaction] = msg.reactions[reaction] || [];
        // toggle: si ya reaccionó, quitar; si no, agregar
        const idx = msg.reactions[reaction].indexOf(socket.username);
        if (idx >= 0) msg.reactions[reaction].splice(idx, 1);
        else msg.reactions[reaction].push(socket.username);
        io.emit("message_reaction_update", {
          scope: "public",
          msgId,
          reactions: msg.reactions,
        });
      }
    } else if (scope === "private" && withUser) {
      const conv = getConversationId(socket.username, withUser);
      const msgs = privateMessages[conv] || [];
      const msg = msgs.find((m) => m.id === msgId);
      if (msg) {
        msg.reactions = msg.reactions || {};
        msg.reactions[reaction] = msg.reactions[reaction] || [];
        const idx = msg.reactions[reaction].indexOf(socket.username);
        if (idx >= 0) msg.reactions[reaction].splice(idx, 1);
        else msg.reactions[reaction].push(socket.username);

        // notificar a participantes del conv
        const participants = conv.split("|");
        participants.forEach((p) => {
          const entry = users.get(p);
          if (entry) {
            entry.sockets.forEach((sid) =>
              io.to(sid).emit("message_reaction_update", {
                scope: "private",
                msgId,
                reactions: msg.reactions,
                conv,
              })
            );
          }
        });
      }
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
          // usuario totalmente offline
          entry.online = false;
          entry.lastSeen = new Date().toISOString();
        }

        io.emit(
          "users_status",
          Array.from(users.values()).map((u) => ({
            username: u.username,
            online: u.online,
            lastSeen: u.lastSeen,
          }))
        );
      }
    }
  });
  socket.on("avatarChange", ({ username, avatar }) => {
    if (!username || !avatar) return;
    avatars[username] = avatar; // guardar
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

  socket.on("typing", ({ to, scope }) => {
    // scope: 'room' or 'private'; to only used for private (username)
    if (scope === "room") {
      socket.broadcast.emit("typing", { from: socket.username, scope: "room" });
    } else if (scope === "private" && to) {
      const recipient = users.get(to);
      if (recipient) {
        recipient.sockets.forEach((sid) =>
          io.to(sid).emit("typing", {
            from: socket.username,
            scope: "private",
            fromUser: socket.username,
          })
        );
      }
    }
  });
});

// ✅ Servidor arrancando FUERA del bloque
server.listen(PORT, () => {
  console.log("🚀 Connecta server listening on", PORT);
  console.log("👉 Abre http://localhost:" + PORT + " en tu navegador");
});
