const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

const state = {
  cookbookId: "",
  recipes: [],
  activeRecipeId: "",
  unsubscribe: null,
  firebaseReady: false,
  db: null,
  auth: null,
  firebase: null,
  sortMode: localStorage.getItem("recetario:sortMode") || "updatedDesc"
};

const localKey = () => `recetario:${state.cookbookId}:recipes`;

const form = $("#recipeForm");
const lockScreen = $("#lockScreen");
const appShell = $("#appShell");
const recipesList = $("#recipesList");
const emptyState = $("#emptyState");

$("#unlockButton").addEventListener("click", unlock);
$("#cookbookCode").addEventListener("keydown", (event) => {
  if (event.key === "Enter") unlock();
});

$("#settingsButton").addEventListener("click", openSettings);
$("#changeCodeButton").addEventListener("click", changeCode);
$("#exportButton").addEventListener("click", exportBackup);
$("#importBackupInput").addEventListener("change", importBackup);
$("#searchInput").addEventListener("input", renderList);
$("#categoryFilter").addEventListener("change", renderList);
if ($("#sortSelect")) {
  $("#sortSelect").value = state.sortMode;
  $("#sortSelect").addEventListener("change", updateSortMode);
}
$("#recipeUrl").addEventListener("input", syncSourceUrlFromLinkMode);
$("#sourceUrlInput")?.addEventListener("input", syncRecipeUrlFromSourceField);

$$(".nav-button").forEach((button) => {
  button.addEventListener("click", () => showView(button.dataset.view));
});

$$(".mode-tab").forEach((button) => {
  button.addEventListener("click", () => setMode(button.dataset.mode));
});

form.addEventListener("submit", saveRecipeFromForm);
$("#cancelEditButton").addEventListener("click", resetForm);
$("#runOcrButton").addEventListener("click", runOcr);
$("#importLinkButton").addEventListener("click", importFromLink);
$("#parseTextButton").addEventListener("click", () => fillFormFromText($("#pastedRecipeText").value, $("#recipeUrl").value));
$("#startVoiceButton").addEventListener("click", startVoice);
$("#stopVoiceButton").addEventListener("click", stopVoice);
$("#parseVoiceButton").addEventListener("click", () => fillFormFromText($("#voiceText").value));

window.addEventListener("beforeprint", () => showView("detailView", false));

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").then((registration) => {
    if (registration.waiting) {
      registration.waiting.postMessage({ type: "SKIP_WAITING" });
    }
  }).catch(() => {});
}

const savedCookbook = localStorage.getItem("recetario:lastCookbookCode");
if (savedCookbook) {
  $("#cookbookCode").value = savedCookbook;
  unlock();
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
  lockScreen.classList.add("hidden");
  appShell.classList.remove("hidden");

  loadLocalRecipes();
  renderAll();
  await initFirebase();
}

async function initFirebase() {
  const config = window.RECETARIO_FIREBASE_CONFIG || {};
  if (!config.apiKey || !config.projectId) {
    setSyncStatus("Modo local. Configura Firebase para sincronizar entre moviles.");
    return;
  }

  try {
    const appModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js");
    const authModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js");
    const firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js");

    const app = appModule.initializeApp(config);
    state.auth = authModule.getAuth(app);
    await authModule.signInAnonymously(state.auth);
    state.db = firestoreModule.getFirestore(app);
    state.firebase = firestoreModule;
    state.firebaseReady = true;
    setSyncStatus("Sincronizado con Firebase.");
    subscribeToCloudRecipes();
  } catch (error) {
    console.error(error);
    setSyncStatus("No se pudo conectar con Firebase. La app sigue en modo local.");
  }
}

function subscribeToCloudRecipes() {
  if (state.unsubscribe) state.unsubscribe();
  const { collection, onSnapshot, orderBy, query } = state.firebase;
  const ref = collection(state.db, "cookbooks", state.cookbookId, "recipes");
  state.unsubscribe = onSnapshot(
    query(ref, orderBy("updatedAt", "desc")),
    (snapshot) => {
      state.recipes = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      saveLocalRecipes();
      renderAll();
      setSyncStatus("Sincronizado con Firebase.");
    },
    (error) => {
      console.error(error);
      setSyncStatus("Error de sincronizacion. Revisa Firebase y sus reglas.");
    }
  );
}

function loadLocalRecipes() {
  try {
    state.recipes = JSON.parse(localStorage.getItem(localKey()) || "[]");
  } catch {
    state.recipes = [];
  }
}

function saveLocalRecipes() {
  localStorage.setItem(localKey(), JSON.stringify(state.recipes));
}

async function saveRecipe(recipe) {
  recipe.updatedAt = new Date().toISOString();
  const existingIndex = state.recipes.findIndex((item) => item.id === recipe.id);
  if (existingIndex >= 0) {
    state.recipes[existingIndex] = recipe;
  } else {
    state.recipes.unshift(recipe);
  }
  saveLocalRecipes();
  renderAll();

  if (state.firebaseReady) {
    const { doc, setDoc } = state.firebase;
    await setDoc(doc(state.db, "cookbooks", state.cookbookId, "recipes", recipe.id), recipe);
  }
}

async function deleteRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe || !confirm(`Eliminar "${recipe.title}"?`)) return;

  state.recipes = state.recipes.filter((item) => item.id !== recipeId);
  saveLocalRecipes();
  renderAll();
  showView("listView");

  if (state.firebaseReady) {
    const { deleteDoc, doc } = state.firebase;
    await deleteDoc(doc(state.db, "cookbooks", state.cookbookId, "recipes", recipeId));
  }
}

async function saveRecipeFromForm(event) {
  event.preventDefault();
  const editingId = $("#editingId").value;
  const previous = state.recipes.find((item) => item.id === editingId);
  const sourceUrl = normalizeUrlForStorage($("#sourceUrlInput")?.value || $("#recipeUrl").value);
  const recipe = {
    id: editingId || crypto.randomUUID().replace(/-/g, "").slice(0, 20),
    title: $("#titleInput").value.trim(),
    categories: splitList($("#categoriesInput").value),
    tags: splitList($("#tagsInput").value),
    time: $("#timeInput").value.trim(),
    ingredients: splitLines($("#ingredientsInput").value),
    steps: $("#stepsInput").value.trim(),
    notes: $("#notesInput").value.trim(),
    sourceUrl,
    createdAt: previous?.createdAt || new Date().toISOString()
  };

  const duplicate = findDuplicateRecipe(recipe);
  if (duplicate && !confirm(`Ya existe una receta parecida: "${duplicate.title}". Guardarla igualmente?`)) {
    return;
  }

  await saveRecipe(recipe);
  resetForm();
  state.activeRecipeId = "";
  showView("listView");
}

function renderAll() {
  renderCategoryFilter();
  renderList();
  if (state.activeRecipeId) renderDetail(state.activeRecipeId);
}

function renderCategoryFilter() {
  const select = $("#categoryFilter");
  const current = select.value;
  const categories = [...new Set(state.recipes.flatMap((recipe) => recipe.categories || []))].sort(localeSort);
  select.innerHTML = `<option value="">Todas</option>${categories.map((category) => `<option value="${escapeAttr(category)}">${escapeHtml(category)}</option>`).join("")}`;
  select.value = categories.includes(current) ? current : "";
}

function renderList() {
  const query = normalize($("#searchInput").value);
  const category = $("#categoryFilter").value;
  const filtered = state.recipes.filter((recipe) => {
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
    const matchesQuery = !query || haystack.includes(query);
    const matchesCategory = !category || (recipe.categories || []).includes(category);
    return matchesQuery && matchesCategory;
  });

  recipesList.innerHTML = sortRecipes(filtered).map(recipeCard).join("");
  emptyState.classList.toggle("hidden", state.recipes.length > 0);

  recipesList.querySelectorAll(".recipe-card").forEach((card) => {
    card.addEventListener("click", () => openRecipe(card.dataset.id));
  });
}

function recipeCard(recipe) {
  const chips = [...(recipe.categories || []), ...(recipe.tags || []).slice(0, 3)];
  return `
    <button class="recipe-card" data-id="${escapeAttr(recipe.id)}">
      <h2>${escapeHtml(recipe.title)}</h2>
      <div class="card-meta">
        ${recipe.time ? `<span class="chip">${escapeHtml(recipe.time)}</span>` : ""}
        ${chips.map((chip) => `<span class="chip">${escapeHtml(chip)}</span>`).join("")}
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
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;

  $("#recipeDetail").innerHTML = `
    <h2>${escapeHtml(recipe.title)}</h2>
    <div class="detail-line">
      <span class="detail-label">Categoria</span>
      <div class="chip-row">${(recipe.categories || []).map((category) => `<span class="chip">${escapeHtml(category)}</span>`).join("") || "Sin categoria"}</div>
    </div>
    <div class="detail-line">
      <span class="detail-label">Tiempo</span>
      <div>${escapeHtml(recipe.time || "Sin tiempo indicado")}</div>
    </div>
    ${recipe.sourceUrl ? `
      <div class="detail-line">
        <span class="detail-label">Link</span>
        <div><a class="recipe-source-link" href="${escapeAttr(normalizeUrlForOpen(recipe.sourceUrl))}" target="_blank" rel="noopener noreferrer">${escapeHtml(shortUrl(recipe.sourceUrl))}</a></div>
      </div>` : ""}
    ${(recipe.tags || []).length ? `
      <div class="detail-line">
        <span class="detail-label">Etiquetas</span>
        <div class="chip-row">${recipe.tags.map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join("")}</div>
      </div>` : ""}
    <section class="detail-section">
      <h3>Ingredientes</h3>
      <ul class="ingredients-list">${(recipe.ingredients || []).map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("")}</ul>
    </section>
    <section class="detail-section">
      <h3>Receta</h3>
      <div class="steps-text">${escapeHtml(recipe.steps || "")}</div>
    </section>
    ${recipe.notes ? `
      <section class="detail-section">
        <h3>Notas</h3>
        <div class="notes-text">${escapeHtml(recipe.notes)}</div>
      </section>` : ""}
    <div class="detail-actions">
      <button class="secondary-button" data-action="print">PDF</button>
      <button class="secondary-button" data-action="edit">Editar</button>
      <button class="ghost-button" data-action="delete">Eliminar</button>
    </div>
  `;

  $("#recipeDetail").querySelector('[data-action="print"]').addEventListener("click", () => window.print());
  $("#recipeDetail").querySelector('[data-action="edit"]').addEventListener("click", () => editRecipe(recipe.id));
  $("#recipeDetail").querySelector('[data-action="delete"]').addEventListener("click", () => deleteRecipe(recipe.id));
}

function editRecipe(recipeId) {
  const recipe = state.recipes.find((item) => item.id === recipeId);
  if (!recipe) return;
  $("#editingId").value = recipe.id;
  $("#titleInput").value = recipe.title || "";
  $("#categoriesInput").value = (recipe.categories || []).join(", ");
  $("#timeInput").value = recipe.time || "";
  $("#tagsInput").value = (recipe.tags || []).join(", ");
  $("#ingredientsInput").value = (recipe.ingredients || []).join("\n");
  $("#stepsInput").value = recipe.steps || "";
  $("#notesInput").value = recipe.notes || "";
  $("#recipeUrl").value = recipe.sourceUrl || "";
  if ($("#sourceUrlInput")) $("#sourceUrlInput").value = recipe.sourceUrl || "";
  $("#cancelEditButton").classList.remove("hidden");
  showView("addView");
}

function resetForm() {
  form.reset();
  $("#editingId").value = "";
  $("#cancelEditButton").classList.add("hidden");
  setMode("manual");
}

function showView(viewId, updateNav = true) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === viewId));
  if (updateNav) {
    $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === viewId));
  }
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

function syncSourceUrlFromLinkMode() {
  if ($("#sourceUrlInput")) $("#sourceUrlInput").value = $("#recipeUrl").value.trim();
}

function syncRecipeUrlFromSourceField() {
  $("#recipeUrl").value = $("#sourceUrlInput")?.value.trim() || "";
}

function sortRecipes(recipes) {
  return [...recipes].sort((a, b) => {
    if (state.sortMode === "titleAsc") {
      return localeSort(a.title || "", b.title || "");
    }

    if (state.sortMode === "categoryAsc") {
      return localeSort((a.categories || [])[0] || "", (b.categories || [])[0] || "")
        || localeSort(a.title || "", b.title || "");
    }

    if (state.sortMode === "createdDesc") {
      return dateValue(b.createdAt) - dateValue(a.createdAt) || localeSort(a.title || "", b.title || "");
    }

    return dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt)
      || localeSort(a.title || "", b.title || "");
  });
}

async function runOcr() {
  const file = $("#photoInput").files[0];
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
  const url = normalizeUrlForOpen($("#recipeUrl").value || $("#sourceUrlInput").value);
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

    const text = doc.body?.innerText || "";
    fillFormFromText(text, url);
    $("#linkStatus").textContent = "He intentado convertir el contenido. Revisalo antes de guardar.";
  } catch {
    $("#linkStatus").textContent = "Esa web no deja leer el contenido desde GitHub Pages. Pega el texto o sube una captura.";
  }
}

function extractSchemaRecipe(doc) {
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const script of scripts) {
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
        sourceUrl: $("#recipeUrl").value.trim()
      };
    } catch {
      continue;
    }
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
    const text = Array.from(event.results).map((result) => result[0].transcript).join(" ");
    $("#voiceText").value = text;
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
  if (recognition) recognition.stop();
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
  const cleanLines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lowerLines = cleanLines.map(normalize);
  const ingredientsStart = findSection(lowerLines, ["ingredientes", "ingredients"]);
  const stepsStart = findSection(lowerLines, ["preparacion", "elaboracion", "receta", "pasos", "instructions"]);
  const notesStart = findSection(lowerLines, ["notas", "notes"]);

  const title = cleanLines.find((line, index) => index < 5 && line.length > 3 && !line.includes(":")) || cleanLines[0] || "";
  const timeMatch = text.match(/(\d+\s?(min|mins|minutos|h|hora|horas))/i);

  const ingredientsEnd = [stepsStart, notesStart].filter((index) => index > ingredientsStart).sort((a, b) => a - b)[0] || cleanLines.length;
  const stepsEnd = notesStart > stepsStart ? notesStart : cleanLines.length;

  const ingredients = ingredientsStart >= 0
    ? cleanLines.slice(ingredientsStart + 1, ingredientsEnd).map(cleanBullet).filter(Boolean)
    : cleanLines.filter(looksLikeIngredient).slice(0, 18);

  const steps = stepsStart >= 0
    ? cleanLines.slice(stepsStart + 1, stepsEnd).join("\n")
    : cleanLines.filter((line) => !ingredients.includes(cleanBullet(line)) && line !== title).slice(0, 30).join("\n");

  const notes = notesStart >= 0 ? cleanLines.slice(notesStart + 1).join("\n") : "";

  return {
    title,
    categories: [],
    tags: [],
    time: timeMatch ? timeMatch[1] : "",
    ingredients,
    steps,
    notes
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

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function openSettings() {
  $("#settingsSyncText").textContent = state.firebaseReady
    ? "Firebase esta conectado. Las recetas se sincronizan usando el codigo compartido."
    : "Firebase no esta configurado. Ahora mismo las recetas solo viven en este navegador.";
  renderBackupStatus();
  $("#settingsDialog").showModal();
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
  const recipes = JSON.parse(await file.text());
  if (!Array.isArray(recipes)) return;
  let imported = 0;
  let skipped = 0;
  for (const recipe of recipes) {
    const normalized = normalizeImportedRecipe(recipe);
    if (findDuplicateRecipe(normalized)) {
      skipped += 1;
      continue;
    }
    await saveRecipe(normalized);
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
    ? `Ultima copia exportada: ${formatDateTime(lastBackup)}.`
    : "Todavia no se ha exportado una copia en este navegador.";
}

function normalizeImportedRecipe(recipe) {
  const sourceUrl = normalizeUrlForStorage(recipe.sourceUrl || recipe.link || recipe.url);
  return {
    id: recipe.id || crypto.randomUUID().replace(/-/g, "").slice(0, 20),
    title: String(recipe.title || recipe.nombre || recipe.name || "").trim(),
    categories: normalizeList(recipe.categories || recipe.categorias || recipe.category || recipe.categoria),
    tags: normalizeList(recipe.tags || recipe.etiquetas),
    time: String(recipe.time || recipe.tiempo || "").trim(),
    ingredients: normalizeList(recipe.ingredients || recipe.ingredientes),
    steps: Array.isArray(recipe.steps)
      ? normalizeList(recipe.steps).join("\n")
      : String(recipe.steps || recipe.preparacion || recipe["preparaci\u00f3n"] || recipe.receta || "").trim(),
    notes: String(recipe.notes || recipe.notas || "").trim(),
    sourceUrl,
    createdAt: recipe.createdAt || new Date().toISOString(),
    updatedAt: recipe.updatedAt || new Date().toISOString()
  };
}

function normalizeList(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return splitList(value);
}

function findDuplicateRecipe(recipe) {
  const title = normalize(recipe.title);
  const sourceUrl = normalizeUrlForCompare(recipe.sourceUrl);
  return state.recipes.find((item) => {
    if (item.id === recipe.id) return false;
    const sameLink = sourceUrl && normalizeUrlForCompare(item.sourceUrl || item.link) === sourceUrl;
    const sameTitle = title && normalize(item.title) === title;
    return sameLink || sameTitle;
  });
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
  const url = normalizeUrlForStorage(value).replace(/\/$/, "");
  return normalize(url);
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

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "fecha desconocida";
  return new Intl.DateTimeFormat("es", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function changeCode() {
  localStorage.removeItem("recetario:lastCookbookCode");
  location.reload();
}

function setSyncStatus(text) {
  $("#syncStatus").textContent = text;
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
