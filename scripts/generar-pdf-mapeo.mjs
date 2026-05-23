// Genera PDF del mapeo Ciesa vs Plataforma a partir del plan file.
// Uso: node scripts/generar-pdf-mapeo.mjs

import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { marked } from 'marked';

const PLAN_PATH = 'C:\\Users\\acmurillo\\.claude\\plans\\listo-ahora-te-voy-toasty-frost.md';
const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
const SALIDA_PDF = `C:\\Users\\acmurillo\\Desktop\\Plataforma-vs-Siesa-${ts}.pdf`;
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const planCompleto = readFileSync(PLAN_PATH, 'utf8');
const indiceCorte = planCompleto.indexOf('# Plataforma de Atracción EQUITEL — Plan maestro');
if (indiceCorte === -1) {
  console.error('No encontré el separador del plan maestro. Revisar el archivo.');
  process.exit(1);
}
const md = planCompleto.slice(0, indiceCorte).replace(/\n---\n\s*$/, '\n');

const cuerpoHtml = marked.parse(md, { gfm: true, breaks: false });

const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Plataforma de Atracción vs Siesa · 2026-04-30</title>
<style>
  @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
  :root {
    --rojo: #be1e0d;
    --negro: #141414;
    --gris-700: #3f3f3f;
    --gris-500: #5c5c5c;
    --gris-300: #cfcfcf;
    --gris-100: #f5f5f5;
  }
  * { box-sizing: border-box; }
  body {
    font-family: 'Open Sans', -apple-system, 'Segoe UI', Roboto, system-ui, sans-serif;
    color: var(--negro);
    font-size: 10.5pt;
    line-height: 1.5;
    margin: 0;
  }
  h1 {
    font-size: 22pt;
    color: var(--negro);
    border-bottom: 3px solid var(--rojo);
    padding-bottom: 8px;
    margin: 0 0 12px;
    page-break-after: avoid;
  }
  h2 {
    font-size: 15pt;
    color: var(--negro);
    margin: 28px 0 10px;
    border-left: 4px solid var(--rojo);
    padding-left: 10px;
    page-break-after: avoid;
  }
  h3 {
    font-size: 12pt;
    color: var(--rojo);
    margin: 18px 0 8px;
    page-break-after: avoid;
  }
  blockquote {
    border-left: 3px solid var(--gris-300);
    margin: 12px 0;
    padding: 4px 14px;
    color: var(--gris-700);
    background: var(--gris-100);
    font-style: italic;
    font-size: 9.5pt;
  }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  strong { color: var(--negro); }
  code {
    font-family: 'Consolas', 'Courier New', monospace;
    background: var(--gris-100);
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9.5pt;
    color: var(--rojo);
  }
  a { color: var(--rojo); text-decoration: none; }
  table {
    width: 100%;
    border-collapse: collapse;
    margin: 12px 0;
    font-size: 8.5pt;
    page-break-inside: auto;
  }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  th {
    background: var(--negro);
    color: white;
    text-align: left;
    padding: 8px 10px;
    font-weight: 600;
    border: 1px solid var(--negro);
  }
  td {
    border: 1px solid var(--gris-300);
    padding: 7px 10px;
    vertical-align: top;
  }
  tr:nth-child(even) td { background: var(--gris-100); }
  td:first-child { width: 28px; text-align: center; font-weight: 600; }
  hr { border: none; border-top: 1px solid var(--gris-300); margin: 24px 0; }
  .pie {
    margin-top: 30px;
    padding-top: 14px;
    border-top: 1px solid var(--gris-300);
    font-size: 8.5pt;
    color: var(--gris-500);
    text-align: center;
  }
</style>
</head>
<body>
${cuerpoHtml}
<div class="pie">
  Plataforma de Atracción EQUITEL · Plataforma vs Siesa · Generado 2026-04-30
</div>
</body>
</html>`;

const dir = mkdtempSync(join(tmpdir(), 'mapeo-pdf-'));
const htmlPath = join(dir, 'mapeo.html');
writeFileSync(htmlPath, html, 'utf8');

const fileUrl = 'file:///' + htmlPath.replace(/\\/g, '/');
const resultado = spawnSync(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--no-margins',
    `--print-to-pdf=${SALIDA_PDF}`,
    fileUrl,
  ],
  { stdio: 'inherit' },
);

rmSync(dir, { recursive: true, force: true });

if (resultado.status === 0) {
  console.log(`PDF generado: ${SALIDA_PDF}`);
} else {
  console.error('Chrome devolvió código', resultado.status);
  process.exit(resultado.status ?? 1);
}
