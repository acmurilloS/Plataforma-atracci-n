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

const EMPRESAS = [
  { codigo: 'EQT', nombre: 'Equitel', razon_social: 'Equitel S.A.S.', nit: '900000001-1' },
  { codigo: 'CUM', nombre: 'Cumandes', razon_social: 'Cumandes S.A.S.', nit: '900000002-2' },
  { codigo: 'ING', nombre: 'Ingenergía', razon_social: 'Ingenergía S.A.S.', nit: '900000003-3' },
  { codigo: 'SLP', nombre: 'Silap', razon_social: 'Silap S.A.S.', nit: '900000004-4' },
];

const SEDES = [
  { codigo: 'BOG', nombre: 'Bogotá', ciudad: 'Bogotá', empresa_codigo: 'EQT' },
  { codigo: 'MED', nombre: 'Medellín', ciudad: 'Medellín', empresa_codigo: 'EQT' },
  { codigo: 'CTG', nombre: 'Cartagena', ciudad: 'Cartagena', empresa_codigo: 'CUM' },
  { codigo: 'CLI', nombre: 'Cali', ciudad: 'Cali', empresa_codigo: 'ING' },
  { codigo: 'BAR', nombre: 'Barranquilla', ciudad: 'Barranquilla', empresa_codigo: 'SLP' },
];

const UNIDADES = [
  { id: 'eqt-bog-comercial', empresa_codigo: 'EQT', sede_codigo: 'BOG', nombre: 'Comercial Retail' },
  { id: 'eqt-bog-operaciones', empresa_codigo: 'EQT', sede_codigo: 'BOG', nombre: 'Operaciones Bogotá' },
  { id: 'cum-ctg-comercial', empresa_codigo: 'CUM', sede_codigo: 'CTG', nombre: 'Comercial Cartagena' },
];

const CARGOS = [
  {
    id: 'asesor-comercial-senior',
    nombre: 'Asesor Comercial Senior',
    categoria: 'comercial',
    criticidad_sugerida: 'Alta',
    banda_min: 2_500_000,
    banda_max: 4_500_000,
    herramientas_sugeridas: { computador: true, office: true, labroides: false, dotacion: false },
  },
  {
    id: 'auxiliar-operativo',
    nombre: 'Auxiliar Operativo',
    categoria: 'operativo',
    criticidad_sugerida: 'Baja',
    banda_min: null,
    banda_max: null,
    herramientas_sugeridas: { computador: false, office: false, labroides: false, dotacion: true },
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
    unidad_id: 'eqt-bog-comercial',
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
        { id: s.codigo, ...s, direccion: '', activo: true, ...auditoriaSeed() },
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
          requiere_licencia: false,
          requiere_moto: false,
          requiere_tarjeta_profesional: false,
          requiere_titulo_profesional: false,
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
