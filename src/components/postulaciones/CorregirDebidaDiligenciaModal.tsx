import { useMemo, useState, type ReactNode } from 'react';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { functions, storage } from '../../lib/firebase';
import { Button, Card } from '../brand';
import {
  estamparDebidaDiligencia,
  type DebidaDiligenciaEstampado,
} from '../../utils/estamparDebidaDiligencia';
import type { DebidaDiligenciaDoc } from '../../schemas';

const inp =
  'w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500';

/** Timestamp → "dd/MM/yyyy". */
function fechaDisplay(ts: Timestamp | null | undefined): string {
  if (!ts) return '';
  const d = ts.toDate();
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}
function sino(b: boolean | null | undefined): string {
  return b ? 'si' : 'no';
}

/** Doc de Debida Diligencia → datos para estampar el PDF oficial F-CAR-01. */
function docAEstampado(d: DebidaDiligenciaDoc): DebidaDiligenciaEstampado {
  return {
    tipo_registro: d.tipo_registro,
    departamento: d.departamento,
    ciudad_municipio: d.ciudad_municipio,
    fecha_diligenciamiento: fechaDisplay(d.fecha_diligenciamiento) || new Date().toLocaleDateString('es-CO'),
    fecha_ingreso: fechaDisplay(d.fecha_ingreso),
    cargo: d.cargo,
    tipo_vinculacion: d.tipo_vinculacion,
    primer_apellido: d.primer_apellido,
    segundo_apellido: d.segundo_apellido,
    nombres: d.nombres,
    identificacion: d.identificacion,
    tipo_documento: d.tipo_documento,
    tipo_documento_otro: d.tipo_documento_otro,
    fecha_nacimiento: fechaDisplay(d.fecha_nacimiento),
    celular: d.celular,
    pais: d.pais,
    fecha_expedicion_documento: fechaDisplay(d.fecha_expedicion_documento),
    lugar_expedicion: d.lugar_expedicion,
    direccion_residencial: d.direccion_residencial,
    correo_electronico: d.correo_electronico,
    tiene_familiar_empresa: sino(d.tiene_familiar_empresa),
    nombre_apellidos_familiar: d.nombre_apellidos_familiar,
    cargo_familiar: d.cargo_familiar,
    parentesco_familiar: d.parentesco_familiar,
    conyuge_primer_apellido: d.conyuge_primer_apellido,
    conyuge_segundo_apellido: d.conyuge_segundo_apellido,
    conyuge_nombres: d.conyuge_nombres,
    conyuge_identificacion: d.conyuge_identificacion,
    conyuge_tipo_documento: d.conyuge_tipo_documento ?? '',
    conyuge_telefono: d.conyuge_telefono,
    conyuge_ocupacion: d.conyuge_ocupacion,
    conyuge_empleador: d.conyuge_empleador,
    conyuge_parentesco: d.conyuge_parentesco,
    realiza_operaciones_moneda_extranjera: sino(d.realiza_operaciones_moneda_extranjera),
    operaciones_moneda_extranjera_detalle: d.operaciones_moneda_extranjera_detalle,
    posee_productos_financieros_extranjero: sino(d.posee_productos_financieros_extranjero),
    productos_financieros_extranjero_detalle: d.productos_financieros_extranjero_detalle,
    realiza_actividad_ingresos_adicionales: sino(d.realiza_actividad_ingresos_adicionales),
    ingresos_adicionales_observaciones: d.ingresos_adicionales_observaciones,
    posee_reconocimiento_publico: sino(d.posee_reconocimiento_publico),
    posee_vinculo_pep: sino(d.posee_vinculo_pep),
    vinculados_pep: (d.vinculados_pep ?? []).map((v) => ({
      nombre: v.nombre,
      relacion: v.relacion,
      identidad: v.identidad,
      cargo_ocupacion: v.cargo_ocupacion,
      fecha_desvinculacion: v.fecha_desvinculacion ?? '',
    })),
  };
}

// Campos corregibles (deben coincidir con CORREGIBLES_DD del backend).
const CAMPOS: { key: keyof DebidaDiligenciaDoc; label: string; opciones?: { value: string; label: string }[] }[] = [
  { key: 'primer_apellido', label: 'Primer apellido' },
  { key: 'segundo_apellido', label: 'Segundo apellido' },
  { key: 'nombres', label: 'Nombres' },
  { key: 'identificacion', label: 'N° de identificación' },
  { key: 'tipo_documento', label: 'Tipo de documento', opciones: ['CC', 'CE', 'PEP', 'PA', 'OTRO'].map((v) => ({ value: v, label: v })) },
  { key: 'celular', label: 'Celular' },
  { key: 'correo_electronico', label: 'Correo electrónico' },
  { key: 'direccion_residencial', label: 'Dirección residencial' },
  { key: 'lugar_expedicion', label: 'Lugar de expedición' },
  { key: 'cargo', label: 'Cargo' },
  { key: 'departamento', label: 'Departamento' },
  { key: 'ciudad_municipio', label: 'Ciudad / municipio' },
];

interface Props {
  dato: DebidaDiligenciaDoc;
  postulacionId: string;
  onClose: () => void;
  onDone?: (version: number) => void;
}

/**
 * CorregirDebidaDiligenciaModal · corrige campos de una Debida Diligencia /
 * SAGRILAFT ya diligenciada y REGENERA el PDF oficial F-CAR-01 con trazabilidad
 * (misma mecánica que CorregirFormatoModal de Datos Básicos, tipo 'debida_diligencia').
 */
export function CorregirDebidaDiligenciaModal({ dato, postulacionId, onClose, onDone }: Props) {
  const inicial = useMemo(() => {
    const o: Record<string, string> = {};
    for (const c of CAMPOS) o[c.key] = String((dato[c.key] as unknown) ?? '');
    return o;
  }, [dato]);
  const [f, setF] = useState<Record<string, string>>(inicial);
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function guardar() {
    setGuardando(true);
    setErr(null);
    try {
      const edits: Record<string, unknown> = {};
      for (const c of CAMPOS) if (f[c.key] !== inicial[c.key]) edits[c.key] = f[c.key];

      const campos_corregidos = Object.keys(edits).map((k) => ({
        campo: CAMPOS.find((c) => c.key === k)?.label ?? k,
        antes: inicial[k] ?? '',
        despues: String(edits[k] ?? ''),
      }));
      if (campos_corregidos.length === 0) {
        setErr('No cambiaste ningún campo.');
        setGuardando(false);
        return;
      }

      const corregido = { ...dato, ...edits } as DebidaDiligenciaDoc;
      const blob = await estamparDebidaDiligencia(docAEstampado(corregido), dato.firma_integrante_url ?? undefined);
      const ts = Date.now();
      const r = storageRef(storage, `formatos_corregidos/${postulacionId}/debida_diligencia_v${ts}.pdf`);
      await uploadBytes(r, blob, { contentType: 'application/pdf' });
      const pdfUrl = await getDownloadURL(r);

      const fn = httpsCallable(functions, 'regenerarFormatoOficial');
      const res = (await fn({
        postulacion_id: postulacionId,
        tipo: 'debida_diligencia',
        pdf_url: pdfUrl,
        campos_corregidos,
        datos_actualizados: edits,
      })) as { data: { version?: number } };
      onDone?.(res.data?.version ?? 0);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No pudimos regenerar el formato.');
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4 py-8 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
        <Card padding="lg" className="space-y-5">
          <div>
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">Corregir formato · Debida Diligencia</p>
            <p className="mt-1 text-[12px] text-text-muted">
              Corrige el/los campos y se regenera el PDF oficial F-CAR-01. Queda registrada la versión:
              quién, cuándo y qué cambió (formato controlado por Calidad).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {CAMPOS.map((c) => (
              <Campo key={c.key} label={c.label}>
                {c.opciones ? (
                  <select value={f[c.key]} onChange={(e) => set(c.key, e.target.value)} className={inp}>
                    {c.opciones.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                ) : (
                  <input value={f[c.key]} onChange={(e) => set(c.key, e.target.value)} className={inp} />
                )}
              </Campo>
            ))}
          </div>

          {err && <p className="text-[12px] text-danger-700">{err}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="neutral-secondary" onClick={onClose} disabled={guardando}>Cancelar</Button>
            <Button variant="brand-primary" onClick={guardar} loading={guardando} disabled={guardando}>
              Corregir y regenerar
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle mb-1.5">{label}</span>
      {children}
    </label>
  );
}
