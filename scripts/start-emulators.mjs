#!/usr/bin/env node
/**
 * Wrapper para `firebase emulators:start` con persistencia entre reinicios
 * y JDK 21 portátil pre-configurado.
 *
 * - Si existe `./emulator-data`: importa el estado guardado + exporta al salir.
 * - Si no existe (primera vez): arranca limpio y crea el dir al salir.
 * - Inyecta `functions/.jdk21/jdk-21.0.10+7/bin` al PATH si está presente.
 *   firebase-tools >= 14 requiere Java 21+; el JDK portátil cubre esa
 *   dependencia sin tocar el Java del sistema.
 *
 * Salva la demo cuando hay que reiniciar en vivo: no se pierde el caso de
 * prueba (vacantes, candidatos, postulaciones, tickets que ya se sembraron).
 */
import { existsSync, mkdirSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { delimiter, resolve } from 'node:path';

const DIR = resolve(process.cwd(), 'emulator-data');
const FRESH = process.argv.includes('--fresh');
const args = ['emulators:start'];

if (FRESH) {
  // Wipe + start clean. Útil cuando el seed/schema cambia y queremos
  // descartar el estado persistido viejo.
  if (existsSync(DIR)) {
    rmSync(DIR, { recursive: true, force: true });
    process.stdout.write(`🧹 Borrado ${DIR} (modo --fresh)\n`);
  }
  mkdirSync(DIR, { recursive: true });
  args.push(`--export-on-exit=${DIR}`);
  process.stdout.write(`🆕 Arrancando limpio. Estado se guardará en ${DIR} al salir.\n`);
} else if (existsSync(DIR)) {
  args.push(`--import=${DIR}`, '--export-on-exit');
  process.stdout.write(`📦 Importando estado guardado de ${DIR}\n`);
} else {
  mkdirSync(DIR, { recursive: true });
  args.push(`--export-on-exit=${DIR}`);
  process.stdout.write(
    `🆕 Primera vez: el estado se guardará en ${DIR} al salir con Ctrl+C.\n`,
  );
}

// Inyectar JDK 21 portátil si está disponible.
const JDK_HOME = resolve(process.cwd(), 'functions', '.jdk21', 'jdk-21.0.10+7');
const env = { ...process.env };
if (existsSync(resolve(JDK_HOME, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) {
  env.JAVA_HOME = JDK_HOME;
  env.PATH = `${resolve(JDK_HOME, 'bin')}${delimiter}${env.PATH ?? ''}`;
  process.stdout.write(`☕ Usando JDK portátil: ${JDK_HOME}\n`);
} else {
  process.stdout.write(
    `⚠ JDK portátil no encontrado en ${JDK_HOME}. Usando Java del sistema (requiere 21+).\n`,
  );
}

// Usamos `npx` para resolver el binario de firebase-tools sin asumir que
// está en el PATH del shell. npx viene con Node y resuelve binarios
// instalados globalmente, locales (node_modules/.bin) o los descarga.
// Nota: en Node 24+ Windows, spawn directo de .cmd lanza EINVAL — necesita
// shell: true. En Unix, shell: false es seguro.
const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';
const proc = spawn(npxCmd, ['--no-install', 'firebase', ...args], {
  stdio: 'inherit',
  shell: isWindows,
  env,
});
proc.on('exit', (code) => process.exit(code ?? 0));
proc.on('error', (err) => {
  console.error(
    'No se pudo lanzar firebase via npx. ¿Está firebase-tools instalado?\n' +
      '  npm install -g firebase-tools\n\n' +
      'Detalle: ' + err.message,
  );
  process.exit(1);
});
