/**
 * Seed de demo del Portal del Candidato (SOLO emuladores).
 *
 * Crea una postulación en `en_contratacion` con su token + cédula, una
 * entrevista próxima, una orden de exámenes, condiciones laborales y los
 * usuarios analista/gh. Permite abrir el portal y probar F1–F8 sin pasar por la
 * UI del staff.
 *
 * Uso (desde functions/, con emuladores arriba):
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 GCLOUD_PROJECT=demo-equitel-atraccion \
 *   node seed-portal-demo.mjs
 */
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
process.env.GCLOUD_PROJECT ??= 'demo-equitel-atraccion';

initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const db = getFirestore();

const TOKEN = 'DEMO123456';
const CEDULA = '1234567890';
const now = Date.now();
const dias = (n) => Timestamp.fromMillis(now + n * 24 * 60 * 60 * 1000);

async function run() {
  await db.collection('usuarios').doc('analista_demo').set({
    rol: 'analista',
    nombre: 'Ana',
    apellido: 'Lista',
    email: 'analista@equitel.test',
    activo: true,
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });
  await db.collection('usuarios').doc('gh_demo').set({
    rol: 'gh',
    nombre: 'Gloria',
    apellido: 'Humana',
    email: 'gh@equitel.test',
    activo: true,
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });

  await db.collection('vacantes').doc('vac_demo').set({
    analista_uid: 'analista_demo',
    empresa_codigo: 'EQT',
    cargo_nombre: 'Técnico Electromecánico',
    vacante_consecutivo: 'EQT-BOG-2026-0099',
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });

  await db.collection('candidatos').doc('cand_demo').set({
    nombres: 'Carlos',
    apellidos: 'Pérez',
    documento_numero: CEDULA,
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });

  await db
    .collection('postulaciones')
    .doc('post_demo')
    .set({
      candidato_id: 'cand_demo',
      candidato_nombre: 'Carlos Pérez',
      candidato_email: 'carlos.perez@example.com',
      cargo_nombre: 'Técnico Electromecánico',
      vacante_id: 'vac_demo',
      vacante_consecutivo: 'EQT-BOG-2026-0099',
      empresa_codigo: 'EQT',
      estado: 'en_contratacion',
      portal_token: TOKEN,
      portal_enviado_en: Timestamp.now(),
      condiciones_laborales: {
        cargo: 'Técnico Electromecánico',
        empresa: 'Equitel S.A.S.',
        unidad: 'Operaciones',
        sede: 'Bogotá',
        salario: '$2.300.000 + auxilios',
        horario: 'Lunes a viernes, 7:00 a.m. – 5:00 p.m.',
        tipo_contrato: 'Término fijo · 1 año',
      },
      condiciones_enviadas_en: Timestamp.now(),
      marcas: {},
      creado_en: Timestamp.now(),
      creado_por: 'seed',
    });

  await db.collection('portal_candidato_tokens').doc(TOKEN).set({
    token: TOKEN,
    postulacion_id: 'post_demo',
    candidato_id: 'cand_demo',
    vacante_id: 'vac_demo',
    candidato_nombre: 'Carlos Pérez',
    documento_numero: CEDULA,
    cargo_nombre: 'Técnico Electromecánico',
    empresa_codigo: 'EQT',
    revocado: false,
    expira_en: dias(90),
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });

  await db.collection('entrevistas').doc('ent_demo').set({
    postulacion_id: 'post_demo',
    tipo: 'analista',
    modalidad: 'virtual',
    sala_o_link: 'https://meet.google.com/demo-equitel',
    programada_para: dias(2),
    duracion_min: 45,
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });

  await db.collection('examenes_medicos').doc('ex_demo').set({
    postulacion_id: 'post_demo',
    vacante_id: 'vac_demo',
    cargo_nombre: 'Técnico Electromecánico',
    centro_medico: 'Centro Médico Laboral SaludTotal',
    orden_direccion: 'Cra 13 # 45-67, Bogotá',
    orden_instrucciones: 'Asiste en ayunas de 8 horas.\nLleva tu cédula y ropa cómoda.',
    orden_url: 'https://example.com/orden-demo.pdf',
    creado_en: Timestamp.now(),
    creado_por: 'seed',
  });

  console.log('✓ Seed listo.');
  console.log(`  Portal:  http://localhost:5173/portal/${TOKEN}`);
  console.log(`  Cédula:  ${CEDULA}`);
}

run().then(
  () => process.exit(0),
  (e) => {
    console.error('Seed falló:', e);
    process.exit(1);
  },
);
