import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

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
      if (decoded.rol !== 'admin') {
        res.status(403).json({ error: 'Solo admin puede cambiar roles.' });
        return;
      }

      const { uid, rol } = (req.body ?? {}) as { uid?: string; rol?: string };
      const rolesValidos = ['admin', 'lider', 'analista', 'coordinador', 'gh', 'apoyo'];

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

      await getAuth().setCustomUserClaims(uid, { rol });
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
