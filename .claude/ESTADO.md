# Hera · estado y registro compartido

Lo leen y lo actualizan todas las sesiones de Claude (ver `CLAUDE.md`). Arriba, lo que está en marcha; debajo, el
registro de cambios publicados, el más reciente primero. Sin datos personales ni secretos.

## En marcha

| Qué | Detalle | Hasta / cuándo | Dónde |
|---|---|---|---|
| Prueba Black Friday | Desde el 21 nov, sin reparto al azar: quien llega por un anuncio de «2 consultas gratis» ve la versión gratis; solo el anuncio «Black Friday · 1 €» (`utm_content=bf`) lleva a la de 1 € (sin gratis, pago al enviar). Antes, 50/50 al azar. Ver una versión a propósito: `?utm_medium=cpc&utm_campaign=prueba&ab=bf` (o `ab=gratis`) | Hasta el 1 dic (`BF_END`). Leer resultados el 2 dic en el panel, «Pruebas de precio» | `index.html` (AB/BF), `worker.js` (`bf`, plan `bf1`) |
| Consulta prioritaria | Campaña propia `utm_campaign=prioritaria`: 29 €, sin gratis, respuesta en menos de 6 h, aviso con hora límite y recordatorio a las 4 h | Desde el 2 dic, cuando Noza cree la campaña y las profesionales confirmen el plazo | `index.html` (PRIO), `worker.js` (`prio`, plan `prio29`) |
| WhatsApp | En «Próximamente · Avísame» (pago desactivado); la lista de avisos está en el panel | Hasta que Noza decida volver a encenderlo (`SOON = false` en `tools/build-whatsapp.mjs`) | `tools/build-whatsapp.mjs`, `index.html` |
| Enlaces propios | `?via=` de las profesionales, enlaces de amigas (5 gratis hasta el 31 dic) y del grupo (2 gratis) | 31 dic | `worker.js` (`FRIEND_LINKS`), `panel.js` (`VIA_NAME`) |
| Pendientes | Backlog de producto | — | Issues de `jnozaleda/vera-backlog` |

## Registro

### 2026-11-22
- **Guías: medición para quien llega por anuncio**: tiempo (`guia_tiempo:10/30/60/180`), lectura (`guia_scroll:25…100`) y clics (`guia_clic:preguntar|videollamada|otra_guia|whatsapp|otro`), con nombres propios para no mezclarse con la portada. Solo con gclid o utm_medium=cpc. (publicado)

### 2026-11-21
- **Consultas repetidas**: si alguien vuelve a escribir al mismo profesional en 30 min y aún no le han respondido, se añade a su consulta (misma conversación, no gasta otra; `ADD_WINDOW_MIN`, `rec.lt`). Tras enviar: «¿Se te ha olvidado algo? Escríbelo aquí…»; el botón dice «Añadir a tu consulta a X» esos 30 min; en las versiones de pago, «Para X» bajo el botón. Panel: columna «Recordatorio» con cuál ha salido y cuándo el siguiente. (publicado)
- **Recordatorios de pago pendiente**: dos en vez de uno, a la hora y a las 24 h (antes, uno a las 3–4 h), con cómo se paga y «si has tenido un problema, responde». El servicio revisa cada 15 min con un solo cron (el plan gratis de Cloudflare ya tiene los 5 usados); lo horario va a los :15. En el panel, tras qué recordatorio pagan. Worker b6dfc0ac. (publicado)
- **Anuncios «Black Friday · 1 €»** (aprobados por Noza): 8 anuncios, uno por grupo de ginecólogo, matrona y pediatra en España, Argentina y México/Chile/Colombia, con `utm_content=bf`. Pausa programada el 2 dic a las 00:05 (en esta sesión).
- **Black Friday sin engañar**: los anuncios prometen «2 consultas gratis», así que la portada ya no enseña la versión de 1 € a quien llega por ellos; solo el anuncio de 1 € (`utm_content=bf`) lleva a ella. Nota del panel actualizada. Pausadas «dudas embarazo» (España y México/Chile/Colombia) y «dudas menopausia» (México/Chile/Colombia); nuevas palabras clave (chat ginecologo, ginecologa gratis, ginecologa virtual, pediatra virtual) y negativas (foro, posiciones, calcular, creatina). (publicado)
- **Modo equipo y pagos**: abrir el pago de Stripe desde un dispositivo del equipo ya no cuenta en «Fueron a Stripe».
  Limpieza de datos: borrada una consulta Black Friday de prueba (guardada sin pagar) y su «fue a Stripe», y dos
  eventos de comprobación del despliegue. Worker desplegado (versión 47ac6c71). (sesión en la nube; publicado)
- **Google Ads**: campaña nueva «Hera | Guías | España» (2 €/día, tope 0,40 €/clic) hacia las guías de menopausia y
  lactancia; España baja a 5 €/día sin «dudas menopausia» ni «dudas lactancia»; Argentina sube a 10 €/día; topes de
  clic en España (1,50 €) y México/Chile/Colombia (1 €); palabras negativas. Todo aprobado por Noza.
- **Coordinación entre sesiones**: este archivo y `CLAUDE.md` en `.claude/` (no se publican en la web).
- **Guías desde anuncios**: el logo e «Inicio» también llevan el código del clic a la portada; en el panel, grupo
  «Google Ads · a una guía» en «De dónde vienen». (7a268fd, publicado)
- **Embudo del pago con Stripe**: «fue a Stripe», «volvió sin pagar» y «a medias», con tarjeta en el panel; el total de
  pagos ya cuenta 1 € y 29 €. (8c8e5e0, sesión en la nube; publicado)
- **Guías como destino de anuncios** y dos guías nuevas de lactancia revisadas por Marina. (648e5d8, b8b3ab8; publicado)
- **Copy común de la portada**: título y subtítulo con los nombres, cifras reales (`GET /cifras`, 30 días), texto de
  ayuda, privacidad, opinión publicable de una usuaria y pantalla «X ya tiene tu consulta». (c488866, publicado)
- **Precios**: «Comprar un bono o el ilimitado» abre ahí mismo correo + plan y va al pago. (7499068, publicado)
- **Consulta prioritaria (29 €)** lista para la campaña del 2 dic. (bacb323, publicado)
- **Black Friday**: pasos «1 Envía tu duda · 2 Confirma el pago · 3 Te respondemos», botón «Continuar al pago · 1 €»,
  «Preguntar · 1 €» arriba, sin WhatsApp ni «gratis» en esa versión. (publicado)
- **Panel**: país de visitas y consultas, versión vista en «Últimas visitas», «Visitas y consultas por día» con
  selector Todo / Web / App y línea del % que consulta.

### 2026-11-20
- **Prueba Black Friday 1 €** (50/50 en anuncios) y **oferta de llamada, videollamada o consulta nueva** en la primera
  respuesta de las consultas de anuncio. (55ecf1f)
- **Portada** sin desplazamiento lateral en móviles de 375 px. (5767aec)
- Avisos al equipo: sin resumen por hora ni avisos de visitas; aviso con correo cuando alguien pide «Avísame» de WhatsApp.

### Antes
- Historial anterior: `git log` y los issues cerrados de `jnozaleda/vera-backlog`.
