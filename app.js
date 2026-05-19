const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  cookbookId: "",
  recipes: [],
  activeRecipeId: "",
  folderFilter: "",
  sortMode: localStorage.getItem("recetario:sortMode") || "updatedDesc",
  drive: {
    accessToken: "",
    tokenClient: null,
    ready: false,
    syncing: false,
    requestSilent: false,
    fileIds: new Map(),
    fileChoices: new Map(),
    lastReadAt: localStorage.getItem("recetario:drive:lastReadAt") || "",
    lastWriteAt: localStorage.getItem("recetario:drive:lastWriteAt") || "",
    lastBackupAt: localStorage.getItem("recetario:drive:lastBackupAt") || "",
    lastError: localStorage.getItem("recetario:drive:lastError") || "",
    lastDuplicateCount: Number(localStorage.getItem("recetario:drive:lastDuplicateCount") || 0),
    pendingUploads: 0
  }
};

const RECIPE_SCHEMA_VERSION = 2;
const GENERATED_ID = /^[a-f0-9]{20}$/i;
const driveScope = "https://www.googleapis.com/auth/drive";
const driveConfig = () => window.RECETARIO_DRIVE_CONFIG || {};
const localKey = () => `recetario:${state.cookbookId}:recipes`;
const deviceId = getDeviceId();

const CARD_IMG_SALADO = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#f3e4d0"/>
  <ellipse cx="200" cy="210" rx="118" ry="18" fill="rgba(35,47,62,.18)"/>
  <circle cx="200" cy="150" r="96" fill="#e4c08b"/>
  <circle cx="200" cy="150" r="82" fill="#fff7e8"/>
  <ellipse cx="182" cy="148" rx="28" ry="20" fill="#bf5a30"/>
  <ellipse cx="218" cy="152" rx="26" ry="19" fill="#d47a3f"/>
  <path d="M152 124c18-18 31-2 44-12 15-11 30-3 47 10" fill="none" stroke="#4d7c5e" stroke-width="7" stroke-linecap="round"/>
  <path d="M170 136c22-14 39-6 61-10" fill="none" stroke="#77a56f" stroke-width="5" stroke-linecap="round"/>
</svg>`)}`;

const CARD_IMG_POSTRE = `data:image/svg+xml,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300">
  <rect width="400" height="300" fill="#fde8d8"/>
  <ellipse cx="200" cy="220" rx="115" ry="16" fill="rgba(35,47,62,.16)"/>
  <path d="M118 202 200 102l82 100c-46 18-115 18-164 0Z" fill="#e8a15d"/>
  <path d="M126 194 200 106l74 88c-46 10-101 10-148 0Z" fill="#fff0da"/>
  <path d="M130 196c48 18 94 18 140 0" fill="none" stroke="#b84d28" stroke-width="9" stroke-linecap="round"/>
  <circle cx="176" cy="170" r="8" fill="#8b1a1a"/>
  <circle cx="202" cy="158" r="8" fill="#8b1a1a"/>
  <circle cx="228" cy="170" r="8" fill="#8b1a1a"/>
  <path d="M190 126c-6-28 8-34 0-56" fill="none" stroke="#4d7c5e" stroke-width="5" stroke-linecap="round"/>
  <ellipse cx="192" cy="66" rx="10" ry="15" fill="#4d7c5e"/>
</svg>`)}`;

const CARPETAS = [
  { id: "Carne", color: "#d4613a", bg: "#fdf0eb",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="20" cy="11" r="8"/><path d="M14 17L5 26"/><circle cx="4.5" cy="26.5" r="2.5" fill="currentColor" stroke="none"/></svg>` },
  { id: "Pescado", color: "#3a85c4", bg: "#e8f3fd",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 16C9 10 15 7 22 9C28 11 28 16 28 16C28 16 28 21 22 23C15 25 9 22 7 16Z"/><path d="M7 16L2 11M7 16L2 21"/><circle cx="24" cy="13.5" r="1.5" fill="currentColor" stroke="none"/></svg>` },
  { id: "Mariscos", color: "#3ab0a0", bg: "#e0f5f2",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M4 10Q10 6 16 10Q22 14 28 10"/><path d="M4 16Q10 12 16 16Q22 20 28 16"/><path d="M4 22Q10 18 16 22Q22 26 28 22"/></svg>` },
  { id: "Verduras", color: "#4d9e5a", bg: "#e5f5ea",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 27C16 27 6 20 6 13A10 10 0 0 1 26 13C26 20 16 27 16 27Z"/><line x1="16" y1="27" x2="16" y2="14"/><path d="M16 22L11 18"/><path d="M16 19L21 15"/></svg>` },
  { id: "Arroz", color: "#e09040", bg: "#fdf5e8",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 14H26L24 27H8Z"/><path d="M4 14Q16 5 28 14"/></svg>` },
  { id: "Pasta", color: "#c04e22", bg: "#f5e8e3",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 17H26L24 27H8Z"/><line x1="4" y1="17" x2="28" y2="17"/><path d="M10 13Q11 10 10 7"/><path d="M16 12Q17 9 16 6"/><path d="M22 13Q23 10 22 7"/></svg>` },
  { id: "Legumbres", color: "#9b59b6", bg: "#f3e8f8",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="16" cy="16" r="12" stroke-dasharray="4 3"/><circle cx="11" cy="16" r="3.5" fill="currentColor" stroke="none"/><circle cx="21" cy="16" r="3.5" fill="currentColor" stroke="none"/></svg>` },
  { id: "Sopas y cremas", color: "#4d9e7a", bg: "#e0f5ec",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 18H27L25 28H7Z"/><line x1="3" y1="18" x2="29" y2="18"/><path d="M10 14Q12 11 10 8"/><path d="M16 13Q18 10 16 7"/><path d="M22 14Q24 11 22 8"/></svg>` },
  { id: "Huevos", color: "#e0a83a", bg: "#fdf6e3",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4C10 4 7 10 7 17A9 9 0 0 0 25 17C25 10 22 4 16 4Z"/></svg>` },
  { id: "Bocadillos", color: "#c07a3a", bg: "#f5ede3",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12C3 8 7 6 16 6C25 6 29 8 29 12V14H3Z"/><rect x="3" y="14" width="26" height="5" rx="0"/><path d="M3 19H29V22C29 26 25 26 16 26C7 26 3 26 3 22Z"/></svg>` },
  { id: "Tapas y aperitivos", color: "#e0587a", bg: "#fde8ef",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><ellipse cx="16" cy="22" rx="13" ry="4"/><circle cx="9" cy="15" r="3" fill="currentColor" stroke="none"/><circle cx="16" cy="13" r="3" fill="currentColor" stroke="none"/><circle cx="23" cy="15" r="3" fill="currentColor" stroke="none"/></svg>` },
  { id: "Postres", color: "#e05870", bg: "#fde8ed",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 25L16 8L25 25Z"/><line x1="7" y1="25" x2="25" y2="25"/><circle cx="12" cy="21" r="2" fill="currentColor" stroke="none"/><circle cx="16" cy="19" r="2" fill="currentColor" stroke="none"/><circle cx="20" cy="21" r="2" fill="currentColor" stroke="none"/><line x1="15" y1="8" x2="15" y2="4"/><circle cx="15" cy="3" r="1.5" fill="currentColor" stroke="none"/></svg>` },
  { id: "Repostería", color: "#3a3a4a", bg: "#eaeaee",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="10" y1="5" x2="10" y2="27"/><path d="M7 5V13C7 13 7 16 10 16C13 16 13 13 13 13V5"/><line x1="22" y1="5" x2="22" y2="27"/><path d="M18 5L22 10L26 5"/></svg>` },
  { id: "Bebidas", color: "#3a5bd9", bg: "#e8edfd",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 5H22L19 18C19 22 18 24 16 24C14 24 13 22 13 18Z"/><line x1="10" y1="5" x2="22" y2="5"/><line x1="16" y1="24" x2="16" y2="28"/><line x1="11" y1="28" x2="21" y2="28"/></svg>` },
  { id: "Salsas", color: "#3a9e8c", bg: "#e0f3f1",
    svg: `<svg viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 4C16 4 5 15 5 21A11 11 0 0 0 27 21C27 15 16 4 16 4Z"/><path d="M11 23C11 23 12 26 16 26"/></svg>` },
];

bindEvents();

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.addEventListener("controllerchange", () => location.reload());
  navigator.serviceWorker.register("./sw.js").then((registration) => {
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
    registration.update?.();
  }).catch(() => {});
}

const savedCookbook = localStorage.getItem("recetario:lastCookbookCode");
if (savedCookbook) {
  $("#cookbookCode").value = savedCookbook;
  unlock();
} else {
  // Show recipe count from localStorage before unlocking
  (function showLockCount() {
    const el = $("#lockRecipeCount");
    if (!el) return;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith("recetario:recipes:")) {
        try { total += JSON.parse(localStorage.getItem(key) || "[]").length; } catch {}
      }
    }
    if (total > 0) el.textContent = `${total} receta${total === 1 ? "" : "s"} guardada${total === 1 ? "" : "s"}`;
  })();
}

function bindEvents() {
  $("#unlockButton")?.addEventListener("click", unlock);
  $("#cookbookCode")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") unlock();
  });
  $("#backButton")?.addEventListener("click", handleBack);
  $("#settingsButton")?.addEventListener("click", openSettings);
  $("#changeCodeButton")?.addEventListener("click", changeCode);
  $("#exportButton")?.addEventListener("click", exportBackup);
  $("#importBackupInput")?.addEventListener("change", importBackup);
  $("#driveConnectButton")?.addEventListener("click", () => connectGoogleDrive());
  $("#driveRefreshButton")?.addEventListener("click", () => refreshFromDrive(true));
  $("#driveExportButton")?.addEventListener("click", () => exportRecipesToDrive(state.recipes));
  $("#driveRepairButton")?.addEventListener("click", repairDriveDuplicates);
  $("#searchInput")?.addEventListener("input", renderList);
  $("#categoryFilter")?.addEventListener("change", renderList);
  $("#sortSelect")?.addEventListener("change", updateSortMode);
  $("#recipeUrl")?.addEventListener("input", () => {
    const sourceUrlInput = $("#sourceUrlInput");
    if (sourceUrlInput) sourceUrlInput.value = $("#recipeUrl").value.trim();
  });
  $("#sourceUrlInput")?.addEventListener("input", () => {
    const recipeUrl = $("#recipeUrl");
    if (recipeUrl) recipeUrl.value = $("#sourceUrlInput").value.trim();
  });
  $("#recipeForm")?.addEventListener("submit", saveRecipeFromForm);
  $("#cancelEditButton")?.addEventListener("click", resetForm);
  $("#recipePhotoInput")?.addEventListener("change", handlePhotoPick);
  $("#recipePhotoClear")?.addEventListener("click", clearRecipePhoto);
  $("#cookCloseButton")?.addEventListener("click", closeCookMode);
  $("#cookPrevButton")?.addEventListener("click", () => moveCookStep(-1));
  $("#cookNextButton")?.addEventListener("click", () => moveCookStep(1));
  $("#cookIngredientsButton")?.addEventListener("click", openIngredientsPanel);
  $("#cookIngredientsClose")?.addEventListener("click", closeIngredientsPanel);
  $("#cookIngredientsBackdrop")?.addEventListener("click", closeIngredientsPanel);
  $("#runOcrButton")?.addEventListener("click", runOcr);
  $("#importLinkButton")?.addEventListener("click", importFromLink);
  $("#parseTextButton")?.addEventListener("click", () => fillFormFromText($("#pastedRecipeText")?.value || "", $("#recipeUrl")?.value || ""));
  $("#startVoiceButton")?.addEventListener("click", startVoice);
  $("#stopVoiceButton")?.addEventListener("click", stopVoice);
  $("#parseVoiceButton")?.addEventListener("click", () => fillFormFromText($("#voiceText")?.value || ""));
  $$(".nav-button").forEach((button) => button.addEventListener("click", () => {
    const view = button.dataset.view;
    if (view === "listView" || view === "foldersView") state.folderFilter = "";
    showView(view);
    if (view === "listView") renderList();
  }));

  const picker = $("#carpetasPicker");
  if (picker) {
    picker.innerHTML = CARPETAS.map((c) =>
      `<label class="carpeta-chip" style="--chip-color:${c.color};--chip-bg:${c.bg}">
        <input type="checkbox" name="carpetas" value="${escapeAttr(c.id)}">
        <span>${escapeHtml(c.id)}</span>
      </label>`
    ).join("");
  }
  $$(".mode-tab").forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
  window.addEventListener("beforeprint", () => showView("detailView", false));
  if ($("#sortSelect")) $("#sortSelect").value = state.sortMode;
}

async function unlock() {
  const code = $("#cookbookCode").value.trim();
  if (code.length < 6) {
    $("#lockMessage").textContent = "Usa un codigo de al menos 6 caracteres.";
    return;
  }

  $("#lockMessage").textContent = "Abriendo recetario...";
  state.cookbookId = await sha256(`recetario:${code}`);
  localStorage.setItem("recetario:lastCookbookCode", code);
  $("#lockScreen")?.classList.add("hidden");
  $("#appShell")?.classList.remove("hidden");

  loadLocalRecipes();
  renderAll();
  setSyncStatus("Recetario local cargado. Conecta Drive para sincronizar.");
  setTimeout(() => connectGoogleDrive({ silent: true }), 300);
}

function loadLocalRecipes() {
  try {
    state.recipes = normalizeRecipes(JSON.parse(localStorage.getItem(localKey()) || "[]"));
    saveLocalRecipes();
  } catch {
    state.recipes = [];
  }
}

function saveLocalRecipes() {
  state.recipes = normalizeRecipes(state.recipes);
  try {
    localStorage.setItem(localKey(), JSON.stringify(state.recipes));
  } catch (error) {
    console.error(error);
    setSyncStatus("No queda espacio local para guardar todo. Revisa fotos o exporta copia.");
  }
}

function visibleRecipes() {
  return state.recipes.filter((recipe) => !recipe.deletedAt);
}

async function saveRecipe(recipe) {
  const normalizedRecipe = normalizeImportedRecipe(recipe);
  normalizedRecipe.updatedAt = new Date().toISOString();
  normalizedRecipe.updatedBy = deviceId;
  const previous = state.recipes.find((item) => sameRecipeIdentity(item, normalizedRecipe));
  normalizedRecipe.revision = (Number(previous?.revision) || Number(normalizedRecipe.revision) || 0) + 1;
  const index = state.recipes.findIndex((item) => sameRecipeIdentity(item, normalizedRecipe));
  if (index >= 0) {
    const picked = pickNewestRecipe(state.recipes[index], normalizedRecipe);
    picked.id = state.recipes[index].id;
    state.recipes[index] = picked;
  } else {
    state.recipes.unshift(normalizedRecipe);
  }
  saveLocalRecipes();
  renderAll();

  if (state.drive.ready) {
    try {
      await writeRecipeToDrive(normalizedRecipe);
    } catch {
      setSyncStatus("Guardada en este movil. Pendiente de subir a Drive.");
    }
  }
}

async function deleteRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !confirm(`Eliminar "${recipe.title}"?`)) return;

  try {
    await createDriveBackup("antes-de-eliminar", state.recipes, false);
  } catch (error) {
    console.warn("No se pudo crear backup antes de eliminar", error);
  }
  const now = new Date().toISOString();
  const tombstone = {
    ...normalizeImportedRecipe(recipe),
    deletedAt: now,
    updatedAt: now,
    updatedBy: deviceId,
    revision: (Number(recipe.revision) || 0) + 1
  };
  state.recipes = state.recipes.filter((item) => item.id !== recipeId);
  state.recipes.push(tombstone);
  saveLocalRecipes();
  renderAll();
  showView("listView");

  if (state.drive.ready) {
    try {
      await writeRecipeToDrive(tombstone);
      setSyncStatus("Eliminada tambien de Drive.");
    } catch {
      setSyncStatus("Eliminada en este movil. Revisa Drive cuando vuelvas a conectar.");
    }
  }
}

async function saveRecipeFromForm(event) {
  event.preventDefault();
  const editingId = $("#editingId").value;
  const previous = state.recipes.find((item) => item.id === editingId);
  const title = $("#titleInput").value.trim();
  const recipe = {
    id: editingId || uniqueRecipeId(title),
    title,
    carpetas: $$('input[name="carpetas"]:checked').map((cb) => cb.value),
    categories: splitList($("#categoriesInput").value),
    tags: splitList($("#tagsInput").value),
    time: $("#timeInput").value.trim(),
    ingredients: splitLines($("#ingredientsInput").value),
    steps: $("#stepsInput").value.trim(),
    notes: $("#notesInput").value.trim(),
    sourceUrl: normalizeUrlForStorage($("#sourceUrlInput")?.value || $("#recipeUrl")?.value),
    photo: state.editingPhoto !== undefined ? state.editingPhoto : (previous?.photo || ""),
    createdAt: previous?.createdAt || new Date().toISOString()
  };

  const duplicate = findDuplicateRecipe(recipe);
  if (duplicate && !confirm(`Ya existe una receta parecida: "${duplicate.title}". Actualizarla?`)) return;

  await saveRecipe(recipe);
  resetForm();
  state.activeRecipeId = "";
  showView("listView");
}

function renderAll() {
  renderCategoryFilter();
  renderList();
  renderFoldersView();
  if (state.activeRecipeId && visibleRecipes().some((recipe) => recipe.id === state.activeRecipeId)) {
    renderDetail(state.activeRecipeId);
  } else {
    state.activeRecipeId = "";
  }
}

function renderCategoryFilter() {
  const select = $("#categoryFilter");
  if (!select) return;
  const current = select.value;
  const categories = [...new Set(visibleRecipes().flatMap((recipe) => recipe.categories || []))].sort(localeSort);
  select.innerHTML = `<option value="">Todas</option>${categories.map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join("")}`;
  select.value = categories.includes(current) ? current : "";
}

function renderList() {
  const list = $("#recipesList");
  if (!list) return;

  const folderHeader = $("#folderHeader");
  if (folderHeader) {
    if (state.folderFilter) {
      const carpeta = CARPETAS.find((c) => c.id === state.folderFilter);
      const count = visibleRecipes().filter((r) => (r.carpetas || []).includes(state.folderFilter)).length;
      folderHeader.innerHTML = `
        <div class="folder-header-content" style="--folder-color:${carpeta?.color || "var(--brand)"}">
          <span class="folder-header-icon">${carpeta?.svg || ""}</span>
          <span class="folder-header-name">${escapeHtml(state.folderFilter)}</span>
          <span class="folder-header-count">${count} receta${count !== 1 ? "s" : ""}</span>
        </div>`;
      folderHeader.classList.remove("hidden");
    } else {
      folderHeader.classList.add("hidden");
    }
  }

  const query = normalize($("#searchInput")?.value || "");
  const category = $("#categoryFilter")?.value || "";
  const filtered = visibleRecipes().filter((recipe) => {
    if (state.folderFilter && !(recipe.carpetas || []).includes(state.folderFilter)) return false;
    const haystack = normalize([
      recipe.title,
      recipe.time,
      ...(recipe.categories || []),
      ...(recipe.tags || []),
      ...(recipe.ingredients || []),
      recipe.steps,
      recipe.notes,
      recipe.sourceUrl
    ].join(" "));
    return (!query || haystack.includes(query)) && (!category || (recipe.categories || []).includes(category));
  });

  list.innerHTML = sortRecipes(filtered).map(recipeCard).join("");
  const isEmpty = state.folderFilter ? filtered.length === 0 : visibleRecipes().length === 0;
  $("#emptyState")?.classList.toggle("hidden", !isEmpty);
  list.querySelectorAll(".recipe-card").forEach((card) => {
    card.addEventListener("click", () => openRecipe(card.dataset.id));
  });
}

function recipeCard(recipe) {
  const carpetaId = (recipe.carpetas || [])[0] || null;
  const carpeta = CARPETAS.find(c => c.id === carpetaId);
  const bg = carpeta ? carpeta.bg : "#f3e4d0";
  const color = carpeta ? carpeta.color : "#8a6a50";
  const label = carpeta ? carpeta.id : "Sin carpeta";
  const icon = carpeta
    ? carpeta.svg.replace("<svg ", `<svg width="64" height="64" style="color:${color}" `)
    : `<svg width="64" height="64" viewBox="0 0 32 32" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round"><rect x="4" y="8" width="24" height="18" rx="3"/><path d="M4 12h24"/></svg>`;
  const imgBlock = recipe.photo
    ? `<img class="card-img" src="${escapeAttr(recipe.photo)}" alt="${escapeAttr(recipe.title)}" loading="lazy">`
    : `<div class="card-img-folder" style="background:${bg};">${icon}</div>`;
  return `
    <button class="recipe-card" data-id="${escapeAttr(recipe.id)}">
      <div class="card-img-wrap">
        ${imgBlock}
        <span class="card-type-badge" style="background:${color};color:#fff;">${label}</span>
      </div>
      <div class="card-body">
        <h2>${escapeHtml(recipe.title)}</h2>
        <div class="card-meta">${recipe.time ? `<span class="chip chip-time">${escapeHtml(recipe.time)}</span>` : ""}</div>
      </div>
    </button>
  `;
}

function openRecipe(recipeId) {
  state.activeRecipeId = recipeId;
  renderDetail(recipeId);
  showView("detailView");
}

function renderDetail(recipeId) {
  const recipe = visibleRecipes().find((item) => item.id === recipeId);
  const detail = $("#recipeDetail");
  if (!recipe || !detail) return;
  const carpetaId = (recipe.carpetas || [])[0] || null;
  const carpeta = CARPETAS.find(c => c.id === carpetaId);
  const heroBg = carpeta ? carpeta.bg : "#f3e4d0";
  const heroColor = carpeta ? carpeta.color : "#8a6a50";
  const heroIcon = carpeta
    ? carpeta.svg.replace("<svg ", `<svg width="72" height="72" style="color:${heroColor}" `)
    : "";
  const heroHtml = recipe.photo
    ? `<div class="detail-hero detail-hero-photo" style="background-image:url('${escapeAttr(recipe.photo)}');">${carpeta ? `<span class="detail-hero-label" style="background:${heroColor};">${escapeHtml(carpetaId)}</span>` : ""}</div>`
    : (heroIcon ? `<div class="detail-hero" style="background:${heroBg};">${heroIcon}<span class="detail-hero-label" style="background:${heroColor};">${escapeHtml(carpetaId)}</span></div>` : "");
  detail.innerHTML = `
    ${heroHtml}
    <h2>${escapeHtml(recipe.title)}</h2>
    <div class="detail-line">
      <span class="detail-label">Categoria</span>
      <div class="chip-row">${(recipe.categories || []).map((category) => `<span class="chip">${escapeHtml(category)}</span>`).join("") || "Sin categoria"}</div>
    </div>
    <div class="detail-line">
      <span class="detail-label">Tiempo</span>
      <div>${escapeHtml(recipe.time || "Sin tiempo indicado")}</div>
    </div>
    ${recipe.sourceUrl ? `<div class="detail-line"><span class="detail-label">Link</span><div><a class="recipe-source-link" href="${escapeAttr(normalizeUrlForOpen(recipe.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl(recipe.sourceUrl))}</a></div></div>` : ""}
    ${(recipe.tags || []).length ? `<div class="detail-line"><span class="detail-label">Etiquetas</span><div class="chip-row">${recipe.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div></div>` : ""}
    <section class="detail-section"><h3>Ingredientes</h3><ul class="ingredients-list">${(recipe.ingredients || []).map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("")}</ul></section>
    <section class="detail-section"><h3>Receta</h3><div class="steps-text">${escapeHtml(recipe.steps || "")}</div></section>
    ${recipe.notes ? `<section class="detail-section"><h3>Notas</h3><div class="notes-text">${escapeHtml(recipe.notes)}</div></section>` : ""}
    <div class="detail-actions">
      <button class="primary-button" data-action="cook">🍳 Cocinar</button>
      <button class="secondary-button" data-action="print">PDF</button>
      <button class="secondary-button" data-action="edit">Editar</button>
      <button class="ghost-button" data-action="delete">Eliminar</button>
    </div>
  `;
  detail.querySelector('[data-action="cook"]')?.addEventListener("click", () => openCookMode(recipe.id));
  detail.querySelector('[data-action="print"]')?.addEventListener("click", () => print());
  detail.querySelector('[data-action="edit"]')?.addEventListener("click", () => editRecipe(recipe.id));
  detail.querySelector('[data-action="delete"]')?.addEventListener("click", () => deleteRecipe(recipe.id));
}

function editRecipe(recipeId) {
  const recipe = visibleRecipes().find((item) => item.id === recipeId);
  if (!recipe) return;
  $("#editingId").value = recipe.id;
  $("#titleInput").value = recipe.title || "";
  $("#categoriesInput").value = (recipe.categories || []).join(", ");
  $("#tagsInput").value = (recipe.tags || []).join(", ");
  $("#timeInput").value = recipe.time || "";
  $("#ingredientsInput").value = (recipe.ingredients || []).join("\n");
  $("#stepsInput").value = recipe.steps || "";
  $("#notesInput").value = recipe.notes || "";
  if ($("#sourceUrlInput")) $("#sourceUrlInput").value = recipe.sourceUrl || "";
  $$('input[name="carpetas"]').forEach((cb) => { cb.checked = (recipe.carpetas || []).includes(cb.value); });
  state.editingPhoto = recipe.photo || "";
  showPhotoPreview(recipe.photo || "");
  $("#cancelEditButton")?.classList.remove("hidden");
  showView("addView");
}

function resetForm() {
  $("#recipeForm")?.reset();
  $("#editingId").value = "";
  $$('input[name="carpetas"]').forEach((cb) => { cb.checked = false; });
  state.editingPhoto = undefined;
  showPhotoPreview("");
  $("#cancelEditButton")?.classList.add("hidden");
  setMode("manual");
}

function showView(viewId, updateNav = true) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  if (updateNav) {
    const activeNav = (viewId === "listView" && state.folderFilter) ? "foldersView" : viewId;
    $$(".nav-button").forEach((btn) => btn.classList.toggle("active", btn.dataset.view === activeNav));
  }
  const showBack = viewId === "detailView" || (viewId === "listView" && Boolean(state.folderFilter));
  $("#backButton")?.classList.toggle("hidden", !showBack);
  if (viewId === "foldersView") renderFoldersView();
}

function handleBack() {
  if (state.activeRecipeId) {
    state.activeRecipeId = "";
    showView("listView");
  } else if (state.folderFilter) {
    state.folderFilter = "";
    showView("foldersView");
  } else {
    showView("listView");
  }
}

function renderFoldersView() {
  const grid = $("#foldersGrid");
  if (!grid) return;
  grid.innerHTML = CARPETAS.map((carpeta) => {
    const count = visibleRecipes().filter((r) => (r.carpetas || []).includes(carpeta.id)).length;
    return `
      <button class="folder-card" data-folder="${escapeAttr(carpeta.id)}"
        style="--folder-color:${carpeta.color};--folder-bg:${carpeta.bg}">
        <div class="folder-icon">${carpeta.svg}</div>
        <span class="folder-name">${escapeHtml(carpeta.id)}</span>
        ${count ? `<span class="folder-count">${count}</span>` : ""}
      </button>`;
  }).join("");
  grid.querySelectorAll(".folder-card").forEach((card) => {
    card.addEventListener("click", () => {
      state.folderFilter = card.dataset.folder;
      renderList();
      showView("listView");
    });
  });
}

function setMode(mode) {
  $$(".mode-tab").forEach((button) => button.classList.toggle("active", button.dataset.mode === mode));
  $$(".mode-panel").forEach((panel) => panel.classList.toggle("active", panel.id === `${mode}Mode`));
}

function updateSortMode(event) {
  state.sortMode = event.target.value;
  localStorage.setItem("recetario:sortMode", state.sortMode);
  renderList();
}

function sortRecipes(recipes) {
  return [...recipes].sort((a, b) => {
    if (state.sortMode === "titleAsc") return localeSort(a.title || "", b.title || "");
    if (state.sortMode === "categoryAsc") {
      return localeSort((a.categories || [])[0] || "", (b.categories || [])[0] || "") || localeSort(a.title || "", b.title || "");
    }
    if (state.sortMode === "createdDesc") {
      return dateValue(b.createdAt) - dateValue(a.createdAt) || localeSort(a.title || "", b.title || "");
    }
    return dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt) || localeSort(a.title || "", b.title || "");
  });
}

async function connectGoogleDrive(options = {}) {
  const silent = options.silent === true;
  const config = driveConfig();
  if (!config.folderId || !config.clientId) {
    if (!silent) setDriveStatus("Configura el folderId y clientId de Google Drive.");
    return;
  }

  try {
    await loadGoogleIdentity();
    state.drive.requestSilent = silent;
    if (!state.drive.tokenClient) {
      state.drive.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: config.clientId,
        scope: driveScope,
        callback: async (response) => {
          if (response.error) {
            if (!state.drive.requestSilent) setDriveStatus("No se pudo conectar con Google Drive.");
            return;
          }
          state.drive.accessToken = response.access_token;
          state.drive.ready = true;
          renderDriveStatus();
          await refreshFromDrive(true);
        }
      });
    }
    if (!silent) setDriveStatus("Abriendo Google Drive...");
    state.drive.tokenClient.requestAccessToken({ prompt: (state.drive.accessToken || silent) ? "" : "consent" });
  } catch (error) {
    console.error(error);
    if (!silent) setDriveStatus("Google Drive no esta disponible ahora mismo.");
  }
}

function loadGoogleIdentity() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-google-identity="true"]');
    if (existing) {
      existing.addEventListener("load", resolve, { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.googleIdentity = "true";
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
}

async function refreshFromDrive(uploadLocalAfterMerge = false) {
  if (!state.drive.ready || state.drive.syncing) return;
  state.drive.syncing = true;
  state.drive.pendingUploads = 0;
  setDriveStatus("Leyendo JSON de Drive...");
  renderDriveStatus();

  try {
    const localRecipes = [...state.recipes];
    const driveEntries = await loadDriveRecipeEntries();
    const driveRecipes = driveEntries.map((entry) => entry.recipe);
    const pendingLocalRecipes = localRecipes.filter((recipe) => {
      const driveRecipe = driveRecipes.find((item) => sameRecipeIdentity(item, recipe));
      return !driveRecipe || dateValue(recipe.updatedAt || recipe.createdAt) > dateValue(driveRecipe.updatedAt || driveRecipe.createdAt);
    });
    state.drive.pendingUploads = pendingLocalRecipes.length;

    state.recipes = mergeRecipes(localRecipes, driveRecipes);
    saveLocalRecipes();
    renderAll();

    if (uploadLocalAfterMerge && pendingLocalRecipes.length) {
      setDriveStatus(`Subiendo ${pendingLocalRecipes.length} receta(s) a Drive...`);
      for (const recipe of pendingLocalRecipes) await writeRecipeToDrive(recipe);
    }

    setDriveMeta("lastReadAt", new Date().toISOString());
    clearDriveError();
    state.drive.pendingUploads = 0;
    setDriveStatus(`Drive conectado. ${visibleRecipes().length} receta(s) disponibles.`);
    setSyncStatus("Sincronizado con Google Drive.");
  } catch (error) {
    console.error(error);
    setDriveError("No se pudieron leer los JSON de Drive.");
    setDriveStatus("No se pudieron leer los JSON de Drive.");
  } finally {
    state.drive.syncing = false;
    renderDriveStatus();
  }
}

async function loadRecipesFromDrive() {
  return (await loadDriveRecipeEntries()).map((entry) => entry.recipe);
}

async function loadDriveRecipeEntries() {
  const files = await listDriveJsonFiles();
  const entries = [];
  state.drive.fileIds = new Map();
  state.drive.fileChoices = new Map();
  for (const file of files) {
    try {
      const content = await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
      recipesFromDrivePayload(content, file.name?.replace(/\.json$/i, "") || "").forEach((recipe) => {
        entries.push({ file, recipe });
        rememberDriveFileId(recipe, file);
      });
    } catch (error) {
      console.warn(`No se pudo importar ${file.name}`, error);
    }
  }
  setDriveDuplicateCount(entries);
  return entries;
}

async function listDriveJsonFiles() {
  const query = [
    `'${driveConfig().folderId}' in parents`,
    "trashed = false",
    "(mimeType = 'application/json' or name contains '.json')"
  ].join(" and ");
  const params = new URLSearchParams({
    q: query,
    fields: "files(id,name,modifiedTime)",
    pageSize: "1000",
    supportsAllDrives: "true",
    includeItemsFromAllDrives: "true"
  });
  const result = await driveRequest(`https://www.googleapis.com/drive/v3/files?${params}`);
  return (result.files || []).filter((file) => !String(file.name || "").startsWith("backup-recetario-"));
}

function rememberDriveFileId(recipe, file) {
  const currentEntry = state.drive.fileChoices.get(recipe.id);
  if (!currentEntry) {
    state.drive.fileIds.set(recipe.id, file.id);
    state.drive.fileChoices.set(recipe.id, { recipe, file });
    return;
  }
  const currentTime = dateValue(currentEntry?.recipe?.updatedAt || currentEntry?.file?.modifiedTime);
  const nextTime = dateValue(recipe.updatedAt || file.modifiedTime);
  if (nextTime >= currentTime) {
    state.drive.fileIds.set(recipe.id, file.id);
    state.drive.fileChoices.set(recipe.id, { recipe, file });
  }
}

function setDriveDuplicateCount(entries) {
  const groups = groupDriveEntries(entries);
  const duplicateCount = groups.reduce((total, group) => total + Math.max(0, group.length - 1), 0);
  setDriveMeta("lastDuplicateCount", duplicateCount);
}

function groupDriveEntries(entries) {
  const groups = new Map();
  entries.forEach((entry) => {
    const key = recipeIdentityKey(entry.recipe) || `id:${entry.recipe.id}`;
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(entry);
  });
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

function recipesFromDrivePayload(payload, fallbackId = "") {
  const items = Array.isArray(payload) ? payload : (Array.isArray(payload.recipes) ? payload.recipes : [payload]);
  return items.map((recipe) => normalizeImportedRecipe(recipe, fallbackId)).filter((recipe) => recipe.id && recipe.title);
}

async function exportRecipesToDrive(recipes, showStatus = true) {
  if (!state.drive.ready || state.drive.syncing) {
    if (showStatus) setDriveStatus("Conecta Google Drive primero.");
    return;
  }
  try {
    await createDriveBackup("antes-de-subir", state.recipes, false);
  } catch (error) {
    console.error(error);
    setDriveError("No se pudo crear copia de seguridad antes de subir.");
    setDriveStatus("No se pudo crear copia de seguridad antes de subir.");
    return;
  }
  state.drive.syncing = true;
  if (showStatus) setDriveStatus(`Subiendo ${recipes.length} receta(s) a Drive...`);
  try {
    for (const recipe of recipes) await writeRecipeToDrive(recipe);
    setDriveMeta("lastWriteAt", new Date().toISOString());
    clearDriveError();
    if (showStatus) setDriveStatus(`Drive actualizado. ${recipes.length} receta(s) subida(s).`);
  } catch (error) {
    console.error(error);
    setDriveError("No se pudieron subir todas las recetas a Drive.");
    setDriveStatus("No se pudieron subir todas las recetas a Drive.");
  } finally {
    state.drive.syncing = false;
    renderDriveStatus();
  }
}

async function writeRecipeToDrive(recipe) {
  if (!state.drive.ready) return;
  const normalizedRecipe = normalizeImportedRecipe(recipe);
  const fileId = state.drive.fileIds.get(normalizedRecipe.id);
  const metadata = {
    name: `${normalizedRecipe.id}.json`,
    mimeType: "application/json",
    ...(fileId ? {} : { parents: [driveConfig().folderId] })
  };
  const savedFile = await uploadDriveJson(metadata, JSON.stringify(normalizedRecipe, null, 2), fileId);
  state.drive.fileIds.set(normalizedRecipe.id, savedFile.id);
  setDriveMeta("lastWriteAt", new Date().toISOString());
}

async function deleteRecipeFromDrive(recipeId) {
  const fileId = state.drive.fileIds.get(recipeId);
  if (!fileId) return;
  await trashDriveFile(fileId);
  state.drive.fileIds.delete(recipeId);
}

async function repairDriveDuplicates() {
  if (!state.drive.ready || state.drive.syncing) {
    setDriveStatus("Conecta Google Drive primero.");
    return;
  }
  if (!confirm("Reparar duplicados en Drive? Se conservara la version mas reciente y las copias antiguas se moveran a la papelera.")) return;

  state.drive.syncing = true;
  setDriveStatus("Buscando duplicados en Drive...");
  renderDriveStatus();
  try {
    const entries = await loadDriveRecipeEntries();
    const duplicateGroups = groupDriveEntries(entries);
    if (!duplicateGroups.length) {
      setDriveMeta("lastDuplicateCount", 0);
      setDriveStatus("Drive revisado. No hay duplicados.");
      return;
    }

    await createDriveBackup("antes-de-reparar-duplicados", state.recipes, false, { ignoreSyncing: true });
    let trashed = 0;
    for (const group of duplicateGroups) {
      const sorted = [...group].sort((a, b) => driveEntryTime(b) - driveEntryTime(a));
      const keep = sorted[0];
      state.drive.fileIds.set(keep.recipe.id, keep.file.id);
      for (const duplicate of sorted.slice(1)) {
        await trashDriveFile(duplicate.file.id);
        trashed += 1;
      }
    }

    setDriveMeta("lastDuplicateCount", 0);
    clearDriveError();
    state.drive.syncing = false;
    await refreshFromDrive(false);
    setDriveStatus(`Drive reparado. ${trashed} duplicado(s) movido(s) a la papelera.`);
  } catch (error) {
    console.error(error);
    setDriveError("No se pudieron reparar los duplicados de Drive.");
    setDriveStatus("No se pudieron reparar los duplicados de Drive.");
  } finally {
    state.drive.syncing = false;
    renderDriveStatus();
  }
}

function driveEntryTime(entry) {
  return dateValue(entry.recipe.updatedAt || entry.recipe.createdAt || entry.file.modifiedTime);
}

async function trashDriveFile(fileId) {
  const response = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${state.drive.accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ trashed: true })
  });
  if (!response.ok) throw new Error(await response.text());
}

async function createDriveBackup(reason, recipes = state.recipes, showStatus = false, options = {}) {
  if (!state.drive.ready || (state.drive.syncing && !options.ignoreSyncing)) return false;
  const now = new Date().toISOString();
  const stamp = now.replace(/[:.]/g, "-");
  const metadata = {
    name: `backup-recetario-${stamp}-${slugify(reason)}.json`,
    mimeType: "application/json",
    parents: [driveConfig().folderId]
  };
  const payload = JSON.stringify({
    schemaVersion: RECIPE_SCHEMA_VERSION,
    backupCreatedAt: now,
    reason,
    deviceId,
    recipeCount: recipes.length,
    recipes
  }, null, 2);
  if (showStatus) setDriveStatus("Creando copia de seguridad en Drive...");
  await uploadDriveJson(metadata, payload);
  setDriveMeta("lastBackupAt", now);
  localStorage.setItem("recetario:lastBackupAt", now);
  renderBackupStatus();
  return true;
}

async function uploadDriveJson(metadata, json, fileId = "") {
  const body = createDriveMultipartBody(metadata, json);
  const url = fileId
    ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&supportsAllDrives=true`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
  const response = await fetch(url, {
    method: fileId ? "PATCH" : "POST",
    headers: {
      Authorization: `Bearer ${state.drive.accessToken}`,
      "Content-Type": body.contentType
    },
    body: body.payload
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

function createDriveMultipartBody(metadata, json) {
  const boundary = `recetario_${crypto.randomUUID().replace(/-/g, "")}`;
  return {
    contentType: `multipart/related; boundary=${boundary}`,
    payload: [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      json,
      `--${boundary}--`
    ].join("\r\n")
  };
}

async function driveRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), Authorization: `Bearer ${state.drive.accessToken}` }
  });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}

async function runOcr() {
  const file = $("#photoInput")?.files?.[0];
  if (!file) {
    $("#ocrStatus").textContent = "Elige una foto primero.";
    return;
  }
  $("#ocrStatus").textContent = "Cargando OCR...";
  try {
    const { createWorker } = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js");
    const worker = await createWorker("spa+eng", 1, {
      logger: (log) => {
        if (log.status) $("#ocrStatus").textContent = `${log.status} ${Math.round((log.progress || 0) * 100)}%`;
      }
    });
    const result = await worker.recognize(file);
    await worker.terminate();
    fillFormFromText(result.data.text);
    $("#ocrStatus").textContent = "Texto detectado. Revisa y corrige la receta antes de guardar.";
  } catch (error) {
    console.error(error);
    $("#ocrStatus").textContent = "No se pudo analizar la foto. Prueba con una imagen mas clara o pega el texto.";
  }
}

async function importFromLink() {
  const url = normalizeUrlForOpen($("#recipeUrl")?.value || $("#sourceUrlInput")?.value);
  if (!url) {
    $("#linkStatus").textContent = "Pega un link primero.";
    return;
  }
  $("#recipeUrl").value = url;
  if ($("#sourceUrlInput")) $("#sourceUrlInput").value = url;
  $("#linkStatus").textContent = "Intentando leer la web...";
  try {
    const response = await fetch(url);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, "text/html");
    const schema = extractSchemaRecipe(doc);
    if (schema) {
      fillForm(schema);
      $("#linkStatus").textContent = "Receta importada. Revisala antes de guardar.";
      return;
    }
    fillFormFromText(doc.body?.innerText || "", url);
    $("#linkStatus").textContent = "He intentado convertir el contenido. Revisalo antes de guardar.";
  } catch {
    $("#linkStatus").textContent = "Esa web no deja leer el contenido desde GitHub Pages. Pega el texto o sube una captura.";
  }
}

function extractSchemaRecipe(doc) {
  for (const script of Array.from(doc.querySelectorAll('script[type="application/ld+json"]'))) {
    try {
      const data = JSON.parse(script.textContent);
      const items = Array.isArray(data) ? data : [data, ...(data["@graph"] || [])];
      const recipe = items.find((item) => {
        const type = item["@type"];
        return type === "Recipe" || (Array.isArray(type) && type.includes("Recipe"));
      });
      if (!recipe) continue;
      return {
        title: recipe.name || "",
        categories: splitList(recipe.recipeCategory || ""),
        tags: splitList([recipe.recipeCuisine, ...(recipe.keywords ? String(recipe.keywords).split(",") : [])].join(",")),
        time: recipe.totalTime || recipe.cookTime || recipe.prepTime || "",
        ingredients: Array.isArray(recipe.recipeIngredient) ? recipe.recipeIngredient : [],
        steps: Array.isArray(recipe.recipeInstructions)
          ? recipe.recipeInstructions.map((step) => typeof step === "string" ? step : step.text).filter(Boolean).join("\n")
          : "",
        notes: recipe.description || "",
        sourceUrl: $("#recipeUrl")?.value.trim() || ""
      };
    } catch {}
  }
  return null;
}

let recognition = null;

function startVoice() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    $("#voiceStatus").textContent = "Este navegador no soporta dictado integrado. Puedes escribir o pegar el texto.";
    return;
  }
  recognition = new SpeechRecognition();
  recognition.lang = "es-ES";
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (event) => {
    $("#voiceText").value = Array.from(event.results).map((result) => result[0].transcript).join(" ");
  };
  recognition.onend = () => {
    $("#startVoiceButton").disabled = false;
    $("#stopVoiceButton").disabled = true;
  };
  recognition.start();
  $("#voiceStatus").textContent = "Dictando...";
  $("#startVoiceButton").disabled = true;
  $("#stopVoiceButton").disabled = false;
}

function stopVoice() {
  recognition?.stop();
  $("#voiceStatus").textContent = "Dictado detenido. Puedes convertir el texto en receta.";
}

function fillFormFromText(text, sourceUrl = "") {
  const recipe = parseRecipeText(text);
  recipe.sourceUrl = sourceUrl;
  fillForm(recipe);
}

function fillForm(recipe) {
  if (recipe.title) $("#titleInput").value = recipe.title;
  if (recipe.categories?.length) $("#categoriesInput").value = recipe.categories.join(", ");
  if (recipe.tags?.length) $("#tagsInput").value = recipe.tags.join(", ");
  if (recipe.time) $("#timeInput").value = recipe.time;
  if (recipe.ingredients?.length) $("#ingredientsInput").value = recipe.ingredients.join("\n");
  if (recipe.steps) $("#stepsInput").value = recipe.steps;
  if (recipe.notes) $("#notesInput").value = recipe.notes;
  if (recipe.sourceUrl) {
    const sourceUrl = normalizeUrlForStorage(recipe.sourceUrl);
    $("#recipeUrl").value = sourceUrl;
    if ($("#sourceUrlInput")) $("#sourceUrlInput").value = sourceUrl;
  }
  setMode("manual");
}

function parseRecipeText(text) {
  const cleanLines = String(text || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lowerLines = cleanLines.map(normalize);
  const ingredientsStart = findSection(lowerLines, ["ingredientes", "ingredients"]);
  const stepsStart = findSection(lowerLines, ["preparacion", "elaboracion", "receta", "pasos", "instructions"]);
  const notesStart = findSection(lowerLines, ["notas", "notes"]);
  const title = cleanLines.find((line, index) => index < 5 && line.length > 3 && !line.includes(":")) || cleanLines[0] || "";
  const timeMatch = String(text || "").match(/(\d+\s?(min|mins|minutos|h|hora|horas))/i);
  const ingredientsEnd = [stepsStart, notesStart].filter((index) => index > ingredientsStart).sort((a, b) => a - b)[0] || cleanLines.length;
  const stepsEnd = notesStart > stepsStart ? notesStart : cleanLines.length;
  return {
    title,
    categories: [],
    tags: [],
    time: timeMatch ? timeMatch[1] : "",
    ingredients: ingredientsStart >= 0
      ? cleanLines.slice(ingredientsStart + 1, ingredientsEnd).map(cleanBullet).filter(Boolean)
      : cleanLines.filter(looksLikeIngredient).slice(0, 18),
    steps: stepsStart >= 0
      ? cleanLines.slice(stepsStart + 1, stepsEnd).join("\n")
      : cleanLines.filter((line) => line !== title).slice(0, 30).join("\n"),
    notes: notesStart >= 0 ? cleanLines.slice(notesStart + 1).join("\n") : ""
  };
}

function findSection(lines, names) {
  return lines.findIndex((line) => names.some((name) => line.replace(/:$/, "") === normalize(name)));
}

function looksLikeIngredient(line) {
  return /^[-*\u2022]?\s*(\d+|[\u00bd\u00bc\u00be]|una?|dos|tres|cuatro|cinco|sal|aceite|agua|harina|azucar)/i.test(line);
}

function cleanBullet(line) {
  return line.replace(/^[-*\u2022\d.)\s]+/, "").trim();
}

function openSettings() {
  $("#settingsSyncText").textContent = state.drive.ready
    ? "Google Drive esta conectado. Las recetas se leen y guardan como archivos JSON."
    : "Conecta Google Drive en cada dispositivo para compartir el mismo recetario.";
  renderBackupStatus();
  renderDriveStatus();
  $("#settingsDialog")?.showModal();
}

function exportBackup() {
  const blob = new Blob([JSON.stringify(state.recipes, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `recetario-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  localStorage.setItem("recetario:lastBackupAt", new Date().toISOString());
  renderBackupStatus();
}

async function importBackup(event) {
  const file = event.target.files[0];
  if (!file) return;
  try {
    await createDriveBackup("antes-de-importar", state.recipes, false);
  } catch (error) {
    console.warn("No se pudo crear backup antes de importar", error);
  }
  const payload = JSON.parse(await file.text());
  const recipes = Array.isArray(payload) ? payload : (Array.isArray(payload.recipes) ? payload.recipes : []);
  if (!recipes.length) return;
  let imported = 0;
  let skipped = 0;
  for (const recipe of recipes) {
    const normalizedRecipe = normalizeImportedRecipe(recipe);
    if (findDuplicateRecipe(normalizedRecipe)) {
      skipped += 1;
      continue;
    }
    await saveRecipe(normalizedRecipe);
    imported += 1;
  }
  event.target.value = "";
  renderAll();
  alert(`Importadas: ${imported}. Omitidas por posible duplicado: ${skipped}.`);
}

function renderBackupStatus() {
  const status = $("#backupStatus");
  if (!status) return;
  const lastBackup = localStorage.getItem("recetario:lastBackupAt");
  status.textContent = lastBackup
    ? `Ultima copia creada: ${formatDateTime(lastBackup)}.`
    : "Todavia no se ha creado una copia en este navegador.";
}

function renderDriveStatus() {
  const config = driveConfig();
  $("#driveConnectButton")?.classList.toggle("hidden", state.drive.ready);
  $("#driveRefreshButton")?.classList.toggle("hidden", !state.drive.ready);
  $("#driveExportButton")?.classList.toggle("hidden", !state.drive.ready);
  $("#driveRepairButton")?.classList.toggle("hidden", !state.drive.ready);
  if (!config.folderId) return setDriveStatus("Configura el folderId de Google Drive.");
  if (!config.clientId) return setDriveStatus("Falta el clientId de Google Drive.");
  setDriveStatus(state.drive.ready ? `Drive conectado. Carpeta: ${config.folderId}.` : "Drive preparado. Conecta para leer y guardar JSON.");
  renderDriveDiagnostics();
}

function setDriveStatus(text) {
  const status = $("#driveStatus");
  if (status) status.textContent = text;
  renderDriveDiagnostics();
}

function renderDriveDiagnostics() {
  const diagnostics = $("#driveDiagnostics");
  if (!diagnostics) return;
  const items = [
    state.drive.lastReadAt ? `Ultima lectura: ${formatDateTime(state.drive.lastReadAt)}` : "Ultima lectura: pendiente",
    state.drive.lastWriteAt ? `Ultima subida: ${formatDateTime(state.drive.lastWriteAt)}` : "Ultima subida: pendiente",
    state.drive.lastBackupAt ? `Ultimo backup Drive: ${formatDateTime(state.drive.lastBackupAt)}` : "Ultimo backup Drive: pendiente",
    `Pendientes: ${state.drive.pendingUploads}`,
    `Duplicados detectados: ${state.drive.lastDuplicateCount || 0}`
  ];
  if (state.drive.lastError) items.push(`Ultimo error: ${state.drive.lastError}`);
  diagnostics.innerHTML = items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
}

function setDriveMeta(key, value) {
  state.drive[key] = value;
  localStorage.setItem(`recetario:drive:${key}`, String(value));
}

function setDriveError(message) {
  setDriveMeta("lastError", message);
}

function clearDriveError() {
  state.drive.lastError = "";
  localStorage.removeItem("recetario:drive:lastError");
}

function mergeRecipes(localRecipes, cloudRecipes) {
  const byId = new Map();
  const byIdentity = new Map();
  [...localRecipes, ...cloudRecipes].forEach((recipe) => {
    const normalizedRecipe = normalizeImportedRecipe(recipe);
    if (!normalizedRecipe.id) return;
    const identity = recipeIdentityKey(normalizedRecipe);
    const current = (identity && byIdentity.get(identity)) || byId.get(normalizedRecipe.id);
    const picked = pickNewestRecipe(current, normalizedRecipe);
    if (current?.id) picked.id = current.id;
    if (current?.id) byId.delete(current.id);
    byId.set(picked.id, picked);
    if (identity) byIdentity.set(identity, picked);
  });
  return sortRecipes(Array.from(byId.values()));
}

function normalizeRecipes(recipes) {
  const used = new Set();
  const byId = new Map();
  const byIdentity = new Map();
  (Array.isArray(recipes) ? recipes : []).forEach((recipe) => {
    const fixed = normalizeImportedRecipe(recipe);
    const identity = recipeIdentityKey(fixed);
    const current = (identity && byIdentity.get(identity)) || byId.get(fixed.id);
    const picked = pickNewestRecipe(current, fixed);
    if (current?.id) {
      picked.id = current.id;
    } else {
      picked.id = uniqueRecipeId(picked.id || picked.title || "receta", Array.from(used));
      used.add(picked.id);
    }
    if (current?.id) byId.delete(current.id);
    byId.set(picked.id, picked);
    if (identity) byIdentity.set(identity, picked);
  });
  return sortRecipes(Array.from(byId.values()));
}

function normalizeImportedRecipe(recipe, fallbackId = "") {
  const title = String(recipe?.title || recipe?.nombre || recipe?.name || "").trim();
  const rawId = String(recipe?.id || "").trim();
  const preferredId = rawId && !GENERATED_ID.test(rawId) ? slugify(rawId) : slugify(title) || slugify(fallbackId) || "receta";
  const allCarpetaIds = CARPETAS.map((c) => c.id);
  const createdAt = recipe?.createdAt || new Date().toISOString();
  const updatedAt = recipe?.updatedAt || createdAt;
  return {
    schemaVersion: Number(recipe?.schemaVersion) || RECIPE_SCHEMA_VERSION,
    id: preferredId,
    title,
    carpetas: normalizeList(recipe?.carpetas || recipe?.folders || []).filter((c) => allCarpetaIds.includes(c)),
    categories: normalizeList(recipe?.categories || recipe?.categorias || recipe?.category || recipe?.categoria),
    tags: normalizeList(recipe?.tags || recipe?.etiquetas),
    time: String(recipe?.time || recipe?.tiempo || "").trim(),
    ingredients: normalizeList(recipe?.ingredients || recipe?.ingredientes),
    steps: Array.isArray(recipe?.steps)
      ? normalizeList(recipe.steps).join("\n")
      : String(recipe?.steps || recipe?.preparacion || recipe?.["preparacion"] || recipe?.["preparación"] || recipe?.receta || "").trim(),
    notes: String(recipe?.notes || recipe?.notas || "").trim(),
    sourceUrl: normalizeUrlForStorage(recipe?.sourceUrl || recipe?.link || recipe?.url),
    photo: typeof recipe?.photo === "string" && recipe.photo.startsWith("data:image/") ? recipe.photo : "",
    createdAt,
    updatedAt,
    updatedBy: String(recipe?.updatedBy || deviceId),
    revision: Math.max(1, Number(recipe?.revision) || 1),
    deletedAt: recipe?.deletedAt || ""
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return splitList(value);
}

function splitList(value) {
  return String(value || "").split(",").map((item) => item.trim()).filter(Boolean);
}

function splitLines(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function findDuplicateRecipe(recipe) {
  return visibleRecipes().find((item) => item.id !== recipe.id && sameRecipeIdentity(item, recipe));
}

function sameRecipeIdentity(a, b) {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const aLink = normalizeUrlForCompare(a.sourceUrl || a.link || a.url);
  const bLink = normalizeUrlForCompare(b.sourceUrl || b.link || b.url);
  if (aLink && bLink && aLink === bLink) return true;
  const aTitle = normalize(a.title || a.nombre || a.name);
  const bTitle = normalize(b.title || b.nombre || b.name);
  return Boolean(aTitle && bTitle && aTitle === bTitle);
}

function recipeIdentityKey(recipe) {
  const sourceUrl = normalizeUrlForCompare(recipe.sourceUrl || recipe.link || recipe.url);
  if (sourceUrl) return `url:${sourceUrl}`;
  const title = normalize(recipe.title || recipe.nombre || recipe.name);
  return title ? `title:${title}` : "";
}

function pickNewestRecipe(a, b) {
  if (!a) return b;
  if (!b) return a;
  const aTime = dateValue(a.updatedAt || a.createdAt);
  const bTime = dateValue(b.updatedAt || b.createdAt);
  if (bTime !== aTime) return bTime > aTime ? b : a;
  return (Number(b.revision) || 0) >= (Number(a.revision) || 0) ? b : a;
}

function uniqueRecipeId(value, existingRecipes = state.recipes) {
  const usedIds = new Set(existingRecipes.map((recipe) => typeof recipe === "string" ? recipe : recipe?.id).filter(Boolean));
  const base = slugify(value) || "receta";
  let candidate = base;
  let index = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function slugify(value) {
  return normalize(value).replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80);
}

function normalizeUrlForStorage(value) {
  const url = normalizeUrlForOpen(value);
  if (!url) return "";
  try {
    return new URL(url).href;
  } catch {
    return String(value || "").trim();
  }
}

function normalizeUrlForOpen(value) {
  const url = String(value || "").trim();
  if (!url) return "";
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

function normalizeUrlForCompare(value) {
  return normalize(normalizeUrlForStorage(value).replace(/\/$/, ""));
}

function shortUrl(value) {
  try {
    const url = new URL(normalizeUrlForOpen(value));
    return url.hostname.replace(/^www\./, "") + url.pathname.replace(/\/$/, "");
  } catch {
    return value || "Abrir link";
  }
}

function dateValue(value) {
  const time = Date.parse(value || "");
  return Number.isNaN(time) ? 0 : time;
}

function getDeviceId() {
  const key = "recetario:deviceId";
  const saved = localStorage.getItem(key);
  if (saved) return saved;
  const id = crypto.randomUUID ? crypto.randomUUID() : `device_${Date.now()}_${Math.random().toString(16).slice(2)}`;
  localStorage.setItem(key, id);
  return id;
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha desconocida";
  return new Intl.DateTimeFormat("es", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function changeCode() {
  localStorage.removeItem("recetario:lastCookbookCode");
  location.reload();
}

function setSyncStatus(text) {
  const status = $("#syncStatus");
  if (status) status.textContent = text;
}

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function normalize(value) {
  return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function localeSort(a, b) {
  return a.localeCompare(b, "es", { sensitivity: "base" });
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}

// ─── Recipe Photo ─────────────────────────────────────────
async function handlePhotoPick(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    const compressed = await compressImage(file, 1000, 0.82);
    state.editingPhoto = compressed;
    showPhotoPreview(compressed);
  } catch {
    alert("No se pudo procesar la imagen. Prueba con otra foto.");
  }
}

function clearRecipePhoto() {
  state.editingPhoto = "";
  const input = $("#recipePhotoInput");
  if (input) input.value = "";
  showPhotoPreview("");
}

function showPhotoPreview(dataUrl) {
  const preview = $("#recipePhotoPreview");
  const clear = $("#recipePhotoClear");
  if (!preview) return;
  if (dataUrl) {
    preview.style.backgroundImage = `url("${dataUrl}")`;
    preview.classList.remove("hidden");
    clear?.classList.remove("hidden");
  } else {
    preview.style.backgroundImage = "";
    preview.classList.add("hidden");
    clear?.classList.add("hidden");
  }
}

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─── Cook Mode ────────────────────────────────────────────
let cookState = { steps: [], index: 0, ingredients: [], checked: new Set(), wakeLock: null };

async function openCookMode(recipeId) {
  const recipe = visibleRecipes().find((r) => r.id === recipeId);
  if (!recipe) return;
  const steps = (recipe.steps || "").split(/\n+/).map((s) => s.trim()).filter(Boolean);
  if (steps.length === 0) { alert("Esta receta no tiene pasos definidos."); return; }
  cookState.steps = steps;
  cookState.index = 0;
  cookState.ingredients = recipe.ingredients || [];
  cookState.checked = new Set();
  $("#cookRecipeTitle").textContent = recipe.title;
  const overlay = $("#cookMode");
  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
  renderCookStep();
  renderCookIngredients();
  try {
    if ("wakeLock" in navigator) {
      cookState.wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch {}
}

function closeCookMode() {
  const overlay = $("#cookMode");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  closeIngredientsPanel();
  if (cookState.wakeLock) {
    try { cookState.wakeLock.release(); } catch {}
    cookState.wakeLock = null;
  }
}

function openIngredientsPanel() {
  $("#cookIngredientsPanel")?.classList.remove("hidden");
  $("#cookIngredientsBackdrop")?.classList.remove("hidden");
  $("#cookIngredientsPanel")?.setAttribute("aria-hidden", "false");
}

function closeIngredientsPanel() {
  $("#cookIngredientsPanel")?.classList.add("hidden");
  $("#cookIngredientsBackdrop")?.classList.add("hidden");
  $("#cookIngredientsPanel")?.setAttribute("aria-hidden", "true");
}

function renderCookIngredients() {
  const list = $("#cookIngredientsList");
  if (!list) return;
  if (cookState.ingredients.length === 0) {
    list.innerHTML = `<li class="cook-ingredients-empty">Sin ingredientes definidos.</li>`;
    $("#cookIngredientsButton")?.classList.add("hidden");
    return;
  }
  $("#cookIngredientsButton")?.classList.remove("hidden");
  list.innerHTML = cookState.ingredients.map((ing, i) => `
    <li class="cook-ingredient-item">
      <label>
        <input type="checkbox" data-index="${i}" ${cookState.checked.has(i) ? "checked" : ""}>
        <span class="cook-ingredient-text">${escapeHtml(ing)}</span>
      </label>
    </li>
  `).join("");
  list.querySelectorAll('input[type="checkbox"]').forEach((cb) => {
    cb.addEventListener("change", (e) => {
      const idx = Number(e.target.dataset.index);
      if (e.target.checked) cookState.checked.add(idx);
      else cookState.checked.delete(idx);
      e.target.closest(".cook-ingredient-item")?.classList.toggle("checked", e.target.checked);
    });
    if (cb.checked) cb.closest(".cook-ingredient-item")?.classList.add("checked");
  });
}

function moveCookStep(delta) {
  const next = cookState.index + delta;
  if (next < 0 || next >= cookState.steps.length) return;
  cookState.index = next;
  renderCookStep();
}

function renderCookStep() {
  const total = cookState.steps.length;
  const i = cookState.index;
  $("#cookStepCounter").textContent = `Paso ${i + 1} de ${total}`;
  $("#cookStepText").textContent = cookState.steps[i] || "";
  $("#cookPrevButton").disabled = i === 0;
  $("#cookNextButton").disabled = i === total - 1;
}
