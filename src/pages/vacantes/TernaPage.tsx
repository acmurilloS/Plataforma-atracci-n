import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Mail,
  RotateCcw,
  Send,
  Stethoscope,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useFestivosAnio } from '../../hooks/useCatalogos';
import {
  MOTIVOS_RECICLABLES,
  MOTIVO_DESCARTE_LABEL,
  politicaParaCriticidad,
  validarTransicion,
  type MotivoDescarte,
} from '../../schemas';
import type { VacanteDoc, PostulacionDoc, ProcesoDoc } from '../../schemas';
import { crearTicketsConexion } from '../../utils/crearTicketsConexion';
import { actualizarResultadoCandidato } from '../../utils/actualizarResultadoCandidato';
import { DescarteModal } from '../../components/vacantes/DescarteModal';
import { PoliticaCriticidadBanner } from '../../components/vacantes/PoliticaCriticidadBanner';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';

/**
 * TernaPage · sistema brand.
 *
 * Centraliza pasos 12-14 del flujograma:
 *  · Paso 12: analista cierra terna → arranca reloj 48h del líder
 *  · Paso 13: reloj activo · countdown visible para todos los roles
 *  · Paso 14: líder aprueba / descarta con motivo tipificado · loop al pool
 */

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

  // Estados que mostramos como candidatos del flujo aún en proceso (pasos 5-9).
  // Tiene sentido "Incluir en terna" desde ahí. Excluimos: terminales
  // (descartado, filtrado, desistió, no interesado), los ya en terna, los ya
  // seleccionados/aprobados y los que están en pasos posteriores (exámenes,
  // contratación, contratado) — esos no se reabren a la terna.
  const ESTADOS_AUN_EN_FLUJO: PostulacionDoc['estado'][] = [
    'sourceado_por_ia',
    'postulado',
    'pre_entrevistado_pendiente',
    'pre_entrevistado_ok',
    'pruebas_enviadas',
    'pruebas_completadas',
    'entrevistado_analista',
    'referencias_validadas',
  ];

  const enTerna = postulaciones.filter((p) => p.estado === 'en_terna');
  const seleccionado = postulaciones.find((p) => p.estado === 'seleccionado_por_lider') ?? null;
  const descartadosLider = postulaciones.filter((p) => p.estado === 'descartado_por_lider');
  const otras = postulaciones.filter((p) => ESTADOS_AUN_EN_FLUJO.includes(p.estado));
  const decisionTomada = !!seleccionado || vacante?.estado === 'seleccionado';

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
  const urgente = relojActivo && !vencido && horasRestantes <= 24;

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
        terna_respondida_en: ahora,
      });
      await crear('examenes_medicos', {
        postulacion_id: p.id,
        candidato_id: p.candidato_id,
        vacante_id: vacante.id,
        proceso_id: vacante.proceso_activo_id,
        // Denormalizado para que ExamenesMedicosPage muestre nombre del
        // candidato + cargo sin tener que joinear con postulaciones.
        candidato_nombre: p.candidato_nombre,
        cargo_nombre: vacante.cargo_nombre,
        vacante_consecutivo: vacante.consecutivo,
        empresa_codigo: vacante.empresa_codigo,
        sede_codigo: vacante.sede_codigo,
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
      await crearTicketsConexion({
        vacante,
        postulacion: p,
        procesoActivo,
        uid: user.uid,
        festivosIsoSet: festivos,
        disparadoPor: 'automatico_terna',
      });
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
      await actualizarResultadoCandidato({
        candidato_id: p.candidato_id,
        resultado: MOTIVOS_RECICLABLES.has(motivo) ? 'apto_no_contratado' : 'descartado_lider',
        vacante_id: vacante.id,
        vacante_consecutivo: vacante.consecutivo,
        motivo_descarte: motivo,
        uid: user.uid,
      });
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

  async function cerrarTerna() {
    if (!vacante) return;
    if (enTerna.length === 0) {
      setErr('No hay candidatos en terna para enviar al líder.');
      return;
    }
    if (
      !window.confirm(
        `¿Cerrar la terna con ${enTerna.length} candidato(s) y enviar al líder ${vacante.lider_nombre}?\n\n` +
          'Arranca un reloj de 48h. A las 24h le mandamos recordatorio; a las 48h sin respuesta, la vacante se pausa.',
      )
    )
      return;
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

      // Notificar al líder en su perfil (campana) + correo automático. El
      // trigger onNotificacionCreate envía el correo al crearse la notificación,
      // así el analista NO tiene que descargar y mandar el correo a mano.
      if (vacante.lider_uid) {
        const analista = perfil ? `${perfil.nombre} ${perfil.apellido}` : 'El analista';
        // Listar los nombres de la terna para que el líder vea de una quién
        // está, sin tener que entrar (sale en la campana y en el correo).
        const nombres = enTerna.map((p) => p.candidato_nombre).filter(Boolean);
        const lista = nombres.length > 0 ? `: ${nombres.join(', ')}` : '';
        try {
          await crear('notificaciones', {
            destinatario_uid: vacante.lider_uid,
            tipo: 'terna_lista',
            titulo: 'Terna lista para tu revisión',
            mensaje: `${analista} te envió la terna de ${vacante.cargo_nombre} (${vacante.consecutivo}) con ${enTerna.length} candidato(s)${lista}. Revísala y decide desde la plataforma — tienes 48 horas.`,
            link: `/vacantes/${vacante.id}/terna`,
            leida: false,
            leida_en: null,
          });
        } catch (e) {
          // La terna ya quedó cerrada; un fallo al notificar no debe romper el flujo.
          console.warn('No se pudo crear la notificación al líder', e);
        }
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cerrar la terna.');
    } finally {
      setProcesando(null);
    }
  }

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

  if (!vacante)
    return (
      <div className="max-w-5xl mx-auto px-6 py-12 text-text-muted text-sm">
        Cargando vacante…
      </div>
    );

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-8">
      {/* Volver */}
      <Link
        to={`/vacantes/${vacante.id}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver al detalle
      </Link>

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <div>
        <Pill tono="brand" dot>
          Pasos 12 – 14 · Líder + Analista
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Terna y decisión
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          {vacante.cargo_nombre} · {vacante.empresa_nombre} · {vacante.sede_nombre}.{' '}
          <span className="tabular-nums font-semibold text-text-body">
            {enTerna.length} {enTerna.length === 1 ? 'candidato finalista' : 'candidatos finalistas'}
          </span>
          {minCandidatos > 0 && (
            <>
              {' '}
              · mínimo política <strong>{vacante.criticidad}</strong>:{' '}
              <span className="tabular-nums">{minCandidatos}</span>
            </>
          )}
        </p>
      </div>

      {err && (
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
          {err}
        </div>
      )}

      <PoliticaCriticidadBanner criticidad={vacante.criticidad} />

      {/* ─── Decisión tomada · candidato seleccionado ────────── */}
      {seleccionado && (
        <Card
          padding="lg"
          className="border-2 border-success-300 bg-gradient-to-br from-success-50/60 to-white"
        >
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3 min-w-0 flex-1">
              <div className="w-10 h-10 rounded-md bg-success-100 text-success-700 flex items-center justify-center shrink-0">
                <CheckCircle2 size={18} strokeWidth={1.75} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-success-700">
                  Decisión tomada · paso 14
                </p>
                <h3 className="mt-1 text-[20px] font-semibold tracking-[-0.012em] text-text-strong">
                  {seleccionado.candidato_nombre}
                </h3>
                <p className="text-[12px] text-text-muted mt-1">
                  Aprobado por el líder. Ya se disparó la solicitud de exámenes
                  médicos (paso 15) y los tickets de conexión (paso 20).
                </p>
                {seleccionado.candidato_email && (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-[12px] text-text-muted">
                    <Mail size={11} strokeWidth={1.5} className="text-text-subtle" />
                    {seleccionado.candidato_email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex flex-col gap-2 shrink-0">
              <Link to="/examenes-medicos">
                <Button
                  variant="brand-primary"
                  size="medium"
                  icon={<Stethoscope size={13} strokeWidth={1.75} />}
                  iconPosition="left"
                >
                  Ir a exámenes médicos
                </Button>
              </Link>
              <Link
                to={`/postulaciones/${seleccionado.id}`}
                className="inline-flex items-center justify-end gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
              >
                Ver ficha del candidato
                <ArrowRight size={11} strokeWidth={1.75} />
              </Link>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Reloj 48h del líder (paso 13) ───────────────────── */}
      {relojActivo && (
        <Card
          padding="lg"
          className={cn(
            'border-2',
            vencido
              ? 'border-danger-300 bg-danger-50/40'
              : urgente
                ? 'border-warning-300 bg-warning-50/40'
                : 'border-brand-200 bg-gradient-to-br from-brand-50/40 to-white',
          )}
        >
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-10 h-10 rounded-md flex items-center justify-center',
                  vencido
                    ? 'bg-danger-100 text-danger-700'
                    : urgente
                      ? 'bg-warning-100 text-warning-700'
                      : 'bg-brand-100 text-brand-700',
                )}
              >
                <Clock size={18} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                  Reloj del líder · paso 13
                </p>
                <p className="text-[14px] text-text-body mt-1">
                  Terna enviada a{' '}
                  <span className="font-semibold text-text-strong">{vacante.lider_nombre}</span>{' '}
                  el{' '}
                  <span className="tabular-nums">
                    {vacante.terna_enviada_en?.toDate().toLocaleString('es-CO')}
                  </span>
                </p>
              </div>
            </div>
            <div className="text-right">
              <p
                className={cn(
                  'text-[40px] font-extralight leading-[0.9] tracking-[-0.045em] tabular-nums',
                  vencido
                    ? 'text-danger-700'
                    : urgente
                      ? 'text-warning-700'
                      : 'text-brand-700',
                )}
              >
                {vencido ? 'Vencido' : `${horasRestantes}h`}
              </p>
              <p className="text-[11px] text-text-subtle mt-1">
                {vencido
                  ? 'La vacante se pausará en el próximo ciclo'
                  : urgente
                    ? 'Recordatorio de 24h enviado'
                    : 'Sin respuesta aún'}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* ─── CTA cerrar terna ────────────────────────────────── */}
      {puedeCerrarTerna && enTerna.length > 0 && !ternaEnviada && (
        <Card
          padding="md"
          className={cn(
            faltanCandidatos
              ? 'border-warning-300 bg-warning-50/40'
              : 'border-brand-200 bg-gradient-to-br from-brand-50/40 to-white',
          )}
        >
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <Send size={16} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-text-strong">
                  Cerrar terna y enviar al líder
                </p>
                <p className="text-[12px] text-text-muted mt-1 max-w-2xl">
                  Tienes{' '}
                  <span className="tabular-nums font-medium text-text-body">
                    {enTerna.length}
                  </span>{' '}
                  candidato(s) listos.{' '}
                  {faltanCandidatos ? (
                    <span className="text-warning-700 font-medium">
                      Política de criticidad {vacante.criticidad} exige mínimo {minCandidatos}.
                      {rol === 'admin' && ' Puedes forzar el cierre como admin.'}
                    </span>
                  ) : (
                    <>
                      Política {vacante.criticidad}: {minCandidatos} mínimo,{' '}
                      {politica?.candidatos_terna_sugeridos} sugeridos. Al enviar arranca el reloj
                      de 48h.
                    </>
                  )}
                </p>
              </div>
            </div>
            <Button
              variant="brand-primary"
              onClick={cerrarTerna}
              disabled={procesando === 'cerrar-terna' || (faltanCandidatos && rol !== 'admin')}
              loading={procesando === 'cerrar-terna'}
              icon={<Send size={13} strokeWidth={1.75} />}
            >
              {faltanCandidatos && rol !== 'admin'
                ? `Faltan ${minCandidatos - enTerna.length}`
                : 'Cerrar terna y notificar líder'}
            </Button>
          </div>
        </Card>
      )}

      {/* ─── Candidatos en terna ─────────────────────────────── */}
      {/* Tras decisión la sección se oculta — ya no se reciben más finalistas. */}
      {!decisionTomada && (
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Users size={14} strokeWidth={1.75} className="text-text-muted" />
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
            Candidatos en terna ·{' '}
            <span className="tabular-nums text-text-strong">{enTerna.length}</span>
          </p>
        </div>
        {enTerna.length === 0 ? (
          <div className="rounded-md border border-dashed border-slate-300 bg-slate-50/50 p-10 text-center">
            <p className="text-[14px] font-medium text-text-strong">Aún no hay candidatos en terna</p>
            <p className="text-[12px] text-text-muted mt-1 max-w-md mx-auto">
              En la pestaña "Informe" de cada postulación, presionar "Enviar al líder · paso 12"
              mueve al candidato aquí.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {enTerna.map((p) => (
              <Card key={p.id} padding="md">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[16px] font-semibold tracking-[-0.012em] text-text-strong">
                      {p.candidato_nombre}
                    </h3>
                    {p.candidato_email && (
                      <p className="mt-1 inline-flex items-center gap-1.5 text-[12px] text-text-muted">
                        <Mail size={11} strokeWidth={1.5} className="text-text-subtle" />
                        {p.candidato_email}
                      </p>
                    )}
                    <Link
                      to={`/postulaciones/${p.id}`}
                      className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2"
                    >
                      <FileText size={11} strokeWidth={1.5} />
                      Ver informe completo →
                    </Link>
                  </div>
                  {esLider && (
                    <div className="flex gap-2">
                      <Button
                        variant="destructive-secondary"
                        size="medium"
                        onClick={() => setDescarteAbierto(p)}
                        disabled={procesando === p.id}
                        icon={<X size={13} strokeWidth={1.75} />}
                      >
                        Descartar
                      </Button>
                      <Button
                        variant="brand-primary"
                        size="medium"
                        onClick={() => aprobar(p)}
                        disabled={procesando === p.id}
                        loading={procesando === p.id}
                        icon={<Check size={13} strokeWidth={1.75} />}
                      >
                        Aprobar
                      </Button>
                    </div>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      )}

      {/* ─── Descartados por el líder ────────────────────────── */}
      {descartadosLider.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
            <div className="flex items-center gap-2">
              <X size={14} strokeWidth={1.75} className="text-danger-700" />
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-danger-700">
                Descartados por el líder ·{' '}
                <span className="tabular-nums">{descartadosLider.length}</span>
              </p>
            </div>
            {puedeReabrir && (
              <p className="text-[11px] text-text-subtle italic max-w-md text-right">
                Si la terna queda desierta, puedes reabrir un candidato al pool y considerarlo en la
                próxima vuelta sin abrir proceso nuevo.
              </p>
            )}
          </div>
          <Card padding="none" className="overflow-hidden border-danger-500/20">
            <table className="w-full text-[13px]">
              <thead className="bg-danger-50/40 text-danger-700">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Candidato
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Motivo
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Notas
                  </th>
                  {puedeReabrir && <th className="px-4 py-3"></th>}
                </tr>
              </thead>
              <tbody>
                {descartadosLider.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-danger-500/10 hover:bg-danger-50/20 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-text-strong">{p.candidato_nombre}</p>
                      <p className="text-[11px] text-text-subtle">{p.candidato_email}</p>
                    </td>
                    <td className="px-4 py-3">
                      {p.motivo_descarte ? (
                        <Pill
                          tono={
                            MOTIVOS_RECICLABLES.has(p.motivo_descarte) ? 'success' : 'danger'
                          }
                          dot
                        >
                          {MOTIVOS_RECICLABLES.has(p.motivo_descarte) ? 'Reciclable' : 'Duro'}
                        </Pill>
                      ) : (
                        <span className="text-text-subtle">—</span>
                      )}
                      {p.motivo_descarte && (
                        <p className="text-[11px] text-text-muted mt-1">
                          {MOTIVO_DESCARTE_LABEL[p.motivo_descarte]}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[12px] text-text-muted italic">
                      {p.razon_descarte ?? '—'}
                    </td>
                    {puedeReabrir && (
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="neutral-secondary"
                          size="small"
                          onClick={() => reabrirAlPool(p)}
                          disabled={procesando === p.id}
                          icon={<RotateCcw size={11} strokeWidth={1.75} />}
                        >
                          Reabrir al pool
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      {/* ─── Otros candidatos activos ────────────────────────── */}
      {otras.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Otros candidatos activos ·{' '}
              <span className="tabular-nums text-text-strong">{otras.length}</span>
            </p>
          </div>
          <Card padding="none" className="overflow-hidden">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-text-muted">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Candidato
                  </th>
                  <th className="px-4 py-3 text-left font-bold text-[10px] uppercase tracking-[0.06em]">
                    Estado
                  </th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {otras.map((p) => (
                  <tr
                    key={p.id}
                    className="border-t border-slate-100 hover:bg-slate-50/30 transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-text-strong">
                      {p.candidato_nombre}
                    </td>
                    <td className="px-4 py-3">
                      <Pill tono="neutral" dot>
                        {p.estado.replace(/_/g, ' ')}
                      </Pill>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => agregarATerna(p)}
                        className="text-[12px] text-brand-700 hover:text-brand-800 hover:underline font-medium"
                      >
                        Incluir en terna
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        </section>
      )}

      <p className="text-[11px] text-text-subtle italic">
        Al aprobar un candidato, la plataforma crea automáticamente la solicitud de exámenes
        médicos (paso 15), dispara los{' '}
        <Link to="/tickets" className="text-brand-700 hover:text-brand-800 hover:underline">
          tickets de conexión
        </Link>{' '}
        a IT / compras / bodega / contabilidad / talentos (paso 20), y mueve la vacante a estado{' '}
        <code className="font-mono text-text-body">seleccionado</code>.
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
