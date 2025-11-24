// login.js - manages simple username login stored in localStorage
document.addEventListener("DOMContentLoaded", () => {
  const stored = localStorage.getItem("connecta_username");
  const loginGate = document.getElementById("loginGate");
  const app = document.getElementById("app");
  const usernameInputGate = document.getElementById("usernameInputGate");
  const enterBtnGate = document.getElementById("enterBtnGate");
  const meName = document.getElementById("meName");

  function showLogin() {
    loginGate.style.display = "flex";
    /*app.style.display = "none";*/
  }

  function showApp() {
    loginGate.style.display = "none";
    /*app.style.display = "block";*/
  }

  if (!stored) {
    showLogin();
  } else {
    document.getElementById("meName").textContent = stored;
    showApp();
  }

  enterBtnGate.addEventListener("click", () => {
    const v = usernameInputGate.value.trim();
    if (!v) return alert("Ingresa un nombre de usuario");
    localStorage.setItem("connecta_username", v);
    document.getElementById("meName").textContent = v;
    showApp();
    // reload to init socket with username
    location.reload();
  });
});
