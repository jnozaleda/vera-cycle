# Hera · memoria del proyecto (para otras herramientas de IA)

Resumen para usar Hera como contexto en otra conversación (por ejemplo, con ChatGPT). Está al día a **27 de noviembre de 2026**.
El detalle de cada cambio, con fechas, está en [`ESTADO.md`](ESTADO.md) (en la misma carpeta). Sin datos personales, correos ni claves.

## Qué es

**Hera** ([hera-gine.com](https://hera-gine.com)) es una web y una app (PWA) donde tres profesionales sanitarios responden **por escrito**
las dudas de salud de mujeres y familias, sin cita y sin videollamada:

- **Gonzalo**: ginecólogo (Hospital Gregorio Marañón). Regla, anticoncepción, embarazo, menopausia.
- **Marina**: matrona (Clínica Universidad de Navarra). Embarazo, parto, posparto, lactancia.
- **Lucía**: pediatra (Hospital Gregorio Marañón). Fiebre, sueño, alimentación, piel y desarrollo del bebé.

Todos con más de 15 años de experiencia. El dueño del producto es **Noza** (no es sanitario; dirige producto, anuncios y técnica con ayuda de Claude).
Público: España y Latinoamérica (Argentina, México, Chile, Colombia). La mayoría entra desde el móvil.

## Cómo funciona hoy (modelo «escribir gratis»)

1. **La usuaria escribe su duda y su correo en la portada. Enviar es gratis**, sin tarjeta ni registro.
2. **Le llega a la profesional por correo** con tres botones:
   - **Responder y pedir el pago de 5 €**: escribe su respuesta y a la usuaria le llega con el botón «Pagar 5 € y recibir la respuesta».
     También puede contestar desde el correo: su respuesta lleva el botón de pago.
   - **Es rápido: responder gratis**: contesta sin cobrar (con la oferta de seguir por 5 €).
   - **Es urgente**: sin pago; le dice que vaya a urgencias.
   - Contestar al correo **sin pulsar nada** sirve para pedir más datos antes de decidir (no cobra).
3. **Si paga**, la profesional recibe el aviso y responde entera en la misma conversación (plazo: 24 h). La usuaria recibe confirmación del pago.
4. **Si no paga**: recordatorio a las 24 h; si escribe después de que le pidan el pago, cada mensaje suyo recibe un correo automático
   «falta completar el pago»; 6 h después del recordatorio, un correo de producto preguntando «¿Qué te frenó?» (precio, pago, confianza…).
5. **Consulta sin texto**: no llega a la profesional; a la usuaria le pedimos su duda por correo.
6. La conversación sigue **por correo**, a través de direcciones de Hera (ninguna ve el correo personal de la otra).

**Precios**: consulta por escrito **5 €** (respuesta completa; gratis si es algo rápido). Acompañamiento mensual 99 €/mes
(respuesta en menos de 6 h, una videollamada y WhatsApp). Videollamada 30 min 55 €, llamada 15 min 25 €. Devolución si no sirve.

**Historia de precios** (para entender los datos): hasta el 21 nov, 2 consultas gratis por persona → del 22 nov, 1 € (Black Friday), luego
9 € y prueba 9 € / 29 € (prioritaria, menos de 6 h), siempre pagando **antes** de enviar → el 24 nov, 5 € → desde el 24-25 nov,
**escribir gratis y la profesional pide el pago** (modelo actual).

## Cifras reales

| Día | Personas en la portada | Consultas enviadas | Pago pedido | Pagadas |
|---|---|---|---|---|
| 20 nov (gratis) | 70 | 13 | — | — |
| 21 nov (gratis) | 84 | 11 | — | — |
| 22 nov (1 € / 9 €, pago antes) | 64 | 6 | — | — |
| 23 nov (9 € / 29 €) | 70 | 1 | — | — |
| 24 nov (5 €, pago antes) | 33 | 0 | — | — |
| 25 nov (escribir gratis) | 44 | 14 | 10 | 0 |
| 26 nov | 17 | 4 | 2 | 0 |

- **Pagos reales de consultas desde el 20 nov: 0** (solo una prueba interna, ya devuelta).
- Con pago antes de escribir, casi nadie empezaba a escribir (de ~30 % a <10 % de las visitas).
- Con «escribir gratis» vuelven a llegar consultas, pero nadie ha pagado aún los 5 €. La mayoría vienen de anuncios de Latinoamérica.
- **Google Ads: todas las campañas de Hera en pausa desde el 26 nov** (antes ~6,50-22 €/día en España, Argentina y México/Chile/Colombia).

## Cómo se mide (sin cookies)

Sin cookies ni píxeles de anuncios. La web avisa al servicio de acciones anónimas (visitas, bajar, escribir, enviar, pagar) con una etiqueta
diaria que no identifica a nadie. **Panel privado** con embudo, consultas recientes y su estado, pagos, pruebas de precio, origen
(anuncio, enlaces propios), un **mapa de calor** de la portada (dónde tocan) y un buscador de consultas. Correo con 10/10 en mail-tester.

## Canales

- Google Ads (en pausa), guías de salud con SEO (embarazo, bebé, menopausia, pediatría), cuestionario de menopausia, app instalable.
- Enlaces propios `?via=`: de las profesionales (con 2 gratis), de amigas (5 gratis hasta el 31 dic), de socios a 5 € (dos influencers y una clínica).
- WhatsApp: en «Próximamente» (apagado).

## Técnica (resumen)

- Web estática en GitHub Pages (repositorio público `jnozaleda/vera-cycle`). App PWA en `app/`.
- Servicio de consultas en Cloudflare Workers (`consult-worker/`): consultas, correos (Resend), pagos (Stripe, en modo real), panel.
- Datos en Cloudflare KV y D1. El **texto de las consultas no se guarda en Hera**: solo va en los correos; el correo de la usuaria se guarda cifrado.

## Reglas que hay que respetar

- Nada de datos personales de usuarias en documentos, commits o issues.
- **Promesas clínicas** (plazos, qué revisan, qué es «rápido») solo si las confirman Gonzalo, Marina y Lucía.
- Diseño sobrio: sin emojis, sin degradados, iconos de línea, datos reales.
- Castellano sencillo, sin jerga.
- No tocar precios ni presupuesto de anuncios sin que Noza lo pida.

## Preguntas abiertas

- ¿Por qué nadie paga los 5 € después de que la profesional lo pide? (¿precio, desconfianza, pago desde Latinoamérica en euros,
  o que la respuesta gratis/rápida ya les basta?). El correo «¿Qué te frenó?» empieza a dar respuestas.
- ¿Volver a encender anuncios, y en qué países?
- ¿Pasar la app y la página /consultas/ al modelo «escribir gratis»? (hoy siguen con pago antes de enviar).
