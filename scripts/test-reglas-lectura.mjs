/**
 * Prueba las reglas con la API oficial `firebaserules.projects.test` (server-side,
 * sin emulador ni Java). Cada caso declara quién pide, qué documento y si se
 * espera ALLOW o DENY.
 */
import { readFileSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const PROJECT = 'ptm-atraccion';
const RULES = fileURLToPath(new URL('../firestore.rules', import.meta.url));
const TOKEN = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim();
const source = readFileSync(RULES, 'utf8');

const D = (p) => `/databases/(default)/documents/${p}`;
const tok = (rol, extra = {}) => ({
  rol,
  firebase: { sign_in_provider: 'google.com' },
  ...extra,
});
const ANON = { firebase: { sign_in_provider: 'anonymous' } };

// Datos que devuelve la lectura (para reglas que miran resource.data).
const DATOS = {
  'vacantes/v1': { lider_uid: 'lider1', estado: 'publicada', justificacion: 'reemplazo', salario_base: 3000000 },
  'candidatos/c1': { nombres: 'Ana', documento_numero: '1020304050' },
  'postulaciones/p1': { vacante_id: 'v1', estado: 'postulado' },
  'debida_diligencia/dd1': { conyuge_identificacion: '999' },
  'datos_basicos_integrante/db1': { cuenta_banco_numero: '123', grupo_sanguineo: 'O+' },
  'documentos_candidato/doc1': { archivo_url: 'https://x/cedula.pdf' },
  'carpetas_digitales/carp1': { postulacion_id: 'p1' },
  'informes/i1': { postulacion_id: 'p1' },
  'entrevistas/e1': { postulacion_id: 'p1' },
  'referencias/r1': { postulacion_id: 'p1' },
  'pruebas/pr1': { postulacion_id: 'p1' },
  'procesos/pro1': { empresas_competencia: 'secreto' },
  'cargos_catalogo/cg1': { banda_min: 2000000, banda_max: 4000000 },
  'configuracion_global/referidos': { sheet_id: 'SECRETO' },
  'referidos_links/slug123': { cedula_tecnico: '111' },
  'referidos_optouts/1020304050': { motivo: 'x' },
  'notificaciones/n1': { destinatario_uid: 'analista1', titulo: 'Examen de Ana: no apto' },
  'notificaciones/n2': { destinatario_uid: 'otro', titulo: 'privado' },
  'tickets_conexion/t1': { area: 'it' },
  'tickets_conexion/t2': { area: 'compras' },
  'empresas/emp1': { nombre: 'Equitel' },
  'contactos_candidato/cc1': { candidato_id: 'c1' },
  'ternas/tn1': { vacante_id: 'v1' },
  'eventos/ev1': { tipo: 'x' },
  'documentos_portal/dp1': { postulacion_id: 'p1', clave: 'hoja_vida' },
  'formatos_versiones/fv1': { postulacion_id: 'p1', tipo: 'datos_basicos' },
  'examenes_medicos/em1': { postulacion_id: 'p1', candidato_nombre: 'Ana', estado: 'solicitada' },
};

const casos = [];
const caso = (grupo, nombre, { token, path, method = 'get', esperado, data }) => {
  casos.push({
    grupo, nombre, esperado,
    tc: {
      expectation: esperado,
      request: {
        auth: token === null ? null : { uid: token.uid ?? 'u1', token },
        path: D(path),
        method,
        time: new Date('2026-07-15T12:00:00Z').toISOString(),
      },
      // OJO: en las reglas, `resource` (el doc que YA existe) es una variable
      // hermana de `request`, no `request.resource` (que es el payload de
      // escritura). Si se anida, `resource.data` sale null, la regla ERRORA y
      // deniega — dando falsos "PASA" en los casos DENY.
      resource: { data: data ?? DATOS[path] ?? {} },
    },
  });
};

const G1 = '1. EL ANÓNIMO DE LA LANDING (el hallazgo crítico)';
caso(G1, 'NO lee candidatos (cédulas)', { token: ANON, path: 'candidatos/c1', esperado: 'DENY' });
caso(G1, 'NO lista candidatos', { token: ANON, path: 'candidatos/c1', method: 'list', esperado: 'DENY' });
caso(G1, 'NO lee postulaciones', { token: ANON, path: 'postulaciones/p1', esperado: 'DENY' });
caso(G1, 'NO lee el SAGRILAFT', { token: ANON, path: 'debida_diligencia/dd1', esperado: 'DENY' });
caso(G1, 'NO lee cuenta bancaria/salud', { token: ANON, path: 'datos_basicos_integrante/db1', esperado: 'DENY' });
caso(G1, 'NO lee documentos_candidato', { token: ANON, path: 'documentos_candidato/doc1', esperado: 'DENY' });
caso(G1, 'NO lee informes', { token: ANON, path: 'informes/i1', esperado: 'DENY' });
caso(G1, 'NO lee entrevistas', { token: ANON, path: 'entrevistas/e1', esperado: 'DENY' });
caso(G1, 'NO lee notificaciones', { token: ANON, path: 'notificaciones/n1', method: 'list', esperado: 'DENY' });
caso(G1, 'NO lee procesos (empresas competencia)', { token: ANON, path: 'procesos/pro1', esperado: 'DENY' });
caso(G1, 'NO lee cargos_catalogo (banda salarial)', { token: ANON, path: 'cargos_catalogo/cg1', esperado: 'DENY' });
caso(G1, 'NO lee configuracion_global', { token: ANON, path: 'configuracion_global/referidos', esperado: 'DENY' });
caso(G1, 'NO lee referidos_links (cédula técnico)', { token: ANON, path: 'referidos_links/slug123', esperado: 'DENY' });
caso(G1, 'NO lee referidos_optouts (cédulas)', { token: ANON, path: 'referidos_optouts/1020304050', esperado: 'DENY' });
caso(G1, 'NO lista vacantes (borradores)', { token: ANON, path: 'vacantes/v1', method: 'list', esperado: 'DENY' });
caso(G1, 'NO inyecta en eventos', { token: ANON, path: 'eventos/ev1', method: 'create', esperado: 'DENY' });
caso(G1, 'NO lee empresas', { token: ANON, path: 'empresas/emp1', esperado: 'DENY' });

const G2 = '2. LA LANDING SIGUE FUNCIONANDO';
caso(G2, 'SÍ abre la oferta por id (get vacante)', { token: ANON, path: 'vacantes/v1', esperado: 'ALLOW' });
caso(G2, 'SÍ abre la oferta SIN login', { token: null, path: 'vacantes/v1', esperado: 'ALLOW' });

const G3 = '3. GOOGLE AUTENTICADO PERO SIN ROL';
const SINROL = { firebase: { sign_in_provider: 'google.com' } };
caso(G3, 'sin rol NO lee candidatos', { token: SINROL, path: 'candidatos/c1', esperado: 'DENY' });
caso(G3, 'sin rol NO lee catálogos', { token: SINROL, path: 'empresas/emp1', esperado: 'DENY' });

const G4 = '4. EL EQUIPO SIGUE LEYENDO LO SUYO';
const analista = tok('analista', { uid: 'analista1' });
const coord = tok('coordinador');
const gh = tok('gh');
const carla = tok('documentacion');
const gestor = tok('gestor');
const lider = tok('lider', { uid: 'lider1' });
const talentos = tok('talentos');
const apoyoIt = tok('apoyo', { area_apoyo: 'it' });
caso(G4, 'analista lee candidatos', { token: analista, path: 'candidatos/c1', esperado: 'ALLOW' });
caso(G4, 'analista lee informes', { token: analista, path: 'informes/i1', esperado: 'ALLOW' });
caso(G4, 'analista lee el SAGRILAFT', { token: analista, path: 'debida_diligencia/dd1', esperado: 'ALLOW' });
caso(G4, 'analista lee catálogos', { token: analista, path: 'empresas/emp1', esperado: 'ALLOW' });
caso(G4, 'Karen (coord) lee entrevistas', { token: coord, path: 'entrevistas/e1', esperado: 'ALLOW' });
caso(G4, 'GH lee carpetas_digitales', { token: gh, path: 'carpetas_digitales/carp1', esperado: 'ALLOW' });
caso(G4, 'GH lee documentos_candidato', { token: gh, path: 'documentos_candidato/doc1', esperado: 'ALLOW' });
caso(G4, 'GH lee el SAGRILAFT (es su carpeta)', { token: gh, path: 'debida_diligencia/dd1', esperado: 'ALLOW' });
caso(G4, 'Carla lee carpetas', { token: carla, path: 'carpetas_digitales/carp1', esperado: 'ALLOW' });
caso(G4, 'Carla lee datos básicos', { token: carla, path: 'datos_basicos_integrante/db1', esperado: 'ALLOW' });
caso(G4, 'gestor SST lee su examen (examenes_medicos)', { token: gestor, path: 'examenes_medicos/em1', esperado: 'ALLOW' });
caso(G4, 'líder lee informes', { token: lider, path: 'informes/i1', esperado: 'ALLOW' });
caso(G4, 'líder lee documentos (hoja de vida)', { token: lider, path: 'documentos_candidato/doc1', esperado: 'ALLOW' });
caso(G4, 'líder lista SUS vacantes', { token: lider, path: 'vacantes/v1', method: 'list', esperado: 'ALLOW' });
caso(G4, 'talentos lee procesos', { token: talentos, path: 'procesos/pro1', esperado: 'ALLOW' });
caso(G4, 'campanita del analista (su notif)', { token: analista, path: 'notificaciones/n1', method: 'list', esperado: 'ALLOW' });
caso(G4, 'tickets de IT (su área)', { token: apoyoIt, path: 'tickets_conexion/t1', method: 'list', esperado: 'ALLOW' });

const G5 = '5. LOS ROLES ACOTADOS NO LEEN DE MÁS';
caso(G5, 'GH NO lee informes (reu 09-jul)', { token: gh, path: 'informes/i1', esperado: 'DENY' });
caso(G5, 'GH NO lee entrevistas', { token: gh, path: 'entrevistas/e1', esperado: 'DENY' });
caso(G5, 'GH NO lee referencias', { token: gh, path: 'referencias/r1', esperado: 'DENY' });
caso(G5, 'GH NO lee pruebas', { token: gh, path: 'pruebas/pr1', esperado: 'DENY' });
caso(G5, 'gestor NO lee candidatos', { token: gestor, path: 'candidatos/c1', esperado: 'DENY' });
caso(G5, 'gestor NO lee el SAGRILAFT', { token: gestor, path: 'debida_diligencia/dd1', esperado: 'DENY' });
caso(G5, 'talentos NO lee el pool', { token: talentos, path: 'candidatos/c1', esperado: 'DENY' });
caso(G5, 'talentos NO lee el SAGRILAFT', { token: talentos, path: 'debida_diligencia/dd1', esperado: 'DENY' });
caso(G5, 'apoyo/IT NO lee candidatos', { token: apoyoIt, path: 'candidatos/c1', esperado: 'DENY' });
caso(G5, 'apoyo/IT NO lee datos bancarios', { token: apoyoIt, path: 'datos_basicos_integrante/db1', esperado: 'DENY' });
caso(G5, 'apoyo/IT NO lista tickets de compras', { token: apoyoIt, path: 'tickets_conexion/t2', method: 'list', esperado: 'DENY' });
caso(G5, 'Carla NO lee informes', { token: carla, path: 'informes/i1', esperado: 'DENY' });
caso(G5, 'líder NO lee el SAGRILAFT', { token: lider, path: 'debida_diligencia/dd1', esperado: 'DENY' });
caso(G5, 'líder NO lee la cuenta bancaria', { token: lider, path: 'datos_basicos_integrante/db1', esperado: 'DENY' });
caso(G5, 'analista NO lee notif ajena', { token: analista, path: 'notificaciones/n2', method: 'list', esperado: 'DENY' });
caso(G5, 'superficie muerta: contactos_candidato', { token: coord, path: 'contactos_candidato/cc1', esperado: 'DENY' });
caso(G5, 'superficie muerta: ternas', { token: coord, path: 'ternas/tn1', esperado: 'DENY' });

const G6 = '6. FIXES 16-JUL (Carla ve su carpeta · líder decide por callable)';
caso(G6, 'Carla lee documentos_portal (docs del integrante)', { token: carla, path: 'documentos_portal/dp1', esperado: 'ALLOW' });
caso(G6, 'GH lee documentos_portal', { token: gh, path: 'documentos_portal/dp1', esperado: 'ALLOW' });
caso(G6, 'analista lee documentos_portal', { token: analista, path: 'documentos_portal/dp1', esperado: 'ALLOW' });
caso(G6, 'Carla lee formatos_versiones (historial de correcciones)', { token: carla, path: 'formatos_versiones/fv1', esperado: 'ALLOW' });
caso(G6, 'gestor NO lee documentos_portal', { token: gestor, path: 'documentos_portal/dp1', esperado: 'DENY' });
caso(G6, 'anónimo NO lee documentos_portal', { token: ANON, path: 'documentos_portal/dp1', esperado: 'DENY' });
// El líder decide la terna por la callable decidirTerna (Admin SDK); NO puede
// escribir la postulación directo — esta regla debe seguir negándolo.
caso(G6, 'líder NO escribe postulaciones directo (va por callable)', { token: lider, path: 'postulaciones/p1', method: 'update', esperado: 'DENY', data: { estado: 'en_examenes_medicos' } });
caso(G6, 'gestor SST NO lee postulaciones (solo su examen)', { token: gestor, path: 'postulaciones/p1', esperado: 'DENY' });

// ── Ejecutar ────────────────────────────────────────────────────────────
const res = await fetch(`https://firebaserules.googleapis.com/v1/projects/${PROJECT}:test`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
    'x-goog-user-project': PROJECT,
  },
  body: JSON.stringify({
    source: { files: [{ name: 'firestore.rules', content: source }] },
    testSuite: { testCases: casos.map((c) => c.tc) },
  }),
});
const j = await res.json();

if (j.error) {
  console.error('ERROR de la API:', JSON.stringify(j.error, null, 1).slice(0, 1500));
  process.exit(2);
}
if (j.issues?.length) {
  console.error('\n*** LAS REGLAS NO COMPILAN ***');
  j.issues.forEach((i) => console.error(`  [${i.severity}] línea ${i.sourcePosition?.line}: ${i.description}`));
  process.exit(2);
}

let ok = 0, fail = 0, grupo = '';
(j.testResults || []).forEach((r, i) => {
  const c = casos[i];
  if (c.grupo !== grupo) { grupo = c.grupo; console.log('\n=== ' + grupo + ' ==='); }
  const paso = r.state === 'SUCCESS';
  if (paso) { ok++; console.log('  \x1b[32mPASA \x1b[0m ' + c.nombre); }
  else {
    fail++;
    const real = c.esperado === 'ALLOW' ? 'DENY' : 'ALLOW';
    console.log(`  \x1b[31mFALLA\x1b[0m ${c.nombre}  (esperaba ${c.esperado}, dio ${real})`);
    (r.errorPosition ? [r.errorPosition] : []).forEach((p) => console.log('         línea ' + p.line));
  }
});
console.log('\n' + '─'.repeat(54));
console.log(`  ${ok} pasan · ${fail} fallan  (de ${casos.length})`);
console.log('─'.repeat(54));
process.exit(fail ? 1 : 0);
