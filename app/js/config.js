// config.js
// Identificador OAuth de Google (tipo "Aplicación web") para la sincronización con Google Drive.
// No es un secreto: identifica a Vera ante Google. Mientras esté vacío, la opción de
// sincronizar no se muestra en la app.

export const GOOGLE_CLIENT_ID = '947810760672-ko1k3rkl8h94hpmjc0tmaqe2i1h6m18c.apps.googleusercontent.com';

// Mientras la app de Google esté en modo "Testing" (solo usuarias de prueba), la opción solo
// aparece al abrir Vera con ?beta (se recuerda en este navegador; ?beta=off lo desactiva).
// Pasar a false al publicar la app en Google Auth Platform.
export const SYNC_BETA_ONLY = true;
