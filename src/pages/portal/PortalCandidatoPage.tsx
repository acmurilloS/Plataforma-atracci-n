import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { Check, Loader2, ShieldCheck } from 'lucide-react';
import { auth, functions } from '../../lib/firebase';
import { EquitelLogo } from '../../components/EquitelLogo';
import { Button } from '../../components/brand';
import {
  CuerpoConsentimiento,
  empresaConsentimiento,
  tituloConsentimiento,
} from '../../components/consentimientos/consentimientoLegal';

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

  async function aceptar(tipo: 'datos' | 'imagen') {
    if (!token) return;
    const fn = httpsCallable<{ token: string; tipo: string }, { ok: true }>(
      functions,
      'registrarConsentimientoPortal',
    );
    await fn({ token, tipo });
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
          empresa={empresa}
          nombreCompleto={data.candidato_nombre}
          documentoNumero={data.documento_numero}
          aceptado={data.consentimiento_datos_aceptado}
          onAceptar={() => aceptar('datos')}
        />
        <ConsentimientoCard
          tipo="imagen"
          empresa={empresa}
          nombreCompleto={data.candidato_nombre}
          documentoNumero={data.documento_numero}
          aceptado={data.consentimiento_imagen_aceptado}
          onAceptar={() => aceptar('imagen')}
        />

        <footer className="pt-2 text-center text-[11px] text-text-subtle">
          {empresa.nombre} · NIT {empresa.nit} · Plataforma de Atracción
        </footer>
      </div>
    </div>
  );
}

function ConsentimientoCard({
  tipo,
  empresa,
  nombreCompleto,
  documentoNumero,
  aceptado,
  onAceptar,
}: {
  tipo: 'datos' | 'imagen';
  empresa: ReturnType<typeof empresaConsentimiento>;
  nombreCompleto: string;
  documentoNumero: string;
  aceptado: boolean;
  onAceptar: () => Promise<void>;
}) {
  const [chk, setChk] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmar() {
    setEnviando(true);
    setErr(null);
    try {
      await onAceptar();
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
          {err && <p className="text-[12px] text-danger-700">{err}</p>}
          <Button
            onClick={confirmar}
            disabled={!chk || enviando}
            loading={enviando}
            variant="brand-primary"
            icon={<Check size={14} strokeWidth={2} />}
          >
            {enviando ? 'Registrando…' : 'Aceptar'}
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
