-- Medición de uso de Hera (vera-backlog#6). Solo recuentos por día; sin IP, sin identificadores de persona.
CREATE TABLE IF NOT EXISTS counts (day TEXT NOT NULL, k TEXT NOT NULL, n INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (day, k));
-- Huellas diarias (hash de IP + navegador + día + sal) para contar personas distintas por día; se borran a las 48 h.
CREATE TABLE IF NOT EXISTS visitors (day TEXT NOT NULL, h TEXT NOT NULL, PRIMARY KEY (day, h));

-- Actividad en tiempo real para el equipo (fase de pruebas): eventos anónimos con dispositivo y etiqueta de persona del día; 7 días.
CREATE TABLE IF NOT EXISTS activity (ts INTEGER NOT NULL, e TEXT NOT NULL, d TEXT, p TEXT);
CREATE INDEX IF NOT EXISTS activity_ts ON activity (ts);
