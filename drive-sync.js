(function () {
  const driveScope = "https://www.googleapis.com/auth/drive";
  const state = {
    accessToken: "",
    tokenClient: null,
    ready: false,
    syncing: false,
    fileIds: new Map(),
    uploadTimer: null
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initDriveSync);
  } else {
    initDriveSync();
  }

  function initDriveSync() {
    injectDriveStyles();
    document.querySelector("#driveConnectButton")?.addEventListener("click", connectDrive);
    document.querySelector("#driveRefreshButton")?.addEventListener("click", () => refreshFromDrive(true));
    document.querySelector("#driveExportButton")?.addEventListener("click", () => exportRecipesToDrive(getLocalRecipes()));
    patchLocalStorageUploads();
    renderDriveStatus();
  }

  async function connectDrive() {
    const config = driveConfig();
    if (!config.folderId || !config.clientId) {
      setDriveStatus("Falta configurar Google Drive en firebase-config.js.");
      return;
    }

    try {
      await rememberCookbookId();
      await loadGoogleIdentity();
      if (!state.tokenClient) {
        state.tokenClient = google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: driveScope,
          callback: async (response) => {
            if (response.error) {
              setDriveStatus("No se pudo conectar con Google Drive.");
              return;
            }
            state.accessToken = response.access_token;
            state.ready = true;
            renderDriveStatus();
            await refreshFromDrive(true);
          }
        });
      }
      state.tokenClient.requestAccessToken({ prompt: state.accessToken ? "" : "consent" });
    } catch (error) {
      console.error(error);
      setDriveStatus("Google Drive no esta disponible ahora mismo.");
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

  async function refreshFromDrive(uploadLocalAfterMerge) {
    if (!state.ready || state.syncing) return;

    state.syncing = true;
    setDriveStatus("Leyendo JSON de Drive...");

    try {
      const localRecipes = getLocalRecipes();
      const driveRecipes = await loadRecipesFromDrive();
      const merged = mergeRecipes(localRecipes, driveRecipes);
      setLocalRecipes(merged);

      if (uploadLocalAfterMerge) {
        const driveById = new Map(driveRecipes.map((recipe) => [recipe.id, recipe]));
        const pending = localRecipes.filter((recipe) => {
          const driveRecipe = driveById.get(recipe.id);
          return !driveRecipe || dateValue(recipe.updatedAt || recipe.createdAt) > dateValue(driveRecipe.updatedAt || driveRecipe.createdAt);
        });
        for (const recipe of pending) await writeRecipeToDrive(recipe);
      }

      setDriveStatus(`Drive conectado. ${merged.length} receta(s) disponibles.`);
      setSyncStatus("Sincronizado con Google Drive.");
      window.location.reload();
    } catch (error) {
      console.error(error);
      setDriveStatus("No se pudieron leer los JSON de Drive.");
    } finally {
      state.syncing = false;
    }
  }

  async function loadRecipesFromDrive() {
    const files = await listDriveJsonFiles();
    const recipes = [];
    state.fileIds = new Map();

    for (const file of files) {
      try {
        const payload = await driveRequest(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
        recipesFromPayload(payload).forEach((recipe) => {
          recipes.push(recipe);
          state.fileIds.set(recipe.id, file.id);
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
    if (!state.ready || state.syncing) {
      setDriveStatus("Conecta Google Drive primero.");
      return;
    }

    state.syncing = true;
    setDriveStatus(`Subiendo ${recipes.length} receta(s) a Drive...`);

    try {
      for (const recipe of recipes) await writeRecipeToDrive(recipe);
      setDriveStatus(`Drive actualizado. ${recipes.length} receta(s) subida(s).`);
    } catch (error) {
      console.error(error);
      setDriveStatus("No se pudieron subir todas las recetas a Drive.");
    } finally {
      state.syncing = false;
    }
  }

  async function writeRecipeToDrive(recipe) {
    if (!recipe?.id) return;

    const fileId = state.fileIds.get(recipe.id);
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
        Authorization: `Bearer ${state.accessToken}`,
        "Content-Type": body.contentType
      },
      body: body.payload
    });

    if (!response.ok) throw new Error(await response.text());
    const saved = await response.json();
    state.fileIds.set(recipe.id, saved.id);
  }

  function patchLocalStorageUploads() {
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function (key, value) {
      originalSetItem(key, value);
      if (state.ready && key.startsWith("recetario:") && key.endsWith(":recipes")) {
        clearTimeout(state.uploadTimer);
        state.uploadTimer = setTimeout(() => {
          try {
            exportRecipesToDrive(JSON.parse(value || "[]"));
          } catch {}
        }, 900);
      }
    };
  }

  function getLocalRecipes() {
    try {
      return JSON.parse(localStorage.getItem(localKey()) || "[]");
    } catch {
      return [];
    }
  }

  function setLocalRecipes(recipes) {
    localStorage.setItem(localKey(), JSON.stringify(recipes));
  }

  function localKey() {
    const cookbookId = sessionStorage.getItem("recetario:driveCookbookId") || "";
    return `recetario:${cookbookId}:recipes`;
  }

  async function rememberCookbookId() {
    const code = localStorage.getItem("recetario:lastCookbookCode") || document.querySelector("#cookbookCode")?.value || "";
    if (!code) return;
    const data = new TextEncoder().encode(`recetario:${code.trim()}`);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const cookbookId = Array.from(new Uint8Array(hash)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
    sessionStorage.setItem("recetario:driveCookbookId", cookbookId);
  }

  function recipesFromPayload(payload) {
    const items = Array.isArray(payload) ? payload : (Array.isArray(payload.recipes) ? payload.recipes : [payload]);
    return items.map(normalizeRecipe).filter((recipe) => recipe.id && recipe.title);
  }

  function normalizeRecipe(recipe) {
    return {
      id: recipe.id || crypto.randomUUID().replace(/-/g, "").slice(0, 20),
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
      updatedAt: recipe.updatedAt || new Date().toISOString()
    };
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
    return String(value || "").split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
  }

  function mergeRecipes(localRecipes, driveRecipes) {
    const byId = new Map();
    [...localRecipes, ...driveRecipes].forEach((recipe) => {
      if (!recipe?.id) return;
      const current = byId.get(recipe.id);
      byId.set(recipe.id, !current || dateValue(recipe.updatedAt || recipe.createdAt) >= dateValue(current.updatedAt || current.createdAt) ? recipe : current);
    });
    return Array.from(byId.values()).sort((a, b) => dateValue(b.updatedAt || b.createdAt) - dateValue(a.updatedAt || a.createdAt));
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
      headers: { Authorization: `Bearer ${state.accessToken}` }
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  }

  function renderDriveStatus() {
    document.querySelector("#driveConnectButton")?.classList.toggle("hidden", state.ready);
    document.querySelector("#driveRefreshButton")?.classList.toggle("hidden", !state.ready);
    document.querySelector("#driveExportButton")?.classList.toggle("hidden", !state.ready);
    setDriveStatus(state.ready ? "Drive conectado." : "Drive preparado para guardar recetas JSON.");
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

  function injectDriveStyles() {
    if (document.querySelector("#driveSyncStyles")) return;
    const style = document.createElement("style");
    style.id = "driveSyncStyles";
    style.textContent = ".settings-group{display:grid;gap:10px;border:1px solid rgba(200,94,49,.18);border-radius:6px;background:#fff8ef;padding:12px}.settings-group h3{margin:0;color:var(--brand-dark);font-size:.95rem}.settings-group p{margin:0}";
    document.head.append(style);
  }

  document.addEventListener("click", (event) => {
    if (event.target?.id === "unlockButton") rememberCookbookId();
  });
  document.querySelector("#cookbookCode")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") rememberCookbookId();
  });
  rememberCookbookId();
})();
