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
- Convierte ingredientes en una lista, un ingrediente por elemento.
- Convierte la preparacion en texto claro con pasos separados por saltos de linea.
- Usa categorias amplias y utiles. Una receta puede tener varias categorias.
- Usa etiquetas cortas para busqueda.
- Manten el idioma en espanol.
- No inventes ingredientes importantes que no aparezcan.

Formato exacto:
{
  "title": "",
  "categories": [],
  "time": "",
  "tags": [],
  "ingredients": [],
  "steps": "",
  "notes": "",
  "sourceUrl": ""
}

Contenido a convertir:
[PEGA AQUI EL LINK, TEXTO O DESCRIPCION DE LA FOTO]
```

## Ejemplo valido

```json
{
  "title": "Tortilla de patatas",
  "categories": ["Cena", "Comida", "Tradicional"],
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
2. Entra en `Añadir`.
3. Pulsa `Importar`.
4. Pega el JSON generado por el chat o sube un archivo `.json`.
5. Pulsa `Cargar en formulario`.
6. Revisa los campos.
7. Pulsa `Guardar receta`.

## Contrato de datos

- `title`: texto obligatorio recomendado.
- `categories`: lista de categorias. Puede tener varias.
- `time`: texto libre, por ejemplo `25 min`.
- `tags`: lista de etiquetas cortas.
- `ingredients`: lista de ingredientes.
- `steps`: preparacion como texto.
- `notes`: notas opcionales.
- `sourceUrl`: link original opcional.
