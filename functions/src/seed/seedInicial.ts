import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { sembrarFestivosAnio } from '../festivos/festivos';

interface SeedUsuario {
  email: string;
  password: string;
  nombre: string;
  apellido: string;
  rol: 'lider' | 'analista' | 'coordinador' | 'gh' | 'apoyo' | 'admin';
  area_apoyo?: 'it' | 'compras' | 'bodega' | 'contabilidad' | 'administrativo' | 'talentos';
  empresa_codigo?: string;
  sede_codigo?: string;
  unidad_id?: string;
}

// ─── Empresas (4 confirmadas por Karen y validadas con fuentes públicas) ─
// Códigos provisionales hasta que GH cierre la tabla oficial (ATR-21).
const EMPRESAS = [
  {
    codigo: 'EQT',
    nombre: 'Equitel',
    razon_social: 'Equitel S.A.',
    nit: '900000001-1',
    es_provisional: true,
  },
  {
    codigo: 'CUM',
    nombre: 'Cumandes',
    razon_social: 'Cummins de los Andes S.A.',
    nit: '900000002-2',
    es_provisional: true,
  },
  {
    codigo: 'ING',
    nombre: 'Ingenergía',
    razon_social: 'Ingenergía (Colombia) S.A.',
    nit: '900000003-3',
    es_provisional: true,
  },
  {
    codigo: 'LAP',
    nombre: 'LAP Technologies',
    razon_social: 'LAP Technologies S.A.',
    nit: '900000004-4',
    es_provisional: true,
  },
];

// ─── Sedes (fuentes: web oficial Cumandes + LinkedIn de cada empresa) ───
// Domicilio matriz del grupo: Av. Troncal de Occidente No 29-88E, Mosquera.
const SEDES = [
  // Equitel — operación holding desde la matriz de Mosquera + Bogotá.
  { codigo: 'MOS', nombre: 'Mosquera (matriz)', ciudad: 'Mosquera', empresa_codigo: 'EQT', direccion: 'Av. Troncal de Occidente No 29-88E, Km 2.5 vía Bogotá–Mosquera' },
  { codigo: 'BOG', nombre: 'Bogotá', ciudad: 'Bogotá', empresa_codigo: 'EQT', direccion: '' },

  // Cumandes — 8 sedes confirmadas en su web oficial 2026.
  { codigo: 'CMO', nombre: 'Mosquera', ciudad: 'Mosquera', empresa_codigo: 'CUM', direccion: 'Av. Troncal de Occidente Km 2.5' },
  { codigo: 'CBO', nombre: 'Bogotá', ciudad: 'Bogotá', empresa_codigo: 'CUM', direccion: '' },
  { codigo: 'CME', nombre: 'Medellín', ciudad: 'Medellín', empresa_codigo: 'CUM', direccion: '' },
  { codigo: 'CCL', nombre: 'Cali', ciudad: 'Cali', empresa_codigo: 'CUM', direccion: '' },
  { codigo: 'CIB', nombre: 'Ibagué', ciudad: 'Ibagué', empresa_codigo: 'CUM', direccion: '' },
  { codigo: 'CBA', nombre: 'Barranquilla', ciudad: 'Barranquilla', empresa_codigo: 'CUM', direccion: '' },
  { codigo: 'CDU', nombre: 'Duitama', ciudad: 'Duitama', empresa_codigo: 'CUM', direccion: '' },
  { codigo: 'CVI', nombre: 'Villavicencio', ciudad: 'Villavicencio', empresa_codigo: 'CUM', direccion: '' },

  // Ingenergía — Mosquera + oficina Bogotá Av. Ciudad de Cali.
  { codigo: 'IMO', nombre: 'Mosquera', ciudad: 'Mosquera', empresa_codigo: 'ING', direccion: 'Av. Troncal de Occidente Km 2.5' },
  { codigo: 'IBO', nombre: 'Bogotá', ciudad: 'Bogotá', empresa_codigo: 'ING', direccion: 'Av. Ciudad de Cali #11-22' },

  // LAP Technologies — comparte domicilio principal en Mosquera.
  { codigo: 'LMO', nombre: 'Mosquera', ciudad: 'Mosquera', empresa_codigo: 'LAP', direccion: 'Av. Troncal de Occidente Km 2.5' },
];

// ─── Unidades (algunas representativas; GH ajustará luego) ──────────────
const UNIDADES = [
  // Equitel — administración del holding
  { id: 'eqt-mos-admin-holding', empresa_codigo: 'EQT', sede_codigo: 'MOS', nombre: 'Administración Holding' },
  { id: 'eqt-bog-admin', empresa_codigo: 'EQT', sede_codigo: 'BOG', nombre: 'Administración Bogotá' },

  // Cumandes — servicio técnico Cummins (núcleo del negocio)
  { id: 'cum-mos-servicio-tecnico', empresa_codigo: 'CUM', sede_codigo: 'CMO', nombre: 'Servicio Técnico Cummins' },
  { id: 'cum-bog-servicio-tecnico', empresa_codigo: 'CUM', sede_codigo: 'CBO', nombre: 'Servicio Técnico Cummins' },
  { id: 'cum-mos-comercial', empresa_codigo: 'CUM', sede_codigo: 'CMO', nombre: 'Comercial' },

  // Ingenergía — comercial energía
  { id: 'ing-bog-comercial-energia', empresa_codigo: 'ING', sede_codigo: 'IBO', nombre: 'Comercial Soluciones de Energía' },

  // LAP — desarrollo de software / telemática
  { id: 'lap-mos-desarrollo', empresa_codigo: 'LAP', sede_codigo: 'LMO', nombre: 'Desarrollo Software' },
];

// ─── Cargos representativos (1 técnico crítico, 1 comercial crítico, 1 admin no crítico) ─
const CARGOS = [
  {
    id: 'tecnico-servicio-cummins',
    nombre: 'Técnico de servicio Cummins',
    categoria: 'tecnico',
    criticidad_sugerida: 'Alta',
    banda_min: 2_500_000,
    banda_max: 4_000_000,
    requiere_licencia: true,
    requiere_moto: false,
    requiere_tarjeta_profesional: false,
    requiere_titulo_profesional: false,
    herramientas_sugeridas: { computador: false, office: false, labroides: false, dotacion: true },
  },
  {
    id: 'ejecutivo-comercial-energia',
    nombre: 'Ejecutivo comercial de soluciones de energía',
    categoria: 'comercial',
    criticidad_sugerida: 'Alta',
    banda_min: 4_500_000,
    banda_max: 7_500_000,
    requiere_licencia: true,
    requiere_moto: false,
    requiere_tarjeta_profesional: false,
    requiere_titulo_profesional: true,
    herramientas_sugeridas: { computador: true, office: true, labroides: false, dotacion: false },
  },
  {
    id: 'asistente-administrativo-contable',
    nombre: 'Asistente administrativo / contable',
    categoria: 'administrativo',
    criticidad_sugerida: 'Baja',
    banda_min: 1_600_000,
    banda_max: 2_400_000,
    requiere_licencia: false,
    requiere_moto: false,
    requiere_tarjeta_profesional: false,
    requiere_titulo_profesional: false,
    herramientas_sugeridas: { computador: true, office: true, labroides: true, dotacion: false },
  },
];

const USUARIOS: SeedUsuario[] = [
  {
    email: 'admin@equitel.test',
    password: 'Admin1234!',
    nombre: 'Admin',
    apellido: 'Plataforma',
    rol: 'admin',
  },
  {
    email: 'lider@equitel.test',
    password: 'Lider1234!',
    nombre: 'Juan Carlos',
    apellido: 'Pineda',
    rol: 'lider',
    empresa_codigo: 'EQT',
    sede_codigo: 'BOG',
    unidad_id: 'eqt-bog-admin',
  },
  {
    email: 'coordinador@equitel.test',
    password: 'Coord1234!',
    nombre: 'Karen',
    apellido: 'Bonilla',
    rol: 'coordinador',
  },
  {
    email: 'analista@equitel.test',
    password: 'Anal1234!',
    nombre: 'Génesis',
    apellido: 'Analista',
    rol: 'analista',
  },
  {
    email: 'gh@equitel.test',
    password: 'GH1234!',
    nombre: 'Maribel',
    apellido: 'González',
    rol: 'gh',
  },
  {
    email: 'apoyo-it@equitel.test',
    password: 'Apoyo1234!',
    nombre: 'Sebastián',
    apellido: 'IT',
    rol: 'apoyo',
    area_apoyo: 'it',
  },
  {
    email: 'apoyo-compras@equitel.test',
    password: 'Apoyo1234!',
    nombre: 'Sebastián',
    apellido: 'Orozco',
    rol: 'apoyo',
    area_apoyo: 'compras',
  },
  {
    email: 'apoyo-talentos@equitel.test',
    password: 'Apoyo1234!',
    nombre: 'Mariana',
    apellido: 'Talentos',
    rol: 'apoyo',
    area_apoyo: 'talentos',
  },
];

function auditoriaSeed() {
  return {
    creado_en: FieldValue.serverTimestamp(),
    creado_por: 'seed',
    actualizado_en: FieldValue.serverTimestamp(),
    actualizado_por: 'seed',
  };
}

export const seedInicial = onCall(
  { region: 'us-central1' },
  async (req) => {
    const esEmulador = !!process.env.FUNCTIONS_EMULATOR;
    if (!esEmulador && req.auth?.token.rol !== 'admin') {
      throw new HttpsError('permission-denied', 'Solo disponible en emulador o para admin.');
    }

    const auth = getAuth();

    for (const u of USUARIOS) {
      let uid: string;
      try {
        const ex = await auth.getUserByEmail(u.email);
        uid = ex.uid;
      } catch {
        const created = await auth.createUser({
          email: u.email,
          password: u.password,
          displayName: `${u.nombre} ${u.apellido}`,
        });
        uid = created.uid;
      }
      await auth.setCustomUserClaims(uid, {
        rol: u.rol,
        area_apoyo: u.area_apoyo ?? null,
      });
      await db.collection('usuarios').doc(uid).set(
        {
          id: uid,
          email: u.email,
          nombre: u.nombre,
          apellido: u.apellido,
          rol: u.rol,
          area_apoyo: u.area_apoyo ?? null,
          empresa_codigo: u.empresa_codigo ?? null,
          sede_codigo: u.sede_codigo ?? null,
          unidad_id: u.unidad_id ?? null,
          activo: true,
          ...auditoriaSeed(),
        },
        { merge: true },
      );
    }

    for (const e of EMPRESAS) {
      await db.collection('empresas').doc(e.codigo).set(
        { id: e.codigo, ...e, activo: true, ...auditoriaSeed() },
        { merge: true },
      );
    }

    for (const s of SEDES) {
      await db.collection('sedes').doc(s.codigo).set(
        { id: s.codigo, ...s, es_provisional: true, activo: true, ...auditoriaSeed() },
        { merge: true },
      );
    }

    for (const u of UNIDADES) {
      await db.collection('unidades').doc(u.id).set(
        { ...u, activo: true, ...auditoriaSeed() },
        { merge: true },
      );
    }

    for (const c of CARGOS) {
      await db.collection('cargos_catalogo').doc(c.id).set(
        {
          ...c,
          pruebas_sugeridas: [],
          activo: true,
          ...auditoriaSeed(),
        },
        { merge: true },
      );
    }

    const f2026 = await sembrarFestivosAnio(2026);
    const f2027 = await sembrarFestivosAnio(2027);

    logger.info('Seed inicial completado', {
      empresas: EMPRESAS.length,
      sedes: SEDES.length,
      unidades: UNIDADES.length,
      cargos: CARGOS.length,
      usuarios: USUARIOS.length,
      festivos2026: f2026,
      festivos2027: f2027,
    });

    return {
      ok: true,
      empresas: EMPRESAS.length,
      sedes: SEDES.length,
      unidades: UNIDADES.length,
      cargos: CARGOS.length,
      usuarios: USUARIOS.length,
      festivos: f2026 + f2027,
    };
  },
);
