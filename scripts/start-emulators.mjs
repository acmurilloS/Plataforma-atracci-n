#!/usr/bin/env node
/**
 * Wrapper para `firebase emulators:start` con persistencia entre reinicios.
 *
 * - Si existe `./emulator-data`: importa el estado guardado + exporta al salir.
 * - Si no existe (primera vez): arranca limpio y crea el dir al salir.
 *
 * Salva la demo cuando hay que reiniciar en vivo: no se pierde el caso de
 * prueba (vacantes, candidatos, postulaciones, tickets que ya se sembraron).
 */
import { existsSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'emulator-data');
const args = ['emulators:start'];

if (existsSync(DIR)) {
  args.push(`--import=${DIR}`, '--export-on-exit');
  process.stdout.write(`📦 Importando estado guardado de ${DIR}\n`);
} else {
  mkdirSync(DIR, { recursive: true });
  args.push(`--export-on-exit=${DIR}`);
  process.stdout.write(
    `🆕 Primera vez: el estado se guardará en ${DIR} al salir con Ctrl+C.\n`,
  );
}

const proc = spawn('firebase', args, {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
proc.on('exit', (code) => process.exit(code ?? 0));
proc.on('error', (err) => {
  console.error('No se pudo lanzar firebase:', err.message);
  process.exit(1);
});
