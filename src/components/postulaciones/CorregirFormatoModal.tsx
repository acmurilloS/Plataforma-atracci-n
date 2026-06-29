import { useMemo, useState, type ReactNode } from 'react';
import { Timestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { functions, storage } from '../../lib/firebase';
import { useEmpresas } from '../../hooks/useCatalogos';
import { Button, Card } from '../brand';
import { estamparDatosBasicos, type DatosBasicosEstampado } from '../../utils/estamparDatosBasicos';
import type { DatosBasicosIntegranteDoc } from '../../schemas';

const inp =
  'w-full rounded-brand-input border border-slate-300 bg-white px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500';

function partesFecha(ts: Timestamp | null | undefined): [string, string, string] {
  if (!ts) return ['', '', ''];
  const d = ts.toDate();
  return [String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')];
}

/** Doc de Datos Básicos → datos para estampar el PDF oficial (todos los campos). */
function docAEstampado(d: DatosBasicosIntegranteDoc): DatosBasicosEstampado {
  const [na, nm, nd] = partesFecha(d.fecha_nacimiento);
  const [ca, cm, cd] = partesFecha(d.conyuge_fecha_nacimiento);
  return {
    tipo_contratacion: d.tipo_contratacion,
    empresa: d.empresa_nombre,
    nombres: d.nombres,
    apellidos: d.apellidos,
    documento_numero: d.documento_numero,
    documento_ciudad_dpto: [d.documento_ciudad_expedicion, d.documento_dpto_expedicion].filter(Boolean).join(' / '),
    direccion: d.direccion,
    telefono_fijo: d.telefono_fijo,
    barrio: d.barrio,
    ciudad_domicilio: d.ciudad_domicilio,
    celular: d.celular,
    fecha_nac_aa: na,
    fecha_nac_mm: nm,
    fecha_nac_dd: nd,
    lugar_nacimiento: d.lugar_nacimiento,
    estado_civil: d.estado_civil ?? '',
    profesion: d.profesion_actividad,
    genero: d.genero ?? '',
    rh: d.grupo_sanguineo ?? '',
    alergico_a: d.alergico_a,
    dependiente_medicamento: d.dependiente_medicamento,
    libreta_numero: d.libreta_militar_numero,
    libreta_clase: d.libreta_militar_clase,
    correo: d.correo_electronico,
    cuenta_banco: d.cuenta_banco_numero,
    entidad_bancaria: d.entidad_bancaria,
    afp: d.fondo_pensiones_obligatorias,
    eps: d.entidad_promotora_salud,
    cesantias: d.fondo_cesantias,
    caja: d.caja_compensacion,
    arl: d.arl,
    riesgo: d.riesgo_porcentaje,
    conyuge_nombre: d.conyuge_nombre,
    conyuge_doc: d.conyuge_documento,
    conyuge_profesion: d.conyuge_profesion_actividad,
    conyuge_fecha: ca ? `${cd}/${cm}/${ca}` : '',
    hijos: (d.hijos ?? []).map((h) => {
      const [a, m, dd] = (h.fecha_nacimiento ?? '').split('-');
      return { nombre: h.nombre, aa: a, mm: m, dd };
    }),
    emerg1_nombre: d.emergencia_contacto_1?.nombre,
    emerg1_tel: d.emergencia_contacto_1?.telefono,
    emerg2_nombre: d.emergencia_contacto_2?.nombre,
    emerg2_tel: d.emergencia_contacto_2?.telefono,
    talla_calzado: d.talla_calzado,
    talla_pantalon: d.talla_pantalon,
    talla_chaleco: d.talla_chaleco,
    talla_guantes: d.talla_guantes,
    talla_overol: d.talla_overol,
    talla_camisa: d.talla_camisa_blusa,
    talla_otros: d.talla_otros,
    observaciones: d.observaciones,
    tiene_familiares: d.tiene_familiares_organizacion ? 'si' : 'no',
    nombre_familiar: d.nombre_familiar_organizacion,
    fecha_firma: new Date().toLocaleDateString('es-CO'),
  };
}

// Campos corregibles (afectan contrato/nómina). [key, label, opciones?]
const CAMPOS: { key: keyof DatosBasicosIntegranteDoc; label: string; opciones?: { value: string; label: string }[] }[] = [
  { key: 'tipo_contratacion', label: 'Tipo de contratación', opciones: [{ value: 'directo', label: 'Directo' }, { value: 'temporal', label: 'Temporal' }] },
  { key: 'nombres', label: 'Nombres' },
  { key: 'apellidos', label: 'Apellidos' },
  { key: 'documento_tipo', label: 'Tipo de documento', opciones: ['CC', 'CE', 'PEP', 'PA', 'NIT'].map((v) => ({ value: v, label: v })) },
  { key: 'documento_numero', label: 'Número de documento' },
  { key: 'correo_electronico', label: 'Correo electrónico' },
  { key: 'celular', label: 'Celular' },
  { key: 'fondo_pensiones_obligatorias', label: 'Fondo de pensiones (AFP)' },
  { key: 'entidad_promotora_salud', label: 'EPS' },
  { key: 'fondo_cesantias', label: 'Fondo de cesantías' },
  { key: 'entidad_bancaria', label: 'Entidad bancaria' },
  { key: 'cuenta_banco_numero', label: 'Cuenta de banco No.' },
];

interface Props {
  dato: DatosBasicosIntegranteDoc;
  postulacionId: string;
  onClose: () => void;
  onDone?: (version: number) => void;
}

/**
 * CorregirFormatoModal · corrige campos de un Datos Básicos ya diligenciado y
 * REGENERA el PDF oficial con trazabilidad (reu 26-jun, F6). Estampa client-side,
 * sube la versión nueva y llama la callable regenerarFormatoOficial.
 */
export function CorregirFormatoModal({ dato, postulacionId, onClose, onDone }: Props) {
  const { empresas } = useEmpresas();
  const inicial = useMemo(() => {
    const o: Record<string, string> = { empresa_codigo: dato.empresa_codigo ?? '' };
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
      // Edits en forma del schema (incluye empresa_nombre derivado del código).
      const empSel = empresas.find((e) => e.codigo === f.empresa_codigo);
      const edits: Record<string, unknown> = {};
      for (const c of CAMPOS) if (f[c.key] !== inicial[c.key]) edits[c.key] = f[c.key];
      if (f.empresa_codigo !== inicial.empresa_codigo) {
        edits.empresa_codigo = f.empresa_codigo;
        edits.empresa_nombre = empSel?.nombre ?? dato.empresa_nombre;
      }

      // Diff legible para la traza.
      const campos_corregidos = Object.keys(edits)
        .filter((k) => k !== 'empresa_codigo' && k !== 'empresa_nombre')
        .map((k) => ({ campo: CAMPOS.find((c) => c.key === k)?.label ?? k, antes: inicial[k] ?? '', despues: String(edits[k] ?? '') }));
      if ('empresa_codigo' in edits) {
        campos_corregidos.push({ campo: 'Empresa', antes: dato.empresa_nombre ?? '', despues: String(edits.empresa_nombre ?? '') });
      }
      if (campos_corregidos.length === 0) {
        setErr('No cambiaste ningún campo.');
        setGuardando(false);
        return;
      }

      // Regenera el PDF oficial con el doc corregido.
      const corregido = { ...dato, ...edits } as DatosBasicosIntegranteDoc;
      const blob = await estamparDatosBasicos(docAEstampado(corregido), dato.firma_integrante_url ?? undefined);
      const ts = Date.now();
      const r = storageRef(storage, `formatos_corregidos/${postulacionId}/datos_basicos_v${ts}.pdf`);
      await uploadBytes(r, blob, { contentType: 'application/pdf' });
      const pdfUrl = await getDownloadURL(r);

      const fn = httpsCallable(functions, 'regenerarFormatoOficial');
      const res = (await fn({
        postulacion_id: postulacionId,
        tipo: 'datos_basicos',
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
            <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted">Corregir formato · Datos Básicos</p>
            <p className="mt-1 text-[12px] text-text-muted">
              Corrige el/los campos y se regenera el PDF oficial. Queda registrada la versión: quién,
              cuándo y qué cambió (formato controlado por Calidad).
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Campo label="Empresa">
              <select value={f.empresa_codigo} onChange={(e) => set('empresa_codigo', e.target.value)} className={inp}>
                {empresas.map((e) => <option key={e.codigo} value={e.codigo}>{e.nombre}</option>)}
              </select>
            </Campo>
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
