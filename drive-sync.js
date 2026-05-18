(function () {
  const DRIVE_ENABLED_KEY = "recetario:driveEnabled";
  const DRIVE_SYNCING_KEY = "recetario:driveSyncing";
  const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";

  const driveState = {
    accessToken: "",
    tokenClient: null,
    ready: false,
    syncing: false,
    cookbookId: "",
    fileIds: new Map(),
    uploadTimer: null
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDriveSync);
  } else {
    initDriveSync();
  }

  function initDriveSync() {
    ensureDriveUi();
    patchLocalStorageUploads();
    bindDriveUi();
    bindStableRecipeIds();
    renderDriveStatus();

    if (localStorage.getItem(DRIVE_ENABLED_KEY) === "1") {
      setTimeout(() => connectDrive({ silent: true }), 700);
    }
  }

  function bindDriveUi() {
    document.querySelector("#driveConnectButton")?.addEventListener("click", () => connectDrive({ silent: false }));
    document.querySelector("#driveRefreshButton")?.addEventListener("click", () => syncFromDrive({ uploadLocal: false, reload: true }));
    document.querySelector("#driveExportButton")?.addEventListener("click", () => exportRecipesToDrive(getLocalRecipes()));
  }

  function bindStableRecipeIds() {
    document.querySelector("#recipeForm")?.addEventListener("submit", prepareRecipeIdBeforeSave, true);
  }

  function prepareRecipeIdBeforeSave() {
    const editingInput = document.querySelector("#editingId");
    const titleInput = document.querySelector("#titleInput");
    if (!editingInput || !titleInput || editingInput.value.trim()) return;

    const base = slugify(titleInput.value) || "receta";
    const used = new Set(getLocalRecipes().map((recipe) => recipe.id).filter(Boolean));
    let id = base;
    let counter = 2;
    while (used.has(id)) {
      id = `${base}_${counter}`;
      counter += 1;
    }
    editingInput.value = id;
  }

  async function connectDrive({ silent }) {
    const config = driveConfig();
    if (!config.folderId || !config.clientId) {
      setDriveStatus("Falta configurar Google Drive.");
      return;
    }

    try {
      await ensureCookbookId();
      await loadGoogleIdentity();
      if (!driveState.tokenClient) {
        driveState.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: DRIVE_SCOPE,
          callback: async (response) => {
            if (response.error) {
              if (!silent) setDriveStatus("No se pudo conectar con Google Drive.");
              return;
            }

            driveState.accessToken = response.access_token;
            driveState.ready = true;
            localStorage.setItem(DRIVE_ENABLED_KEY, "1");
            renderDriveStatus();
            await syncFromDrive({ uploadLocal: false, reload: true });
          }
        });
      }

      setDriveStatus(silent ? "Conectando Drive..." : "Abriendo Google Drive...");
      driveState.tokenClient.requestAccessToken({ prompt: silent ? "" : "consent" });
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

  async function syncFromDrive({ uploadLocal, reload }) {
    if (!driveState.ready || driveState.syncing) return;

    driveState.syncing = true;
    localStorage.setItem(DRIVE_SYNCING_KEY, "1");
    setDriveStatus("Leyendo recetas de Drive...");

    try {
      await ensureCookbookId();
      const before = getLocalRecipes();
      const driveRecipes = await loadRecipesFromDrive();
      const merged = mergeRecipes(before, driveRecipes);
      const changed = stableJson(before) !== stableJson(merged);
      setLocalRecipes(merged);

      if (uploadLocal) {
        const driveById = new Map(driveRecipes.map((recipe) => [recipe.id, recipe]));
        const pending = before.filter((recipe) => {
          const driveRecipe = driveById.get(recipe.id);
          return !hasEquivalentDriveRecipe(recipe, driveRecipes)
            && (!driveRecipe || dateValue(recipe.updatedAt || recipe.createdAt) > dateValue(driveRecipe.updatedAt || driveRecipe.createdAt));
        });
        for (const recipe of pending) await writeRecipeToDrive(recipe);
      }

      setDriveStatus(`Drive sincronizado. ${merged.length} receta(s).`);
      setSyncStatus("Sincronizado con Google Drive.");

      if (reload && changed) {
        window.location.reload();
      }
    } catch (error) {
      console.error(error);
      setDriveStatus("No se pudieron cargar los JSON de Drive.");
    } finally {
      driveState.syncing = false;
      localStorage.removeItem(DRIVE_SYNCING_KEY);
    }
  }

  async function loadRecipesFromDrive() {
    const files = await listDriveJsonFiles();
    const recipes = [];
    driveState.fileIds = new Map();

    for (const file of files) {
      try {
        const payload = await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        const fileSlug = file.name.replace(/\.json$/i, "");
        recipesFromPayload(payload, fileSlug).forEach((recipe) => {
          recipes.push(recipe);
          driveState.fileIds.set(recipe.id, file.id);
        });
      } catch (error) {
        console.warn(`No se pudo importar ${file.name}`, error);
      }
    }

    return recipes;
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
    return result.files || [];
  }

  async function exportRecipesToDrive(recipes) {
    if (!driveState.ready || driveState.syncing) {
      setDriveStatus("Conecta Google Drive primero.");
      return;
    }

    const preparedRecipes = normalizeGeneratedRecipeIds(recipes);
    if (stableJson(preparedRecipes) !== stableJson(recipes)) {
      setLocalRecipes(preparedRecipes);
      recipes = preparedRecipes;
    }

    driveState.syncing = true;
    setDriveStatus(`Subiendo ${recipes.length} receta(s) a Drive...`);

    try {
      await ensureCookbookId();
      for (const recipe of recipes) await writeRecipeToDrive(recipe);
      setDriveStatus(`Drive actualizado. ${recipes.length} receta(s) subida(s).`);
    } catch (error) {
      console.error(error);
      setDriveStatus("No se pudieron subir todas las recetas a Drive.");
    } finally {
      driveState.syncing = false;
    }
  }

  async function writeRecipeToDrive(recipe) {
    if (!recipe?.id) return;

    const fileId = driveState.fileIds.get(recipe.id);
    const metadata = {
      name: `${recipe.id}.json`,
      mimeType: "application/json",
      ...(fileId ? {} : { parents: [driveConfig().folderId] })
    };
    const body = createMultipartBody(metadata, JSON.stringify(recipe, null, 2));
    const url = fileId
      ? `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart&supportsAllDrives=true`
      : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true";
    const response = await fetch(url, {
      method: fileId ? "PATCH" : "POST",
      headers: {
        Authorization: `Bearer ${driveState.accessToken}`,
        "Content-Type": body.contentType
      },
      body: body.payload
    });

    if (!response.ok) throw new Error(await response.text());
    const saved = await response.json();
    driveState.fileIds.set(recipe.id, saved.id);
  }

  function patchLocalStorageUploads() {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      if (
        driveState.ready &&
        !driveState.syncing &&
        localStorage.getItem(DRIVE_SYNCING_KEY) !== "1" &&
        key === localRecipesKey()
      ) {
        clearTimeout(driveState.uploadTimer);
        driveState.uploadTimer = setTimeout(() => {
          try {
            exportRecipesToDrive(JSON.parse(value || "[]"));
          } catch {}
        }, 900);
      }
    };
  }

  function getLocalRecipes() {
    try {
      return JSON.parse(localStorage.getItem(localRecipesKey()) || "[]");
    } catch {
      return [];
    }
  }

  function setLocalRecipes(recipes) {
    localStorage.setItem(localRecipesKey(), JSON.stringify(recipes));
  }

  function localRecipesKey() {
    return `recetario:${driveState.cookbookId}:recipes`;
  }

  async function ensureCookbookId() {
    if (driveState.cookbookId) return driveState.cookbookId;
    const code = localStorage.getItem("recetario:lastCookbookCode") || document.querySelector("#cookbookCode")?.value || "";
    if (!code.trim()) return "";
    const text = `recetario:${code.trim()}`;
    const cachedKey = `recetario:hash:${text}`;
    const cached = localStorage.getItem(cachedKey);
    if (cached) {
      driveState.cookbookId = cached;
      return cached;
    }

    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    const value = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(cachedKey, value);
    driveState.cookbookId = value;
    return value;
  }

  function recipesFromPayload(payload, fallbackId) {
    const items = Array.isArray(payload) ? payload : (Array.isArray(payload.recipes) ? payload.recipes : [payload]);
    return items.map((recipe) => normalizeRecipe(recipe, fallbackId)).filter((recipe) => recipe.id && recipe.title);
  }

  function normalizeRecipe(recipe, fallbackId) {
    const id = String(recipe.id || fallbackId || "").trim();
    return {
      id,
      title: String(recipe.title || recipe.nombre || recipe.name || "").trim(),
      categories: normalizeList(recipe.categories || recipe.categorias || recipe.category || recipe.categoria),
      tags: normalizeList(recipe.tags || recipe.etiquetas),
      time: String(recipe.time || recipe.tiempo || "").trim(),
      ingredients: normalizeList(recipe.ingredients || recipe.ingredientes),
      steps: Array.isArray(recipe.steps)
        ? normalizeList(recipe.steps).join("\n")
        : String(recipe.steps || recipe.preparacion || recipe["preparacion"] || recipe.receta || "").trim(),
      notes: String(recipe.notes || recipe.notas || "").trim(),
      sourceUrl: String(recipe.sourceUrl || recipe.link || recipe.url || "").trim(),
      createdAt: recipe.createdAt || new Date().toISOString(),
      updatedAt: recipe.updatedAt || recipe.createdAt || new Date().toISOString()
    };
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  function mergeRecipes(localRecipes, driveRecipes) {
    const byId = new Map();
    const byIdentity = new Map();

    localRecipes.forEach((recipe) => {
      if (!recipe?.id) return;
      byId.set(recipe.id, recipe);
      const identity = recipeIdentity(recipe);
      if (identity) byIdentity.set(identity, recipe.id);
    });

    driveRecipes.forEach((recipe) => {
      if (!recipe?.id) return;
      const identity = recipeIdentity(recipe);
      const duplicateId = identity ? byIdentity.get(identity) : "";
      if (duplicateId && duplicateId !== recipe.id) {
        byId.delete(duplicateId);
      }

      const current = byId.get(recipe.id);
      byId.set(recipe.id, !current || dateValue(recipe.updatedAt || recipe.createdAt) >= dateValue(current.updatedAt || current.createdAt) ? recipe : current);
      if (identity) byIdentity.set(identity, recipe.id);
    });

    return Array.from(byId.values()).sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt));
  }

  function hasEquivalentDriveRecipe(recipe, driveRecipes) {
    const identity = recipeIdentity(recipe);
    return Boolean(identity && driveRecipes.some((driveRecipe) => recipeIdentity(driveRecipe) === identity));
  }

  function recipeIdentity(recipe) {
    const url = normalizeText(recipe?.sourceUrl || recipe?.link || recipe?.url).replace(/\/$/, "");
    if (url) return `url:${url}`;
    const title = normalizeText(recipe?.title || recipe?.nombre || recipe?.name);
    return title ? `title:${title}` : "";
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();
  }

  function normalizeGeneratedRecipeIds(recipes) {
    const used = new Set();
    return (recipes || []).map((recipe) => {
      if (!recipe?.title) return recipe;
      if (recipe.id && !looksGeneratedId(recipe.id)) {
        used.add(recipe.id);
        return recipe;
      }

      const base = slugify(recipe.title) || "receta";
      let id = base;
      let counter = 2;
      while (used.has(id)) {
        id = `${base}_${counter}`;
        counter += 1;
      }
      used.add(id);
      return { ...recipe, id };
    });
  }

  function looksGeneratedId(id) {
    return /^[a-f0-9]{20}$/i.test(String(id || ""));
  }

  function slugify(value) {
    return normalizeText(value)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");
  }

  function createMultipartBody(metadata, json) {
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

  async function driveRequest(url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${driveState.accessToken}` }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function ensureDriveUi() {
    if (!document.querySelector("#driveStatus")) {
      const backupStatus = document.querySelector("#backupStatus");
      backupStatus?.insertAdjacentHTML("afterend", `
        <section class="settings-group" aria-label="Google Drive">
          <h3>Google Drive</h3>
          <p id="driveStatus" class="muted"></p>
          <button id="driveConnectButton" type="button" class="secondary-button">Conectar Drive</button>
          <button id="driveRefreshButton" type="button" class="secondary-button hidden">Actualizar desde Drive</button>
          <button id="driveExportButton" type="button" class="secondary-button hidden">Subir todo a Drive</button>
        </section>
      `);
    }

    if (!document.querySelector("#driveSyncStyles")) {
      const style = document.createElement("style");
      style.id = "driveSyncStyles";
      style.textContent = ".settings-group{display:grid;gap:10px;border:1px solid rgba(200,94,49,.18);border-radius:6px;background:#fff8ef;padding:12px}.settings-group h3{margin:0;color:var(--brand-dark);font-size:.95rem}.settings-group p{margin:0}";
      document.head.append(style);
    }
  }

  function renderDriveStatus() {
    document.querySelector("#driveConnectButton")?.classList.toggle("hidden", driveState.ready);
    document.querySelector("#driveRefreshButton")?.classList.toggle("hidden", !driveState.ready);
    document.querySelector("#driveExportButton")?.classList.toggle("hidden", !driveState.ready);
    setDriveStatus(driveState.ready ? "Drive conectado." : "Drive preparado. Conecta una vez en cada dispositivo.");
  }

  function setDriveStatus(text) {
    const status = document.querySelector("#driveStatus");
    if (status) status.textContent = text;
  }

  function setSyncStatus(text) {
    const status = document.querySelector("#syncStatus");
    if (status) status.textContent = text;
  }

  function driveConfig() {
    return window.RECETARIO_DRIVE_CONFIG || {};
  }

  function dateValue(value) {
    const time = Date.parse(value || "");
    return Number.isNaN(time) ? 0 : time;
  }

  function stableJson(value) {
    return JSON.stringify(value || []);
  }
})();
