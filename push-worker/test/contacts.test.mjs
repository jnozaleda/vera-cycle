import { suggestContact } from '../../app/js/contacts.js';
import assert from 'node:assert/strict';
const s = (text, context = '', mode = 'postpartum') => suggestContact({ text, context, mode });

assert.equal(s('Me duele al dar el pecho y tengo una grieta').to, 'matrona');
assert.equal(s('¿Puedo tomar ibuprofeno?').to, 'gineco');
assert.equal(s('¿Qué método anticonceptivo es compatible con la lactancia?').to, 'gineco', 'anticoncepción pesa más que lactancia');
assert.equal(s('Quiero saber cómo hacer el plan de parto', '', 'pregnancy').to, 'matrona');
assert.equal(s('Tengo una ecografía y no entiendo el resultado', '', 'pregnancy').to, 'gineco');
assert.equal(s('', 'Contracciones', 'pregnancy').to, 'matrona');
assert.equal(s('', 'Mi bebé · semana 12', 'pregnancy').to, 'matrona');
assert.equal(s('hola', '', 'pregnancy').to, null, 'sin pistas en embarazo: que elija ella');
assert.equal(s('hola', '', 'cycle').to, 'gineco');
assert.equal(s('Tengo sangrado abundante y dolor intenso', '', 'pregnancy').urgent, true);
assert.equal(s('Una duda cualquiera').urgent, false);
console.log('contacts: OK');
