import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Building2,
  Calendar,
  CheckCircle2,
  CircleDollarSign,
  Download,
  FileText,
  Layers,
  ShieldCheck,
  Sparkles,
  User2,
} from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { FlujogramaTimeline } from '../components/FlujogramaTimeline';
import { PoliticaCriticidadBanner } from '../components/vacantes/PoliticaCriticidadBanner';
import { BitacoraReprocesos } from '../components/vacantes/BitacoraReprocesos';
import { SelectorAnalista } from '../components/vacantes/SelectorAnalista';
import { Button, Card, Pill, type PillTono } from '../components/brand';
import { useAuth } from '../hooks/useAuth';
import { puedeAbrirRuta, puedeVerProceso } from '../utils/accesoRutas';
import { rutaHome } from '../utils/rutaHome';
import { useVacantes } from '../hooks/useVacantes';
import { useMutacion } from '../hooks/useMutacion';
import { SelectorCargo } from '../components/vacantes/SelectorCargo';
import { CondicionesVacante } from '../components/vacantes/CondicionesVacante';
import { EditarIdentificacionModal } from '../components/vacantes/EditarIdentificacionModal';
import { useFestivosTodos } from '../hooks/useCatalogos';
import { useResumenesVacantes } from '../hooks/useResumenesVacantes';
import { functions, db } from '../lib/firebase';
import { formatearFecha } from '../utils/fechas';
import { formatearCOP, soloDigitos } from '../utils/moneda';
import { RODAMIENTO_FIJOS, RODAMIENTO_OPCIONES, tieneRodamiento } from '../utils/rodamiento';
import {
  COMISION_TIPOS,
  COMISION_TIPO_LABEL,
  etiquetaBaseComision,
  type ComisionTipo,
} from '../utils/comisiones';
import {
  agruparPostulaciones,
  construirBaseVacantes,
  faseTarjeta,
  pipelineReal,
} from '../utils/reportesVacantes';
import { exportarVacanteIndividual } from '../utils/exportarExcel';
import {
  TIPO_MOVIMIENTO_LABEL,
  TIPO_SOLICITUD_LABEL,
  type CargoDoc,
  type PostulacionDoc,
  type VacanteDoc,
} from '../schemas';

// Estados en los que aún tiene sentido corregir el cargo: antes de que arranque
// el reclutamiento en firme. En estados avanzados no se edita para no desalinear
// el proceso (reu 21-jul: habilitar edición del cargo para corregir errores).
const ESTADOS_CARGO_EDITABLE = ['borrador', 'aprobada', 'lista_para_publicar'];

/**
 * VacanteDetallePage · sistema brand.
 *
 * Hero header con eyebrow consecutivo + h1 hairline + meta empresa/sede.
 * Pill de estado con tono brand semántico. Cards flat con secciones bien
 * espaciadas (space-y-10). Datos en formato dt/dd con tipografía Inter
 * + tabular-nums donde aplica.
 */

const ESTADO_TONO: Record<string, PillTono> = {
  borrador: 'neutral',
  aprobada: 'brand',
  lista_para_publicar: 'brand',
  publicada: 'warning',
  en_proceso: 'info',
  terna_enviada: 'danger',
  seleccionado: 'danger',
  en_contratacion: 'success',
  cerrada: 'success',
  desierta: 'neutral',
  cancelada: 'neutral',
  pausada: 'warning',
};

export default function VacanteDetallePage() {
  const { id } = useParams<{ id: string }>();
  const { suscribirVacante } = useVacantes();
  const { rol, user } = useAuth();
  const festivos = useFestivosTodos();
  const [vac, setVac] = useState<VacanteDoc | null>(null);
  // Candidatos en curso de esta vacante (servidor) → fase real junto al estado.
  const { porVacante: resumenVacante } = useResumenesVacantes(id ? [id] : []);
  const [err, setErr] = useState<string | null>(null);
  const [descargando, setDescargando] = useState(false);
  const { actualizar } = useMutacion();
  const [editarCargoAbierto, setEditarCargoAbierto] = useState(false);
  const [cargoNuevo, setCargoNuevo] = useState<CargoDoc | null>(null);
  const [guardandoCargo, setGuardandoCargo] = useState(false);
  const [errCargo, setErrCargo] = useState<string | null>(null);

  // gh queda fuera: Diego entra al detalle solo como líder solicitante de SU
  // vacante (consulta), no como staff (reu Karen 16-sep). Si es el creador, edita
  // la identificación con los mismos límites que un líder.
  const esStaffReporte = rol === 'analista' || rol === 'coordinador' || rol === 'admin';

  // ── Editar identificación (empresa/sede/unidad/tipo) ────────────────────────
  // La puede corregir el STAFF o el LÍDER CREADOR de la vacante (reu líder 19-ago).
  const [editarIdentAbierto, setEditarIdentAbierto] = useState(false);
  const esCreador = !!vac && !!user && vac.lider_uid === user.uid;
  // El líder no la edita si el proceso ya avanzó (la callable lo bloquea igual).
  const bloqueadoLider = vac
    ? ['terna_enviada', 'seleccionado', 'en_contratacion', 'cerrada', 'desierta', 'cancelada'].includes(
        vac.estado,
      )
    : true;
  const terminal = vac ? ['cerrada', 'desierta', 'cancelada'].includes(vac.estado) : true;
  const puedeEditarIdent = !terminal && (esStaffReporte || (esCreador && !bloqueadoLider));
  // Coordinación (Karen / Mari) + admin: únicos que editan condiciones y
  // consecutivo cuando cambian las condiciones (petición Karen, jul-2026).
  const esCoord = rol === 'coordinador' || rol === 'admin';

  // ── Editar condiciones (salario/comisiones/rodamiento/garantizado) ──────────
  // El rodamiento se edita por VALOR (misma lista que al crear la vacante) y el
  // booleano `rodamiento` se deriva de él, igual que en VacanteForm. Antes el
  // modal solo tocaba el checkbox y dejaba `rodamiento_valor` desincronizado
  // (reu Karen 16-sep: Diego necesita ver el monto, no un "Sí").
  const [editarCondAbierto, setEditarCondAbierto] = useState(false);
  const [condForm, setCondForm] = useState({
    salario_base: '',
    // Comisiones estructuradas (reu 16-sep). '' = vacante vieja sin clasificar.
    comision_tipo: '' as ComisionTipo | '',
    comision_base: '',
    comision_medicion: '',
    comision_aplica_bolsa: false,
    comision_bolsa_detalle: '',
    comisiones_texto: '',
    rodamiento_valor: '',
    garantizado_texto: '',
  });
  // "Otro valor…" en el desplegable: el valor guardado no es uno de la lista.
  const [rodOtro, setRodOtro] = useState(false);
  const [guardandoCond, setGuardandoCond] = useState(false);
  const [errCond, setErrCond] = useState<string | null>(null);

  // Docs viejos o editados con el checkbox: rodamiento=true sin valor guardado.
  // El modal los abre en "Otro valor…" vacío y deja guardar otros campos sin
  // obligar a inventar un monto (la pantalla sigue diciendo "valor no registrado").
  const rodamientoSinValorPrevio = !!vac && Boolean(vac.rodamiento) && !tieneRodamiento(vac.rodamiento_valor);

  function abrirEditarCondiciones() {
    if (!vac) return;
    // Misma precedencia que `textoRodamiento` (el booleano manda): lo que se ve
    // en pantalla es lo que aparece seleccionado. Si no, guardar otro campo
    // podía voltear el rodamiento en silencio en docs desincronizados.
    const guardado = (vac.rodamiento_valor ?? '').trim();
    const valor = vac.rodamiento ? (tieneRodamiento(guardado) ? guardado : '') : 'No aplica';
    setCondForm({
      salario_base: String(vac.salario_base ?? ''),
      comision_tipo: vac.comision_tipo ?? '',
      comision_base: vac.comision_base ?? '',
      comision_medicion: vac.comision_medicion ?? '',
      comision_aplica_bolsa: Boolean(vac.comision_aplica_bolsa),
      comision_bolsa_detalle: vac.comision_bolsa_detalle ?? '',
      comisiones_texto: vac.comisiones_texto ?? '',
      rodamiento_valor: valor,
      garantizado_texto: vac.garantizado_texto ?? '',
    });
    setRodOtro(Boolean(vac.rodamiento) && !RODAMIENTO_FIJOS.has(valor));
    setErrCond(null);
    setEditarCondAbierto(true);
  }
  async function guardarCondiciones() {
    if (!vac) return;
    const salario = Number(condForm.salario_base);
    if (!Number.isFinite(salario) || salario <= 0) {
      setErrCond('Ingresa un salario base válido.');
      return;
    }
    const rodamientoValor = condForm.rodamiento_valor.trim();
    const otroVacio = rodOtro && !rodamientoValor;
    if (otroVacio && !rodamientoSinValorPrevio) {
      setErrCond('Escribe el valor del rodamiento o elige "No aplica".');
      return;
    }
    // Comisiones: con tipo distinto de "ninguna" hay que decir cuál y cómo se mide.
    const tipoComision = condForm.comision_tipo === '' ? null : condForm.comision_tipo;
    const hayComision = tipoComision !== null && tipoComision !== 'ninguna';
    if (hayComision && (!condForm.comision_base.trim() || !condForm.comision_medicion.trim())) {
      setErrCond('Para la comisión indica cuál presupuesto o indicadores aplican y cómo se mide.');
      return;
    }
    setGuardandoCond(true);
    setErrCond(null);
    try {
      await actualizar('vacantes', vac.id, {
        salario_base: salario,
        comision_tipo: tipoComision,
        comision_base: hayComision ? condForm.comision_base.trim() : '',
        comision_medicion: hayComision ? condForm.comision_medicion.trim() : '',
        comision_aplica_bolsa: hayComision ? condForm.comision_aplica_bolsa : false,
        comision_bolsa_detalle:
          hayComision && condForm.comision_aplica_bolsa ? condForm.comision_bolsa_detalle.trim() : '',
        // Sin comisión ("ninguna") el concepto no aplica; sin clasificar (null) se conserva.
        comisiones_texto: tipoComision === 'ninguna' ? '' : condForm.comisiones_texto.trim(),
        rodamiento_valor: rodamientoValor,
        // "Otro valor…" vacío en un doc que ya venía sin valor: se conserva el sí.
        rodamiento: otroVacio ? Boolean(vac.rodamiento) : tieneRodamiento(rodamientoValor),
        garantizado_texto: condForm.garantizado_texto.trim(),
      });
      setEditarCondAbierto(false);
    } catch (e) {
      setErrCond(e instanceof Error ? e.message : 'No se pudieron guardar las condiciones.');
    } finally {
      setGuardandoCond(false);
    }
  }

  // ── Editar consecutivo (corrección manual de coordinación) ──────────────────
  const [editarConsecAbierto, setEditarConsecAbierto] = useState(false);
  const [consecNuevo, setConsecNuevo] = useState('');
  const [guardandoConsec, setGuardandoConsec] = useState(false);
  const [errConsec, setErrConsec] = useState<string | null>(null);

  function abrirEditarConsecutivo() {
    if (!vac) return;
    setConsecNuevo(vac.consecutivo ?? '');
    setErrConsec(null);
    setEditarConsecAbierto(true);
  }
  async function guardarConsecutivo() {
    if (!vac) return;
    const nuevo = consecNuevo.trim().toUpperCase();
    if (!nuevo) {
      setErrConsec('El consecutivo no puede quedar vacío.');
      return;
    }
    if (nuevo === vac.consecutivo) {
      setEditarConsecAbierto(false);
      return;
    }
    setGuardandoConsec(true);
    setErrConsec(null);
    try {
      // Unicidad: que no exista OTRA vacante con ese consecutivo.
      const dup = await getDocs(query(collection(db, 'vacantes'), where('consecutivo', '==', nuevo)));
      if (dup.docs.some((d) => d.id !== vac.id)) {
        setErrConsec('Ya existe otra vacante con ese consecutivo.');
        setGuardandoConsec(false);
        return;
      }
      await actualizar('vacantes', vac.id, { consecutivo: nuevo });
      setEditarConsecAbierto(false);
    } catch (e) {
      setErrConsec(e instanceof Error ? e.message : 'No se pudo guardar el consecutivo.');
    } finally {
      setGuardandoConsec(false);
    }
  }

  /** Corrige el cargo de la vacante (reu 21-jul). Solo staff/analista y solo en
   *  estados tempranos; re-denormaliza nombre + criticidad sugerida del catálogo. */
  async function guardarCargo() {
    if (!vac || !cargoNuevo) return;
    setGuardandoCargo(true);
    setErrCargo(null);
    try {
      await actualizar('vacantes', vac.id, {
        cargo_id: cargoNuevo.id,
        cargo_nombre: cargoNuevo.nombre,
        cargo_criticidad_al_crear: cargoNuevo.criticidad_sugerida,
        criticidad: cargoNuevo.criticidad_sugerida,
      });
      setEditarCargoAbierto(false);
      setCargoNuevo(null);
    } catch (e) {
      setErrCargo(e instanceof Error ? e.message : 'No pudimos actualizar el cargo.');
    } finally {
      setGuardandoCargo(false);
    }
  }

  useEffect(() => {
    if (!id) return;
    setErr(null);
    try {
      return suscribirVacante(id, setVac, (msg) => setErr(msg));
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos cargar la vacante.');
    }
  }, [id, suscribirVacante]);

  /** Descarga la info de ESTA vacante en Excel (reu Karen 02-jul), con los mismos
   *  datos de la base (consecutivo, analista, líder, ANS, conteos). */
  async function descargarInfoVacante() {
    if (!vac) return;
    setDescargando(true);
    setErr(null);
    try {
      const snap = await getDocs(
        query(collection(db, 'postulaciones'), where('vacante_id', '==', vac.id)),
      );
      const posts = snap.docs.map((d) => ({ id: d.id, ...d.data() })) as PostulacionDoc[];
      const conteos = agruparPostulaciones(posts);
      // Misma "Fase real" que el Excel del dashboard.
      const fases = pipelineReal([vac], posts).porVacante;
      const [fila] = construirBaseVacantes([vac], conteos, festivos, new Date(), undefined, fases);
      if (fila) await exportarVacanteIndividual(fila, vac.consecutivo || vac.id);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos generar el Excel de la vacante.');
    } finally {
      setDescargando(false);
    }
  }

  if (err) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12">
        <div className="rounded-md border border-danger-500/20 bg-danger-50 px-4 py-3 text-sm text-danger-700">
          {err}
        </div>
      </div>
    );
  }
  if (!vac) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-12 text-sm text-text-muted">Cargando vacante…</div>
    );
  }

  // Un gh (C&D) SOLO abre las vacantes que él mismo solicitó (es el líder). Para
  // las demás sigue sin ver vacantes (reu Karen 09-jul); la excepción del dueño
  // es la decisión de Karen del 25-sep (reu 16-sep). La ruta lo deja pasar; la
  // propiedad se valida aquí, con la vacante en mano (mismo patrón del Concepto).
  if (rol === 'gh' && !esCreador) {
    return (
      <div className="max-w-md mx-auto px-6 py-16 text-center space-y-2">
        <h1 className="text-[18px] font-semibold text-text-strong">Sin acceso a esta vacante</h1>
        <p className="text-[13px] text-text-muted leading-[1.55]">
          Esta vacante la solicitó otro líder. Solo puedes ver las vacantes que tú mismo
          solicitaste.
        </p>
        <Link
          to="/mis-vacantes"
          className="inline-block pt-2 text-[12px] font-medium text-brand-700 hover:text-brand-800 hover:underline"
        >
          Ir a mis vacantes →
        </Link>
      </div>
    );
  }

  const fechaPropuesta = vac.fecha_entrevista_propuesta?.toDate?.() ?? null;
  const fechaPactada = vac.fecha_entrevista_pactada?.toDate?.() ?? null;
  const avalAprobadoEn = vac.aval_aprobado_en?.toDate?.() ?? null;
  const tono = ESTADO_TONO[vac.estado] ?? 'neutral';
  // "Volver": Seguimiento para quien puede abrirlo. El gh dueño no ve Seguimiento
  // (reu 09-jul) y llega desde "Mis vacantes", así que vuelve allá; sin este gate
  // el link lo mandaba a "Sin permisos" (reu Karen 16-sep, decisión 25-sep).
  const volver = puedeAbrirRuta(rol, '/seguimiento')
    ? { a: '/seguimiento', texto: 'Volver a seguimiento' }
    : puedeAbrirRuta(rol, '/mis-vacantes')
      ? { a: '/mis-vacantes', texto: 'Volver a mis vacantes' }
      : { a: rutaHome(rol), texto: 'Volver al inicio' };

  return (
    <div className="max-w-5xl mx-auto px-6 py-12 space-y-10">
      {/* Volver */}
      <Link
        to={volver.a}
        className="inline-flex items-center gap-1.5 text-[12px] text-text-muted hover:text-text-strong transition-colors"
      >
        <ArrowLeft size={13} strokeWidth={1.75} />
        {volver.texto}
      </Link>

      {/* ─── Hero header ────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-6">
        <div className="max-w-3xl">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-subtle">
            {vac.consecutivo || 'Generando consecutivo…'}
          </p>
          <h1
            className="mt-2 text-[44px] font-light leading-[1.05] tracking-[-0.035em] text-text-strong"
            style={{ textWrap: 'balance' }}
          >
            {vac.cargo_nombre}
          </h1>
          <p className="mt-3 flex items-center gap-1.5 text-[14px] text-text-muted">
            <Building2 size={13} strokeWidth={1.5} className="text-text-subtle" />
            {vac.empresa_nombre} · {vac.sede_nombre} · {vac.unidad_nombre}
          </p>
        </div>
        <div className="self-start flex flex-col items-end gap-1">
          <Pill tono={tono} dot>
            {vac.estado.replace(/_/g, ' ')}
          </Pill>
          {/* Fase real cuando los candidatos van por delante del estado (reu Karen 10-sep). */}
          {(() => {
            const f = faseTarjeta(vac, resumenVacante.get(vac.id));
            return f.secundario ? (
              <span className="text-[11px] text-text-muted text-right">
                {f.letra ? `Fase ${f.letra} · ` : ''}
                {f.texto}
              </span>
            ) : null;
          })()}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        {/* Talentos (José) y apoyo (IT/compras) entran a la vacante pero NO al
            formato VIDA-F-01 (es del proceso) — sin este gate el botón los
            mandaba a "Sin permisos" (re-auditoría 14-jul). gh sí lo consulta
            (decisión Karen 25-sep): aquí solo llega como dueño de la vacante. */}
        {(puedeVerProceso(rol) || rol === 'gh') && (
          <Link
            to={`/vacantes/${vac.id}/solicitud-integrante`}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
          >
            <FileText size={13} strokeWidth={1.75} />
            Solicitud de Integrantes (VIDA-F-01)
          </Link>
        )}
        {esStaffReporte && (
          <button
            type="button"
            onClick={descargarInfoVacante}
            disabled={descargando}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150 disabled:opacity-60"
          >
            <Download size={13} strokeWidth={1.75} />
            {descargando ? 'Generando…' : 'Descargar información (Excel)'}
          </button>
        )}
        {esStaffReporte && ESTADOS_CARGO_EDITABLE.includes(vac.estado) && (
          <button
            type="button"
            onClick={() => {
              setCargoNuevo(null);
              setErrCargo(null);
              setEditarCargoAbierto(true);
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
          >
            <Layers size={13} strokeWidth={1.75} />
            Corregir cargo
          </button>
        )}
        {/* Coordinación (Karen/Mari): editar condiciones + consecutivo cuando
            cambian las condiciones (petición Karen, jul-2026). */}
        {esCoord && (
          <button
            type="button"
            onClick={abrirEditarCondiciones}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
          >
            <CircleDollarSign size={13} strokeWidth={1.75} />
            Editar condiciones
          </button>
        )}
        {esCoord && (
          <button
            type="button"
            onClick={abrirEditarConsecutivo}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-[12px] font-medium text-text-strong hover:bg-slate-50 transition-colors duration-150"
          >
            <FileText size={13} strokeWidth={1.75} />
            Editar consecutivo
          </button>
        )}
      </div>

      {editarIdentAbierto && vac && (
        <EditarIdentificacionModal vacante={vac} onClose={() => setEditarIdentAbierto(false)} />
      )}

      {editarCargoAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !guardandoCargo && setEditarCargoAbierto(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold text-text-strong">Corregir el cargo</h2>
            <p className="mt-1 text-[12px] text-text-muted leading-[1.5]">
              Elige el cargo correcto del catálogo. Se actualizará el nombre y la
              criticidad sugerida de la vacante <span className="font-mono">{vac.consecutivo}</span>.
            </p>
            <div className="mt-4">
              <SelectorCargo
                value={cargoNuevo?.id ?? vac.cargo_id}
                onChange={setCargoNuevo}
                disabled={guardandoCargo}
              />
            </div>
            {errCargo && (
              <p className="mt-3 text-[12px] text-danger-700">{errCargo}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="neutral-secondary"
                onClick={() => setEditarCargoAbierto(false)}
                disabled={guardandoCargo}
              >
                Cancelar
              </Button>
              <Button
                variant="brand-primary"
                onClick={guardarCargo}
                disabled={guardandoCargo || !cargoNuevo || cargoNuevo.id === vac.cargo_id}
              >
                {guardandoCargo ? 'Guardando…' : 'Guardar cargo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal · Editar condiciones (coordinación) ──────────────── */}
      {editarCondAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !guardandoCond && setEditarCondAbierto(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold text-text-strong">Editar condiciones</h2>
            <p className="mt-1 text-[12px] text-text-muted leading-[1.5]">
              Actualiza las condiciones de la vacante{' '}
              <span className="font-mono">{vac.consecutivo}</span> cuando cambien.
            </p>
            <div className="mt-4 space-y-3.5">
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Salario base
                </span>
                <input
                  inputMode="numeric"
                  value={condForm.salario_base ? formatearCOP(Number(condForm.salario_base)) : ''}
                  onChange={(e) =>
                    setCondForm((p) => ({ ...p, salario_base: soloDigitos(e.target.value) }))
                  }
                  disabled={guardandoCond}
                  placeholder="$ 0"
                  className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Comisiones
                </span>
                <select
                  value={condForm.comision_tipo}
                  onChange={(e) =>
                    setCondForm((p) => ({ ...p, comision_tipo: e.target.value as ComisionTipo | '' }))
                  }
                  disabled={guardandoCond}
                  className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                >
                  {condForm.comision_tipo === '' && (
                    <option value="">Sin clasificar (vacante anterior)</option>
                  )}
                  {COMISION_TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {COMISION_TIPO_LABEL[t]}
                    </option>
                  ))}
                </select>
              </label>
              {condForm.comision_tipo !== 'ninguna' && (
                <>
                  {condForm.comision_tipo !== '' && (
                    <>
                      <label className="block">
                        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                          {etiquetaBaseComision(condForm.comision_tipo)}
                        </span>
                        <textarea
                          value={condForm.comision_base}
                          onChange={(e) => setCondForm((p) => ({ ...p, comision_base: e.target.value }))}
                          disabled={guardandoCond}
                          rows={2}
                          placeholder="Cuál presupuesto o cuáles indicadores"
                          className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 resize-none"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                          Cómo se mide y se paga
                        </span>
                        <textarea
                          value={condForm.comision_medicion}
                          onChange={(e) =>
                            setCondForm((p) => ({ ...p, comision_medicion: e.target.value }))
                          }
                          disabled={guardandoCond}
                          rows={2}
                          placeholder="% sobre lo vendido, periodicidad, tabla por rangos…"
                          className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500 resize-none"
                        />
                      </label>
                      <label className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={condForm.comision_aplica_bolsa}
                          onChange={(e) =>
                            setCondForm((p) => ({ ...p, comision_aplica_bolsa: e.target.checked }))
                          }
                          disabled={guardandoCond}
                          className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-300"
                        />
                        <span className="text-[13px] text-text-strong">Aplica bolsa</span>
                      </label>
                      {condForm.comision_aplica_bolsa && (
                        <input
                          value={condForm.comision_bolsa_detalle}
                          onChange={(e) =>
                            setCondForm((p) => ({ ...p, comision_bolsa_detalle: e.target.value }))
                          }
                          disabled={guardandoCond}
                          placeholder="Detalle de la bolsa"
                          className="w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                        />
                      )}
                    </>
                  )}
                  <label className="block">
                    <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                      Concepto para el candidato
                    </span>
                    <input
                      value={condForm.comisiones_texto}
                      onChange={(e) => setCondForm((p) => ({ ...p, comisiones_texto: e.target.value }))}
                      disabled={guardandoCond}
                      placeholder="Ej.: 3% sobre ventas · vacío = No aplica"
                      className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                    />
                  </label>
                </>
              )}
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Garantizado
                </span>
                <input
                  value={condForm.garantizado_texto}
                  onChange={(e) => setCondForm((p) => ({ ...p, garantizado_texto: e.target.value }))}
                  disabled={guardandoCond}
                  placeholder="Ej.: $1.500.000 x 3 meses · vacío = No aplica"
                  className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold uppercase tracking-[0.06em] text-text-subtle">
                  Auxilio de rodamiento
                </span>
                <select
                  value={
                    rodOtro
                      ? '__otro__'
                      : RODAMIENTO_FIJOS.has(condForm.rodamiento_valor)
                        ? condForm.rodamiento_valor
                        : ''
                  }
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === '__otro__') {
                      setRodOtro(true);
                      setCondForm((p) => ({ ...p, rodamiento_valor: '' }));
                    } else {
                      setRodOtro(false);
                      setCondForm((p) => ({ ...p, rodamiento_valor: v }));
                    }
                  }}
                  disabled={guardandoCond}
                  className="mt-1 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                >
                  <option value="">Selecciona…</option>
                  {RODAMIENTO_OPCIONES.map((o) => (
                    <option key={o.valor} value={o.valor}>
                      {o.label}
                    </option>
                  ))}
                  <option value="__otro__">Otro valor…</option>
                </select>
                {rodOtro && (
                  <input
                    value={condForm.rodamiento_valor}
                    onChange={(e) => setCondForm((p) => ({ ...p, rodamiento_valor: e.target.value }))}
                    disabled={guardandoCond}
                    placeholder="Escribe el valor del rodamiento"
                    className="mt-2 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
                  />
                )}
              </label>
            </div>
            {errCond && <p className="mt-3 text-[12px] text-danger-700">{errCond}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="neutral-secondary"
                onClick={() => setEditarCondAbierto(false)}
                disabled={guardandoCond}
              >
                Cancelar
              </Button>
              <Button variant="brand-primary" onClick={guardarCondiciones} disabled={guardandoCond}>
                {guardandoCond ? 'Guardando…' : 'Guardar condiciones'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal · Editar consecutivo (coordinación) ──────────────── */}
      {editarConsecAbierto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
          onClick={() => !guardandoConsec && setEditarConsecAbierto(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[16px] font-semibold text-text-strong">Editar consecutivo</h2>
            <p className="mt-1 text-[12px] text-text-muted leading-[1.5]">
              Corrige el número de la solicitud. Se valida que no choque con otra vacante. Formato
              usual: <span className="font-mono">EMPRESA-SEDE-AÑO-####</span>.
            </p>
            <input
              value={consecNuevo}
              onChange={(e) => setConsecNuevo(e.target.value)}
              disabled={guardandoConsec}
              placeholder="CUM-CME-2026-1217"
              className="mt-4 w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 font-mono text-[13px] text-text-strong focus:outline-none focus:border-brand-500"
            />
            {errConsec && <p className="mt-3 text-[12px] text-danger-700">{errConsec}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button
                variant="neutral-secondary"
                onClick={() => setEditarConsecAbierto(false)}
                disabled={guardandoConsec}
              >
                Cancelar
              </Button>
              <Button variant="brand-primary" onClick={guardarConsecutivo} disabled={guardandoConsec}>
                {guardandoConsec ? 'Guardando…' : 'Guardar consecutivo'}
              </Button>
            </div>
          </div>
        </div>
      )}

      <PoliticaCriticidadBanner criticidad={vac.criticidad} />

      {/* ─── Empresa y cargo ─────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between gap-3">
          <SectionEyebrow icon={<Layers size={12} strokeWidth={1.75} />}>
            Identificación
          </SectionEyebrow>
          {puedeEditarIdent && (
            <button
              onClick={() => setEditarIdentAbierto(true)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800"
            >
              Editar
            </button>
          )}
        </div>
        <Card padding="lg" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-5">
            <Dato label="Empresa" valor={`${vac.empresa_nombre} (${vac.empresa_codigo})`} />
            <Dato label="Sede" valor={`${vac.sede_nombre} (${vac.sede_codigo})`} />
            <Dato label="Unidad" valor={vac.unidad_nombre} />
            <Dato label="Criticidad" valor={vac.criticidad} mono />
            {vac.es_movimiento_interno && (
              <Dato
                label="Movimiento interno"
                valor={vac.tipo_movimiento ? TIPO_MOVIMIENTO_LABEL[vac.tipo_movimiento] : 'Sí'}
              />
            )}
            <Dato
              label="Tipo de solicitud"
              valor={TIPO_SOLICITUD_LABEL[vac.tipo_solicitud] ?? vac.tipo_solicitud}
            />
            {vac.tipo_solicitud === 'reemplazo_indefinido' && vac.reemplaza_a_nombre && (
              <Dato label="Reemplaza a" valor={vac.reemplaza_a_nombre} />
            )}
            {vac.tipo_solicitud === 'necesidad_temporal' && vac.temporalidad_meses != null && (
              <Dato
                label="Duración estimada"
                valor={`${vac.temporalidad_meses} mes${vac.temporalidad_meses === 1 ? '' : 'es'}`}
              />
            )}
            <Dato label="Líder solicitante" valor={vac.lider_nombre} />
          </div>
        </Card>
      </section>

      {/* ─── Condiciones ─────────────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<CircleDollarSign size={12} strokeWidth={1.75} />}>
          Condiciones
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          {/* Mismo bloque que ve GH en Aprobaciones (rodamiento con valor, etc.). */}
          <CondicionesVacante vacante={vac} variante="plana" />
          <div className="mt-5">
            <Dato label="Justificación" valor={vac.justificacion} preserveBreaks />
          </div>
        </Card>
      </section>

      {/* ─── Aval y agendamiento ─────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<ShieldCheck size={12} strokeWidth={1.75} />}>
          Aval y agendamiento
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
            <div>
              <DatoLabel>Aval adjunto</DatoLabel>
              {vac.aval_url ? (
                <a
                  href={vac.aval_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:text-brand-800 hover:underline underline-offset-2"
                >
                  <FileText size={13} strokeWidth={1.5} />
                  Ver PDF firmado
                </a>
              ) : vac.aval_no_requiere ? (
                <p className="mt-1.5 text-[14px] font-medium text-text-strong">No requiere aval</p>
              ) : (
                <p className="mt-1.5 text-[14px] font-medium text-warning-700">Pendiente de adjuntar</p>
              )}
            </div>
            <Dato
              label="Aval aprobado por GH"
              valor={avalAprobadoEn ? formatearFecha(avalAprobadoEn) : 'Pendiente'}
              icon={<CheckCircle2 size={13} strokeWidth={1.5} />}
            />
            <Dato
              label="Fecha propuesta por líder"
              valor={formatearFecha(fechaPropuesta)}
              icon={<Calendar size={13} strokeWidth={1.5} />}
            />
            <Dato
              label="Fecha pactada (paso 3)"
              valor={fechaPactada ? formatearFecha(fechaPactada) : 'Pendiente · perfilamiento'}
              icon={<Calendar size={13} strokeWidth={1.5} />}
            />
          </div>
        </Card>
      </section>

      {/* ─── Asignación ──────────────────────────────────────────── */}
      <AsignacionAnalista vac={vac} />

      {/* ─── Reprocesos y novedades (bitácora) ───────────────────── */}
      <BitacoraReprocesos vacante={vac} />

      {/* ─── Flujograma ──────────────────────────────────────────── */}
      <section>
        <SectionEyebrow icon={<Sparkles size={12} strokeWidth={1.75} />}>
          Flujograma · 20 pasos
        </SectionEyebrow>
        <Card padding="lg" className="mt-3">
          <p className="text-[12px] text-text-muted mb-5">
            El paso resaltado en rojo brand es el estado actual. Los pasos en verde ya están
            completados. Click en cualquiera para abrir su pantalla.
          </p>
          <FlujogramaTimeline vacante={vac} />
        </Card>
      </section>
    </div>
  );
}

/**
 * AsignacionAnalista · muestra la analista/líder de la vacante y, para el STAFF
 * (coordinador/admin), un selector para asignar/reasignar la analista responsable
 * vía la callable `asignarAnalista` (reu 26-jun). La asignación ya NO es
 * automática en el perfilamiento; la decide el staff a mano.
 */
function AsignacionAnalista({ vac }: { vac: VacanteDoc }) {
  const { rol } = useAuth();
  const { actualizar } = useMutacion();
  const esStaff = rol === 'admin' || rol === 'coordinador';
  const [selUid, setSelUid] = useState<string | null>(vac.analista_uid);
  const [asignando, setAsignando] = useState(false);
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  const asignadoEn = vac.analista_asignado_en?.toDate?.() ?? null;
  const cambio = !!selUid && selUid !== vac.analista_uid;

  // Fecha de activación (procesos viejos migrados): la fija Coordinación para que
  // los días del proceso cuenten desde el inicio REAL, no desde la carga.
  const actInicial = vac.fecha_activacion?.toDate?.() ?? null;
  const [fechaAct, setFechaAct] = useState(actInicial ? actInicial.toISOString().slice(0, 10) : '');
  const [guardandoFecha, setGuardandoFecha] = useState(false);
  const [msgFecha, setMsgFecha] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);

  async function guardarFechaActivacion() {
    setGuardandoFecha(true);
    setMsgFecha(null);
    try {
      await actualizar('vacantes', vac.id, {
        fecha_activacion: fechaAct
          ? Timestamp.fromDate(new Date(`${fechaAct}T12:00:00`))
          : null,
      });
      setMsgFecha({
        tipo: 'ok',
        texto: fechaAct ? '✓ Fecha de activación guardada.' : '✓ Fecha de activación quitada.',
      });
    } catch (e) {
      setMsgFecha({
        tipo: 'error',
        texto: e instanceof Error ? e.message : 'No pudimos guardar la fecha.',
      });
    } finally {
      setGuardandoFecha(false);
    }
  }

  async function asignar() {
    if (!selUid) return;
    setAsignando(true);
    setMsg(null);
    try {
      const fn = httpsCallable(functions, 'asignarAnalista');
      const res = (await fn({ vacante_id: vac.id, analista_uid: selUid })) as {
        data: { analista_nombre?: string };
      };
      setMsg({ tipo: 'ok', texto: `Analista asignada: ${res.data?.analista_nombre ?? ''}.` });
    } catch (e) {
      setMsg({
        tipo: 'error',
        texto: e instanceof Error ? e.message : 'No pudimos asignar la analista.',
      });
    } finally {
      setAsignando(false);
    }
  }

  return (
    <section>
      <SectionEyebrow icon={<User2 size={12} strokeWidth={1.75} />}>Asignación</SectionEyebrow>
      <Card padding="lg" className="mt-3 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
          <Dato label="Analista responsable" valor={vac.analista_nombre ?? 'Sin asignar'} />
          <Dato label="Líder solicitante" valor={vac.lider_nombre ?? '—'} />
        </div>
        {asignadoEn && (
          <p className="text-[11px] text-text-subtle">Analista asignada el {formatearFecha(asignadoEn)}.</p>
        )}
        {esStaff && (
          <div className="border-t border-slate-100 pt-5 space-y-2">
            <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
              Fecha de activación del proceso
            </p>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={fechaAct}
                onChange={(e) => {
                  setFechaAct(e.target.value);
                  setMsgFecha(null);
                }}
                className="rounded-brand-input border border-slate-300 px-2.5 py-1.5 text-[12px] text-text-strong focus:outline-none focus:border-brand-500"
              />
              <Button
                variant="neutral-secondary"
                onClick={guardarFechaActivacion}
                loading={guardandoFecha}
                disabled={guardandoFecha}
              >
                Guardar
              </Button>
              {msgFecha && (
                <span
                  className={`text-[11px] ${msgFecha.tipo === 'ok' ? 'text-success-700' : 'text-danger-700'}`}
                >
                  {msgFecha.texto}
                </span>
              )}
            </div>
            <p className="text-[11px] text-text-subtle">
              Para procesos viejos migrados: fija el inicio REAL del proceso. Los días del proceso se
              cuentan desde aquí (si la dejas vacía, se usa la fecha de creación en el aplicativo).
            </p>
          </div>
        )}
        {esStaff && (
          <div className="border-t border-slate-100 pt-5 space-y-3">
            <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
              {vac.analista_uid ? 'Reasignar analista' : 'Asignar analista'}
            </p>
            <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 md:items-center">
              <SelectorAnalista value={selUid} onChange={(uid) => setSelUid(uid)} disabled={asignando} />
              <Button
                variant="brand-primary"
                onClick={asignar}
                loading={asignando}
                disabled={asignando || !cambio}
              >
                {vac.analista_uid ? 'Reasignar' : 'Asignar'}
              </Button>
            </div>
            {msg && (
              <p className={`text-[12px] ${msg.tipo === 'ok' ? 'text-success-700' : 'text-danger-700'}`}>
                {msg.texto}
              </p>
            )}
            <p className="text-[11px] text-text-subtle">
              La asignación la hace coordinación/admin; una analista no se autoasigna vacantes ajenas.
            </p>
          </div>
        )}
      </Card>
    </section>
  );
}

function SectionEyebrow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-text-muted">{icon}</span>
      <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">
        {children}
      </p>
    </div>
  );
}

function DatoLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle">
      {children}
    </p>
  );
}

interface DatoProps {
  label: string;
  valor: React.ReactNode;
  hero?: boolean;
  mono?: boolean;
  capital?: boolean;
  ancho?: string;
  icon?: React.ReactNode;
  preserveBreaks?: boolean;
}
function Dato({ label, valor, hero, mono, capital, ancho, icon, preserveBreaks }: DatoProps) {
  return (
    <div className={ancho ?? ''}>
      <DatoLabel>{label}</DatoLabel>
      <p
        className={[
          'mt-1.5 text-text-strong',
          hero ? 'text-[22px] font-light tracking-[-0.02em] tabular-nums' : 'text-[14px] font-medium',
          mono && 'font-mono tabular-nums',
          capital && 'capitalize',
          preserveBreaks && 'whitespace-pre-line',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {icon && <span className="text-text-subtle mr-1.5 inline-block align-[-2px]">{icon}</span>}
        {valor}
      </p>
    </div>
  );
}
