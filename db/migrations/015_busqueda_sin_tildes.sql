-- =====================================================================
-- Turnoo · Migración 015 · Búsqueda de clientes sin tildes
-- Se aplica con el superusuario (npm run db:migrar), después de la 014.
--
-- Buscar "Rapido" debe encontrar a "Cliente Rápido", y "PEREZ" a "Ana Pérez".
--
--  * unaccent quita las tildes (á→a, ñ→n, ü→u).
--  * texto_para_buscar(): minúsculas y sin tildes. unaccent() es STABLE (su
--    diccionario podría cambiar); esta función la fija al diccionario
--    public.unaccent y se declara IMMUTABLE para poder indexarla si hiciera falta.
--  * La consulta compara texto_para_buscar(nombre) LIKE texto_para_buscar($texto).
--
-- Sin índice de trigramas (pg_trgm) a propósito: con RLS, Postgres evalúa un
-- LIKE (que no es LEAKPROOF) después de la política, así que ese índice nunca
-- se usaría con el rol turnoo_app. Lo que sí acota la búsqueda es filtrar por
-- negocio_id en la consulta: entra por el índice UNIQUE (negocio_id, ...) y
-- solo recorre los clientes de ese negocio.
-- =====================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS unaccent;

CREATE FUNCTION texto_para_buscar(texto text) RETURNS text
  LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
  RETURN lower(public.unaccent('public.unaccent'::regdictionary, texto));

GRANT EXECUTE ON FUNCTION texto_para_buscar(text) TO turnoo_app;

COMMIT;
