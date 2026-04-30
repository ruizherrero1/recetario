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
  installRecipeLinkField();
  makeCookbookCodeVisible();
  returnToListAfterSave();
  watchRecipeLinks();

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

let currentRecipeId = "";

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

      .recipe-source-link {
        color: #9d4423;
        font-weight: 800;
        overflow-wrap: anywhere;
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

function installRecipeLinkField() {
  const formGrid = document.querySelector(".form-grid");
  if (!formGrid || document.querySelector("#sourceUrlInput")) return;

  const field = document.createElement("label");
  field.className = "field";
  field.innerHTML = `
    <span>Link</span>
    <input id="sourceUrlInput" name="sourceUrl" type="url" placeholder="https://...">
  `;
  formGrid.appendChild(field);

  const sourceInput = document.querySelector("#sourceUrlInput");
  const linkModeInput = document.querySelector("#recipeUrl");

  sourceInput?.addEventListener("input", () => {
    if (linkModeInput) linkModeInput.value = sourceInput.value.trim();
  });

  linkModeInput?.addEventListener("input", () => {
    if (sourceInput) sourceInput.value = linkModeInput.value.trim();
  });

  document.addEventListener("click", (event) => {
    const editButton = event.target.closest?.('[data-action="edit"]');
    if (editButton) {
      window.setTimeout(syncVisibleLinkField, 0);
    }

    const importButton = event.target.closest?.("#importLinkButton, #parseTextButton, #importSingleRecipeButton");
    if (importButton) syncVisibleLinkFieldSoon();
  });

  document.querySelector("#recipeForm")?.addEventListener("submit", () => {
    if (sourceInput && linkModeInput) {
      linkModeInput.value = sourceInput.value.trim() || linkModeInput.value.trim();
    }
  }, true);
}

function syncVisibleLinkField() {
  const sourceInput = document.querySelector("#sourceUrlInput");
  const linkModeInput = document.querySelector("#recipeUrl");
  if (sourceInput && linkModeInput) sourceInput.value = linkModeInput.value.trim();
}

function syncVisibleLinkFieldSoon() {
  [0, 300, 900, 1800].forEach((delay) => {
    window.setTimeout(syncVisibleLinkField, delay);
  });
}

function watchRecipeLinks() {
  document.addEventListener("click", (event) => {
    const card = event.target.closest?.(".recipe-card");
    if (card?.dataset?.id) currentRecipeId = card.dataset.id;
  }, true);

  const detail = document.querySelector("#recipeDetail");
  if (!detail) return;

  const observer = new MutationObserver(() => {
    window.setTimeout(renderRecipeLink, 0);
  });
  observer.observe(detail, { childList: true, subtree: true });
}

function renderRecipeLink() {
  const detail = document.querySelector("#recipeDetail");
  if (!detail || detail.querySelector(".detail-link-line")) return;

  const recipe = findCurrentRecipe();
  const link = normalizeUrl(recipe?.sourceUrl || recipe?.link || "");
  if (!link) return;

  const line = document.createElement("div");
  line.className = "detail-line detail-link-line";
  line.innerHTML = `
    <span class="detail-label">Link</span>
    <div><a class="recipe-source-link" href="${escapeAttr(link)}" target="_blank" rel="noopener noreferrer">Abrir receta original</a></div>
  `;

  const timeLine = Array.from(detail.querySelectorAll(".detail-line"))
    .find((item) => item.textContent.trim().startsWith("Tiempo"));
  (timeLine || detail.querySelector(".detail-line"))?.after(line);
}

function findCurrentRecipe() {
  const recipes = readStoredRecipes();
  if (!recipes.length) return null;

  if (currentRecipeId) {
    const byId = recipes.find((recipe) => recipe.id === currentRecipeId);
    if (byId) return byId;
  }

  const title = document.querySelector("#recipeDetail h2")?.textContent?.trim();
  return recipes.find((recipe) => recipe.title === title) || null;
}

function readStoredRecipes() {
  const code = localStorage.getItem("recetario:lastCookbookCode");
  if (!code) return [];

  const existingKey = Object.keys(localStorage).find((key) =>
    key.startsWith("recetario:") && key.endsWith(":recipes")
  );
  if (!existingKey) return [];

  try {
    const recipes = JSON.parse(localStorage.getItem(existingKey) || "[]");
    return Array.isArray(recipes) ? recipes : [];
  } catch {
    return [];
  }
}

function normalizeUrl(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function escapeAttr(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
