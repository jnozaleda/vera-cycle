// config.js
// Identificador OAuth de Google (tipo "Aplicación web") para la sincronización con Google Drive.
// No es un secreto: identifica a Hera ante Google. Mientras esté vacío, la opción de
// sincronizar no se muestra en la app.

export const GOOGLE_CLIENT_ID = '922678499713-qi6icefe2piid172c0ns62brq40rhiuo.apps.googleusercontent.com';

// Mientras la app de Google esté en modo "Testing" (solo usuarias de prueba), la opción solo
// aparece al abrir Hera con ?beta (se recuerda en este navegador; ?beta=off lo desactiva).
// Pasar a false al publicar la app en Google Auth Platform.
export const SYNC_BETA_ONLY = false;

// Modo embarazo y posparto: solo visible con ?beta hasta que el contenido clínico esté revisado.
export const PREGNANCY_BETA_ONLY = false;

// Consulta con el ginecólogo. Rellenar cuando estén disponibles:
// - photo: ruta de la foto (p. ej. 'img/gonzalo.jpg'); vacío = círculo con iniciales.
// - colegiado: número de colegiado; vacío = no se muestra.
// - whatsapp: número en formato internacional sin '+' (p. ej. '34600111222'); vacío = sin botón de WhatsApp.
export const CONSULTS = {
  gineco: {
    key: 'gineco',
    name: 'Dr. Gonzalo Nozaleda',
    short: 'Gonzalo',
    initials: 'GN',
    role: 'Ginecólogo',
    scope: 'Embarazo y pruebas, medicación, anticoncepción, regla y ciclo, complicaciones',
    colegiado: '',
    photo: '',
    whatsapp: '',
    // PRUEBAS: la dirección @hera-gine.com reenvía al correo de Noza; cambiar el destino del reenvío por el real al lanzar.
    email: 'gonzalo@hera-gine.com',
    responseHours: 48,
  },
  matrona: {
    key: 'matrona',
    name: 'Marina Fernández',
    short: 'Marina',
    initials: 'MF',
    role: 'Matrona',
    scope: 'Lactancia, parto y posparto, suelo pélvico, cuidados del recién nacido',
    colegiado: '',
    photo: '',
    whatsapp: '',
    // PRUEBAS: la dirección @hera-gine.com reenvía al correo de Noza; cambiar el destino del reenvío por el real al lanzar.
    email: 'marina@hera-gine.com',
    responseHours: 48,
  },
  pediatra: {
    key: 'pediatra',
    name: 'Lucía Carrascón',
    short: 'Lucía',
    initials: 'LC',
    role: 'Pediatra',
    scope: 'Salud y cuidados del bebé: fiebre, alimentación, sueño, desarrollo, vacunas',
    colegiado: '',
    photo: '',
    whatsapp: '',
    // PRUEBAS: la dirección @hera-gine.com reenvía al correo de Noza; cambiar el destino del reenvío por el real al lanzar.
    email: 'lucia@hera-gine.com',
    responseHours: 48,
  },
};
// Compatibilidad: contacto principal (ginecología)
export const CONSULT = CONSULTS.gineco;

// Mensaje principal de Hera (bienvenida, ajustes de etapa).
export const TAGLINE = 'Embarazo, posparto y tu bebé, acompañada por tu ginecólogo, tu matrona y tu pediatra.';

// Avisos push semanales (vera-backlog#9). Servicio propio en Cloudflare: guarda solo la dirección de
// push del navegador, sus claves de cifrado y la fecha probable de parto. La clave VAPID pública no es secreta.
export const PUSH_URL = 'https://vera-push.tempcheck-app.workers.dev';
export const VAPID_PUBLIC = 'BLcknXtmkyDdEyAXBKPaty9DAR8UgcKnuSpc_QVUIIbtyX-7lwGKYBGeoMEPK2ZcvyM337DL_2t0FqEtdnKBkXQ';
