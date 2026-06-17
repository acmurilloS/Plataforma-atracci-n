import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { Check, FileText, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { auth, functions, storage } from '../../lib/firebase';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button } from '../../components/brand';
import {
  CuerpoConsentimiento,
  empresaConsentimiento,
  tituloConsentimiento,
} from '../../components/consentimientos/consentimientoLegal';
import { FirmaCanvas } from '../../components/firma/FirmaCanvas';
import { generarConstanciaFirma } from '../../utils/pdfFirma';

/**
 * PortalCandidatoPage · portal público del candidato (sin login).
 *
 * Se llega por `/portal/:token` desde el link que el analista le manda al
 * candidato por correo. El candidato lee y ACEPTA el tratamiento de datos y el
 * acuerdo de imagen y voz por sí mismo; queda registrado con fecha + evidencia.
 *
 * No usa Firestore directo (el candidato no tiene permisos): todo va por las
 * callables `resolverPortalToken` y `registrarConsentimientoPortal`.
 */

interface PortalData {
  candidato_nombre: string;
  documento_numero: string;
  cargo_nombre: string;
  empresa_codigo: string;
  consentimiento_datos_aceptado: boolean;
  consentimiento_imagen_aceptado: boolean;
  estado: string;
  documentos: { nombre: string; url: string }[];
}

type ResolverResp = { encontrado: false } | ({ encontrado: true } & PortalData);

export default function PortalCandidatoPage() {
  const { token } = useParams<{ token: string }>();
  const [authReady, setAuthReady] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [data, setData] = useState<PortalData | null>(null);
  const [noValido, setNoValido] = useState(false);

  // Auth anónima (el candidato no tiene cuenta real).
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        try {
          await signInAnonymously(auth);
        } catch (e) {
          console.error('Anon sign-in falló:', e);
        }
      }
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Resolver el token a los datos del portal + estado de consentimientos.
  useEffect(() => {
    if (!authReady || !token) return;
    (async () => {
      try {
        const fn = httpsCallable<{ token: string }, ResolverResp>(functions, 'resolverPortalToken');
        const res = await fn({ token });
        if (res.data.encontrado) {
          const { encontrado: _e, ...rest } = res.data;
          void _e;
          setData(rest);
        } else {
          setNoValido(true);
        }
      } catch (e) {
        console.error('resolverPortalToken falló:', e);
        setNoValido(true);
      } finally {
        setCargando(false);
      }
    })();
  }, [authReady, token]);

  async function aceptar(tipo: 'datos' | 'imagen', firmaUrl: string) {
    if (!token) return;
    const fn = httpsCallable<{ token: string; tipo: string; firma_url?: string }, { ok: true }>(
      functions,
      'registrarConsentimientoPortal',
    );
    await fn({ token, tipo, firma_url: firmaUrl });
    setData((d) =>
      d
        ? {
            ...d,
            ...(tipo === 'datos'
              ? { consentimiento_datos_aceptado: true }
              : { consentimiento_imagen_aceptado: true }),
          }
        : d,
    );
  }

  if (cargando) {
    return (
      <Centro>
        <Loader2 className="animate-spin text-brand-600" size={26} strokeWidth={1.75} />
        <p className="mt-3 text-[13px] text-text-muted">Cargando tu portal…</p>
      </Centro>
    );
  }

  if (noValido || !data) {
    return (
      <Centro>
        <ShieldCheck className="text-text-subtle" size={28} strokeWidth={1.5} />
        <p className="mt-3 text-[15px] font-medium text-text-strong">Este enlace no es válido</p>
        <p className="mt-1 text-[13px] text-text-muted max-w-sm">
          El link pudo expirar o estar incompleto. Escríbele a la persona de Atracción que te
          contactó para que te reenvíe tu portal.
        </p>
      </Centro>
    );
  }

  const empresa = empresaConsentimiento(data.empresa_codigo);
  const primerNombre = data.candidato_nombre.split(' ')[0] || data.candidato_nombre;
  const ambosAceptados =
    data.consentimiento_datos_aceptado && data.consentimiento_imagen_aceptado;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-5 py-10 sm:py-14 space-y-7">
        {/* Encabezado */}
        <header className="flex items-center gap-3">
          <EquitelLogo size={44} />
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-semibold">
              Portal del candidato
            </p>
            <p className="text-[13px] text-text-muted">Organización Equitel</p>
          </div>
        </header>

        <div>
          <h1 className="text-[26px] sm:text-[30px] font-light leading-[1.15] tracking-[-0.02em] text-text-strong">
            Hola {primerNombre} 👋
          </h1>
          <p className="mt-2 text-[14px] text-text-muted leading-[1.55]">
            Estás en tu proceso para el cargo <strong>{data.cargo_nombre}</strong>. Para continuar,
            por favor lee y acepta los siguientes dos documentos. Quedan registrados con la fecha de
            tu aceptación — no tienes que imprimir ni firmar nada a mano.
          </p>
        </div>

        <EstadoProceso estado={data.estado} />

        {ambosAceptados && (
          <div className="rounded-lg border border-success-500/25 bg-success-50 px-4 py-3 flex items-start gap-2.5">
            <Check size={16} strokeWidth={2} className="text-success-700 mt-0.5 shrink-0" />
            <p className="text-[13px] text-success-800 leading-[1.5]">
              ¡Listo! Aceptaste los dos documentos. Puedes cerrar esta página; el equipo de Atracción
              continuará con tu proceso.
            </p>
          </div>
        )}

        <ConsentimientoCard
          tipo="datos"
          token={token ?? ''}
          empresa={empresa}
          nombreCompleto={data.candidato_nombre}
          documentoNumero={data.documento_numero}
          aceptado={data.consentimiento_datos_aceptado}
          onAceptar={(url) => aceptar('datos', url)}
        />
        <ConsentimientoCard
          tipo="imagen"
          token={token ?? ''}
          empresa={empresa}
          nombreCompleto={data.candidato_nombre}
          documentoNumero={data.documento_numero}
          aceptado={data.consentimiento_imagen_aceptado}
          onAceptar={(url) => aceptar('imagen', url)}
        />

        <SubirDocumentos token={token ?? ''} iniciales={data.documentos} />

        <footer className="pt-2 text-center text-[11px] text-text-subtle">
          {empresa.nombre} · NIT {empresa.nit} · Plataforma de Atracción
        </footer>
      </div>
    </div>
  );
}

function ConsentimientoCard({
  tipo,
  token,
  empresa,
  nombreCompleto,
  documentoNumero,
  aceptado,
  onAceptar,
}: {
  tipo: 'datos' | 'imagen';
  token: string;
  empresa: ReturnType<typeof empresaConsentimiento>;
  nombreCompleto: string;
  documentoNumero: string;
  aceptado: boolean;
  onAceptar: (firmaUrl: string) => Promise<void>;
}) {
  const [chk, setChk] = useState(false);
  const [firma, setFirma] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmar() {
    if (!firma || !token) return;
    setEnviando(true);
    setErr(null);
    try {
      const blob = await generarConstanciaFirma({
        titulo: tituloConsentimiento(tipo),
        nombre: nombreCompleto || 'Candidato',
        documentoIdentidad: documentoNumero || '—',
        fechaTexto: new Date().toLocaleDateString('es-CO'),
        firmaPngDataUrl: firma,
        empresaNombre: empresa.nombre,
      });
      const r = storageRef(storage, `portal_docs/${token}/firma_${tipo}_${Date.now()}.pdf`);
      await uploadBytes(r, blob, { contentType: 'application/pdf' });
      const url = await getDownloadURL(r);
      await onAceptar(url);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'No se pudo registrar. Reintenta.');
    } finally {
      setEnviando(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
            {tituloConsentimiento(tipo)}
          </h2>
          <p className="text-[11px] text-text-muted mt-0.5">Ley 1581 de 2012 · Decreto 1377 de 2013</p>
        </div>
        {aceptado && (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium text-success-700 bg-success-50 border border-success-500/25 rounded-full px-2.5 py-1">
            <Check size={13} strokeWidth={2} />
            Aceptado
          </span>
        )}
      </div>

      <div className="px-5 sm:px-7 py-5 text-[13px] leading-relaxed text-text-strong max-h-[340px] overflow-y-auto">
        <CuerpoConsentimiento
          tipo={tipo}
          empresa={empresa}
          nombreCompleto={nombreCompleto}
          documentoNumero={documentoNumero}
          documentoCiudad=""
        />
      </div>

      {!aceptado && (
        <div className="px-5 sm:px-7 py-4 border-t border-slate-100 bg-slate-50/50 space-y-3">
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={chk}
              onChange={(e) => setChk(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            <span className="text-[13px] text-text-body leading-[1.5]">
              He leído y <strong>acepto</strong> este documento.
            </span>
          </label>
          <div>
            <p className="text-[12px] font-medium text-text-body mb-1">Tu firma</p>
            <FirmaCanvas onChange={setFirma} />
          </div>
          {err && <p className="text-[12px] text-danger-700">{err}</p>}
          <Button
            onClick={confirmar}
            disabled={!chk || !firma || enviando}
            loading={enviando}
            variant="brand-primary"
            icon={<Check size={14} strokeWidth={2} />}
          >
            {enviando ? 'Firmando…' : 'Aceptar y firmar'}
          </Button>
        </div>
      )}
    </section>
  );
}

function Centro({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center px-6 text-center">
      {children}
    </div>
  );
}

/** Traduce el estado interno de la postulación a un mensaje amable para el candidato. */
function estadoAmigable(estado: string): { texto: string; tono: 'success' | 'info' | 'neutral' } {
  if (estado === 'contratado')
    return { texto: '¡Felicitaciones! Tu proceso culminó con tu contratación 🎉', tono: 'success' };
  if (estado === 'en_contratacion')
    return { texto: 'Estás en proceso de contratación.', tono: 'success' };
  if (estado === 'en_examenes_medicos')
    return { texto: 'Estás en la etapa de exámenes médicos.', tono: 'info' };
  if (estado === 'en_terna' || estado === 'seleccionado_por_lider')
    return { texto: 'Tu perfil está en revisión final con el líder.', tono: 'info' };
  if (
    [
      'descartado_examenes_medicos',
      'descartado_por_lider',
      'filtrado_no_cumple',
      'pre_entrevistado_no_interesado',
      'desistio_candidato',
    ].includes(estado)
  )
    return {
      texto: 'Tu proceso para esta vacante ha finalizado. Gracias por participar.',
      tono: 'neutral',
    };
  if (!estado) return { texto: '', tono: 'neutral' };
  return {
    texto: 'Tu proceso está en marcha; el equipo de Atracción avanza con tu selección.',
    tono: 'info',
  };
}

function EstadoProceso({ estado }: { estado: string }) {
  const { texto, tono } = estadoAmigable(estado);
  if (!texto) return null;
  const clases =
    tono === 'success'
      ? 'border-success-500/25 bg-success-50 text-success-800'
      : tono === 'info'
        ? 'border-info-500/25 bg-info-50 text-info-700'
        : 'border-slate-200 bg-slate-50 text-text-body';
  return (
    <div className={`rounded-lg border px-4 py-3 ${clases}`}>
      <p className="text-[10px] uppercase tracking-[0.12em] font-semibold opacity-70">
        Estado de tu proceso
      </p>
      <p className="text-[14px] font-medium mt-0.5">{texto}</p>
    </div>
  );
}

function SubirDocumentos({
  token,
  iniciales,
}: {
  token: string;
  iniciales: { nombre: string; url: string }[];
}) {
  const [docs, setDocs] = useState(iniciales);
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !token) return;
    if (file.size > 10 * 1024 * 1024) {
      setErr('El archivo supera 10 MB. Comprímelo o súbelo en partes.');
      return;
    }
    setSubiendo(true);
    setErr(null);
    try {
      const ts = Date.now();
      const safe = file.name.replace(/[^\w.\-]+/g, '_');
      const r = storageRef(storage, `portal_docs/${token}/${ts}_${safe}`);
      await uploadBytes(r, file);
      const url = await getDownloadURL(r);
      const fn = httpsCallable<{ token: string; nombre_archivo: string; url: string }, { ok: true }>(
        functions,
        'registrarDocumentoPortal',
      );
      await fn({ token, nombre_archivo: file.name, url });
      setDocs((prev) => [...prev, { nombre: file.name, url }]);
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : 'No se pudo subir el archivo. Reintenta.');
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-brand-card overflow-hidden">
      <div className="px-5 sm:px-7 py-4 border-b border-slate-100">
        <h2 className="text-[16px] font-semibold tracking-[-0.01em] text-text-strong">
          Tus documentos
        </h2>
        <p className="text-[12px] text-text-muted mt-0.5">
          Sube aquí tu cédula, certificados y demás documentos que te pidan (PDF o foto legible).
        </p>
      </div>
      <div className="px-5 sm:px-7 py-5 space-y-3">
        {docs.length > 0 && (
          <ul className="space-y-1.5">
            {docs.map((d, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px] text-text-body">
                <FileText size={13} strokeWidth={1.75} className="text-text-subtle shrink-0" />
                <a
                  href={d.url}
                  target="_blank"
                  rel="noreferrer"
                  className="hover:text-brand-700 hover:underline truncate"
                >
                  {d.nombre}
                </a>
                <Check size={13} strokeWidth={2} className="text-success-700 shrink-0" />
              </li>
            ))}
          </ul>
        )}
        {err && <p className="text-[12px] text-danger-700">{err}</p>}
        <label
          className={`inline-flex items-center gap-2 rounded-md border border-dashed border-slate-300 px-4 py-2.5 text-[13px] font-medium cursor-pointer hover:bg-slate-50 ${
            subiendo ? 'opacity-60 pointer-events-none' : ''
          }`}
        >
          {subiendo ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Upload size={14} strokeWidth={1.75} />
          )}
          {subiendo ? 'Subiendo…' : 'Subir un documento'}
          <input
            type="file"
            accept="application/pdf,image/*"
            onChange={onFile}
            className="hidden"
            disabled={subiendo}
          />
        </label>
      </div>
    </section>
  );
}
