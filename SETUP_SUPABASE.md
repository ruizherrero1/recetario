# Recetario multiusuario con Supabase

Pasos para activar cuentas por email y recetarios compartidos por invitacion.
Mientras `supabase-config.js` este vacio, la app sigue funcionando en el modo
clasico (codigo compartido + Drive), asi que se puede desplegar sin riesgo.

> **Estado actual**: el recetario reutiliza el proyecto Supabase de
> GymLog-Web (`tnuohiyrwnoqsnxyfonn`) porque el plan gratuito limita a 2
> proyectos activos. Las tablas del recetario tienen su propio RLS y no
> tocan nada de GymLog. La migracion (paso 2) ya esta ejecutada y
> `supabase-config.js` ya esta relleno. Una misma cuenta de email sirve
> para GymLog y para el recetario.

## 1. Proyecto

Reutilizamos `gymlog-web`. Si algun dia se quiere separar: crear proyecto
nuevo, ejecutar la migracion alli y cambiar `supabase-config.js`.

## 2. Ejecutar la migracion (hecho)

En `SQL Editor`, pegar y ejecutar
`supabase/migrations/202606110001_recetario_multiusuario.sql`
(crea 4 tablas, funciones, triggers y policies).

## 3. Registro

El registro global queda **abierto** porque GymLog-Web lo usa. El acceso a
los recetarios sigue siendo solo por invitacion: sin membresia (codigo de
invitacion canjeado) no se ve ningun dato — lo garantiza RLS, y la app de
recetario no crea cuentas (`shouldCreateUser: false`).

**Login por enlace magico.** El plan gratuito no permite editar las
plantillas de email sin configurar un SMTP propio, asi que el email de
acceso trae solo el enlace (sin codigo). La app envia el enlace con
redireccion al propio recetario y detecta la sesion al aterrizar.

Mejora opcional futura: configurar un SMTP gratuito (Resend, Brevo...) en
`Project Settings > Auth > SMTP` permite editar la plantilla y anadir
`{{ .Token }}` para entrar tecleando un codigo de 6 digitos — util en la
PWA instalada en iPhone, donde el enlace abre Safari en lugar de la app.
El campo de codigo ya esta en la pantalla de login, esperando a eso. El
enlace debe mantenerse en la plantilla para no cambiar el flujo de GymLog.

## 4. URLs permitidas

En `Authentication > URL Configuration`, **anadir** a `Redirect URLs` (sin
quitar las de GymLog):

- `https://ruizherrero1.github.io`
- `https://ruizherrero1.github.io/**`

`Site URL` se queda como esta (`https://gym.ramonruizherrero.com`).

## 5. Configurar la app (hecho)

`supabase-config.js` ya apunta al proyecto compartido. La publishable key es
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
