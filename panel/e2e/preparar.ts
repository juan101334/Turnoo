import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Siembra turnoo_test con el script del backend y guarda los datos para las pruebas. */
export default function preparar() {
  const salida = execFileSync('npx', ['tsx', 'pruebas/e2e/sembrar.ts'], {
    cwd: fileURLToPath(new URL('../../backend', import.meta.url)),
    encoding: 'utf8',
  });
  const linea = salida.trim().split('\n').at(-1) ?? '';
  JSON.parse(linea); // Falla aquí si el script no devolvió el JSON esperado.
  writeFileSync(fileURLToPath(new URL('./.datos.json', import.meta.url)), linea);
}
