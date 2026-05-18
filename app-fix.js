(function () {
  const GENERATED_ID = /^[a-f0-9]{20}$/i;
  const RECIPES_KEY = /^recetario:.*:recipes$/;
  const originalGetItem = Storage.prototype.getItem;
  const originalSetItem = Storage.prototype.setItem;
  const originalFetch = window.fetch.bind(window);

  Storage.prototype.getItem = function (key) {
    const value = originalGetItem.call(this, key);
    if (!RECIPES_KEY.test(String(key || ""))) return value;
    return normalizeRecipesJson(value);
  };

  Storage.prototype.setItem = function (key, value) {
    if (RECIPES_KEY.test(String(key || ""))) {
      return originalSetItem.call(this, key, normalizeRecipesJson(value));
    }
    return originalSetItem.call(this, key, value);
  };

  window.fetch = async function (input, init) {
    const url = typeof input === "string" ? input : input?.url || "";
    const nextInit = patchDriveUpload(url, init);
    const response = await originalFetch(input, nextInit);
    if (!url.includes("/drive/v3/files/") || !url.includes("alt=media") || !response.ok) {
      return response;
    }

    try {
      const payload = await response.clone().json();
      const fixed = normalizePayload(payload);
      return new Response(JSON.stringify(fixed), {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers
      });
    } catch {
      return response;
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bindStableRecipeIds);
  } else {
    bindStableRecipeIds();
  }

  function bindStableRecipeIds() {
    document.querySelector("#recipeForm")?.addEventListener("submit", () => {
      const editingInput = document.querySelector("#editingId");
      const titleInput = document.querySelector("#titleInput");
      if (!editingInput || !titleInput || editingInput.value.trim()) return;

      const recipes = readAllStoredRecipes();
      editingInput.value = uniqueId(slugify(titleInput.value) || "receta", recipes);
    }, true);
  }

  function patchDriveUpload(url, init) {
    if (!url.includes("/upload/drive/v3/files") || !init?.body || typeof init.body !== "string") {
      return init;
    }

    try {
      const body = init.body.replace(/\{[\s\S]*"title"[\s\S]*?\}(?=\r?\n--recetario_)/, (match) => {
        const recipe = JSON.parse(match);
        return JSON.stringify(normalizeRecipe(recipe, new Set()), null, 2);
      });
      return { ...init, body };
    } catch {
      return init;
    }
  }

  function normalizeRecipesJson(value) {
    try {
      const recipes = JSON.parse(value || "[]");
      return JSON.stringify(normalizeRecipes(Array.isArray(recipes) ? recipes : []));
    } catch {
      return value;
    }
  }

  function normalizePayload(payload) {
    if (Array.isArray(payload)) return normalizeRecipes(payload);
    if (Array.isArray(payload?.recipes)) return { ...payload, recipes: normalizeRecipes(payload.recipes) };
    return normalizeRecipe(payload, new Set());
  }

  function normalizeRecipes(recipes) {
    const used = new Set();
    const byId = new Map();
    const byIdentity = new Map();

    recipes.forEach((recipe) => {
      const fixed = normalizeRecipe(recipe, used);
      if (!fixed?.id || !fixed?.title) return;

      const identity = recipeIdentity(fixed);
      const duplicateId = identity ? byIdentity.get(identity) : "";
      if (duplicateId && duplicateId !== fixed.id) {
        const previous = byId.get(duplicateId);
        byId.delete(duplicateId);
        byId.set(fixed.id, newest(previous, fixed));
      } else {
        byId.set(fixed.id, newest(byId.get(fixed.id), fixed));
      }
      if (identity) byIdentity.set(identity, fixed.id);
    });

    return Array.from(byId.values());
  }

  function normalizeRecipe(recipe, used) {
    if (!recipe || typeof recipe !== "object") return recipe;
    const title = String(recipe.title || recipe.nombre || recipe.name || "").trim();
    const currentId = String(recipe.id || "").trim();
    const base = currentId && !GENERATED_ID.test(currentId) ? slugify(currentId) : slugify(title);
    const id = uniqueId(base || "receta", Array.from(used).map((item) => ({ id: item })));
    used.add(id);
    return { ...recipe, id, title: recipe.title || title };
  }

  function uniqueId(base, recipes) {
    const used = new Set((recipes || []).map((recipe) => recipe.id).filter(Boolean));
    let id = base;
    let counter = 2;
    while (used.has(id)) {
      id = `${base}_${counter}`;
      counter += 1;
    }
    return id;
  }

  function readAllStoredRecipes() {
    const recipes = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      if (!RECIPES_KEY.test(String(key || ""))) continue;
      try {
        recipes.push(...JSON.parse(originalGetItem.call(localStorage, key) || "[]"));
      } catch {}
    }
    return recipes;
  }

  function recipeIdentity(recipe) {
    const sourceUrl = normalizeUrl(recipe?.sourceUrl || recipe?.link || recipe?.url);
    if (sourceUrl) return `url:${sourceUrl}`;
    const title = normalize(recipe?.title || recipe?.nombre || recipe?.name).trim();
    return title ? `title:${title}` : "";
  }

  function newest(a, b) {
    if (!a) return b;
    if (!b) return a;
    return dateValue(b.updatedAt || b.createdAt) >= dateValue(a.updatedAt || a.createdAt) ? b : a;
  }

  function dateValue(value) {
    const time = Date.parse(value || "");
    return Number.isNaN(time) ? 0 : time;
  }

  function normalizeUrl(value) {
    return normalize(String(value || "").trim().replace(/\/$/, ""));
  }

  function slugify(value) {
    return normalize(value)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60);
  }

  function normalize(value) {
    return String(value || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }
})();
