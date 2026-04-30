# Recetario

App movil para guardar recetas, organizarlas por categorias y etiquetas, sincronizarlas entre dos personas y generar una version imprimible/PDF.

## Que incluye

- Entrada con codigo compartido, sin pantalla de login.
- Listado de recetas con busqueda, filtro por categoria y ordenacion.
- Una receta puede tener varias categorias.
- Campo `Link` para guardar la web original y abrirla desde la receta.
- Vista de receta en modo lectura.
- Botones para editar, eliminar y generar PDF desde la vista de receta.
- Alta manual de recetas.
- Importacion de recetas generadas por chat mediante JSON.
- Importacion desde foto de receta escrita mediante OCR en el navegador.
- Importacion desde link cuando la web lo permite; si no, permite pegar el texto.
- Aviso de posible duplicado por nombre o link.
- Exportacion e importacion de copia JSON.
- Ayuda para instalar la app en iPhone desde ajustes.
- Modo local sin configurar nada.
- Sincronizacion con Firebase cuando se rellena `firebase-config.js`.

## Limitaciones importantes

GitHub Pages es una web estatica: no puede guardar por si sola archivos dentro del repositorio ni ejecutar codigo de servidor. Por eso la app guarda recetas como datos editables y genera el PDF cuando se pulsa el boton `PDF`.

El codigo compartido no es un sistema de seguridad fuerte como usuario y contrasena. Sirve para uso familiar o privado entre pocas personas. No guardes informacion sensible.

La importacion desde redes sociales y muchas webs puede fallar porque bloquean la lectura desde una web estatica. En esos casos usa captura/foto o pega el texto.

## Publicar en GitHub Pages

1. Sube estos archivos al repositorio `ruizherrero1/recetario`.
2. En GitHub entra en `Settings`.
3. Abre `Pages`.
4. En `Build and deployment`, elige `Deploy from a branch`.
5. Elige rama `main` y carpeta `/root`.
6. Guarda.
7. La app quedara publicada en `https://ruizherrero1.github.io/recetario/`.

## Configurar Firebase gratis para sincronizar

1. Entra en <https://console.firebase.google.com/>.
2. Crea un proyecto nuevo.
3. En `Build > Authentication`, activa `Anonymous`.
4. En `Build > Firestore Database`, crea una base de datos en modo produccion.
5. En reglas de Firestore, pega el contenido de `firestore.rules` y publica.
6. En `Project settings > General`, crea una app web.
7. Copia la configuracion `firebaseConfig`.
8. Edita `firebase-config.js` y rellena `window.RECETARIO_FIREBASE_CONFIG`.
9. Sube el cambio a GitHub.

Firestore tiene cuota gratis suficiente para un recetario pequeno: 1 GiB de datos, 50.000 lecturas al dia, 20.000 escrituras al dia y 20.000 borrados al dia.

## Uso recomendado

Usad un codigo largo y dificil de adivinar, por ejemplo una frase de 4 o 5 palabras. Ese mismo codigo en los dos moviles abre el mismo recetario.

Para guardar un PDF: abre una receta, pulsa `PDF` y en el dialogo del movil elige guardar como PDF o imprimir.

Para crear recetas desde cualquier chat sin API, usa `PLANTILLA_IMPORTAR_RECETAS.md`. El chat debe devolverte un JSON; despues entra en `Anadir > Importar`, pega el JSON, revisa los campos y guarda.

Para instalarlo en iPhone: abre la app en Safari, pulsa compartir y elige `Anadir a pantalla de inicio`. Si el icono no cambia, borra el acceso antiguo y vuelve a anadirlo.
