import { useState, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Check, Plus, Trash2 } from 'lucide-react';
import { functions, storage } from '../../lib/firebase';
import { Button } from '../brand';
import { FirmaInput } from '../firma/FirmaInput';
import {
  estamparDebidaDiligencia,
  type DebidaDiligenciaEstampado,
} from '../../utils/estamparDebidaDiligencia';

/**
 * DebidaDiligenciaPortalCard · el INTEGRANTE diligencia y firma su Debida
 * Diligencia / SAGRILAFT (F-CAR-01) desde el portal (B2). Espejo de
 * `DatosBasicosPortalCard`: llena bloques 1–7, firma, se estampa el PDF OFICIAL y
 * se registra vía `registrarDebidaDiligenciaPortal`. El bloque 8 (verificación de
 * listas + VoBo) lo completa después el oficial de cumplimiento (staff).
 */

const inp =
  'w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500';

interface Props {
  token: string;
  cedula: string;
  empresaNombre: string;
  nombreCompleto: string;
  documentoNumero: string;
  cargoNombre?: string;
  celular?: string;
  correo?: string;
  yaEnviado: boolean;
  firmaUrl?: string;
}

interface Pep {
  nombre: string;
  relacion: string;
  identidad: string;
  cargo_ocupacion: string;
  fecha_desvinculacion: string;
}

function splitNombre(full: string): { nombres: string; primer: string; segundo: string } {
  const w = (full || '').trim().split(/\s+/).filter(Boolean);
  if (w.length >= 4) return { nombres: w.slice(0, w.length - 2).join(' '), primer: w[w.length - 2], segundo: w[w.length - 1] };
  if (w.length === 3) return { nombres: w[0], primer: w[1], segundo: w[2] };
  if (w.length === 2) return { nombres: w[0], primer: w[1], segundo: '' };
  return { nombres: full || '', primer: '', segundo: '' };
}

/** "2026-06-30" → "30/06/2026" (para estampar). */
function isoADisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((iso || '').trim());
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

export function DebidaDiligenciaPortalCard({
  token,
  cedula,
  empresaNombre,
  nombreCompleto,
  documentoNumero,
  cargoNombre,
  celular,
  correo,
  yaEnviado,
  firmaUrl,
}: Props) {
  const ini = splitNombre(nombreCompleto);
  const [f, setF] = useState<Record<string, string>>({
    departamento: '',
    ciudad_municipio: '',
    cargo: cargoNombre || '',
    tipo_vinculacion: 'directo',
    primer_apellido: ini.primer,
    segundo_apellido: ini.segundo,
    nombres: ini.nombres,
    identificacion: documentoNumero || '',
    tipo_documento: 'CC',
    tipo_documento_otro: '',
    fecha_nacimiento: '',
    celular: celular || '',
    pais: 'Colombia',
    fecha_expedicion_documento: '',
    lugar_expedicion: '',
    direccion_residencial: '',
    correo_electronico: correo || '',
    // Familiar
    tiene_familiar_empresa: 'no',
    nombre_apellidos_familiar: '',
    parentesco_familiar: '',
    cargo_familiar: '',
    // Cónyuge
    conyuge_primer_apellido: '',
    conyuge_segundo_apellido: '',
    conyuge_nombres: '',
    conyuge_identificacion: '',
    conyuge_tipo_documento: '',
    conyuge_telefono: '',
    conyuge_ocupacion: '',
    conyuge_empleador: '',
    conyuge_parentesco: '',
    // Financiera
    realiza_operaciones_moneda_extranjera: 'no',
    operaciones_moneda_extranjera_detalle: '',
    posee_productos_financieros_extranjero: 'no',
    productos_financieros_extranjero_detalle: '',
    realiza_actividad_ingresos_adicionales: 'no',
    ingresos_adicionales_observaciones: '',
    // PEP (sí/no)
    posee_reconocimiento_publico: 'no',
    posee_vinculo_pep: 'no',
  });
  const [pep, setPep] = useState<Pep[]>([]);
  const [checks, setChecks] = useState({ anticorrupcion: false, origenes: false, laft: false });
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));
  const esSi = (k: string) => f[k] === 'si';

  async function enviar() {
    if (!f.nombres.trim() || !f.primer_apellido.trim() || !f.identificacion.trim()) {
      setErr('Nombres, primer apellido y número de identificación son obligatorios.');
      return;
    }
    if (!checks.anticorrupcion || !checks.origenes || !checks.laft) {
      setErr('Debes aceptar las 3 declaraciones (cláusulas 5, 6 y 7) para continuar.');
      return;
    }
    if (!firma) {
      setErr('Dibuja tu firma para continuar.');
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      const estampado: DebidaDiligenciaEstampado = {
        ...f,
        fecha_diligenciamiento: isoADisplay(new Date().toISOString().slice(0, 10)),
        fecha_nacimiento: isoADisplay(f.fecha_nacimiento),
        fecha_expedicion_documento: isoADisplay(f.fecha_expedicion_documento),
        vinculados_pep: pep,
      };
      const blob = await estamparDebidaDiligencia(estampado, firma);
      const ts = Date.now();
      const rPdf = storageRef(storage, `portal_docs/${token}/debida_diligencia_${ts}.pdf`);
      await uploadBytes(rPdf, blob, { contentType: 'application/pdf' });
      const pdfUrl = await getDownloadURL(rPdf);
      const imgBlob = await (await fetch(firma)).blob();
      const rImg = storageRef(storage, `portal_docs/${token}/debida_diligencia_firma_${ts}.png`);
      await uploadBytes(rImg, imgBlob, { contentType: 'image/png' });
      const firmaImgUrl = await getDownloadURL(rImg);

      const datos = {
        ...f,
        tiene_familiar_empresa: esSi('tiene_familiar_empresa'),
        realiza_operaciones_moneda_extranjera: esSi('realiza_operaciones_moneda_extranjera'),
        posee_productos_financieros_extranjero: esSi('posee_productos_financieros_extranjero'),
        realiza_actividad_ingresos_adicionales: esSi('realiza_actividad_ingresos_adicionales'),
        posee_reconocimiento_publico: esSi('posee_reconocimiento_publico'),
        posee_vinculo_pep: esSi('posee_vinculo_pep'),
        acepta_clausulas_anticorrupcion: checks.anticorrupcion,
        acepta_declaracion_origenes_ingreso: checks.origenes,
        acepta_politicas_laft: checks.laft,
        vinculados_pep: pep,
      };
      const fn = httpsCallable(functions, 'registrarDebidaDiligenciaPortal');
      await fn({ token, cedula, datos, pdf_url: pdfUrl, firma_imagen_url: firmaImgUrl });
      setEnviado(true);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo enviar. Reintenta.');
    } finally {
      setEnviando(false);
    }
  }

  if (yaEnviado || enviado) {
    return (
      <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card px-5 sm:px-7 py-6">
        <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-success-700 bg-success-50 border border-success-500/25 rounded-full px-2.5 py-1">
          <Check size={14} strokeWidth={2} />
          Debida Diligencia / SAGRILAFT enviada
        </span>
        <p className="mt-3 text-[13px] text-text-muted leading-[1.55]">
          Ya diligenciaste y firmaste tu Debida Diligencia. El oficial de cumplimiento la revisará.
          Si necesitas corregir algo, escríbenos por la pestaña ¿Dudas?.
        </p>
        {firmaUrl && (
          <a
            href={firmaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-700 hover:text-brand-800 underline underline-offset-2"
          >
            Descargar PDF firmado
          </a>
        )}
      </section>
    );
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
          Debida Diligencia / SAGRILAFT (F-CAR-01)
        </h2>
        <p className="text-[11px] text-text-muted mt-0.5">
          Formato oficial de conocimiento del integrante. Empresa: <strong>{empresaNombre || '—'}</strong>.
        </p>
      </div>

      <div className="px-5 sm:px-7 py-5 space-y-6">
        <Bloque titulo="1. Datos de registro">
          <Campo label="Departamento"><input value={f.departamento} onChange={(e) => set('departamento', e.target.value)} className={inp} /></Campo>
          <Campo label="Ciudad / municipio"><input value={f.ciudad_municipio} onChange={(e) => set('ciudad_municipio', e.target.value)} className={inp} /></Campo>
          <Campo label="Cargo"><input value={f.cargo} onChange={(e) => set('cargo', e.target.value)} className={inp} /></Campo>
          <Campo label="Tipo de vinculación">
            <select value={f.tipo_vinculacion} onChange={(e) => set('tipo_vinculacion', e.target.value)} className={inp}>
              {['directo', 'temporal', 'aprendiz', 'practica', 'contratista'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
        </Bloque>

        <Bloque titulo="2. Datos generales">
          <Campo label="Primer apellido"><input value={f.primer_apellido} onChange={(e) => set('primer_apellido', e.target.value)} className={inp} /></Campo>
          <Campo label="Segundo apellido"><input value={f.segundo_apellido} onChange={(e) => set('segundo_apellido', e.target.value)} className={inp} /></Campo>
          <Campo label="Nombres"><input value={f.nombres} onChange={(e) => set('nombres', e.target.value)} className={inp} /></Campo>
          <Campo label="N° de identificación"><input value={f.identificacion} onChange={(e) => set('identificacion', e.target.value)} className={inp} /></Campo>
          <Campo label="Tipo de documento">
            <select value={f.tipo_documento} onChange={(e) => set('tipo_documento', e.target.value)} className={inp}>
              {['CC', 'CE', 'PEP', 'PA', 'OTRO'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          {f.tipo_documento === 'OTRO' && (
            <Campo label="¿Otro, cuál?"><input value={f.tipo_documento_otro} onChange={(e) => set('tipo_documento_otro', e.target.value)} className={inp} /></Campo>
          )}
          <Campo label="Fecha de nacimiento"><input type="date" value={f.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} className={inp} /></Campo>
          <Campo label="Celular"><input value={f.celular} onChange={(e) => set('celular', e.target.value)} className={inp} /></Campo>
          <Campo label="País"><input value={f.pais} onChange={(e) => set('pais', e.target.value)} className={inp} /></Campo>
          <Campo label="Fecha de expedición del documento"><input type="date" value={f.fecha_expedicion_documento} onChange={(e) => set('fecha_expedicion_documento', e.target.value)} className={inp} /></Campo>
          <Campo label="Lugar de expedición"><input value={f.lugar_expedicion} onChange={(e) => set('lugar_expedicion', e.target.value)} className={inp} /></Campo>
          <Campo label="Dirección residencial" full><input value={f.direccion_residencial} onChange={(e) => set('direccion_residencial', e.target.value)} className={inp} /></Campo>
          <Campo label="Correo electrónico" full><input value={f.correo_electronico} onChange={(e) => set('correo_electronico', e.target.value)} className={inp} /></Campo>
          <Campo label="¿Tiene un familiar empleado en esta empresa?">
            <select value={f.tiene_familiar_empresa} onChange={(e) => set('tiene_familiar_empresa', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          {esSi('tiene_familiar_empresa') && (
            <>
              <Campo label="Nombre y apellidos del familiar"><input value={f.nombre_apellidos_familiar} onChange={(e) => set('nombre_apellidos_familiar', e.target.value)} className={inp} /></Campo>
              <Campo label="Parentesco"><input value={f.parentesco_familiar} onChange={(e) => set('parentesco_familiar', e.target.value)} className={inp} /></Campo>
              <Campo label="Cargo que ocupa el familiar"><input value={f.cargo_familiar} onChange={(e) => set('cargo_familiar', e.target.value)} className={inp} /></Campo>
            </>
          )}
        </Bloque>

        <Bloque titulo="3. Información del cónyuge">
          <Campo label="Primer apellido"><input value={f.conyuge_primer_apellido} onChange={(e) => set('conyuge_primer_apellido', e.target.value)} className={inp} /></Campo>
          <Campo label="Segundo apellido"><input value={f.conyuge_segundo_apellido} onChange={(e) => set('conyuge_segundo_apellido', e.target.value)} className={inp} /></Campo>
          <Campo label="Nombres"><input value={f.conyuge_nombres} onChange={(e) => set('conyuge_nombres', e.target.value)} className={inp} /></Campo>
          <Campo label="N° de identificación"><input value={f.conyuge_identificacion} onChange={(e) => set('conyuge_identificacion', e.target.value)} className={inp} /></Campo>
          <Campo label="Tipo de documento">
            <select value={f.conyuge_tipo_documento} onChange={(e) => set('conyuge_tipo_documento', e.target.value)} className={inp}>
              <option value="">—</option>
              {['CC', 'CE', 'PEP', 'PA', 'OTRO'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Teléfono fijo o celular"><input value={f.conyuge_telefono} onChange={(e) => set('conyuge_telefono', e.target.value)} className={inp} /></Campo>
          <Campo label="Ocupación"><input value={f.conyuge_ocupacion} onChange={(e) => set('conyuge_ocupacion', e.target.value)} className={inp} /></Campo>
          <Campo label="Empleador"><input value={f.conyuge_empleador} onChange={(e) => set('conyuge_empleador', e.target.value)} className={inp} /></Campo>
          <Campo label="Parentesco"><input value={f.conyuge_parentesco} onChange={(e) => set('conyuge_parentesco', e.target.value)} className={inp} /></Campo>
        </Bloque>

        <Bloque titulo="4. Información financiera">
          <Campo label="¿Realiza operaciones en moneda extranjera?">
            <select value={f.realiza_operaciones_moneda_extranjera} onChange={(e) => set('realiza_operaciones_moneda_extranjera', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          {esSi('realiza_operaciones_moneda_extranjera') && (
            <Campo label="Especifique"><input value={f.operaciones_moneda_extranjera_detalle} onChange={(e) => set('operaciones_moneda_extranjera_detalle', e.target.value)} className={inp} /></Campo>
          )}
          <Campo label="¿Posee productos financieros en el extranjero?">
            <select value={f.posee_productos_financieros_extranjero} onChange={(e) => set('posee_productos_financieros_extranjero', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          {esSi('posee_productos_financieros_extranjero') && (
            <Campo label="Especifique"><input value={f.productos_financieros_extranjero_detalle} onChange={(e) => set('productos_financieros_extranjero_detalle', e.target.value)} className={inp} /></Campo>
          )}
          <Campo label="¿Realiza alguna actividad que genere ingresos adicionales?">
            <select value={f.realiza_actividad_ingresos_adicionales} onChange={(e) => set('realiza_actividad_ingresos_adicionales', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          {esSi('realiza_actividad_ingresos_adicionales') && (
            <Campo label="Observaciones"><input value={f.ingresos_adicionales_observaciones} onChange={(e) => set('ingresos_adicionales_observaciones', e.target.value)} className={inp} /></Campo>
          )}
        </Bloque>

        <Bloque titulo="5. Persona Expuesta Políticamente (PEP)">
          <Campo label="¿Posee reconocimiento público?">
            <select value={f.posee_reconocimiento_publico} onChange={(e) => set('posee_reconocimiento_publico', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          <Campo label="¿Posee vínculo con una persona públicamente expuesta?">
            <select value={f.posee_vinculo_pep} onChange={(e) => set('posee_vinculo_pep', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          {esSi('posee_vinculo_pep') && (
            <div className="sm:col-span-2 space-y-2">
              <p className="text-[11px] font-medium text-text-muted">Personas vinculadas (PEP)</p>
              {pep.map((v, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-5 gap-2 items-center">
                  <input placeholder="Nombre" value={v.nombre} onChange={(e) => setPep((s) => s.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} className={inp} />
                  <input placeholder="Relación" value={v.relacion} onChange={(e) => setPep((s) => s.map((x, j) => (j === i ? { ...x, relacion: e.target.value } : x)))} className={inp} />
                  <input placeholder="Identidad" value={v.identidad} onChange={(e) => setPep((s) => s.map((x, j) => (j === i ? { ...x, identidad: e.target.value } : x)))} className={inp} />
                  <input placeholder="Cargo u ocupación" value={v.cargo_ocupacion} onChange={(e) => setPep((s) => s.map((x, j) => (j === i ? { ...x, cargo_ocupacion: e.target.value } : x)))} className={inp} />
                  <div className="flex gap-1 items-center">
                    <input type="date" value={v.fecha_desvinculacion} onChange={(e) => setPep((s) => s.map((x, j) => (j === i ? { ...x, fecha_desvinculacion: e.target.value } : x)))} className={inp} />
                    <button type="button" onClick={() => setPep((s) => s.filter((_, j) => j !== i))} className="shrink-0 text-text-subtle hover:text-danger-700"><Trash2 size={15} /></button>
                  </div>
                </div>
              ))}
              {pep.length < 4 && (
                <button type="button" onClick={() => setPep((s) => [...s, { nombre: '', relacion: '', identidad: '', cargo_ocupacion: '', fecha_desvinculacion: '' }])} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800">
                  <Plus size={13} /> Agregar vinculado
                </button>
              )}
            </div>
          )}
        </Bloque>

        <div>
          <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle mb-2.5">
            6. Declaraciones (cláusulas 5, 6 y 7)
          </p>
          <div className="space-y-2.5">
            <Declaracion checked={checks.anticorrupcion} onChange={(v) => setChecks((s) => ({ ...s, anticorrupcion: v }))}>
              Declaro que conozco y acepto la <strong>Política de Transparencia y Ética Empresarial</strong> (cláusulas anticorrupción y antisoborno transnacional) de la Organización Equitel.
            </Declaracion>
            <Declaracion checked={checks.origenes} onChange={(v) => setChecks((s) => ({ ...s, origenes: v }))}>
              Declaro que el <strong>origen de mis ingresos</strong> y recursos es lícito y no proviene de actividades ilícitas.
            </Declaracion>
            <Declaracion checked={checks.laft} onChange={(v) => setChecks((s) => ({ ...s, laft: v }))}>
              Conozco y acepto las <strong>políticas del Manual de Autocontrol y Gestión del Riesgo LA/FT</strong> (SAGRILAFT).
            </Declaracion>
          </div>
        </div>

        <div className="border-t border-slate-100 pt-5 space-y-3">
          <p className="text-[12px] font-medium text-text-body">Tu firma</p>
          <FirmaInput onChange={setFirma} />
          {err && <p className="text-[12px] text-danger-700">{err}</p>}
          <Button onClick={enviar} loading={enviando} disabled={enviando || !firma} variant="brand-primary" icon={<Check size={14} strokeWidth={2} />}>
            {enviando ? 'Enviando…' : 'Enviar y firmar Debida Diligencia'}
          </Button>
        </div>
      </div>
    </section>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-bold tracking-[0.08em] uppercase text-text-subtle mb-2.5">{titulo}</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{children}</div>
    </div>
  );
}

function Campo({ label, children, full }: { label: string; children: ReactNode; full?: boolean }) {
  return (
    <label className={`block ${full ? 'sm:col-span-2' : ''}`}>
      <span className="block text-[11px] font-medium text-text-muted mb-1">{label}</span>
      {children}
    </label>
  );
}

function Declaracion({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex gap-2.5 items-start cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-600" />
      <span className="text-[12px] text-text-body leading-[1.5]">{children}</span>
    </label>
  );
}
