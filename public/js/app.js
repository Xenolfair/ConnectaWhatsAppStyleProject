// app.js - client side logic for Connecta (no DB, in-memory on server)
document.addEventListener("DOMContentLoaded", () => {
  const avatars = {}; // mapa username -> avatarUrl
  const DEFAULT_AVATAR =
    "https://cdn-icons-png.flaticon.com/512/149/149071.png";
  const username = localStorage.getItem("connecta_username");
  const loginGate = document.getElementById("loginGate");
  const app = document.getElementById("app");
  const chatHistory = {}; // 🔹 Guardará el historial de cada chat
  const backgrounds = {};

  if (!username) return; // show login gate (handled by login.js)

  const socket = io();

  socket.on("connect", () => {
    socket.emit("join", { username });

    const myAvatar = localStorage.getItem("connecta_avatar_url");
    if (myAvatar && username) {
      socket.emit("avatarChange", { username, avatar: myAvatar });
    }
  });

  const usersListEl = document.getElementById("usersList");
  const messagesEl = document.getElementById("messages");
  const msgInput = document.getElementById("messageInput");
  const btnSend = document.getElementById("btnSend");
  const chatTitle = document.getElementById("chatTitle");

  let currentView = { type: "room", id: "GENERAL" };

  // -------------------- Envío de mensajes --------------------
  btnSend.addEventListener("click", () => {
    const text = msgInput.value.trim();
    if (!text) return;

    if (currentView.type === "room") {
      socket.emit("public_message", { content: text });
    } else if (currentView.type === "private") {
      socket.emit("private_message", { to: currentView.id, content: text });
    }
    msgInput.value = "";
  });

  // -------------------- Añadir mensajes --------------------
  function addMessage(msg, opts = { prepend: false }) {
    const el = document.createElement("div");
    el.className = "message " + (msg.from === username ? "me" : "other");
    const who = msg.from === username ? "Tú" : msg.from;
    el.innerHTML =
      '<div class="meta"><strong>' +
      escapeHtml(who) +
      "</strong> <small>" +
      new Date(msg.createdAt).toLocaleTimeString() +
      "</small></div>" +
      '<div class="content">' +
      escapeHtml(msg.content) +
      "</div>";

    if (opts.prepend) messagesEl.prepend(el);
    else messagesEl.appendChild(el);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // 🔹 Guardar historial del chat actual
    const chatId = currentView.type === "room" ? "GENERAL" : currentView.id;
    chatHistory[chatId] = messagesEl.innerHTML;

    el.dataset.msgId = msg.id;

    const rx = document.createElement("div");
    rx.className = "reactions";
    if (msg.reactions) {
      Object.entries(msg.reactions).forEach(([emoji, users]) => {
        if (users.length > 0) {
          const span = document.createElement("span");
          span.className = "reaction";
          span.textContent = `${emoji} ${users.length}`;
          rx.appendChild(span);
        }
      });
    }
    el.appendChild(rx);
  }

  messagesEl.addEventListener("click", (e) => {
    const msgEl = e.target.closest(".message");
    if (!msgEl) return;
    // abre un mini-panel de reacciones (simple prompt o menú)
    showReactionsMenu(msgEl);
  });

  function showReactionsMenu(msgEl) {
    // menú simple: emojis predefinidos
    const emojis = ["👍", "❤️", "😂", "🔥", "😮", "😢"];
    const menu = document.createElement("div");
    menu.className = "reaction-menu";
    menu.style.animation = "reactionPop 0.17s ease-out forwards";
    emojis.forEach((em) => {
      const btn = document.createElement("button");
      btn.textContent = em;
      btn.addEventListener("click", () => {
        const msgId = msgEl.dataset.msgId;
        // scope: deducir si es public o private
        const scope = currentView.type === "room" ? "public" : "private";
        const withUser =
          currentView.type === "private" ? currentView.id : undefined;
        socket.emit("react_message", { msgId, reaction: em, scope, withUser });
        menu.remove();
      });
      menu.appendChild(btn);
    });
    // posiciona el menú y añádelo al body
    document.body.appendChild(menu);
    const rect = msgEl.getBoundingClientRect();
    menu.style.position = "absolute";
    menu.style.left = `${rect.left}px`;
    menu.style.top = `${rect.top - 40}px`;
    // cerrar al click afuera
    setTimeout(
      () =>
        document.addEventListener("click", () => menu.remove(), { once: true }),
      10
    );
  }

  socket.on("users_status", (list) => {
    window.userStatusMap = {}; // global memoria
    list.forEach((u) => {
      window.userStatusMap[u.username] = {
        online: u.online,
        lastSeen: u.lastSeen,
      };
    });

    refreshUserListStatus();
  });

  function refreshUserListStatus() {
    const items = document.querySelectorAll(".user-item");

    items.forEach((item) => {
      const user = item.dataset.username;
      const status = window.userStatusMap[user];
      if (!status) return;

      let badge = item.querySelector(".status-badge");
      if (!badge) {
        badge = document.createElement("div");
        badge.className = "status-badge";
        item.appendChild(badge);
      }

      if (status.online) {
        badge.textContent = "🟢 En línea";
        badge.style.color = "green";
      } else {
        const date = new Date(status.lastSeen);
        badge.textContent = "🕓 Visto: " + date.toLocaleTimeString();
        badge.style.color = "gray";
      }
    });
  }

  socket.on("message_reaction_update", ({ scope, msgId, reactions, conv }) => {
    // buscar el mensaje por data-msgId (en messagesEl)
    const msgEl = messagesEl.querySelector(
      `.message[data-msg-id="${msgId}"], .message[data-msg-id='${msgId}']`
    );
    if (msgEl) {
      // actualizar contenedor .reactions
      let rx = msgEl.querySelector(".reactions");
      if (!rx) {
        rx = document.createElement("div");
        rx.className = "reactions";
        msgEl.appendChild(rx);
      }
      rx.innerHTML = ""; // limpiar
      Object.entries(reactions || {}).forEach(([emoji, users]) => {
        if (users.length) {
          const span = document.createElement("span");
          span.className = "reaction";
          span.textContent = `${emoji} ${users.length}`;
          rx.appendChild(span);
        }
      });
    }
  });

  function escapeHtml(text) {
    const d = document.createElement("div");
    d.textContent = text;
    return d.innerHTML;
  }

  // -------------------- Historial general --------------------
  socket.on("public_history", (history) => {
    messagesEl.innerHTML = "";
    history.forEach((m) => addMessage(m));
    chatHistory["GENERAL"] = messagesEl.innerHTML;
  });

  //------------------------ parte de backgrounds ----------------
  socket.on("backgrounds", (serverBackgrounds) => {
    Object.assign(backgrounds, serverBackgrounds);
    applyOtherUserBackgrounds();
  });

  socket.on("backgroundUpdate", ({ username: who, background }) => {
    backgrounds[who] = background;
    applyOtherUserBackgrounds();
  });

  function applyOtherUserBackgrounds() {
    const active = currentChatUser; // ya la tienes en tu app.js
    if (!active) return;

    // Si es chat privado, usar fondo del otro usuario
    const bg = backgrounds[active];
    if (bg) {
      chatBody.style.backgroundImage = `url('${bg}')`;
      chatBody.style.backgroundSize = "cover";
      chatBody.style.backgroundPosition = "center";
    }
  }

  // -------------------- Sistema de burbujas --------------------
  const unreadCounts = {};

  function incrementUnread(chatId) {
    if (!unreadCounts[chatId]) unreadCounts[chatId] = 0;
    unreadCounts[chatId]++;
    updateUnreadBubble(chatId);
  }

  function clearUnread(chatId) {
    unreadCounts[chatId] = 0;
    updateUnreadBubble(chatId);
  }

  function updateUnreadBubble(chatId) {
    const userItem = document.querySelector(
      `.user-item[data-username="${chatId}"]`
    );
    const generalItem = document.getElementById("room-general");
    const target = chatId === "GENERAL" ? generalItem : userItem;
    if (!target) return;

    let bubble = target.querySelector(".unread-bubble");
    if (!bubble) {
      bubble = document.createElement("span");
      bubble.className = "unread-bubble";
      target.appendChild(bubble);
    }

    const count = unreadCounts[chatId] || 0;
    bubble.textContent = count > 0 ? count : "";
    bubble.style.display = count > 0 ? "inline-block" : "none";
  }

  // -------------------- Mensajes públicos --------------------
  socket.on("new_public_message", (msg) => {
    if (currentView.type === "room" && currentView.id === "GENERAL") {
      addMessage(msg);
    } else {
      incrementUnread("GENERAL");
      console.log("nuevo en general", msg);
    }
  });

  // -------------------- Mensajes privados --------------------
  socket.on("new_private_message", (msg) => {
    const convWith = msg.from === username ? msg.to : msg.from;
    if (currentView.type === "private" && currentView.id === convWith) {
      addMessage(msg);
    } else {
      incrementUnread(convWith);
      console.log("mensaje privado", msg);
    }
  });

  // -------------------- Lista de usuarios --------------------
  socket.on("users", (users) => {
    usersListEl.innerHTML = "";
    users.forEach((u) => {
      if (u === username) return;
      const item = document.createElement("div");
      item.className = "user-item";

      // ✅ Añadir imagen circular por defecto al lado del nombre
      const img = document.createElement("img");
      img.src = avatars[u] || DEFAULT_AVATAR;
      img.alt = u;
      img.style.width = "35px";
      img.style.height = "35px";
      img.style.borderRadius = "50%";
      img.style.objectFit = "cover";
      img.style.marginRight = "10px";
      img.style.border = "2px solid var(--accent)";

      const name = document.createElement("span");
      name.textContent = u;

      // Contenedor interno (imagen + texto)
      const container = document.createElement("div");
      container.style.display = "flex";
      container.style.alignItems = "center";
      container.appendChild(img);
      container.appendChild(name);

      item.appendChild(container);
      item.dataset.username = u;
      item.addEventListener("click", () => openPrivateChat(u));
      usersListEl.appendChild(item);

      updateUnreadBubble(u); // 🔹 mantener el contador si ya había mensajes nuevos
    });
  });

  socket.on("avatars", (serverAvatars) => {
    // serverAvatars es un objeto { username: avatarUrl, ... }
    Object.assign(avatars, serverAvatars);
    // re-render de la lista de usuarios si está visible
    // Simula re-emisión de users para refrescar
    const event = new Event("refreshUsers");
    document.dispatchEvent(event);
  });

  // recibir actualización puntual
  socket.on("avatarUpdate", ({ username: who, avatar }) => {
    avatars[who] = avatar;
    // actualizar la imagen si el usuario está en la lista
    const img = document.querySelector(
      `.user-item[data-username="${who}"] img`
    );
    if (img) img.src = avatar;
  });

  document.addEventListener("refreshUsers", () => {
    // solicitar re-render: emitir 'users' cache desde el servidor no es necesario
    // simplemente re-triggerear el mismo handler (si tienes la lista en memoria)
    // Si no mantienes la lista en memoria, puedes pedir una re-emisión simple:
    socket.emit("request_users");
  });
  // -------------------- Abrir chat privado --------------------
  function openPrivateChat(userTo) {
    const prevChatId = currentView.type === "room" ? "GENERAL" : currentView.id;
    chatHistory[prevChatId] = messagesEl.innerHTML;

    currentView = { type: "private", id: userTo };
    chatTitle.textContent = userTo;
    clearUnread(userTo);

    if (chatHistory[userTo]) {
      messagesEl.innerHTML = chatHistory[userTo];
    } else {
      messagesEl.innerHTML = "";
      socket.emit("get_private_history", { with: userTo });
    }

    applyOtherUserBackgrounds();
  }

  // -------------------- Historial privado --------------------
  socket.on("private_history", (data) => {
    if (currentView.type === "private" && currentView.id === data.with) {
      messagesEl.innerHTML = "";
      data.history.forEach((m) => addMessage(m));
      chatHistory[data.with] = messagesEl.innerHTML;
    }
  });

  // -------------------- Volver al chat general --------------------
  document.getElementById("room-general").addEventListener("click", () => {
    const prevChatId = currentView.type === "room" ? "GENERAL" : currentView.id;
    chatHistory[prevChatId] = messagesEl.innerHTML;

    currentView = { type: "room", id: "GENERAL" };
    chatTitle.textContent = "# General";
    clearUnread("GENERAL");

    if (chatHistory["GENERAL"]) {
      messagesEl.innerHTML = chatHistory["GENERAL"];
    } else {
      messagesEl.innerHTML = "";
      socket.emit("request_public_history");
    }
  });

  // 🔹 Fondo de chat desde localStorage o predeterminado
  const savedBg = localStorage.getItem("connecta_bg_url");
  const root = document.documentElement;
  if (savedBg) {
    root.style.setProperty("--bg-url", `url("${savedBg}")`);
  } else {
    root.style.setProperty(
      "--bg-url",
      'url("https://i.pinimg.com/1200x/25/bd/14/25bd1438b5fb08237273ca3917e8cdb5.jpg")'
    );
  }
});

// Botón para ir a cambiar fondo
document.getElementById("btnChangeBg").addEventListener("click", () => {
  window.location.href = "background.html";
});

// Cargar fondo y avatar guardados
window.addEventListener("DOMContentLoaded", () => {
  const savedBg = localStorage.getItem("connecta_bg_url");
  if (savedBg) {
    document.body.style.backgroundImage = `url(${savedBg})`;
    document.body.style.backgroundSize = "cover";
    document.body.style.backgroundPosition = "center";
  }

  const savedAvatar = localStorage.getItem("connecta_avatar_url");
  if (savedAvatar) {
    const myAvatar = document.getElementById("userAvatar");
    if (myAvatar) myAvatar.src = savedAvatar;
  }
});

let typingTimeout;
msgInput.addEventListener("input", () => {
  const scope = currentView.type === "room" ? "room" : "private";
  const to = currentView.type === "private" ? currentView.id : undefined;
  socket.emit("typing", { to, scope });

  // opcional: detener envío continuo (debounce)
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    socket.emit("typing_stop", { to, scope });
  }, 1500);
});

const typingIndicatorEl = document.createElement("div");
typingIndicatorEl.id = "typingIndicator";
typingIndicatorEl.style.padding = "6px 12px";
typingIndicatorEl.style.fontStyle = "italic";
typingIndicatorEl.style.color = "#666";
document.querySelector(".chat-header").appendChild(typingIndicatorEl);

socket.on("typing", ({ from, scope }) => {
  // mostrar solo si corresponde a la vista actual
  if (scope === "room" && currentView.type === "room") {
    typingIndicatorEl.textContent = `${from} está escribiendo...`;
  } else if (
    scope === "private" &&
    currentView.type === "private" &&
    currentView.id === from
  ) {
    typingIndicatorEl.textContent = `${from} está escribiendo...`;
  }
});

socket.on("typing_stop", ({ from }) => {
  if (typingIndicatorEl) typingIndicatorEl.textContent = "";
});
// Actualizar si cambia el localStorage
window.addEventListener("storage", (e) => {
  if (e.key === "connecta_bg_url") {
    document.body.style.backgroundImage = `url(${e.newValue})`;
  }
  if (e.key === "connecta_avatar_url") {
    const myAvatar = document.getElementById("userAvatar");
    if (myAvatar) myAvatar.src = e.newValue;
  }
});
