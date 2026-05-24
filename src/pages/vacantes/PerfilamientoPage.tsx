import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Sparkles } from 'lucide-react';
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
import type { CargoDoc, VacanteDoc } from '../../schemas';
import type { ProcesoDoc } from '../../schemas/procesoSchema';

interface AnalisisIA {
  diagnostico: string;
  alertas_adicionales: string[];
  recomendacion_global: string;
  perfil_es_realista: boolean;
}

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
    setAnalisisIA({ diagnostico: '', alertas_adicionales: [], recomendacion_global: '', perfil_es_realista: true, cargando: true });
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
        // No bloqueamos el avance del paso 3 si el pre-aviso falla.
        // El analista puede regresar y re-guardar; la operación es idempotente.
        console.error('[preavisos] no se pudieron crear', errPre);
      }
      nav(`/vacantes/${vacante.id}/publicacion`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos guardar.');
    } finally {
      setEnviando(false);
    }
  }

  if (cargandoVac) return <div className="px-6 py-10 text-navy-500 text-sm">Cargando…</div>;
  if (!vacante) return <div className="px-6 py-10 text-red-600 text-sm">Vacante no encontrada.</div>;

  return (
    <div className="max-w-3xl mx-auto px-6 py-10 space-y-6">
      <div>
        <Link to={`/vacantes/${vacante.id}`} className="text-xs text-navy-500 hover:text-navy-800">
          ← Volver a detalle
        </Link>
        <p className="text-xs uppercase tracking-widest text-gold-700 mt-2">Paso 3 · Analista + Líder</p>
        <h1 className="font-display text-3xl font-semibold text-navy-900">Perfilamiento del cargo</h1>
        <p className="text-sm text-navy-600 mt-1">
          {vacante.cargo_nombre} · {vacante.empresa_nombre} · {vacante.sede_nombre}
        </p>
      </div>

      <PoliticaCriticidadBanner criticidad={vacante.criticidad} />

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="rounded-xl border border-navy-100 bg-white p-5 space-y-4">
          <div>
            <label className="block">
              <span className="text-sm font-medium text-navy-800">
                Criterios específicos (qué busca el líder)
              </span>
              <textarea
                value={criterios}
                onChange={(e) => setCriterios(e.target.value)}
                rows={5}
                required
                className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
                placeholder="Experiencia mínima, habilidades técnicas, idiomas, competencias blandas…"
              />
            </label>
            <p className="text-[11px] text-navy-500 mt-1">
              💡 Mientras escribes, detectamos si lo pedido es coherente con el salario ($
              {vacante.salario_base.toLocaleString('es-CO')}) y la categoría del cargo.
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-navy-800">
              Empresas competencia (separadas por coma)
            </span>
            <input
              value={competencia}
              onChange={(e) => setCompetencia(e.target.value)}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
              placeholder="Claro, Movistar, Tigo"
            />
          </label>
          <fieldset>
            <legend className="text-sm font-medium text-navy-800">
              Herramientas requeridas (disparo adelantado de tickets)
            </legend>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(['computador', 'office', 'labroides', 'dotacion'] as const).map((k) => (
                <label key={k} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={herramientas[k]}
                    onChange={(e) => setHerramientas({ ...herramientas, [k]: e.target.checked })}
                  />
                  <span className="capitalize">{k}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <label className="block">
            <span className="text-sm font-medium text-navy-800">
              Fecha de entrevista con líder (pactada)
            </span>
            <input
              type="date"
              value={fechaEntrevista}
              min={fechaInputValue(minFecha)}
              onChange={(e) => setFechaEntrevista(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
            <span className="mt-1 block text-xs text-navy-500">
              Propuesta original: {fechaInputValue(vacante.fecha_entrevista_propuesta?.toDate?.())}
            </span>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-navy-800">Notas</span>
            <textarea
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-md border border-navy-200 px-3 py-2 text-sm"
            />
          </label>
        </div>

        {/* Validador anti-unicornio (heurística + opción IA) */}
        <AlertasUnicornio alertas={alertas} analisisIA={analisisIA} />

        {errIA && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {errIA}
          </div>
        )}

        {criterios.trim().length >= 20 && (
          <div className="flex items-center justify-between flex-wrap gap-3 rounded-xl border border-navy-100 bg-cream-50/40 px-4 py-3">
            <p className="text-xs text-navy-700">
              ¿Quieres una segunda opinión más profunda? Gemini analiza coherencia salario ↔ skills
              ↔ mercado colombiano.
            </p>
            <button
              type="button"
              onClick={pedirAnalisisIA}
              disabled={analisisIA?.cargando}
              className="inline-flex items-center gap-1.5 rounded-md border border-equitel-rojo-300 bg-white px-3 py-1.5 text-xs font-semibold text-equitel-rojo-700 hover:bg-equitel-rojo-50 disabled:opacity-50"
            >
              <Sparkles size={14} />
              {analisisIA?.cargando ? 'Analizando…' : 'Pedir análisis IA'}
            </button>
          </div>
        )}

        {err && <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{err}</div>}

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={enviando}
            className="rounded-md bg-navy-700 px-6 py-2.5 text-sm font-semibold text-white hover:bg-navy-800 disabled:bg-navy-300"
          >
            {enviando ? 'Guardando…' : 'Guardar y pasar a publicación'}
          </button>
        </div>
      </form>
    </div>
  );
}
