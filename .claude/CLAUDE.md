# Hera · normas para cualquier sesión de Claude (local o en la nube)

Hera (hera-gine.com): la web y la app (PWA) donde Gonzalo (ginecólogo), Marina (matrona) y Lucía (pediatra)
responden por escrito las dudas de salud de mujeres y familias. El dueño del producto es Noza.

**Este repositorio es público** y GitHub Pages publica la raíz en hera-gine.com. Esta carpeta `.claude/` no se publica
en la web (empieza por punto), pero sí se ve en GitHub: aquí nunca van secretos, correos, nombres de usuarias ni
contenido de consultas.

## Al empezar y al terminar (coordinación entre sesiones)

1. Al empezar: `git pull`, leer [`ESTADO.md`](ESTADO.md) y los issues abiertos con `gh issue list -R jnozaleda/vera-backlog`.
   Mirar también si hay ramas sin publicar (`git branch -r`) que haya dejado otra sesión.
2. Al terminar algo que se publica: añadir una entrada arriba del registro de `ESTADO.md` (fecha, qué cambia en
   palabras sencillas, commit, estado) y actualizar «En marcha» si toca.
3. Si algo queda a medias (falta desplegar, probar en el móvil, decidir…): abrir un issue en `jnozaleda/vera-backlog`
   con la etiqueta `Claude` (o `Noza` si le toca a él), qué falta y el commit. Nunca dejar una rama sin publicar sin issue.
4. Trabajar directamente en `main` (autorizado). Si dos sesiones pueden coincidir, `git pull --rebase` antes de subir.

## Desplegar

- **Web** (portada, app, guías, páginas): `git push` a `main`; GitHub Pages la publica en 1–2 minutos.
  Las guías y páginas generadas se editan en `tools/` y `tools/data/` y se regeneran con `node tools/build-*.mjs`;
  no editar a mano el HTML generado.
- **Servicio de consultas** (`consult-worker/`, Cloudflare Worker): antes de desplegar, `git pull` (para no pisar lo de
  otra sesión) y `npm test` en verde; luego `npx wrangler deploy`. El servicio de avisos está en `push-worker/`.
- Después de publicar, comprobarlo en la web real o en el panel y decirlo. Si no se puede desplegar, dejar issue.
- En la app, al cambiar archivos de `app/`, subir la versión de caché en `app/sw.js` (`vera-web-vNNN`).

## Cómo trabaja Noza

- Castellano sencillo, sin jerga técnica. Respuestas claras y cortas.
- Si pide «propuesta» o «borrador», primero un borrador visual (HTML estático con imágenes incrustadas, sin JS ni
  archivos aparte) y no se implementa hasta que diga «implementa» o «despliega».
- Diseño: sin emojis, sin degradados, sin textos de plantilla; iconos de línea y datos reales.
- Cerrar cada respuesta con la tabla «⚠️ Pending backlog» (solo pendientes de producto, con enlace al archivo y al issue).
- No tocar presupuestos de anuncios ni precios sin que Noza lo pida.

## Cuidado

- Secretos solo en `consult-worker/.secrets.json` y `push-worker/.secrets.json` (ignorados por git); leerlos solo dentro
  de scripts, nunca imprimirlos.
- Stripe está en **modo real**: no crear pagos ni pagar sin permiso de Noza.
- Pruebas desde un dispositivo en «modo equipo» (`localStorage hera-equipo = 1`): no cuentan en el panel.
- Nada de datos personales en issues, commits ni en este repositorio.
- Promesas clínicas (plazos, qué revisan) solo si las han confirmado las profesionales.

## Dónde está cada cosa

- `index.html`: portada con la caja de consulta, pruebas de precio (Black Friday, prioritaria) y precios.
- `app/`: la app (PWA). `guias/`: guías generadas (`tools/build-guias.mjs`).
- `consult-worker/src/`: `worker.js` (consultas, correos, pagos), `panel.js` (panel privado), `activity.js` (eventos),
  `stripe.js` (planes y pagos). Tests en `consult-worker/test/worker.test.mjs`.
- Panel privado: `https://hera-consultas.tempcheck-app.workers.dev/panel?k=…` (la clave es secreta).
