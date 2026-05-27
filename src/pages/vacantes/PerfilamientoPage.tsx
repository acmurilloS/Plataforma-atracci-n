import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import {
  ArrowLeft,
  Briefcase,
  Calendar,
  Cpu,
  HardHat,
  Lightbulb,
  Monitor,
  Smartphone,
  Sparkles,
  Target,
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { useMutacion } from '../../hooks/useMutacion';
import { useFestivosAnio } from '../../hooks/useCatalogos';
import { functions } from '../../lib/firebase';
import {
  fechaInputValue,
  parsearFechaInput,
  sumarDiasHabiles,
} from '../../utils/fechas';
import { crearPreavisosTickets } from '../../utils/crearPreavisosTickets';
import {
  validarPerfilUnicornio,
  type AlertaUnicornio,
} from '../../utils/validadorPerfilUnicornio';
import { AlertasUnicornio } from '../../components/vacantes/AlertasUnicornio';
import { PoliticaCriticidadBanner } from '../../components/vacantes/PoliticaCriticidadBanner';
import { Button, Card, Pill } from '../../components/brand';
import { cn } from '../../utils/cn';
import type { CargoDoc, VacanteDoc } from '../../schemas';
import type { ProcesoDoc } from '../../schemas/procesoSchema';

/**
 * PerfilamientoPage · sistema brand.
 *
 * Hero header hairline + PoliticaCriticidadBanner.
 * Form en 3 cards brand (Criterios y mercado / Herramientas / Agenda).
 * Validador anti-unicornio en línea + CTA "Pedir análisis IA" en card glass
 * brand. CTA submit en brand-primary.
 */

interface AnalisisIA {
  diagnostico: string;
  alertas_adicionales: string[];
  recomendacion_global: string;
  perfil_es_realista: boolean;
}

const HERRAMIENTAS_META = [
  {
    key: 'computador' as const,
    label: 'Computador',
    detalle: 'Equipo + monitor',
    icon: Monitor,
  },
  {
    key: 'office' as const,
    label: 'Office / M365',
    detalle: 'Licencia productividad',
    icon: Cpu,
  },
  {
    key: 'celular_plan_datos' as const,
    label: 'Celular + datos',
    detalle: 'Línea corporativa',
    icon: Smartphone,
  },
  {
    key: 'labroides' as const,
    label: 'Labroides',
    detalle: 'Usuario contable',
    icon: Briefcase,
  },
  {
    key: 'dotacion' as const,
    label: 'Dotación',
    detalle: 'Uniforme / EPP',
    icon: HardHat,
  },
];

const inputClass =
  'w-full rounded-brand-input bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[13px] text-text-strong placeholder:text-text-subtle transition-colors duration-150 ease-out focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40';

const textareaClass = inputClass + ' resize-none leading-relaxed';

export default function PerfilamientoPage() {
  const { id } = useParams<{ id: string }>();
  const nav = useNavigate();
  const { perfil, user } = useAuth();
  const { doc: vacante, cargando: cargandoVac } = useDoc<VacanteDoc>('vacantes', id);
  const { doc: cargo } = useDoc<CargoDoc>('cargos_catalogo', vacante?.cargo_id ?? null);
  const { docs: procesos } = useColeccion<ProcesoDoc>('procesos', {
    filtros: id ? [['vacante_id', '==', id], ['estado', '==', 'activo']] : [],
    limit: 1,
  });
  const { crear, actualizar } = useMutacion();
  const festivos = useFestivosAnio(new Date().getFullYear());

  const procesoActivo = procesos[0] ?? null;

  const [criterios, setCriterios] = useState('');
  const [competencia, setCompetencia] = useState('');
  const [fechaEntrevista, setFechaEntrevista] = useState('');
  const [notas, setNotas] = useState('');
  const [herramientas, setHerramientas] = useState({
    computador: false,
    office: false,
    labroides: false,
    dotacion: false,
    celular_plan_datos: false,
  });
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [analisisIA, setAnalisisIA] = useState<(AnalisisIA & { cargando?: boolean }) | null>(null);
  const [errIA, setErrIA] = useState<string | null>(null);

  // ─── Validador anti-unicornio en tiempo real (heurística) ─────────────
  const alertas: AlertaUnicornio[] = useMemo(() => {
    if (!vacante) return [];
    return validarPerfilUnicornio({
      criteriosTexto: criterios,
      salarioBase: vacante.salario_base,
      cargo,
      empresasCompetencia: competencia.split(',').map((s) => s.trim()).filter(Boolean),
      criticidad: vacante.criticidad,
    });
  }, [criterios, competencia, vacante, cargo]);

  async function pedirAnalisisIA() {
    if (!vacante) return;
    if (criterios.trim().length < 20) {
      setErrIA('Escribe primero los criterios (al menos 20 caracteres) antes de pedir análisis.');
      return;
    }
    setErrIA(null);
    setAnalisisIA({
      diagnostico: '',
      alertas_adicionales: [],
      recomendacion_global: '',
      perfil_es_realista: true,
      cargando: true,
    });
    try {
      const fn = httpsCallable<unknown, AnalisisIA>(functions, 'analizarPerfilIA');
      const res = await fn({
        cargo_nombre: vacante.cargo_nombre,
        categoria_cargo: cargo?.categoria ?? null,
        salario_base: vacante.salario_base,
        banda_min: cargo?.banda_min ?? null,
        banda_max: cargo?.banda_max ?? null,
        criticidad: vacante.criticidad,
        empresa_nombre: vacante.empresa_nombre,
        sede_ciudad: vacante.sede_nombre,
        criterios_texto: criterios,
        empresas_competencia: competencia.split(',').map((s) => s.trim()).filter(Boolean),
      });
      setAnalisisIA({ ...res.data, cargando: false });
    } catch (e) {
      setErrIA(e instanceof Error ? e.message : 'No pudimos consultar IA.');
      setAnalisisIA(null);
    }
  }

  useEffect(() => {
    if (procesoActivo?.perfilamiento) {
      const p = procesoActivo.perfilamiento;
      setCriterios(p.criterios_texto);
      setCompetencia(p.empresas_competencia.join(', '));
      setNotas(p.notas);
      setHerramientas({
        computador: !!p.herramientas_requeridas.computador,
        office: !!p.herramientas_requeridas.office,
        labroides: !!p.herramientas_requeridas.labroides,
        dotacion: !!p.herramientas_requeridas.dotacion,
        celular_plan_datos: !!p.herramientas_requeridas.celular_plan_datos,
      });
      if (p.fecha_entrevista_lider_pactada) {
        setFechaEntrevista(fechaInputValue(p.fecha_entrevista_lider_pactada.toDate()));
      }
    } else if (vacante?.fecha_entrevista_propuesta) {
      setFechaEntrevista(fechaInputValue(vacante.fecha_entrevista_propuesta.toDate()));
    }
  }, [procesoActivo, vacante]);

  const minFecha = sumarDiasHabiles(new Date(), 3, new Set());

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!vacante || !user || !perfil) return;
    setEnviando(true);
    setErr(null);
    try {
      const fechaDate = parsearFechaInput(fechaEntrevista);
      if (!fechaDate) throw new Error('Selecciona una fecha válida.');
      const perfilamientoData = {
        criterios_texto: criterios.trim(),
        empresas_competencia: competencia.split(',').map((s) => s.trim()).filter(Boolean),
        herramientas_requeridas: herramientas,
        fecha_entrevista_lider_pactada: Timestamp.fromDate(fechaDate),
        compromiso_agenda_lider_cumplido: null,
        notas: notas.trim(),
        completado_en: Timestamp.now(),
      };
      let procesoId = procesoActivo?.id;
      if (!procesoId) {
        procesoId = await crear('procesos', {
          vacante_id: vacante.id,
          vacante_consecutivo: vacante.consecutivo,
          numero_intento: 1,
          estado: 'activo',
          analista_uid: user.uid,
          analista_nombre: `${perfil.nombre} ${perfil.apellido}`,
          empresa_codigo: vacante.empresa_codigo,
          sede_codigo: vacante.sede_codigo,
          unidad_id: vacante.unidad_id,
          cargo_id: vacante.cargo_id,
          cargo_nombre: vacante.cargo_nombre,
          cargo_criticidad_al_crear: vacante.cargo_criticidad_al_crear,
          perfilamiento: perfilamientoData,
          fecha_inicio: Timestamp.now(),
          fecha_cierre: null,
          razon_cierre: null,
        });
      } else {
        await actualizar('procesos', procesoId, { perfilamiento: perfilamientoData });
      }
      await actualizar('vacantes', vacante.id, {
        estado: 'lista_para_publicar',
        fecha_entrevista_pactada: Timestamp.fromDate(fechaDate),
        proceso_activo_id: procesoId,
        analista_uid: user.uid,
        analista_nombre: `${perfil.nombre} ${perfil.apellido}`,
      });
      // Disparo ADELANTADO de pre-avisos a IT/talentos/compras/etc.
      // (Dolor #4: candidatos con 15 días sin equipo). Refleja lo que Karen
      // ya hace operativamente copiando a IT desde el inicio del proceso.
      try {
        await crearPreavisosTickets({
          vacante,
          procesoActivo: {
            ...(procesoActivo ?? ({} as ProcesoDoc)),
            id: procesoId,
            perfilamiento: {
              ...perfilamientoData,
              fecha_entrevista_lider_pactada: Timestamp.fromDate(fechaDate),
            },
          } as ProcesoDoc,
          uid: user.uid,
          festivosIsoSet: festivos,
        });
      } catch (errPre) {
        console.error('[preavisos] no se pudieron crear', errPre);
      }
      nav(`/vacantes/${vacante.id}/publicacion`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoVac)
    return <div className="max-w-4xl mx-auto px-6 py-12 text-text-muted text-sm">Cargando…</div>;
  if (!vacante)
    return (
      <div className="max-w-4xl mx-auto px-6 py-12">
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          Vacante no encontrada.
        </div>
      </div>
    );

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      {/* Volver */}
      <Link
        to={`/vacantes/${vacante.id}`}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        Volver al detalle
      </Link>

      {/* ─── Hero ──────────────────────────────────────────────── */}
      <div>
        <Pill tono="brand" dot>
          Paso 3 · Analista + Líder
        </Pill>
        <h1
          className="mt-4 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
          style={{ textWrap: 'balance' }}
        >
          Perfilamiento del cargo
        </h1>
        <p className="mt-3 text-[15px] text-text-muted leading-[1.55] max-w-2xl">
          {vacante.cargo_nombre} · {vacante.empresa_nombre} · {vacante.sede_nombre}.
          Define qué busca el líder, qué empresas son competencia y qué
          herramientas necesita el ingreso para que IT/compras/talentos
          arranquen desde hoy.
        </p>
      </div>

      <PoliticaCriticidadBanner criticidad={vacante.criticidad} />

      <form onSubmit={onSubmit} className="space-y-6">
        {/* ─── Criterios y mercado ──────────────────────────────── */}
        <Card padding="lg">
          <div className="flex items-center gap-2 mb-5">
            <Target size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Criterios y mercado
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <label
                htmlFor="criterios"
                className="block text-[13px] font-medium text-text-strong mb-1.5"
              >
                Criterios específicos <span className="text-brand-600">*</span>
              </label>
              <textarea
                id="criterios"
                value={criterios}
                onChange={(e) => setCriterios(e.target.value)}
                rows={6}
                required
                className={textareaClass}
                placeholder="Experiencia mínima, habilidades técnicas, idiomas, competencias blandas, sector preferido…"
              />
              <p className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-text-subtle">
                <Lightbulb size={11} strokeWidth={1.75} className="text-warning-600" />
                Mientras escribes, validamos coherencia con salario de{' '}
                <span className="font-semibold text-text-body tabular-nums">
                  ${vacante.salario_base.toLocaleString('es-CO')}
                </span>{' '}
                y la categoría del cargo.
              </p>
            </div>

            <div>
              <label
                htmlFor="competencia"
                className="block text-[13px] font-medium text-text-strong mb-1.5"
              >
                Empresas competencia
              </label>
              <input
                id="competencia"
                value={competencia}
                onChange={(e) => setCompetencia(e.target.value)}
                className={inputClass}
                placeholder="Claro, Movistar, Tigo · separadas por coma"
              />
              <p className="mt-1.5 text-[11px] text-text-subtle">
                Empresas de donde típicamente vienen los candidatos a este cargo.
                Sirve al sourcing IA y al validador anti-unicornio.
              </p>
            </div>
          </div>
        </Card>

        {/* ─── Herramientas requeridas ─────────────────────────── */}
        <Card padding="lg">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Cpu size={14} strokeWidth={1.75} className="text-text-muted" />
              <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
                Herramientas requeridas
              </p>
            </div>
            <Pill tono="info">Disparo adelantado de tickets</Pill>
          </div>
          <p className="text-[12px] text-text-muted mb-4 max-w-2xl">
            Al guardar el perfilamiento se crean pre-avisos a IT, compras,
            bodega y contabilidad según lo marcado abajo. Cuando se apruebe
            al candidato, los pre-avisos se actualizan con su nombre sin
            duplicarse.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {HERRAMIENTAS_META.map(({ key, label, detalle, icon: Icon }) => {
              const activo = herramientas[key];
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setHerramientas({ ...herramientas, [key]: !activo })}
                  className={cn(
                    'group relative text-left rounded-md border p-4 transition-all duration-150 ease-out',
                    activo
                      ? 'border-brand-400 bg-brand-50/60 shadow-brand-card'
                      : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                  )}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div
                      className={cn(
                        'w-9 h-9 rounded-md flex items-center justify-center transition-colors',
                        activo
                          ? 'bg-brand-100 text-brand-700'
                          : 'bg-slate-100 text-text-muted',
                      )}
                    >
                      <Icon size={16} strokeWidth={1.75} />
                    </div>
                    <div
                      className={cn(
                        'w-4 h-4 rounded-full border-2 transition-colors',
                        activo
                          ? 'border-brand-600 bg-brand-600'
                          : 'border-slate-300 bg-white',
                      )}
                    >
                      {activo && (
                        <svg viewBox="0 0 12 12" className="w-full h-full text-white">
                          <path
                            d="M2.5 6L5 8.5L9.5 4"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </div>
                  </div>
                  <p
                    className={cn(
                      'text-[13px] font-semibold transition-colors',
                      activo ? 'text-brand-700' : 'text-text-strong',
                    )}
                  >
                    {label}
                  </p>
                  <p className="text-[11px] text-text-subtle mt-0.5">{detalle}</p>
                </button>
              );
            })}
          </div>
        </Card>

        {/* ─── Agenda + notas ──────────────────────────────────── */}
        <Card padding="lg">
          <div className="flex items-center gap-2 mb-5">
            <Calendar size={14} strokeWidth={1.75} className="text-text-muted" />
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
              Agenda con líder
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label
                htmlFor="fecha-entrevista"
                className="block text-[13px] font-medium text-text-strong mb-1.5"
              >
                Fecha pactada con líder <span className="text-brand-600">*</span>
              </label>
              <input
                id="fecha-entrevista"
                type="date"
                value={fechaEntrevista}
                min={fechaInputValue(minFecha)}
                onChange={(e) => setFechaEntrevista(e.target.value)}
                required
                className={inputClass}
              />
              <p className="mt-1.5 text-[11px] text-text-subtle">
                Propuesta original del líder:{' '}
                <span className="font-medium text-text-body">
                  {fechaInputValue(vacante.fecha_entrevista_propuesta?.toDate?.())}
                </span>
              </p>
            </div>

            <div>
              <label
                htmlFor="notas"
                className="block text-[13px] font-medium text-text-strong mb-1.5"
              >
                Notas del perfilamiento
              </label>
              <textarea
                id="notas"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                rows={3}
                className={textareaClass}
                placeholder="Acuerdos puntuales, restricciones, observaciones del líder."
              />
            </div>
          </div>
        </Card>

        {/* ─── Validador anti-unicornio ───────────────────────── */}
        <AlertasUnicornio alertas={alertas} analisisIA={analisisIA} />

        {errIA && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
            {errIA}
          </div>
        )}

        {criterios.trim().length >= 20 && (
          <div className="rounded-md border border-brand-200 bg-gradient-to-br from-brand-50/40 to-white px-5 py-4 flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="w-9 h-9 rounded-md bg-brand-100 text-brand-700 flex items-center justify-center shrink-0">
                <Sparkles size={16} strokeWidth={1.75} />
              </div>
              <div>
                <p className="text-[13px] font-semibold text-text-strong">
                  Segunda opinión con IA
                </p>
                <p className="text-[12px] text-text-muted mt-0.5">
                  Gemini analiza coherencia salario ↔ skills ↔ mercado colombiano.
                </p>
              </div>
            </div>
            <Button
              type="button"
              variant="brand-secondary"
              size="medium"
              onClick={pedirAnalisisIA}
              disabled={analisisIA?.cargando}
              loading={analisisIA?.cargando}
              icon={<Sparkles size={13} strokeWidth={1.75} />}
            >
              {analisisIA?.cargando ? 'Analizando…' : 'Pedir análisis IA'}
            </Button>
          </div>
        )}

        {err && (
          <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3.5 py-2.5 text-[13px] text-danger-700">
            {err}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 gap-3 flex-wrap">
          <p className="text-[11px] text-text-subtle">
            Al guardar, la vacante pasa a estado <code className="font-mono text-text-body">lista_para_publicar</code> y
            se disparan los pre-avisos a IT / talentos / compras / contabilidad.
          </p>
          <Button
            type="submit"
            variant="brand-primary"
            size="large"
            disabled={enviando}
            loading={enviando}
          >
            {enviando ? 'Guardando…' : 'Guardar y pasar a publicación →'}
          </Button>
        </div>
      </form>
    </div>
  );
}
