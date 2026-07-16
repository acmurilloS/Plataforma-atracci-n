import { useState, type ReactNode } from 'react';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Check, Plus, Trash2 } from 'lucide-react';
import { auth, functions, storage } from '../../lib/firebase';
import { Button } from '../brand';
import { FirmaInput } from '../firma/FirmaInput';
import { estamparDatosBasicos, type DatosBasicosEstampado } from '../../utils/estamparDatosBasicos';

const inp =
  'w-full rounded-lg bg-white border border-slate-300 px-3 py-2 text-[13px] text-text-strong focus:outline-none focus:border-brand-500';

interface Props {
  token: string;
  cedula: string;
  empresaNombre: string;
  nombreCompleto: string;
  documentoNumero: string;
  yaEnviado: boolean;
  /** URL del PDF oficial firmado, para descargar (B12). */
  firmaUrl?: string;
}

interface Contacto {
  nombre: string;
  telefono: string;
}
interface HijoForm {
  nombre: string;
  fecha_nacimiento: string;
}

function splitNombre(full: string): { nombres: string; apellidos: string } {
  const w = (full || '').trim().split(/\s+/).filter(Boolean);
  if (w.length >= 4) return { nombres: w.slice(0, w.length - 2).join(' '), apellidos: w.slice(-2).join(' ') };
  if (w.length === 3) return { nombres: w[0], apellidos: w.slice(1).join(' ') };
  if (w.length === 2) return { nombres: w[0], apellidos: w[1] };
  return { nombres: full || '', apellidos: '' };
}

function aEstampado(
  f: Record<string, string>,
  emerg: Contacto[],
  hijos: HijoForm[],
  empresaNombre: string,
): DatosBasicosEstampado {
  const [na, nm, nd] = (f.fecha_nacimiento || '').split('-');
  return {
    tipo_contratacion: f.tipo_contratacion,
    empresa: empresaNombre,
    nombres: f.nombres,
    apellidos: f.apellidos,
    documento_numero: f.documento_numero,
    documento_ciudad_dpto: [f.documento_ciudad_expedicion, f.documento_dpto_expedicion]
      .filter(Boolean)
      .join(' / '),
    direccion: f.direccion,
    telefono_fijo: f.telefono_fijo,
    barrio: f.barrio,
    ciudad_domicilio: f.ciudad_domicilio,
    celular: f.celular,
    fecha_nac_aa: na,
    fecha_nac_mm: nm,
    fecha_nac_dd: nd,
    lugar_nacimiento: f.lugar_nacimiento,
    estado_civil: f.estado_civil,
    profesion: f.profesion_actividad,
    genero: f.genero,
    rh: f.grupo_sanguineo,
    alergico_a: f.alergico_a,
    dependiente_medicamento: f.dependiente_medicamento,
    libreta_numero: f.libreta_militar_numero,
    libreta_clase: f.libreta_militar_clase,
    correo: f.correo_electronico,
    cuenta_banco: f.cuenta_banco_numero,
    entidad_bancaria: f.entidad_bancaria,
    afp: f.fondo_pensiones_obligatorias,
    eps: f.entidad_promotora_salud,
    cesantias: f.fondo_cesantias,
    conyuge_nombre: f.conyuge_nombre,
    conyuge_doc: f.conyuge_documento,
    conyuge_profesion: f.conyuge_profesion_actividad,
    conyuge_fecha: (f.conyuge_fecha_nacimiento || '').split('-').reverse().join('/'),
    hijos: hijos.map((h) => {
      const [a, m, d] = (h.fecha_nacimiento || '').split('-');
      return { nombre: h.nombre, aa: a, mm: m, dd: d };
    }),
    emerg1_nombre: emerg[0].nombre,
    emerg1_tel: emerg[0].telefono,
    emerg2_nombre: emerg[1].nombre,
    emerg2_tel: emerg[1].telefono,
    talla_calzado: f.talla_calzado,
    talla_pantalon: f.talla_pantalon,
    talla_chaleco: f.talla_chaleco,
    talla_guantes: f.talla_guantes,
    talla_overol: f.talla_overol,
    talla_camisa: f.talla_camisa_blusa,
    talla_otros: f.talla_otros,
    observaciones: f.observaciones,
    tiene_familiares: f.tiene_familiares_organizacion === 'si' ? 'si' : 'no',
    nombre_familiar: f.nombre_familiar_organizacion,
    fecha_firma: new Date().toLocaleDateString('es-CO'),
  };
}

/**
 * DatosBasicosPortalCard · el INTEGRANTE diligencia y firma sus Datos Básicos
 * (DGH-F-05) desde su portal (reu 26-jun). Genera el PDF oficial estampado y lo
 * envía a la callable registrarDatosBasicosPortal (token + cédula).
 */
export function DatosBasicosPortalCard({
  token,
  cedula,
  empresaNombre,
  nombreCompleto,
  documentoNumero,
  yaEnviado,
  firmaUrl,
}: Props) {
  const ini = splitNombre(nombreCompleto);
  const [f, setF] = useState<Record<string, string>>({
    tipo_contratacion: 'directo',
    nombres: ini.nombres,
    apellidos: ini.apellidos,
    documento_tipo: 'CC',
    documento_numero: documentoNumero || '',
    documento_ciudad_expedicion: '',
    documento_dpto_expedicion: '',
    direccion: '',
    barrio: '',
    ciudad_domicilio: '',
    telefono_fijo: '',
    celular: '',
    fecha_nacimiento: '',
    lugar_nacimiento: '',
    estado_civil: '',
    profesion_actividad: '',
    genero: '',
    grupo_sanguineo: '',
    alergico_a: '',
    dependiente_medicamento: '',
    libreta_militar_numero: '',
    libreta_militar_clase: '',
    correo_electronico: '',
    cuenta_banco_numero: '',
    entidad_bancaria: '',
    fondo_pensiones_obligatorias: '',
    entidad_promotora_salud: '',
    fondo_cesantias: '',
    conyuge_nombre: '',
    conyuge_documento: '',
    conyuge_profesion_actividad: '',
    conyuge_fecha_nacimiento: '',
    observaciones: '',
    tiene_familiares_organizacion: 'no',
    nombre_familiar_organizacion: '',
    talla_calzado: '',
    talla_pantalon: '',
    talla_chaleco: '',
    talla_guantes: '',
    talla_overol: '',
    talla_camisa_blusa: '',
    talla_otros: '',
  });
  const [emerg, setEmerg] = useState<Contacto[]>([
    { nombre: '', telefono: '' },
    { nombre: '', telefono: '' },
  ]);
  const [hijos, setHijos] = useState<HijoForm[]>([]);
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = (k: string, v: string) => setF((s) => ({ ...s, [k]: v }));

  async function enviar() {
    if (!f.nombres.trim() || !f.apellidos.trim() || !f.documento_numero.trim()) {
      setErr('Nombres, apellidos y número de documento son obligatorios.');
      return;
    }
    if (!firma) {
      setErr('Dibuja tu firma para continuar.');
      return;
    }
    setEnviando(true);
    setErr(null);
    try {
      const estampado = aEstampado(f, emerg, hijos, empresaNombre);
      const blob = await estamparDatosBasicos(estampado, firma);
      const ts = Date.now();
      const rPdf = storageRef(storage, `portal_docs/${token}/datos_basicos_${ts}.pdf`);
      await uploadBytes(rPdf, blob, {
        contentType: 'application/pdf',
        customMetadata: { uploaderUid: auth.currentUser?.uid ?? '' },
      });
      const pdfUrl = await getDownloadURL(rPdf);
      const imgBlob = await (await fetch(firma)).blob();
      const rImg = storageRef(storage, `portal_docs/${token}/datos_basicos_firma_${ts}.png`);
      await uploadBytes(rImg, imgBlob, {
        contentType: 'image/png',
        customMetadata: { uploaderUid: auth.currentUser?.uid ?? '' },
      });
      const firmaImgUrl = await getDownloadURL(rImg);

      const datos = {
        ...f,
        emergencia_contacto_1: emerg[0],
        emergencia_contacto_2: emerg[1],
        tiene_familiares_organizacion: f.tiene_familiares_organizacion === 'si',
        hijos,
      };
      const fn = httpsCallable(functions, 'registrarDatosBasicosPortal');
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
          Datos Básicos enviados
        </span>
        <p className="mt-3 text-[13px] text-text-muted leading-[1.55]">
          Ya diligenciaste y firmaste tus Datos Básicos. El equipo de Atracción los revisará. Si
          necesitas corregir algo, escríbenos por la pestaña ¿Dudas?.
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
          Datos Básicos del Integrante
        </h2>
        <p className="text-[11px] text-text-muted mt-0.5">
          Diligéncialos para tu vinculación. Empresa: <strong>{empresaNombre || '—'}</strong>.
        </p>
      </div>

      <div className="px-5 sm:px-7 py-5 space-y-6">
        <Bloque titulo="Tipo de contratación">
          <Campo label="Tipo de contratación">
            <select value={f.tipo_contratacion} onChange={(e) => set('tipo_contratacion', e.target.value)} className={inp}>
              <option value="directo">Directo</option>
              <option value="temporal">Temporal</option>
            </select>
          </Campo>
        </Bloque>

        <Bloque titulo="1. Información personal">
          <Campo label="Nombres"><input value={f.nombres} onChange={(e) => set('nombres', e.target.value)} className={inp} /></Campo>
          <Campo label="Apellidos"><input value={f.apellidos} onChange={(e) => set('apellidos', e.target.value)} className={inp} /></Campo>
          <Campo label="Tipo de documento">
            <select value={f.documento_tipo} onChange={(e) => set('documento_tipo', e.target.value)} className={inp}>
              {['CC', 'CE', 'PEP', 'PA', 'NIT'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Número de documento"><input value={f.documento_numero} onChange={(e) => set('documento_numero', e.target.value)} className={inp} /></Campo>
          <Campo label="Ciudad de expedición"><input value={f.documento_ciudad_expedicion} onChange={(e) => set('documento_ciudad_expedicion', e.target.value)} className={inp} /></Campo>
          <Campo label="Departamento de expedición"><input value={f.documento_dpto_expedicion} onChange={(e) => set('documento_dpto_expedicion', e.target.value)} className={inp} /></Campo>
          <Campo label="Dirección de domicilio" full><input value={f.direccion} onChange={(e) => set('direccion', e.target.value)} className={inp} /></Campo>
          <Campo label="Barrio"><input value={f.barrio} onChange={(e) => set('barrio', e.target.value)} className={inp} /></Campo>
          <Campo label="Ciudad de domicilio"><input value={f.ciudad_domicilio} onChange={(e) => set('ciudad_domicilio', e.target.value)} className={inp} /></Campo>
          <Campo label="Teléfono fijo"><input value={f.telefono_fijo} onChange={(e) => set('telefono_fijo', e.target.value)} className={inp} /></Campo>
          <Campo label="Celular"><input value={f.celular} onChange={(e) => set('celular', e.target.value)} className={inp} /></Campo>
          <Campo label="Fecha de nacimiento"><input type="date" value={f.fecha_nacimiento} onChange={(e) => set('fecha_nacimiento', e.target.value)} className={inp} /></Campo>
          <Campo label="Lugar de nacimiento"><input value={f.lugar_nacimiento} onChange={(e) => set('lugar_nacimiento', e.target.value)} className={inp} /></Campo>
          <Campo label="Estado civil">
            <select value={f.estado_civil} onChange={(e) => set('estado_civil', e.target.value)} className={inp}>
              <option value="">—</option>
              {['soltero', 'casado', 'union_libre', 'separado', 'divorciado', 'viudo'].map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
          </Campo>
          <Campo label="Profesión / actividad actual" full><input value={f.profesion_actividad} onChange={(e) => set('profesion_actividad', e.target.value)} className={inp} /></Campo>
          <Campo label="Género">
            <select value={f.genero} onChange={(e) => set('genero', e.target.value)} className={inp}>
              <option value="">—</option>
              <option value="masculino">Masculino</option>
              <option value="femenino">Femenino</option>
            </select>
          </Campo>
          <Campo label="Grupo sanguíneo (RH)">
            <select value={f.grupo_sanguineo} onChange={(e) => set('grupo_sanguineo', e.target.value)} className={inp}>
              <option value="">—</option>
              {['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-'].map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Alérgico a"><input value={f.alergico_a} onChange={(e) => set('alergico_a', e.target.value)} className={inp} /></Campo>
          <Campo label="¿Dependiente de algún medicamento?"><input value={f.dependiente_medicamento} onChange={(e) => set('dependiente_medicamento', e.target.value)} className={inp} /></Campo>
          <Campo label="# Libreta militar"><input value={f.libreta_militar_numero} onChange={(e) => set('libreta_militar_numero', e.target.value)} className={inp} /></Campo>
          <Campo label="Clase (libreta militar)"><input value={f.libreta_militar_clase} onChange={(e) => set('libreta_militar_clase', e.target.value)} className={inp} /></Campo>
          <Campo label="Correo electrónico" full><input value={f.correo_electronico} onChange={(e) => set('correo_electronico', e.target.value)} className={inp} /></Campo>
        </Bloque>

        <Bloque titulo="2. Información laboral">
          <Campo label="Cuenta de banco No."><input value={f.cuenta_banco_numero} onChange={(e) => set('cuenta_banco_numero', e.target.value)} className={inp} /></Campo>
          <Campo label="Entidad bancaria"><input value={f.entidad_bancaria} onChange={(e) => set('entidad_bancaria', e.target.value)} className={inp} /></Campo>
          <Campo label="Fondo de pensiones (AFP)"><input value={f.fondo_pensiones_obligatorias} onChange={(e) => set('fondo_pensiones_obligatorias', e.target.value)} className={inp} /></Campo>
          <Campo label="EPS"><input value={f.entidad_promotora_salud} onChange={(e) => set('entidad_promotora_salud', e.target.value)} className={inp} /></Campo>
          <Campo label="Fondo de cesantías"><input value={f.fondo_cesantias} onChange={(e) => set('fondo_cesantias', e.target.value)} className={inp} /></Campo>
          <p className="text-[11px] text-text-subtle sm:col-span-2">Caja de compensación, ARL y riesgo (%) los completa Gestión Humana.</p>
        </Bloque>

        <Bloque titulo="3. Información familiar">
          <Campo label="Nombre del cónyuge"><input value={f.conyuge_nombre} onChange={(e) => set('conyuge_nombre', e.target.value)} className={inp} /></Campo>
          <Campo label="Documento del cónyuge"><input value={f.conyuge_documento} onChange={(e) => set('conyuge_documento', e.target.value)} className={inp} /></Campo>
          <Campo label="Profesión / actividad del cónyuge"><input value={f.conyuge_profesion_actividad} onChange={(e) => set('conyuge_profesion_actividad', e.target.value)} className={inp} /></Campo>
          <Campo label="Fecha de nacimiento del cónyuge"><input type="date" value={f.conyuge_fecha_nacimiento} onChange={(e) => set('conyuge_fecha_nacimiento', e.target.value)} className={inp} /></Campo>
          <div className="sm:col-span-2 space-y-2">
            <p className="text-[11px] font-medium text-text-muted">Hijos</p>
            {hijos.map((h, i) => (
              <div key={i} className="flex gap-2 items-center">
                <input placeholder="Nombre" value={h.nombre} onChange={(e) => setHijos((s) => s.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} className={inp} />
                <input type="date" value={h.fecha_nacimiento} onChange={(e) => setHijos((s) => s.map((x, j) => (j === i ? { ...x, fecha_nacimiento: e.target.value } : x)))} className={inp} />
                <button type="button" onClick={() => setHijos((s) => s.filter((_, j) => j !== i))} className="shrink-0 text-text-subtle hover:text-danger-700"><Trash2 size={15} /></button>
              </div>
            ))}
            {hijos.length < 5 && (
              <button type="button" onClick={() => setHijos((s) => [...s, { nombre: '', fecha_nacimiento: '' }])} className="inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:text-brand-800">
                <Plus size={13} /> Agregar hijo
              </button>
            )}
          </div>
        </Bloque>

        <Bloque titulo="4. En caso de emergencia avisar a">
          {[0, 1].map((i) => (
            <Campo key={i} label={`Contacto ${i + 1}`} full>
              <div className="flex gap-2">
                <input placeholder="Nombre" value={emerg[i].nombre} onChange={(e) => setEmerg((s) => s.map((x, j) => (j === i ? { ...x, nombre: e.target.value } : x)))} className={inp} />
                <input placeholder="Teléfono" value={emerg[i].telefono} onChange={(e) => setEmerg((s) => s.map((x, j) => (j === i ? { ...x, telefono: e.target.value } : x)))} className={inp} />
              </div>
            </Campo>
          ))}
        </Bloque>

        <Bloque titulo="5. Dotación · tallajes">
          <Campo label="No. calzado"><input value={f.talla_calzado} onChange={(e) => set('talla_calzado', e.target.value)} className={inp} /></Campo>
          <Campo label="Pantalón"><input value={f.talla_pantalon} onChange={(e) => set('talla_pantalon', e.target.value)} className={inp} /></Campo>
          <Campo label="Chaleco"><input value={f.talla_chaleco} onChange={(e) => set('talla_chaleco', e.target.value)} className={inp} /></Campo>
          <Campo label="Guantes"><input value={f.talla_guantes} onChange={(e) => set('talla_guantes', e.target.value)} className={inp} /></Campo>
          <Campo label="Overol"><input value={f.talla_overol} onChange={(e) => set('talla_overol', e.target.value)} className={inp} /></Campo>
          <Campo label="Camisa / blusa"><input value={f.talla_camisa_blusa} onChange={(e) => set('talla_camisa_blusa', e.target.value)} className={inp} /></Campo>
          <Campo label="Otros"><input value={f.talla_otros} onChange={(e) => set('talla_otros', e.target.value)} className={inp} /></Campo>
        </Bloque>

        <Bloque titulo="6. Observaciones">
          <Campo label="Observaciones" full><textarea value={f.observaciones} onChange={(e) => set('observaciones', e.target.value)} rows={2} className={`${inp} resize-y`} /></Campo>
          <Campo label="¿Tiene familiares en la organización?">
            <select value={f.tiene_familiares_organizacion} onChange={(e) => set('tiene_familiares_organizacion', e.target.value)} className={inp}>
              <option value="no">No</option>
              <option value="si">Sí</option>
            </select>
          </Campo>
          <Campo label="Nombre del familiar"><input value={f.nombre_familiar_organizacion} onChange={(e) => set('nombre_familiar_organizacion', e.target.value)} className={inp} /></Campo>
        </Bloque>

        <div className="border-t border-slate-100 pt-5 space-y-3">
          <p className="text-[12px] font-medium text-text-body">Tu firma</p>
          <FirmaInput onChange={setFirma} />
          {err && <p className="text-[12px] text-danger-700">{err}</p>}
          <Button onClick={enviar} loading={enviando} disabled={enviando || !firma} variant="brand-primary" icon={<Check size={14} strokeWidth={2} />}>
            {enviando ? 'Enviando…' : 'Enviar y firmar Datos Básicos'}
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
