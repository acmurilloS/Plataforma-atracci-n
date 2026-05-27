import { getAuth } from 'firebase-admin/auth';
import { FieldValue } from 'firebase-admin/firestore';
import { logger } from 'firebase-functions/v2';
import { onRequest } from 'firebase-functions/v2/https';
import { db } from '../utils/admin';

/**
 * crearUsuarioCorporativo · admin-only HTTPS.
 *
 * Crea (o reutiliza) un user en Firebase Auth para un email corporativo,
 * le setea custom claim con el rol indicado y crea su doc usuarios/{uid}.
 *
 * Pensado para el bootstrap de nuevos miembros del equipo de atracción
 * (Maribel, Génesis, etc.) hasta que exista una UI completa de gestión de
 * usuarios en /admin.
 *
 * Sin password — los usuarios entran solo con Google con su correo
 * @equitel.com.co. Si el user ya existe, refresca su rol.
 *
 * onRequest (no callable) por el problema recurrente de IAM en callables
 * nuevas: con onRequest + invoker:'public' funciona inmediatamente. La
 * seguridad real está en la verificación manual del Bearer + custom claim.
 */
export const crearUsuarioCorporativo = onRequest(
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
        res.status(403).json({ error: 'Solo admin.' });
        return;
      }

      const { email, nombre, apellido, rol, empresa_codigo, sede_codigo, area_apoyo } =
        (req.body ?? {}) as {
          email?: string;
          nombre?: string;
          apellido?: string;
          rol?: string;
          empresa_codigo?: string;
          sede_codigo?: string;
          area_apoyo?: string;
        };

      const rolesValidos = ['admin', 'lider', 'analista', 'coordinador', 'gh', 'apoyo'];

      if (!email || !nombre || !apellido || !rol || !rolesValidos.includes(rol)) {
        res.status(400).json({
          error:
            'Requiere {email, nombre, apellido, rol}. ' +
            `Roles válidos: ${rolesValidos.join(', ')}.`,
        });
        return;
      }

      const auth = getAuth();

      let uid: string;
      let creado = false;
      try {
        const ex = await auth.getUserByEmail(email);
        uid = ex.uid;
      } catch {
        const nuevo = await auth.createUser({
          email,
          displayName: `${nombre} ${apellido}`,
          emailVerified: true,
        });
        uid = nuevo.uid;
        creado = true;
        logger.info('crearUsuarioCorporativo · user creado en Auth', { email, uid });
      }

      const claims: Record<string, unknown> = { rol };
      if (area_apoyo) claims.area_apoyo = area_apoyo;
      await auth.setCustomUserClaims(uid, claims);

      await db.collection('usuarios').doc(uid).set(
        {
          id: uid,
          email,
          nombre,
          apellido,
          rol,
          empresa_codigo: empresa_codigo ?? null,
          sede_codigo: sede_codigo ?? null,
          area_apoyo: area_apoyo ?? null,
          activo: true,
          creado_en: FieldValue.serverTimestamp(),
          creado_por: decoded.uid,
          actualizado_en: FieldValue.serverTimestamp(),
          actualizado_por: decoded.uid,
        },
        { merge: true },
      );

      logger.info('crearUsuarioCorporativo OK', { email, uid, rol, creado });
      res.json({ ok: true, uid, email, rol, creado });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      logger.error('crearUsuarioCorporativo error', { msg });
      res.status(500).json({ error: msg });
    }
  },
);
