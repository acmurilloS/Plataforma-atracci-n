import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';
import { puedeGestionarUsuarios } from './permisos';

/**
 * setearRolUsuario · admin-only HTTPS.
 *
 * Cambia el rol de un user existente: actualiza custom claim + doc
 * `usuarios/{uid}`. Pensado para que admin/Maribel/Karen puedan promover o
 * demover usuarios desde el Panel de Admin sin tocar Firebase Console.
 *
 * onRequest (no callable) por los problemas recurrentes de IAM en callables
 * nuevas. La seguridad la da la verificación manual del Bearer + rol admin.
 *
 * Importante: después de cambiar el rol, el user debe HACER LOGOUT y volver
 * a loguearse para que su nuevo token traiga el claim actualizado.
 */
export const setearRolUsuario = onRequest(
  { region: 'us-central1', invoker: 'public', cors: true },
  async (req, res) => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.header('Authorization') ?? '';
      const idToken = authHeader.replace(/^Bearer\s+/i, '');
      if (!idToken) {
        res.status(401).json({ error: 'Falta Authorization: Bearer <idToken>.' });
        return;
      }

      const decoded = await getAuth().verifyIdToken(idToken);
      if (!puedeGestionarUsuarios(decoded as unknown as Record<string, unknown>)) {
        res.status(403).json({ error: 'No tienes permiso para cambiar roles.' });
        return;
      }

      const { uid, rol } = (req.body ?? {}) as { uid?: string; rol?: string };
      const rolesValidos = ['admin', 'lider', 'analista', 'coordinador', 'gh', 'apoyo', 'talentos', 'gestor', 'documentacion'];

      if (!uid || !rol || !rolesValidos.includes(rol)) {
        res.status(400).json({
          error: `Requiere {uid, rol}. Roles válidos: ${rolesValidos.join(', ')}.`,
        });
        return;
      }
      // Protección: un admin no puede degradarse a sí mismo (queda sin admins).
      if (uid === decoded.uid && rol !== 'admin') {
        res.status(400).json({
          error: 'No puedes quitarte tu propio rol de admin. Pídele a otro admin que lo haga.',
        });
        return;
      }

      // Preserva el override por-usuario `secciones_admin` (setCustomUserClaims
      // REEMPLAZA todos los claims): si no lo re-inyectamos, cambiar el rol le
      // borraría a alguien (p.ej. Karen) su permiso de Usuarios/Catálogos.
      const target = await getAuth().getUser(uid);
      const prevClaims = (target.customClaims ?? {}) as Record<string, unknown>;
      const nuevosClaims: Record<string, unknown> = { rol };
      if (Array.isArray(prevClaims.secciones_admin)) {
        nuevosClaims.secciones_admin = prevClaims.secciones_admin;
      }
      // Mismo motivo con `area_apoyo` (IT / compras / bodega…): las reglas de
      // `tickets_conexion` filtran la cola por ESE claim. Si se pierde al tocar
      // el rol, el doc de usuario conserva el área pero el token no, y la
      // persona deja de ver sus tickets sin ningún error visible (auditoría de
      // PII, 15-jul). Solo aplica si sigue siendo apoyo.
      if (rol === 'apoyo' && typeof prevClaims.area_apoyo === 'string') {
        nuevosClaims.area_apoyo = prevClaims.area_apoyo;
      }
      await getAuth().setCustomUserClaims(uid, nuevosClaims);
      await db.collection('usuarios').doc(uid).update({
        rol,
        actualizado_en: FieldValue.serverTimestamp(),
        actualizado_por: decoded.uid,
      });

      logger.info('setearRolUsuario', { uid, rol, por: decoded.uid });
      res.json({ ok: true, uid, rol });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('setearRolUsuario error', { msg });
      res.status(500).json({ error: msg });
    }
  },
);
