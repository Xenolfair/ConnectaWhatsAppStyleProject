Connecta - WhatsApp Web style chat (simple demo)
===============================================

What it includes
- Node.js server (Express + Socket.io) - server.js
- Static client (HTML/CSS/JS) under /public
- Login uses a simple username stored in localStorage (no passwords)
- Public "General" room and private 1-to-1 chats
- No database: messages are kept in memory (server restart clears history)

How to run
1. Extract the project.
2. Install dependencies:
   npm install
3. Start server:
   node server.js
4. Open http://localhost:4000 in your browser.
5. Open multiple browser windows or different browsers to simulate multiple users.
