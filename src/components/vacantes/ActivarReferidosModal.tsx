import { useMemo, useState } from 'react';
import { Copy, Download, Send, Users2, X, AlertTriangle, Check } from 'lucide-react';
import { Modal } from '../ui';
import { Button, Pill } from '../brand';
import { useReferidos, type ResultadoGeneracion, type TecnicoInvitado } from '../../hooks/useReferidos';
import type { VacanteDoc } from '../../schemas';

interface Props {
  open: boolean;
  onClose: () => void;
  vacante: VacanteDoc;
  onGenerada?: () => void;
}

type Plantilla = 'v1' | 'v2' | 'v3';
type Modo = 'personal' | 'difusion';

const PAGE_SIZE = 50;

/**
 * Modal para activar referidos sobre una vacante.
 *
 * Flujo (v1, sin envío automático):
 *  1. Karen escoge plantilla y modo (personal o difusión).
 *  2. Click "Generar invitaciones" → callable lee Sheet, normaliza
 *     celulares, crea slugs y devuelve la tabla lista para copiar.
 *  3. Karen copia mensajes / descarga CSV / abre wa.me 1 a 1.
 *  4. Click "Marcar como enviadas" → cierra el modal con un check.
 */
export function ActivarReferidosModal({ open, onClose, vacante, onGenerada }: Props) {
  const { generar, marcarEnviadas, ejecutando } = useReferidos();
  const [plantilla, setPlantilla] = useState<Plantilla>('v1');
  const [modo, setModo] = useState<Modo>('personal');
  const [resultado, setResultado] = useState<ResultadoGeneracion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pagina, setPagina] = useState(0);
  const [marcando, setMarcando] = useState(false);

  function reset() {
    setResultado(null);
    setError(null);
    setPagina(0);
  }

  function cerrar() {
    reset();
    onClose();
  }

  async function onGenerar() {
    setError(null);
    try {
      const res = await generar({
        vacante_id: vacante.id,
        modo,
        mensaje_template: plantilla,
      });
      setResultado(res);
      onGenerada?.();
    } catch (e) {
      setError(humanizar(e));
    }
  }

  async function onMarcarEnviadas() {
    if (!resultado) return;
    setMarcando(true);
    try {
      await marcarEnviadas(resultado.generacion_id);
      cerrar();
    } catch (e) {
      setError(humanizar(e));
    } finally {
      setMarcando(false);
    }
  }

  async function copiar(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      // Fallback para navegadores que bloquean clipboard API
      const ta = document.createElement('textarea');
      ta.value = texto;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
  }

  function descargarCSV() {
    if (!resultado) return;
    const headers = ['nombre', 'sede', 'celular', 'wa_me_url', 'mensaje', 'link_landing'];
    const rows = resultado.tecnicos.map((t) => [
      t.nombre,
      t.sede,
      t.celular_e164,
      t.wa_me_url,
      t.mensaje_personalizado,
      t.link_landing,
    ]);
    const csv = [headers, ...rows]
      .map((r) =>
        r.map((c) => `"${String(c).replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`).join(','),
      )
      .join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referidos_${vacante.consecutivo ?? vacante.id}_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Solo paginamos cuando ya tenemos resultado
  const pageTecnicos = useMemo(() => {
    if (!resultado) return [];
    return resultado.tecnicos.slice(pagina * PAGE_SIZE, (pagina + 1) * PAGE_SIZE);
  }, [resultado, pagina]);

  const totalPaginas = resultado ? Math.ceil(resultado.tecnicos.length / PAGE_SIZE) : 0;

  return (
    <Modal
      open={open}
      onClose={cerrar}
      size="xl"
      title="Activar referidos internos"
      description={`Genera el contenido para que los técnicos de la base recomienden gente · ${vacante.cargo_nombre} · ${vacante.sede_nombre}`}
      footer={
        !resultado ? (
          <>
            <Button variant="neutral-secondary" onClick={cerrar} disabled={ejecutando}>
              Cancelar
            </Button>
            <Button
              variant="brand-primary"
              onClick={onGenerar}
              loading={ejecutando}
              disabled={ejecutando}
              icon={<Users2 size={13} strokeWidth={1.75} />}
            >
              {ejecutando ? 'Leyendo Sheet…' : 'Generar invitaciones'}
            </Button>
          </>
        ) : (
          <>
            <Button variant="neutral-secondary" onClick={cerrar} disabled={marcando}>
              Cerrar sin marcar
            </Button>
            <Button
              variant="brand-primary"
              onClick={onMarcarEnviadas}
              loading={marcando}
              disabled={marcando}
              icon={<Check size={13} strokeWidth={1.75} />}
            >
              Marcar como enviadas
            </Button>
          </>
        )
      }
    >
      {!resultado ? (
        <div className="space-y-5">
          {/* Modo */}
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle mb-2">
              Modo
            </p>
            <div className="grid grid-cols-2 gap-2">
              <OpcionRadio
                seleccionado={modo === 'personal'}
                titulo="1 a 1 (recomendado)"
                detalle="Cada técnico recibe un link único. Sabemos quién refirió a quién."
                onClick={() => setModo('personal')}
              />
              <OpcionRadio
                seleccionado={modo === 'difusion'}
                titulo="Difusión"
                detalle="Mensaje genérico sin link único. Más rápido pero pierdes tracking."
                onClick={() => setModo('difusion')}
              />
            </div>
          </div>

          {/* Plantilla */}
          {modo === 'personal' && (
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-text-subtle mb-2">
                Plantilla
              </p>
              <div className="space-y-2">
                {(['v1', 'v2', 'v3'] as Plantilla[]).map((p) => (
                  <OpcionRadio
                    key={p}
                    seleccionado={plantilla === p}
                    titulo={LABEL_PLANTILLA[p]}
                    detalle={PREVIEW_PLANTILLA[p]}
                    onClick={() => setPlantilla(p)}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="rounded-md bg-brand-50/40 border border-brand-200 p-3.5 text-[12px] text-text-body leading-[1.5]">
            <p className="font-semibold text-brand-700 mb-1">¿Qué hace este botón?</p>
            <p>
              Lee la base de técnicos del Sheet de RRHH, normaliza los celulares y arma una
              tabla con el mensaje listo y el link `wa.me` por persona. Después tú lo copias y
              pegas a WhatsApp manualmente —{' '}
              <span className="font-semibold">la plataforma no envía nada por sí sola</span>.
            </p>
          </div>

          {error && (
            <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-[12px] text-danger-700 inline-flex items-start gap-2">
              <X size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {/* Resumen */}
          <div className="flex flex-wrap items-center gap-2">
            <Pill tono="success">{resultado.tecnicos.length} en esta sede</Pill>
            {resultado.excluidos.otra_sede > 0 && (
              <Pill tono="neutral">{resultado.excluidos.otra_sede} de otras sedes</Pill>
            )}
            {resultado.excluidos.opt_out > 0 && (
              <Pill tono="neutral">{resultado.excluidos.opt_out} opt-out</Pill>
            )}
            {resultado.excluidos.sin_celular > 0 && (
              <Pill tono="warning">{resultado.excluidos.sin_celular} sin celular</Pill>
            )}
            {resultado.excluidos.antiguedad > 0 && (
              <Pill tono="neutral">{resultado.excluidos.antiguedad} novatos</Pill>
            )}
            {resultado.excluidos.manual > 0 && (
              <Pill tono="neutral">{resultado.excluidos.manual} excluidos manualmente</Pill>
            )}
            <span className="text-[11px] text-text-subtle ml-auto">
              {resultado.total_en_sheet} técnicos en el Sheet
            </span>
          </div>

          {/* Acciones rápidas */}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="neutral-secondary"
              onClick={descargarCSV}
              icon={<Download size={13} strokeWidth={1.75} />}
            >
              Descargar CSV
            </Button>
            {modo === 'difusion' && resultado.mensaje_difusion && (
              <Button
                variant="neutral-secondary"
                onClick={() => copiar(resultado.mensaje_difusion ?? '')}
                icon={<Copy size={13} strokeWidth={1.75} />}
              >
                Copiar mensaje de difusión
              </Button>
            )}
          </div>

          {modo === 'difusion' && resultado.mensaje_difusion && (
            <div className="rounded-md bg-slate-50 border border-slate-200 p-3 text-[12px] text-text-strong whitespace-pre-wrap leading-[1.5]">
              {resultado.mensaje_difusion}
            </div>
          )}

          {/* Tabla */}
          {modo === 'personal' && resultado.tecnicos.length > 0 && (
            <>
              <div className="border border-slate-200 rounded-md overflow-hidden">
                <table className="w-full text-[12px]">
                  <thead className="bg-slate-50 text-[10px] uppercase tracking-[0.08em] text-text-subtle">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Nombre</th>
                      <th className="px-3 py-2 text-left font-semibold">Sede</th>
                      <th className="px-3 py-2 text-left font-semibold">Celular</th>
                      <th className="px-3 py-2 text-right font-semibold">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageTecnicos.map((t) => (
                      <FilaTecnico
                        key={t.cedula}
                        tecnico={t}
                        onCopiar={() => copiar(t.mensaje_personalizado)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPaginas > 1 && (
                <div className="flex items-center justify-between text-[12px] text-text-muted">
                  <span>
                    Página {pagina + 1} de {totalPaginas}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="neutral-tertiary"
                      onClick={() => setPagina((p) => Math.max(0, p - 1))}
                      disabled={pagina === 0}
                    >
                      Anterior
                    </Button>
                    <Button
                      variant="neutral-tertiary"
                      onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
                      disabled={pagina >= totalPaginas - 1}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}

          {resultado.tecnicos.length === 0 && (
            <div className="rounded-md border border-warning-500/30 bg-warning-50/60 p-3.5 text-[12px] text-warning-700 inline-flex items-start gap-2">
              <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              <span>
                El Sheet no devolvió técnicos elegibles. Verifica que tenga datos, que la SA
                pueda leerlo y que el mapping de columnas esté correcto en /admin/catalogos.
              </span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-danger-500/20 bg-danger-50 px-3 py-2.5 text-[12px] text-danger-700 inline-flex items-start gap-2">
              <X size={12} strokeWidth={1.75} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

function OpcionRadio({
  seleccionado,
  titulo,
  detalle,
  onClick,
}: {
  seleccionado: boolean;
  titulo: string;
  detalle: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'text-left rounded-md border p-3 transition-colors ' +
        (seleccionado
          ? 'border-brand-500 bg-brand-50/60'
          : 'border-slate-200 bg-white hover:border-slate-300')
      }
    >
      <p className="text-[12px] font-semibold text-text-strong">{titulo}</p>
      <p className="text-[11px] text-text-muted mt-0.5 leading-[1.4]">{detalle}</p>
    </button>
  );
}

function FilaTecnico({
  tecnico,
  onCopiar,
}: {
  tecnico: TecnicoInvitado;
  onCopiar: () => void;
}) {
  return (
    <tr className="hover:bg-slate-50/60">
      <td className="px-3 py-2 text-text-strong">{tecnico.nombre}</td>
      <td className="px-3 py-2 text-text-muted">{tecnico.sede}</td>
      <td className="px-3 py-2 text-text-muted font-mono">{tecnico.celular_e164}</td>
      <td className="px-3 py-2 text-right">
        <div className="inline-flex gap-1.5">
          <button
            type="button"
            onClick={onCopiar}
            className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:text-brand-800 hover:underline"
            title="Copiar mensaje"
          >
            <Copy size={11} strokeWidth={1.75} /> mensaje
          </button>
          <a
            href={tecnico.wa_me_url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-[11px] text-brand-700 hover:text-brand-800 hover:underline"
            title="Abrir chat de WhatsApp con mensaje pre-llenado"
          >
            <Send size={11} strokeWidth={1.75} /> wa.me
          </a>
        </div>
      </td>
    </tr>
  );
}

const LABEL_PLANTILLA: Record<Plantilla, string> = {
  v1: 'V1 · Cercano sencillo',
  v2: 'V2 · Super corto',
  v3: 'V3 · Tono gremio',
};

const PREVIEW_PLANTILLA: Record<Plantilla, string> = {
  v1: '"¡Hola [NOMBRE]! Te escribimos de Atracción Equitel. Abrimos una vacante de…"',
  v2: '"[NOMBRE], buscamos [CARGO] para [SEDE]. ¿Conoces a alguien…"',
  v3: '"Hola [NOMBRE] 🔧 Abrimos vacante de [CARGO] en [SEDE]…"',
};

function humanizar(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e);
  if (/failed-precondition/i.test(raw) && /Sheet/i.test(raw)) {
    return 'No se pudo leer el Sheet. Verifica en /admin/catalogos que esté compartido con la cuenta de servicio.';
  }
  if (/failed-precondition/i.test(raw)) {
    return 'Falta configurar el módulo de referidos. Pídele al admin que lo configure en /admin/catalogos.';
  }
  if (/deadline-exceeded|timeout/i.test(raw)) {
    return 'La generación tardó demasiado. Reintenta en un minuto.';
  }
  return raw.length > 280 ? 'No se pudo generar la lista. Intenta de nuevo.' : raw;
}
