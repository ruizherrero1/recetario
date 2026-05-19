# Plantilla para crear recetas importables

Usa esta plantilla en cualquier chat cuando quieras convertir un link, una foto, una receta escrita o texto suelto en una receta lista para importar en la app.

## Prompt recomendado

Copia y pega esto en el chat, junto con el link, imagen o texto de la receta:

```text
Quiero que conviertas esta receta al formato importable de mi app de recetario.

Reglas:
- Devuelve SOLO un bloque JSON valido.
- No incluyas explicaciones fuera del JSON.
- Si no sabes algun dato, usa "" o [].
- Crea siempre un `id` estable para la receta.
- El `id` debe ir en minusculas, sin tildes, sin espacios y usando guiones bajos. Ejemplo: `pollo_asado`, `tarta_de_queso`, `lentejas_con_chorizo`.
- Si vas a guardar la receta como archivo en Drive, el nombre del archivo debe ser exactamente el `id` con extension `.json`. Ejemplo: `pollo_asado.json`.
- Convierte ingredientes en una lista, un ingrediente por elemento.
- Convierte la preparacion en texto claro con pasos separados por saltos de linea.
- Usa categorias amplias y utiles en el campo `categories`. Una receta puede tener varias.
- Asigna al menos una carpeta en el campo `carpetas`. Usa solo valores del listado disponible (ver abajo). Puedes asignar mas de una si tiene sentido.
- Usa etiquetas cortas para busqueda.
- Manten el idioma en espanol.
- No inventes ingredientes importantes que no aparezcan.
- Si el contenido viene de una web, rellena `sourceUrl` con el link original.
- Si el contenido no viene de una web, deja `sourceUrl` como "".

Listado de carpetas disponibles (usa exactamente estos valores):
Carne, Pescado, Mariscos, Verduras, Arroz, Pasta, Legumbres, Sopas y cremas, Huevos, Bocadillos, Tapas y aperitivos, Postres, Reposteria, Bebidas, Salsas

Formato exacto:
{
  "id": "",
  "title": "",
  "categories": [],
  "carpetas": [],
  "time": "",
  "tags": [],
  "ingredients": [],
  "steps": "",
  "notes": "",
  "sourceUrl": "",
  "photo": ""
}

Nota: deja `photo` como "" — la foto se sube despues desde la propia app, no se rellena en el JSON.

Contenido a convertir:
[PEGA AQUI EL LINK, TEXTO O DESCRIPCION DE LA FOTO]
```

## Ejemplo valido

```json
{
  "id": "tortilla_de_patatas",
  "title": "Tortilla de patatas",
  "categories": ["Cena", "Comida", "Tradicional"],
  "carpetas": ["Huevos"],
  "time": "35 min",
  "tags": ["sarten", "huevo", "patata"],
  "ingredients": [
    "4 patatas medianas",
    "6 huevos",
    "1 cebolla",
    "Aceite de oliva",
    "Sal"
  ],
  "steps": "Pelar y cortar las patatas en laminas finas.\nPochar la patata y la cebolla en aceite hasta que esten tiernas.\nBatir los huevos con sal.\nMezclar la patata escurrida con el huevo.\nCuajar la tortilla por ambos lados en una sarten.",
  "notes": "Dejar reposar 5 minutos antes de servir.",
  "sourceUrl": ""
}
```

## Como importarlo en la app

1. Abre la app.
2. Entra en `Anadir`.
3. Pulsa `Importar`.
4. Pega el JSON generado por el chat o sube un archivo `.json`.
5. Pulsa `Cargar en formulario`.
6. Revisa los campos.
7. Pulsa `Guardar receta`.

## Contrato de datos

- `id`: identificador obligatorio recomendado para sincronizar. Usa minusculas, sin tildes, sin espacios y con guiones bajos. Debe coincidir con el nombre del archivo si lo guardas en Drive: `id.json`.
- `title`: texto obligatorio recomendado.
- `categories`: lista de categorias libres para busqueda y filtrado en la pestana Recetas. Puede tener varias.
- `carpetas`: lista de carpetas para clasificar la receta en la pestana Carpetas. Debe contener al menos un valor del listado oficial. Puede tener mas de uno si tiene sentido. Valores disponibles: `Carne`, `Pescado`, `Mariscos`, `Verduras`, `Arroz`, `Pasta`, `Legumbres`, `Sopas y cremas`, `Huevos`, `Bocadillos`, `Tapas y aperitivos`, `Postres`, `Reposteria`, `Bebidas`, `Salsas`.
- `time`: texto libre, por ejemplo `25 min`.
- `tags`: lista de etiquetas cortas.
- `ingredients`: lista de ingredientes.
- `steps`: preparacion como texto.
- `notes`: notas opcionales.
- `sourceUrl`: link original opcional. En la app se muestra como el campo `Link` y se puede abrir desde la vista de receta.
