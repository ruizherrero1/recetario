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
- Sincronizacion con Google Drive como archivos JSON, uno por receta.
- Ayuda para instalar la app en iPhone desde ajustes.
- Modo local sin configurar nada.

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

## Uso recomendado

Usad un codigo largo y dificil de adivinar, por ejemplo una frase de 4 o 5 palabras. Ese mismo codigo en los dos moviles abre el mismo recetario.

Para guardar un PDF: abre una receta, pulsa `PDF` y en el dialogo del movil elige guardar como PDF o imprimir.

Para crear recetas desde cualquier chat sin API, usa `PLANTILLA_IMPORTAR_RECETAS.md`. El chat debe devolverte un JSON; despues entra en `Anadir > Importar`, pega el JSON, revisa los campos y guarda.

Para instalarlo en iPhone: abre la app en Safari, pulsa compartir y elige `Anadir a pantalla de inicio`. Si el icono no cambia, borra el acceso antiguo y vuelve a anadirlo.

## Configurar Google Drive con JSON

La app guarda cada receta como un archivo `id.json` dentro de una carpeta de Drive. Solo lee archivos JSON; documentos como `.docx` quedan ignorados. La carpeta queda fijada en `firebase-config.js`:

```js
window.RECETARIO_DRIVE_CONFIG = {
  folderId: "1iOIk142KsM7QitqasUgFItlOTbpk16yc",
  clientId: "TU_CLIENT_ID_DE_GOOGLE.apps.googleusercontent.com"
};
```

Pasos:

1. Entra en <https://console.cloud.google.com/>.
2. Crea o abre un proyecto.
3. Activa `Google Drive API`.
4. Configura la pantalla de consentimiento OAuth.
5. Crea un `OAuth client ID` de tipo `Web application`.
6. En `Authorized JavaScript origins`, anade `https://ruizherrero1.github.io`.
7. Copia el client ID en `firebase-config.js`.
8. Publica la app.
9. En la app, entra en `Ajustes > Conectar Drive`.

Si la app esta en modo `Testing`, anade como usuarios de prueba las cuentas de Google que vayan a usar el recetario.

Firebase ya no se usa. Drive es el unico origen remoto de recetas; si una receta existe con un id antiguo, la app intenta reconocerla por link o titulo para evitar duplicados.
