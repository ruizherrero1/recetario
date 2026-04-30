window.RECETARIO_FIREBASE_CONFIG = {
  apiKey: "AIzaSyBADC7lRWcvD_42hqskKkXXNiiNnMd4gvE",
  authDomain: "recetas-15610.firebaseapp.com",
  projectId: "recetas-15610",
  storageBucket: "recetas-15610.firebasestorage.app",
  messagingSenderId: "137712549509",
  appId: "1:137712549509:web:4c13d8eb6825ae650633ec",
  measurementId: "G-PD9MHMKKEM"
};

window.addEventListener("DOMContentLoaded", () => {
  installBranding();
  makeCookbookCodeVisible();
  returnToListAfterSave();

  window.setTimeout(() => {
    const savedCookbook = localStorage.getItem("recetario:lastCookbookCode");
    const unlockButton = document.querySelector("#unlockButton");
    const lockScreen = document.querySelector("#lockScreen");

    if (savedCookbook && unlockButton && lockScreen && !lockScreen.classList.contains("hidden")) {
      unlockButton.click();
    }
  }, 0);

  const importScript = document.createElement("script");
  importScript.src = "import-recipe.js?v=2";
  importScript.defer = true;
  document.body.appendChild(importScript);
});

function installBranding() {
  const iconHref = "apple-touch-icon.png";
  const head = document.head;

  if (!head.querySelector('link[rel="apple-touch-icon"]')) {
    const appleIcon = document.createElement("link");
    appleIcon.rel = "apple-touch-icon";
    appleIcon.href = iconHref;
    head.appendChild(appleIcon);
  }

  if (!head.querySelector('link[rel="icon"]')) {
    const favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.type = "image/svg+xml";
    favicon.href = "icon.svg";
    head.appendChild(favicon);
  }

  if (!head.querySelector("#recetario-branding-style")) {
    const style = document.createElement("style");
    style.id = "recetario-branding-style";
    style.textContent = `
      .app-logo {
        display: block;
        object-fit: contain;
      }

      .lock-logo {
        width: min(250px, 78vw);
        margin: 0 auto 10px;
      }

      .brand-row {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }

      .topbar-logo {
        width: 74px;
        height: 58px;
        flex: 0 0 auto;
      }
    `;
    head.appendChild(style);
  }

  const lockPanel = document.querySelector(".lock-panel");
  if (lockPanel && !lockPanel.querySelector(".lock-logo")) {
    const logo = document.createElement("img");
    logo.className = "app-logo lock-logo";
    logo.src = iconHref;
    logo.alt = "Recetas de Laura";
    lockPanel.querySelector("h1")?.before(logo);
  }

  const topbar = document.querySelector(".topbar");
  const titleBlock = topbar?.querySelector(":scope > div:not(.brand-row)");
  if (topbar && titleBlock && !topbar.querySelector(".topbar-logo")) {
    const row = document.createElement("div");
    row.className = "brand-row";

    const logo = document.createElement("img");
    logo.className = "app-logo topbar-logo";
    logo.src = iconHref;
    logo.alt = "Recetas de Laura";

    titleBlock.before(row);
    row.append(logo, titleBlock);
  }
}

function makeCookbookCodeVisible() {
  const input = document.querySelector("#cookbookCode");
  if (input) input.type = "text";
}

function returnToListAfterSave() {
  const form = document.querySelector("#recipeForm");
  const listButton = document.querySelector('[data-view="listView"]');
  if (!form || !listButton) return;

  form.addEventListener("submit", () => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      if (document.querySelector("#detailView.active")) {
        listButton.click();
        window.clearInterval(timer);
      }

      if (Date.now() - startedAt > 6000) {
        window.clearInterval(timer);
      }
    }, 120);
  });
}
