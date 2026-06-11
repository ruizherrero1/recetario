# Recetario multiusuario con Supabase

Pasos para activar cuentas por email y recetarios compartidos por invitacion.
Mientras `supabase-config.js` este vacio, la app sigue funcionando en el modo
clasico (codigo compartido + Drive), asi que se puede desplegar sin riesgo.

## 1. Crear el proyecto

1. Entra en <https://supabase.com/dashboard> y crea un proyecto nuevo
   (p. ej. `recetario`). Region: `eu-west` (Irlanda u otra de Europa).
2. Guarda la contrasena de la base de datos en tu gestor de contrasenas.

## 2. Ejecutar la migracion

1. En el dashboard, abre `SQL Editor`.
2. Pega el contenido completo de
   `supabase/migrations/202606110001_recetario_multiusuario.sql` y ejecutalo.
3. Debe terminar sin errores (crea 4 tablas, funciones, triggers y policies).

## 3. Cerrar el registro (solo por invitacion)

1. `Authentication > Sign In / Providers`: deja solo `Email` activado.
2. En `Email`, desactiva la confirmacion doble si quieres simplificar, y
   sobre todo: en `Authentication > Settings`, **desactiva**
   `Allow new users to sign up`.
3. `Authentication > Emails > Magic Link`: asegurate de que la plantilla
   incluye el codigo OTP ademas del enlace, anadiendo `{{ .Token }}`:

   ```html
   <p>Tu codigo de acceso: {{ .Token }}</p>
   ```

   La app pide ese codigo de 6 digitos (funciona mejor que el enlace dentro
   de la PWA instalada en iPhone).

## 4. URL del sitio

En `Authentication > URL Configuration`:

- `Site URL`: `https://ruizherrero1.github.io/recetario/`
- Anade esa misma URL a `Redirect URLs`.

## 5. Configurar la app

En `Project Settings > API` copia la `URL` y la `publishable key` y rellena
`supabase-config.js`:

```js
window.RECETARIO_SUPABASE_CONFIG = {
  url: "https://TUPROYECTO.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

Sube el cambio a `main` (GitHub Pages publica solo). La publishable key es
publica por diseno; la seguridad real la ponen las policies RLS.

## 6. Crear cuentas e invitar

Para cada persona (tu mujer, tu padre, tu hermano...):

1. `Authentication > Users > Invite user` con su email. Le llega un correo
   y al pulsar el enlace queda con sesion iniciada en la app.
   (Tu propia cuenta: invitate a ti mismo la primera vez.)
2. En la app, tu creas el recetario (pantalla de entrada > "Crear un
   recetario nuevo") y en `Ajustes > Crear codigo de invitacion` generas un
   codigo de un solo uso (caduca a los 14 dias).
3. La otra persona entra en la app, pega el codigo en "Canjear invitacion"
   y queda como miembro permanente. El codigo solo sirve una vez.

Ejemplos de organizacion:

- Recetario "Casa": tu + tu mujer.
- Recetario "Padre": tu padre (y tu, si te canjeas una invitacion suya).
- Recetario "Hermano": tu hermano + su mujer.

Cada persona ve solo los recetarios donde es miembro (RLS); puede cambiar
entre ellos desde `Ajustes > Cambiar de recetario`.

## 7. Migrar las recetas actuales

En cada movil con recetas del modo antiguo: entra en el recetario nuevo y usa
`Ajustes > Importar recetas locales de este dispositivo` (omite duplicados).
Tambien sirve `Importar copia JSON` con un export antiguo, o los JSON de la
carpeta `recetas/` del repo.

## Notas

- Las fotos viajan en base64 dentro del JSON de cada receta (como hasta
  ahora). Si algun dia pesan demasiado, el siguiente paso es Supabase Storage.
- Google Drive deja de usarse en el modo nube; el grupo de Drive de Ajustes
  solo aparece en el modo clasico.
- Sin conexion, la app abre el ultimo recetario con la copia local y
  sincroniza al volver la red.
