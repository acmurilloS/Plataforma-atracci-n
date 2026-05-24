import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { useAuth } from '../../hooks/useAuth';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useFestivosAnio } from '../../hooks/useCatalogos';
import {
  MOTIVOS_RECICLABLES,
  politicaParaCriticidad,
  validarTransicion,
  type MotivoDescarte,
} from '../../schemas';
import type { VacanteDoc, PostulacionDoc, ProcesoDoc } from '../../schemas';
import { crearTicketsConexion } from '../../utils/crearTicketsConexion';
import { actualizarResultadoCandidato } from '../../utils/actualizarResultadoCandidato';
import { DescarteModal } from '../../components/vacantes/DescarteModal';
import { PoliticaCriticidadBanner } from '../../components/vacantes/PoliticaCriticidadBanner';

export default function TernaPage() {
  const { id } = useParams<{ id: string }>();
  const { user, perfil, rol } = useAuth();
  const { doc: vacante } = useDoc<VacanteDoc>('vacantes', id);
  const { doc: procesoActivo } = useDoc<ProcesoDoc>(
    'procesos',
    vacante?.proceso_activo_id ?? null,
  );
  const { docs: postulaciones } = useColeccion<PostulacionDoc>('postulaciones', {
    filtros: id ? [['vacante_id', '==', id]] : [],
  });
  const { crear, actualizar } = useMutacion();
  const festivos = useFestivosAnio(new Date().getFullYear());
  const [procesando, setProcesando] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [descarteAbierto, setDescarteAbierto] = useState<PostulacionDoc | null>(null);

  const enTerna = postulaciones.filter((p) => p.estado === 'en_terna');
  const descartadosLider = postulaciones.filter((p) => p.estado === 'descartado_por_lider');
  const otras = postulaciones.filter(
    (p) =>
      p.estado !== 'en_terna' &&
      p.estado !== 'descartado_por_lider' &&
      p.estado !== 'filtrado_no_cumple' &&
      p.estado !== 'desistio_candidato',
  );

  const esLider = rol === 'lider' || rol === 'admin';
  const puedeReabrir = rol === 'analista' || rol === 'coordinador' || rol === 'admin';
  const puedeCerrarTerna = rol === 'analista' || rol === 'coordinador' || rol === 'admin';

  const ternaEnviada = vacante?.terna_enviada_en ?? null;
  const ternaRespondida = vacante?.terna_respondida_en ?? null;
  const relojActivo = !!ternaEnviada && !ternaRespondida && vacante?.estado === 'terna_enviada';
  const politica = vacante ? politicaParaCriticidad(vacante.criticidad) : null;
  const minCandidatos = politica?.min_candidatos_terna ?? 1;
  const faltanCandidatos = enTerna.length < minCandidatos;
  const msRestantes = ternaEnviada
    ? 48 * 60 * 60 * 1000 - (Date.now() - ternaEnviada.toMillis())
    : 0;
  const horasRestantes = Math.max(0, Math.floor(msRestantes / (60 * 60 * 1000)));
  const vencido = relojActivo && msRestantes <= 0;

  async function aprobar(p: PostulacionDoc) {
    if (!vacante || !user || !perfil) return;
    setProcesando(p.id);
    setErr(null);
    try {
      await crear('decisiones', {
        postulacion_id: p.id,
        proceso_id: vacante.proceso_activo_id,
        terna_id: null,
        lider_uid: user.uid,
        lider_nombre: `${perfil.nombre} ${perfil.apellido}`,
        aprobado: true,
        feedback_lider: '',
        condiciones_adicionales: null,
        decidido_en: Timestamp.now(),
      });
      const ahora = Timestamp.now();
      await actualizar('postulaciones', p.id, {
        estado: 'seleccionado_por_lider',
        ultima_transicion_estado: ahora,
        'marcas.decidido_en': ahora,
      });
      await actualizar('vacantes', vacante.id, {
        estado: 'seleccionado',
        // Detiene el reloj de 48h del líder (paso 13).
        terna_respondida_en: ahora,
      });
      // Auto-dispara solicitud de exámenes médicos (paso 15)
      await crear('examenes_medicos', {
        postulacion_id: p.id,
        candidato_id: p.candidato_id,
        vacante_id: vacante.id,
        proceso_id: vacante.proceso_activo_id,
        solicitada_en: Timestamp.now(),
        solicitada_por_uid: user.uid,
        orden_url: null,
        enviada_al_candidato_en: null,
        centro_medico: null,
        concepto_recibido_en: null,
        concepto_url: null,
        apto: null,
        recomendaciones: null,
        estado: 'solicitada',
      });
      // Auto-dispara tickets de conexión (paso 20 · Módulo 8) a IT, talentos
      // y áreas según herramientas_requeridas del perfilamiento.
      await crearTicketsConexion({
        vacante,
        postulacion: p,
        procesoActivo,
        uid: user.uid,
        festivosIsoSet: festivos,
        disparadoPor: 'automatico_terna',
      });
      // Denormaliza al candidato: lo deja como "contratado" en su resumen
      // cross-vacante para que no aparezca en pool ni en queries futuras.
      await actualizarResultadoCandidato({
        candidato_id: p.candidato_id,
        resultado: 'contratado',
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        uid: user.uid,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos aprobar.');
    } finally {
      setProcesando(null);
    }
  }

  /**
   * Descarte tipificado del líder (paso 14).
   *
   * En vez de un `window.prompt` libre, abrimos un modal con motivos del enum
   * `motivoDescarte`. Esto permite que el pool futuro (ATR-11) distinga
   * reciclables (feedback blando) de duros (no apto, sin perfil).
   */
  async function descartarConMotivo(p: PostulacionDoc, motivo: MotivoDescarte, notas: string) {
    if (!vacante || !user || !perfil) return;
    setProcesando(p.id);
    setErr(null);
    try {
      await crear('decisiones', {
        postulacion_id: p.id,
        proceso_id: vacante.proceso_activo_id,
        terna_id: null,
        lider_uid: user.uid,
        lider_nombre: `${perfil.nombre} ${perfil.apellido}`,
        aprobado: false,
        feedback_lider: notas,
        motivo_descarte: motivo,
        condiciones_adicionales: null,
        decidido_en: Timestamp.now(),
      });
      const ahora = Timestamp.now();
      await actualizar('postulaciones', p.id, {
        estado: 'descartado_por_lider',
        ultima_transicion_estado: ahora,
        motivo_descarte: motivo,
        razon_descarte: notas || null,
        descarte_etapa: 'entrevista_lider',
        'marcas.descartado_en': ahora,
      });
      // Denormaliza al candidato (pool-ready): los reciclables quedan como
      // 'apto_no_contratado' para que el pool los identifique como candidatos
      // viables; los duros bajan el flag apto_para_pool_futuro.
      await actualizarResultadoCandidato({
        candidato_id: p.candidato_id,
        resultado: MOTIVOS_RECICLABLES.has(motivo) ? 'apto_no_contratado' : 'descartado_lider',
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        motivo_descarte: motivo,
        uid: user.uid,
      });
      // Cualquier decisión del líder detiene el reloj de 48h (paso 13).
      if (vacante.terna_enviada_en && !vacante.terna_respondida_en) {
        await actualizar('vacantes', vacante.id, { terna_respondida_en: ahora });
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos descartar.');
      throw e;
    } finally {
      setProcesando(null);
    }
  }

  async function agregarATerna(p: PostulacionDoc) {
    const ahora = Timestamp.now();
    await actualizar('postulaciones', p.id, {
      estado: 'en_terna',
      ultima_transicion_estado: ahora,
      'marcas.en_terna_en': ahora,
    });
  }

  /**
   * Cierra la terna y arranca el reloj de 48h del líder (paso 12 → paso 13).
   * Setea vacante.estado=terna_enviada + terna_enviada_en=now. La scheduled
   * function `revisarRecordatoriosLider` cada hora chequea esta vacante y
   * dispara recordatorios a las 24h y expiración a las 48h.
   */
  async function cerrarTerna() {
    if (!vacante) return;
    if (enTerna.length === 0) {
      setErr('No hay candidatos en terna para enviar al líder.');
      return;
    }
    if (!window.confirm(
      `¿Cerrar la terna con ${enTerna.length} candidato(s) y enviar al líder ${vacante.lider_nombre}?\n\n` +
        'Arranca un reloj de 48h. A las 24h le mandamos recordatorio; a las 48h sin respuesta, la vacante se pausa.',
    )) return;
    setProcesando('cerrar-terna');
    setErr(null);
    try {
      const ahora = Timestamp.now();
      await actualizar('vacantes', vacante.id, {
        estado: 'terna_enviada',
        terna_enviada_en: ahora,
        terna_respondida_en: null,
        recordatorio_48h_enviado_en: null,
        recordatorio_24h_enviado_en: null,
        recordatorio_expirado_en: null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cerrar la terna.');
    } finally {
      setProcesando(null);
    }
  }

  /**
   * Loop del paso 14: el líder no aprobó pero el candidato cumple el perfil.
   * Regresa la postulación al pool (estado `postulado`) sin abrir proceso nuevo.
   * Conserva razon_descarte previa en observaciones para auditoría.
   */
  async function reabrirAlPool(p: PostulacionDoc) {
    if (!validarTransicion(p.estado, 'postulado')) {
      setErr(`No se puede pasar de ${p.estado} a postulado.`);
      return;
    }
    setProcesando(p.id);
    setErr(null);
    try {
      const ahora = Timestamp.now();
      await actualizar('postulaciones', p.id, {
        estado: 'postulado',
        ultima_transicion_estado: ahora,
        // Limpiamos descarte para que vuelva al flujo normal del paso 5
        razon_descarte: null,
        descarte_etapa: null,
        'marcas.reabierto_al_pool_en': ahora,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos reabrir.');
    } finally {
      setProcesando(null);
    }
  }

  if (!vacante) return <div className="px-6 py-10 text-sm text-navy-500">Cargando…</div>;

  return (
    <div className="max-w-5xl mx-auto px-6 py-10 space-y-6">
      <div>
        <Link to={`/vacantes/${vacante.id}`} className="text-xs text-navy-500 hover:text-navy-800">
          ← Volver a detalle
        </Link>
        <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">
          Pasos 12-14 · Líder + Analista
        </p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">
          Terna y decisión
        </h1>
        <p className="text-sm text-navy-600 mt-1">
          {vacante.cargo_nombre} · {enTerna.length} candidatos finalistas
        </p>
      </div>

      {err && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

      <PoliticaCriticidadBanner criticidad={vacante.criticidad} />

      {/* Reloj 48h del líder (paso 13). Visible para todos los roles cuando la terna
          ya fue enviada y aún no hay respuesta. */}
      {relojActivo && (
        <div
          className={`rounded-xl border p-4 ${
            vencido
              ? 'border-red-300 bg-red-50'
              : horasRestantes <= 24
                ? 'border-amber-300 bg-amber-50'
                : 'border-navy-200 bg-cream-50'
          }`}
        >
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-xs uppercase tracking-widest font-semibold text-navy-700">
                Reloj del líder · paso 13
              </p>
              <p className="text-sm text-navy-800 mt-1">
                Terna enviada a <strong>{vacante.lider_nombre}</strong>{' '}
                el {vacante.terna_enviada_en?.toDate().toLocaleString('es-CO')}.
              </p>
            </div>
            <div className="text-right">
              <p
                className={`font-display text-2xl font-bold ${
                  vencido ? 'text-red-700' : horasRestantes <= 24 ? 'text-amber-700' : 'text-navy-900'
                }`}
              >
                {vencido ? 'Vencido' : `${horasRestantes}h restantes`}
              </p>
              <p className="text-xs text-navy-500">
                {vencido
                  ? 'La vacante se pausará en el próximo ciclo de revisión.'
                  : horasRestantes <= 24
                    ? 'Recordatorio de 24h enviado.'
                    : 'Sin respuesta aún.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* CTA para cerrar la terna y arrancar el reloj. Solo si aún no se envió.
          Bloqueado si faltan candidatos según política de criticidad. */}
      {puedeCerrarTerna && enTerna.length > 0 && !ternaEnviada && (
        <div
          className={`rounded-xl border p-4 flex items-center justify-between flex-wrap gap-3 ${
            faltanCandidatos ? 'border-amber-300 bg-amber-50' : 'border-gold-200 bg-cream-50'
          }`}
        >
          <div>
            <p className="text-sm font-semibold text-navy-900">
              Cerrar terna y enviar al líder
            </p>
            <p className="text-xs text-navy-700 mt-1">
              Tienes {enTerna.length} candidato(s) listos.{' '}
              {faltanCandidatos ? (
                <span className="text-amber-800 font-medium">
                  La política de criticidad {vacante.criticidad} exige mínimo {minCandidatos}.
                  {rol === 'admin' && ' Puedes forzar el cierre como admin.'}
                </span>
              ) : (
                <>
                  Política {vacante.criticidad}: {minCandidatos} mínimo,{' '}
                  {politica?.candidatos_terna_sugeridos} sugeridos. Al enviar arranca el reloj de
                  48h.
                </>
              )}
            </p>
          </div>
          <button
            onClick={cerrarTerna}
            disabled={
              procesando === 'cerrar-terna' || (faltanCandidatos && rol !== 'admin')
            }
            className="rounded-md bg-gold-700 text-white px-4 py-2 text-sm font-semibold hover:bg-gold-800 disabled:bg-gold-300"
          >
            {procesando === 'cerrar-terna'
              ? '…'
              : faltanCandidatos && rol !== 'admin'
                ? `Faltan ${minCandidatos - enTerna.length}`
                : '📤 Cerrar terna y notificar líder'}
          </button>
        </div>
      )}

      <section>
        <h2 className="font-display text-xl font-semibold text-navy-900 mb-3">
          Candidatos en terna ({enTerna.length})
        </h2>
        {enTerna.length === 0 && (
          <p className="text-sm text-navy-500">
            Aún no hay candidatos en terna. En la pestaña "Informe" de cada postulación, enviar informe al líder los mueve aquí.
          </p>
        )}
        <div className="space-y-3">
          {enTerna.map((p) => (
            <div key={p.id} className="rounded-xl border border-navy-100 bg-white p-5 flex items-start justify-between">
              <div>
                <h3 className="font-display text-lg font-semibold text-navy-900">{p.candidato_nombre}</h3>
                <p className="text-xs text-navy-600">{p.candidato_email}</p>
                <Link
                  to={`/postulaciones/${p.id}`}
                  className="mt-2 inline-block text-xs text-gold-700 hover:underline"
                >
                  Ver informe completo →
                </Link>
              </div>
              {esLider && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setDescarteAbierto(p)}
                    disabled={procesando === p.id}
                    className="rounded-md border border-red-200 text-red-700 px-3 py-1.5 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                  >
                    Descartar
                  </button>
                  <button
                    onClick={() => aprobar(p)}
                    disabled={procesando === p.id}
                    className="rounded-md bg-navy-700 text-white px-3 py-1.5 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
                  >
                    {procesando === p.id ? '…' : 'Aprobar'}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {descartadosLider.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <h2 className="font-display text-xl font-semibold text-navy-900">
              Descartados por el líder ({descartadosLider.length})
            </h2>
            {puedeReabrir && (
              <p className="text-xs text-navy-500">
                Si la terna queda desierta, puedes reabrir un candidato al pool para considerarlo en
                la próxima vuelta sin abrir proceso nuevo.
              </p>
            )}
          </div>
          <div className="rounded-xl border border-red-100 bg-red-50/30 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-red-50 text-red-900 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Candidato</th>
                  <th className="px-4 py-2 font-medium">Motivo del descarte</th>
                  {puedeReabrir && <th className="px-4 py-2"></th>}
                </tr>
              </thead>
              <tbody>
                {descartadosLider.map((p) => (
                  <tr key={p.id} className="border-t border-red-100">
                    <td className="px-4 py-2">
                      <p className="font-medium text-navy-900">{p.candidato_nombre}</p>
                      <p className="text-[11px] text-navy-500">{p.candidato_email}</p>
                    </td>
                    <td className="px-4 py-2 text-xs text-navy-700 italic">
                      {p.razon_descarte ?? '—'}
                    </td>
                    {puedeReabrir && (
                      <td className="px-4 py-2 text-right">
                        <button
                          onClick={() => reabrirAlPool(p)}
                          disabled={procesando === p.id}
                          className="rounded-md border border-navy-200 bg-white text-navy-700 px-3 py-1.5 text-xs font-semibold hover:bg-cream-100 disabled:opacity-50"
                        >
                          ↺ Reabrir al pool
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {otras.length > 0 && (
        <section>
          <h2 className="font-display text-xl font-semibold text-navy-900 mb-3">
            Otros candidatos activos ({otras.length})
          </h2>
          <div className="rounded-xl border border-navy-100 bg-white overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-cream-100 text-navy-700 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Candidato</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {otras.map((p) => (
                  <tr key={p.id} className="border-t border-navy-50">
                    <td className="px-4 py-2">{p.candidato_nombre}</td>
                    <td className="px-4 py-2 text-xs">{p.estado}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        onClick={() => agregarATerna(p)}
                        className="text-xs text-gold-700 hover:underline"
                      >
                        Incluir en terna
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <p className="text-xs text-navy-500">
        Al aprobar a un candidato, la plataforma automáticamente crea la solicitud de exámenes
        médicos (paso 15), dispara los <Link to="/tickets" className="text-gold-700 hover:underline">tickets de conexión</Link> a IT
        / compras / bodega / contabilidad / talentos (paso 20) y mueve la vacante a estado <code>seleccionado</code>.
      </p>

      {descarteAbierto && (
        <DescarteModal
          open={!!descarteAbierto}
          candidatoNombre={descarteAbierto.candidato_nombre}
          onClose={() => setDescarteAbierto(null)}
          onConfirmar={async (motivo, notas) => {
            await descartarConMotivo(descarteAbierto, motivo, notas);
          }}
        />
      )}
    </div>
  );
}
