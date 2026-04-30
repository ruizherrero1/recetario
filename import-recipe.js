(function () {
  const $ = (selector) => document.querySelector(selector);

  if (document.readyState === "loading") {
    window.addEventListener("DOMContentLoaded", initRecipeImporter);
  } else {
    initRecipeImporter();
  }

  function initRecipeImporter() {
    ensureImportUi();
    $("#singleRecipeFile")?.addEventListener("change", importSingleRecipeFile);
    $("#importSingleRecipeButton")?.addEventListener("click", importSingleRecipeText);
  }

  function ensureImportUi() {
    const tabs = $(".mode-tabs");
    const form = $("#recipeForm");
    const manualTab = document.querySelector('[data-mode="manual"]');
    const manualPanel = $("#manualMode");

    if (!tabs || !form || !manualPanel) return;

    if (!document.querySelector('[data-mode="import"]')) {
      const importTab = document.createElement("button");
      importTab.type = "button";
      importTab.className = "mode-tab";
      importTab.dataset.mode = "import";
      importTab.textContent = "Importar";
      importTab.addEventListener("click", () => setMode("import"));
      manualTab?.after(importTab);
    }

    if (!$("#importMode")) {
      const panel = document.createElement("div");
      panel.id = "importMode";
      panel.className = "mode-panel";
      panel.innerHTML = `
        <label class="field">
          <span>Archivo JSON de receta</span>
          <input id="singleRecipeFile" type="file" accept="application/json,.json">
        </label>
        <label class="field">
          <span>O pega aqui la receta generada por chat</span>
          <textarea id="singleRecipeText" rows="9" placeholder='{"title":"Tortilla de patatas","categories":["Cena"],"time":"35 min","ingredients":["..."],"steps":"..."}'></textarea>
        </label>
        <button id="importSingleRecipeButton" type="button" class="secondary-button">Cargar en formulario</button>
        <p id="singleRecipeImportStatus" class="message"></p>
      `;
      manualPanel.after(panel);
    }
  }

  function setMode(mode) {
    document.querySelectorAll(".mode-tab").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === mode);
    });
    document.querySelectorAll(".mode-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `${mode}Mode`);
    });
  }

  async function importSingleRecipeFile(event) {
    const file = event.target.files[0];
    if (!file) return;

    try {
      importSingleRecipePayload(await file.text());
      setStatus("Receta cargada en el formulario. Revisala antes de guardar.");
    } catch (error) {
      console.error(error);
      setStatus("No se pudo leer el archivo. Comprueba que sea JSON valido.");
    } finally {
      event.target.value = "";
    }
  }

  function importSingleRecipeText() {
    const text = $("#singleRecipeText")?.value.trim();
    if (!text) {
      setStatus("Pega un JSON de receta o sube un archivo.");
      return;
    }

    try {
      importSingleRecipePayload(text);
      setStatus("Receta cargada en el formulario. Revisala antes de guardar.");
    } catch (error) {
      console.error(error);
      setStatus("No he podido importar esa receta. Pega solo el JSON o revisa el formato.");
    }
  }

  function importSingleRecipePayload(text) {
    const recipe = normalizeImportedRecipe(parseJsonFromText(text));

    $("#titleInput").value = recipe.title;
    $("#categoriesInput").value = recipe.categories.join(", ");
    $("#timeInput").value = recipe.time;
    $("#tagsInput").value = recipe.tags.join(", ");
    $("#ingredientsInput").value = recipe.ingredients.join("\n");
    $("#stepsInput").value = recipe.steps;
    $("#notesInput").value = recipe.notes;
    $("#recipeUrl").value = recipe.sourceUrl;
    const sourceUrlInput = $("#sourceUrlInput");
    if (sourceUrlInput) sourceUrlInput.value = recipe.sourceUrl;
    $("#singleRecipeText").value = "";

    document.querySelector('[data-mode="manual"]')?.click();
  }

  function parseJsonFromText(text) {
    const trimmed = String(text || "").trim();

    try {
      return JSON.parse(trimmed);
    } catch {
      const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
      if (fenced) return JSON.parse(fenced[1].trim());

      const start = trimmed.indexOf("{");
      const end = trimmed.lastIndexOf("}");
      if (start >= 0 && end > start) {
        return JSON.parse(trimmed.slice(start, end + 1));
      }
    }

    throw new Error("Invalid JSON recipe");
  }

  function normalizeImportedRecipe(input) {
    if (!input || typeof input !== "object" || Array.isArray(input)) {
      throw new Error("Recipe must be an object");
    }

    const steps = input.steps || input.preparacion || input["preparaci\u00f3n"] || input.receta;

    return {
      title: stringValue(input.title || input.nombre || input.name),
      categories: listValue(input.categories || input.categorias || input.category || input.categoria),
      tags: listValue(input.tags || input.etiquetas),
      time: stringValue(input.time || input.tiempo),
      ingredients: listValue(input.ingredients || input.ingredientes),
      steps: Array.isArray(steps) ? listValue(steps).join("\n") : stringValue(steps),
      notes: stringValue(input.notes || input.notas),
      sourceUrl: stringValue(input.sourceUrl || input.link || input.url)
    };
  }

  function stringValue(value) {
    return value == null ? "" : String(value).trim();
  }

  function listValue(value) {
    if (Array.isArray(value)) {
      return value.map(stringValue).filter(Boolean);
    }

    if (value == null || value === "") return [];

    return String(value)
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  function setStatus(text) {
    const status = $("#singleRecipeImportStatus");
    if (status) status.textContent = text;
  }
})();
