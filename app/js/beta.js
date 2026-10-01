// beta.js
// Funciones en pruebas: solo visibles al abrir Vera con ?beta (se recuerda en este navegador;
// ?beta=off lo desactiva).

const BETA_KEY = 'vera-beta';

function readBeta() {
  try {
    const p = new URLSearchParams(location.search).get('beta');
    if (p === 'off') localStorage.removeItem(BETA_KEY);
    else if (p !== null) localStorage.setItem(BETA_KEY, '1');
    return localStorage.getItem(BETA_KEY) === '1';
  } catch { return false; }
}

const beta = typeof location !== 'undefined' && readBeta();
export const isBeta = () => beta;
