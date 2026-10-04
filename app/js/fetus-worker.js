// fetus-worker.js: genera la malla del feto fuera del hilo principal.
importScripts('fetus-core.js');
onmessage = function (e) {
  var m = buildFetusMesh(e.data.w, e.data.res);
  postMessage({ w: e.data.w, m: m }, [m.positions.buffer, m.normals.buffer, m.colNat.buffer, m.index.buffer]);
};
