// Capa de datos Supabase: cuentas por email, recetarios compartidos por
// invitacion y recetas con RLS. Sustituye a Google Drive como origen remoto.
//
// La libreria se carga bajo demanda desde CDN para que el modo clasico y el
// arranque offline de la PWA no dependan de la red.

let clientPromise = null;

export function supabaseConfigured() {
  const config = window.RECETARIO_SUPABASE_CONFIG || {};
  return Boolean(config.url && config.publishableKey);
}

function getClient() {
  if (!clientPromise) {
    const config = window.RECETARIO_SUPABASE_CONFIG || {};
    clientPromise = import("https://esm.sh/@supabase/supabase-js@2").then(({ createClient }) =>
      createClient(config.url, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      })
    );
  }
  return clientPromise;
}

// ── Sesion ──────────────────────────────────────────────────

export async function getSession() {
  const client = await getClient();
  const { data } = await client.auth.getSession();
  return data.session || null;
}

export async function onAuthChange(callback) {
  try {
    const client = await getClient();
    client.auth.onAuthStateChange((_event, session) => callback(session || null));
  } catch {}
}

// Envia un email de acceso con enlace magico (y codigo OTP si la plantilla
// del proyecto lo incluye). shouldCreateUser: false: la app no crea cuentas,
// se invita desde Supabase.
export async function sendLoginCode(email) {
  const client = await getClient();
  const { error } = await client.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: location.origin + location.pathname
    }
  });
  if (error) throw new Error(translateAuthError(error));
}

export async function verifyLoginCode(email, token) {
  const client = await getClient();
  const { data, error } = await client.auth.verifyOtp({ email, token, type: "email" });
  if (error) throw new Error(translateAuthError(error));
  return data.session;
}

export async function signInWithPassword(email, password) {
  const client = await getClient();
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    if (/invalid login credentials/i.test(String(error.message))) {
      throw new Error("Email o contraseña incorrectos.");
    }
    if (/email not confirmed/i.test(String(error.message))) {
      throw new Error("Cuenta sin confirmar. Revisa tu correo o pide un enlace de acceso.");
    }
    throw new Error(translateAuthError(error));
  }
  return data.session;
}

// Con confirmacion automatica activada en el proyecto, signUp devuelve sesion
// directamente y no se envia ningun email.
export async function signUpWithPassword(email, password) {
  const client = await getClient();
  const { data, error } = await client.auth.signUp({ email, password });
  if (error) {
    if (/already registered|already been registered/i.test(String(error.message))) {
      throw new Error("Ese email ya tiene cuenta. Entra con tu contraseña.");
    }
    if (/at least|password/i.test(String(error.message))) {
      throw new Error("La contraseña debe tener al menos 6 caracteres.");
    }
    throw new Error(translateAuthError(error));
  }
  return data.session;
}

export async function updatePassword(password) {
  const client = await getClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) {
    if (/different from the old|same password/i.test(String(error.message))) {
      throw new Error("La nueva contraseña debe ser distinta de la actual.");
    }
    throw new Error("No se pudo cambiar la contraseña. Vuelve a intentarlo.");
  }
}

export async function signOut() {
  const client = await getClient();
  await client.auth.signOut();
}

function translateAuthError(error) {
  const message = String(error?.message || "");
  if (/signups not allowed|user not found|otp_disabled/i.test(message)) {
    return "Este email no tiene cuenta. Pide una invitacion al administrador.";
  }
  if (/expired|invalid/i.test(message)) {
    return "Codigo incorrecto o caducado. Pide uno nuevo.";
  }
  if (/rate limit|security purposes/i.test(message)) {
    return "Demasiados intentos. Espera un minuto y vuelve a probar.";
  }
  return "No se pudo completar el acceso. Vuelve a intentarlo.";
}

// ── Recetarios y membresias ─────────────────────────────────

export async function listCookbooks() {
  const client = await getClient();
  const { data, error } = await client
    .from("cookbooks")
    .select("id, name, owner_id, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data || [];
}

// Sin .select() tras el insert: el RETURNING exigiria pasar la policy de
// SELECT (ser miembro), pero la membresia la crea un trigger AFTER INSERT
// que aun no es visible en ese momento y Postgres rechaza la operacion.
// Generamos el id en cliente para no necesitar leer la fila de vuelta.
export async function createCookbook(name) {
  const client = await getClient();
  const session = await getSession();
  const cookbook = { id: crypto.randomUUID(), name, owner_id: session.user.id };
  const { error } = await client.from("cookbooks").insert(cookbook);
  if (error) throw error;
  return cookbook;
}

export async function redeemInvite(code) {
  const client = await getClient();
  const { data, error } = await client.rpc("redeem_invite", { p_code: code });
  if (error) {
    const message = String(error.message || "");
    if (/no valido/i.test(message)) throw new Error("Codigo no valido.");
    if (/ya se ha usado/i.test(message)) throw new Error("Ese codigo ya se ha usado.");
    if (/caducado/i.test(message)) throw new Error("Ese codigo ha caducado.");
    throw new Error("No se pudo canjear la invitacion.");
  }
  return data?.[0] || null;
}

export async function createInvite(cookbookId, role = "editor") {
  const client = await getClient();
  const session = await getSession();
  const code = randomInviteCode();
  const { error } = await client
    .from("cookbook_invites")
    .insert({ code, cookbook_id: cookbookId, role, created_by: session.user.id });
  if (error) throw error;
  return code;
}

function randomInviteCode() {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(10));
  return Array.from(bytes).map((byte) => alphabet[byte % alphabet.length]).join("");
}

// ── Recetas ─────────────────────────────────────────────────

// Devuelve tambien las recetas borradas (tombstones) para que el merge local
// no resucite recetas eliminadas desde otro dispositivo.
export async function fetchRecipes(cookbookId) {
  const client = await getClient();
  const { data, error } = await client
    .from("recipes")
    .select("id, data, updated_at, deleted_at")
    .eq("cookbook_id", cookbookId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data || []).map((row) => ({
    ...row.data,
    id: row.id,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at || row.data?.deletedAt || ""
  }));
}

export async function upsertRecipe(cookbookId, recipe) {
  const client = await getClient();
  const { error } = await client
    .from("recipes")
    .upsert(
      {
        cookbook_id: cookbookId,
        id: recipe.id,
        data: recipe,
        deleted_at: recipe.deletedAt ? new Date(recipe.deletedAt).toISOString() : null
      },
      { onConflict: "cookbook_id,id" }
    );
  if (error) throw error;
}
