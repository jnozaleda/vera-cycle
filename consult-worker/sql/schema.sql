-- Medición de uso de Hera (vera-backlog#6). Solo recuentos por día; sin IP, sin identificadores de persona.
CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, k));
-- Huellas diarias (hash de IP + navegador + día + sal) para contar personas distintas por día; se borran a las 48 h.
CREATE TABLE IF NOT EXISTS visitors (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h));

-- Actividad en tiempo real para el equipo (fase de pruebas): eventos anónimos con dispositivo y etiqueta de persona del día; 31 días.
CREATE TABLE IF NOT EXISTS activity (ts INTEGER NOT NULL, e TEXT NOT NULL, d TEXT, p TEXT);
CREATE INDEX IF NOT EXISTS activity_ts ON activity (ts);

-- Opiniones tras la consulta: sin correo ni número de consulta. nombre solo si la usuaria deja publicarlo.
CREATE TABLE IF NOT EXISTS opiniones (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, pro TEXT NOT NULL, rating INTEGER NOT NULL, texto TEXT NOT NULL, nombre TEXT, publicable INTEGER NOT NULL DEFAULT 0);

-- Pagos (src/stripe.js, vera-backlog#56). Solo la huella del correo, nunca el correo ni la consulta.
CREATE TABLE IF NOT EXISTS pagos (session TEXT PRIMARY KEY, h TEXT NOT NULL, plan TEXT NOT NULL, live INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS saldo (h TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, until TEXT, sub TEXT, sub_until TEXT, day TEXT);
