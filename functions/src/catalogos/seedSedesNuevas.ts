import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * seedSedesNuevas · reu Karen 27-ago. Agrega ciudades faltantes al catálogo de
 * sedes (el desplegable de "Sede" muestra TODAS las ciudades del holding, dedup
 * por ciudad, así que basta un doc por ciudad). El consecutivo usa el `codigo` de
 * la sede (SEDE_CONSEC hace fallback al propio código), no hace falta tocar nada
 * más. Idempotente: salta las ciudades/códigos que ya existen. Solo admin.
 */

const NUEVAS = [
  { codigo: 'BUE', ciudad: 'Buenaventura', nombre: 'Buenaventura' },
  { codigo: 'QUI', ciudad: 'Quibdó', nombre: 'Quibdó' },
  { codigo: 'CUC', ciudad: 'Cúcuta', nombre: 'Cúcuta' },
  { codigo: 'CTG', ciudad: 'Cartagena', nombre: 'Cartagena' },
  { codigo: 'MON', ciudad: 'Montería', nombre: 'Montería' },
];

export const seedSedesNuevas = onCall({ region: 'us-central1' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Inicia sesión.');
  if (String(req.auth.token.rol ?? '') !== 'admin') {
    throw new HttpsError('permission-denied', 'Solo admin.');
  }

  const existentes = await db.collection('sedes').get();
  const ciudades = new Set(
    existentes.docs.map((d) => String(d.data()?.ciudad ?? '').trim().toLowerCase()),
  );
  const codigos = new Set(
    existentes.docs.map((d) => String(d.data()?.codigo ?? '').trim().toUpperCase()),
  );

  let creadas = 0;
  const detalle: { ciudad: string; codigo: string; estado: string }[] = [];
  for (const s of NUEVAS) {
    if (ciudades.has(s.ciudad.toLowerCase()) || codigos.has(s.codigo)) {
      detalle.push({ ciudad: s.ciudad, codigo: s.codigo, estado: 'ya existía' });
      continue;
    }
    await db.collection('sedes').add({
      codigo: s.codigo,
      empresa_codigo: 'EQT',
      nombre: s.nombre,
      ciudad: s.ciudad,
      direccion: '',
      activo: true,
      es_provisional: false,
      creado_en: FieldValue.serverTimestamp(),
      creado_por: req.auth.uid,
      actualizado_en: FieldValue.serverTimestamp(),
      actualizado_por: req.auth.uid,
    });
    creadas++;
    detalle.push({ ciudad: s.ciudad, codigo: s.codigo, estado: 'creada' });
  }

  logger.info('[seedSedesNuevas]', { creadas, detalle });
  return { ok: true as const, creadas, detalle };
});
