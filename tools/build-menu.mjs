// Pone (o actualiza) el menú lateral en las páginas hechas a mano: portada, equipo, soporte y privacidad.
// Las páginas generadas lo llevan ya por web-shell.mjs. Rehacer tras cambiar tools/menu.mjs:
//
//   node tools/build-menu.mjs

import fs from 'node:fs';
import { MENU_BUTTON, MENU_PANEL, MENU_CSS, MENU_JS } from './menu.mjs';

const ROOT = new URL('../', import.meta.url);
const FILES = ['index.html', 'equipo.html', 'support.html', 'privacy.html'];
// En estas cabeceras (flex con space-between) el botón va al final: lo de antes se arrima a él
const HAND_CSS = 'header.top .wrap>.nav,header.top .wrap>.top-cta,header.top .wrap>.btn,header.top .top-in>.btn{margin-left:auto}header.top .top-in{display:flex;align-items:center}';

const block = (name, html) => `<!-- menu:${name} -->${html}<!-- /menu:${name} -->`;
const put = (s, name, html, insert) => {
  const re = new RegExp(`<!-- menu:${name} -->[\\s\\S]*?<!-- /menu:${name} -->`);
  return re.test(s) ? s.replace(re, () => block(name, html)) : insert(s, block(name, html));
};

for (const f of FILES) {
  const url = new URL(f, ROOT);
  let s = fs.readFileSync(url, 'utf8');
  s = put(s, 'css', `<style>${MENU_CSS}\n${HAND_CSS}</style>`, (t, b) => t.replace('</head>', `${b}\n</head>`));
  s = put(s, 'btn', MENU_BUTTON, (t, b) => {
    const h = t.indexOf('</header>');
    const d = t.lastIndexOf('</div>', h);
    if (h < 0 || d < 0) throw new Error(`${f}: sin cabecera`);
    return `${t.slice(0, d)}  ${b}\n  ${t.slice(d)}`;
  });
  s = put(s, 'panel', `${MENU_PANEL}${MENU_JS}`, (t, b) => { const i = t.lastIndexOf('</body>'); return `${t.slice(0, i)}${b}\n${t.slice(i)}`; });
  fs.writeFileSync(url, s);
  console.log(f, 'menú ok');
}
