/**
 * E2E (emulador) del filtro de discapacidad. Verifica contra las Cloud Functions
 * REALES corriendo en el emulador (mismo código compilado que prod), SIN enviar
 * correos (el emulador no tiene GMAIL_* → onNotificacionCreate/ordenGestores no
 * mandan nada). Prueba dos caminos:
 *   A) postulación CON discapacidad → el examen queda con requiere_autorizacion_gh
 *      y NO se envía a gestores (gate). Se crean avisos a GH.
 *   B) postulación SIN discapacidad → el examen NO exige autorización (flujo normal).
 */
const FS = 'http://localhost:8080/v1/projects/ptm-atraccion/databases/(default)/documents';
const H = { Authorization: 'Bearer owner', 'Content-Type': 'application/json' };
const S = (v) => ({ stringValue: v });
const B = (v) => ({ booleanValue: v });
const put = (path, fields) => fetch(`${FS}/${path}`, { method: 'PATCH', headers: H, body: JSON.stringify({ fields }) });
const rm = (path) => fetch(`${FS}/${path}`, { method: 'DELETE', headers: H });
const get = async (path) => { const r = await fetch(`${FS}/${path}`, { headers: H }); return r.ok ? (await r.json()).fields ?? {} : null; };
const wait = (s) => new Promise((r) => setTimeout(r, s * 1000));
const ok = (m, d) => console.log(`  \x1b[32mOK  \x1b[0m ${m}${d ? ' → ' + d : ''}`);
const bad = (m, d) => { console.log(`  \x1b[31mFALLA\x1b[0m ${m}${d ? ' — ' + d : ''}`); process.exitCode = 1; };

async function q(collection, field, value) {
  const r = await fetch(`${FS}:runQuery`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ structuredQuery: { from: [{ collectionId: collection }], where: { fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } } } } }),
  });
  return (await r.json()).filter((x) => x.document).map((x) => ({ id: x.document.name.split('/').pop(), f: x.document.fields || {} }));
}

const PFX = 'zzt_disc';
const VAC = `${PFX}_vac`;

async function seedVacante() {
  await put(`vacantes/${VAC}`, {
    consecutivo: S('EQT-BOG-2026-9999'), cargo_nombre: S('Analista de prueba'),
    empresa_nombre: S('Equitel'), empresa_codigo: S('EQT'), unidad_nombre: S('Tecnología'),
    sede_nombre: S('Bogotá'), sede_codigo: S('BOG'), estado: S('en_proceso'),
  });
}
async function seedPost(sfx, discapacidad, obs) {
  const cand = `${PFX}_${sfx}_cand`;
  const post = `${PFX}_${sfx}_post`;
  await put(`candidatos/${cand}`, { nombres: S('PRUEBA'), apellidos: S('Discapacidad ' + sfx), documento_numero: S('900' + sfx), discapacidad: B(discapacidad), discapacidad_observacion: S(obs) });
  await put(`postulaciones/${post}`, {
    candidato_id: S(cand), candidato_nombre: S('PRUEBA Discapacidad ' + sfx), proceso_id: S(''),
    vacante_id: S(VAC), vacante_consecutivo: S('EQT-BOG-2026-9999'), cargo_nombre: S('Analista de prueba'),
    estado: S('en_terna'), discapacidad: B(discapacidad), discapacidad_observacion: S(obs),
  });
  return post;
}
async function limpiar() {
  for (const sfx of ['A', 'B']) {
    const ex = await q('examenes_medicos', 'postulacion_id', `${PFX}_${sfx}_post`);
    for (const e of ex) await rm(`examenes_medicos/${e.id}`);
    await rm(`postulaciones/${PFX}_${sfx}_post`);
    await rm(`candidatos/${PFX}_${sfx}_cand`);
  }
  const notis = await q('notificaciones', 'link', '/examenes-medicos');
  for (const n of notis) if ((n.f.mensaje?.stringValue || '').includes('PRUEBA Discapacidad')) await rm(`notificaciones/${n.id}`);
  await rm(`vacantes/${VAC}`);
}

console.log('\n=== E2E filtro de discapacidad (emulador) ===');
await limpiar();
await seedVacante();

// ── A) CON discapacidad ────────────────────────────────────────────────────
console.log('\n=== A · postulación CON discapacidad → entra a exámenes ===');
const postA = await seedPost('A', true, 'discapacidad auditiva · requiere intérprete');
await put(`postulaciones/${postA}`, {  // solo cambiar estado dispara onPostulacionEnExamenes
  candidato_id: S(`${PFX}_A_cand`), candidato_nombre: S('PRUEBA Discapacidad A'), proceso_id: S(''),
  vacante_id: S(VAC), vacante_consecutivo: S('EQT-BOG-2026-9999'), cargo_nombre: S('Analista de prueba'),
  estado: S('en_examenes_medicos'), discapacidad: B(true), discapacidad_observacion: S('discapacidad auditiva · requiere intérprete'),
});
await wait(12);
let exA = (await q('examenes_medicos', 'postulacion_id', postA))[0]?.f;
if (!exA) bad('no se creó el examen para A');
else {
  exA.discapacidad?.booleanValue === true ? ok('examen.discapacidad = true') : bad('examen.discapacidad no es true', JSON.stringify(exA.discapacidad));
  exA.discapacidad_observacion?.stringValue?.includes('auditiva') ? ok('observación denormalizada', exA.discapacidad_observacion.stringValue) : bad('observación no denormalizada');
  exA.requiere_autorizacion_gh?.booleanValue === true ? ok('requiere_autorizacion_gh = true') : bad('requiere_autorizacion_gh no es true');
  (!exA.autorizado_gestores_en || exA.autorizado_gestores_en.nullValue !== undefined) ? ok('autorizado_gestores_en = null (aún sin autorizar)') : bad('autorizado_gestores_en no es null');
  (!exA.correo_gestor_enviado_en || exA.correo_gestor_enviado_en.nullValue !== undefined) ? ok('GATE: NO se envió a gestores (correo_gestor_enviado_en vacío)') : bad('el correo a gestores SÍ salió — el gate no funcionó');
}
const avisos = (await q('notificaciones', 'link', '/examenes-medicos')).filter((n) => (n.f.mensaje?.stringValue || '').includes('PRUEBA Discapacidad A') && (n.f.titulo?.stringValue || '').includes('autorización'));
avisos.length > 0 ? ok('GH recibió aviso "pendiente de autorización"', `${avisos.length} aviso(s)`) : bad('GH NO recibió el aviso de autorización');

// ── B) SIN discapacidad (control) ──────────────────────────────────────────
console.log('\n=== B · postulación SIN discapacidad (control) → flujo normal ===');
const postB = await seedPost('B', false, '');
await put(`postulaciones/${postB}`, {
  candidato_id: S(`${PFX}_B_cand`), candidato_nombre: S('PRUEBA Discapacidad B'), proceso_id: S(''),
  vacante_id: S(VAC), vacante_consecutivo: S('EQT-BOG-2026-9999'), cargo_nombre: S('Analista de prueba'),
  estado: S('en_examenes_medicos'), discapacidad: B(false), discapacidad_observacion: S(''),
});
await wait(12);
let exB = (await q('examenes_medicos', 'postulacion_id', postB))[0]?.f;
if (!exB) bad('no se creó el examen para B');
else {
  (exB.requiere_autorizacion_gh?.booleanValue === false || exB.requiere_autorizacion_gh === undefined) ? ok('requiere_autorizacion_gh = false (no exige visto bueno)') : bad('control exige autorización sin discapacidad');
  (exB.discapacidad?.booleanValue === false || exB.discapacidad === undefined) ? ok('examen.discapacidad = false') : bad('control marcado con discapacidad');
}
const avisosB = (await q('notificaciones', 'link', '/examenes-medicos')).filter((n) => (n.f.mensaje?.stringValue || '').includes('PRUEBA Discapacidad B') && (n.f.titulo?.stringValue || '').includes('autorización'));
avisosB.length === 0 ? ok('control NO generó aviso de autorización') : bad('control generó aviso de autorización indebido');

console.log('\n=== Limpieza ===');
await limpiar();
ok('escenario borrado');
console.log('');
process.exit(process.exitCode || 0);
