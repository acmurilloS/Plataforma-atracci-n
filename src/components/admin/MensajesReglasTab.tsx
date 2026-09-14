import { useEffect, useMemo, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { BellRing, Play, Save, Timer } from 'lucide-react';
import { db, functions } from '../../lib/firebase';
import { useAuth } from '../../hooks/useAuth';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { Button, Card } from '../../components/brand';
import { cn } from '../../utils/cn';
import {
  MAX_TEXTO_AVISO,
  MAX_TEXTO_RELOJ,
  MAX_TITULO_AVISO,
  VARIABLES_AVISO,
  VARIABLES_RELOJ,
  validarAvisoCompromiso,
  validarCamposReloj,
  validarRelojLider,
  variablesDesconocidas,
  type ConfigAvisoCompromisoDoc,
  type ConfigRelojLiderDoc,
  type ModoPlazoReloj,
} from '../../schemas';

/**
 * MensajesReglasTab · Admin → Catálogos → "Mensajes y reglas" (reu Karen 09-sep).
 *
 *  - Aviso de compromiso al candidato (punto 6): va en el correo de citación a
 *    entrevista y, opcional, en la tarjeta de la cita del portal.
 *  - Reloj del líder tras el Concepto (punto 7): plazo para dar la fecha de la
 *    entrevista, recordatorio y suspensión.
 *
 * Ambos quedan APAGADOS hasta que se encienden aquí con sus textos: sin eso no se
 * envía nada a nadie ni se pausa ninguna vacante. Solo admin (configuracion_global
 * se escribe con isAdmin). Los textos son planos: no se interpreta HTML.
 */

const inputClass = cn(
  'block w-full bg-slate-50 border border-slate-200 rounded-md',
  'px-3 py-2 text-[13px] text-text-strong placeholder:text-text-subtle',
  'transition-colors duration-150 ease-out',
  'focus:bg-white focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-300/40',
);

const EJEMPLO_AVISO = { nombre: 'Laura', cargo: 'Técnico' };
const EJEMPLO_RELOJ: Record<string, string> = {
  nombre: 'Juan',
  cargo: 'Técnico',
  consecutivo: 'CU-MED-1223',
  empresa: 'Cumandes',
  sede: 'Medellín',
  fecha_limite: '16/09/2026 16:00',
  horas: '48',
  link: 'https://ptm-atraccion.web.app/vacantes/…/concepto-atraccion',
};

function interpolarEjemplo(texto: string, vars: Record<string, string>): string {
  return texto.replace(/\{\{\s*(\w+)\s*\}\}/g, (_m, k: string) => vars[k] ?? `{{${k}}}`);
}

type Msg = { tipo: 'ok' | 'err'; texto: string } | null;

function Mensaje({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p
      className={cn(
        'text-[12px] rounded-md px-3 py-2 border',
        msg.tipo === 'ok'
          ? 'text-success-700 bg-success-50 border-success-500/25'
          : 'text-rose-700 bg-rose-50 border-rose-200',
      )}
    >
      {msg.texto}
    </p>
  );
}

function Variables({ lista }: { lista: readonly string[] }) {
  return (
    <p className="text-[11px] text-text-subtle mt-1">
      Variables:{' '}
      {lista.map((v) => (
        <code key={v} className="mr-1.5 rounded bg-slate-100 px-1 py-0.5 text-[10.5px] text-text-body">
          {`{{${v}}}`}
        </code>
      ))}
    </p>
  );
}

function AvisoDesconocidas({ texto, permitidas }: { texto: string; permitidas: readonly string[] }) {
  const malas = variablesDesconocidas(texto, permitidas);
  if (malas.length === 0) return null;
  return (
    <p className="text-[11px] text-warning-700 mt-1">
      Estas variables no existen y saldrían vacías: {malas.map((m) => `{{${m}}}`).join(', ')}
    </p>
  );
}

export function MensajesReglasTab() {
  return (
    <div className="max-w-3xl space-y-6">
      <AvisoCompromisoCard />
      <RelojLiderCard />
    </div>
  );
}

// ─── Aviso de compromiso al candidato ─────────────────────────────────────

function AvisoCompromisoCard() {
  const { user } = useAuth();
  const { doc: config } = useDoc<ConfigAvisoCompromisoDoc>('configuracion_global', 'aviso_compromiso');
  const [activo, setActivo] = useState(false);
  const [titulo, setTitulo] = useState('');
  const [texto, setTexto] = useState('');
  const [enAnalista, setEnAnalista] = useState(true);
  const [enLider, setEnLider] = useState(true);
  const [enPortal, setEnPortal] = useState(true);
  const [guardando, setGuardando] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    if (!config) return;
    setActivo(config.activo === true);
    setTitulo(config.titulo ?? '');
    setTexto(config.texto ?? '');
    setEnAnalista(config.en_entrevista_analista !== false);
    setEnLider(config.en_entrevista_lider !== false);
    setEnPortal(config.en_portal !== false);
  }, [config]);

  const estado = validarAvisoCompromiso(config);

  async function guardar() {
    if (!user) return;
    setMsg(null);
    const t = texto.trim();
    if (activo && !t) {
      setMsg({ tipo: 'err', texto: 'Para encenderlo escribe el texto del aviso.' });
      return;
    }
    if (t.length > MAX_TEXTO_AVISO || titulo.trim().length > MAX_TITULO_AVISO) {
      setMsg({ tipo: 'err', texto: 'El título o el texto superan el límite.' });
      return;
    }
    setGuardando(true);
    try {
      await setDoc(
        doc(db, 'configuracion_global', 'aviso_compromiso'),
        {
          id: 'aviso_compromiso',
          activo,
          titulo: titulo.trim(),
          texto: t,
          en_entrevista_analista: enAnalista,
          en_entrevista_lider: enLider,
          en_portal: enPortal,
          actualizado_en: serverTimestamp(),
          actualizado_por: user.uid,
        },
        { merge: true },
      );
      setMsg({ tipo: 'ok', texto: activo ? 'Guardado y encendido.' : 'Guardado (apagado).' });
    } catch (err) {
      setMsg({ tipo: 'err', texto: err instanceof Error ? err.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-center gap-2">
          <BellRing size={16} strokeWidth={1.75} className="text-brand-600" />
          <h2 className="text-[15px] font-semibold text-text-strong">Aviso de compromiso al candidato</h2>
        </div>
        <span
          className={cn(
            'text-[11px] font-semibold rounded-full px-2.5 py-0.5',
            estado.efectivo ? 'bg-success-50 text-success-700' : 'bg-slate-100 text-text-muted',
          )}
        >
          {estado.efectivo ? 'Se incluye en las citaciones' : `Apagado: ${estado.motivo}`}
        </span>
      </div>
      <p className="text-[12.5px] text-text-muted mb-4 leading-[1.5]">
        Se agrega automáticamente al correo de citación a entrevista que recibe el candidato (nunca al
        del líder) y, si lo marcas, junto a la cita en su portal.
      </p>
      <div className="rounded-md border border-warning-500/30 bg-warning-50 px-3 py-2 text-[12px] text-warning-700 mb-4 space-y-1">
        <p>
          La plataforma hoy no registra inasistencias: evita prometer exclusiones automáticas hasta
          tener cómo registrarlas.
        </p>
        <p>Los candidatos sin correo no reciben este aviso: la analista debe darlo de palabra.</p>
      </div>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-[13px] text-text-strong">
          <input
            type="checkbox"
            checked={activo}
            onChange={(e) => setActivo(e.target.checked)}
            className="h-4 w-4 accent-brand-600"
          />
          Activo
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-text-body mb-1">
            Título <span className="text-text-subtle font-normal">(opcional)</span>
          </span>
          <input
            value={titulo}
            maxLength={MAX_TITULO_AVISO}
            onChange={(e) => setTitulo(e.target.value)}
            className={inputClass}
            placeholder="Tu compromiso con el proceso"
          />
        </label>
        <label className="block">
          <span className="block text-[12px] font-medium text-text-body mb-1">Texto</span>
          <textarea
            value={texto}
            maxLength={MAX_TEXTO_AVISO}
            onChange={(e) => setTexto(e.target.value)}
            rows={6}
            className={inputClass}
            placeholder="Pega aquí el texto aprobado por Mari."
          />
          <p className="text-[11px] text-text-subtle mt-1 tabular-nums">
            {texto.length}/{MAX_TEXTO_AVISO}
          </p>
          <Variables lista={VARIABLES_AVISO} />
          <AvisoDesconocidas texto={texto} permitidas={VARIABLES_AVISO} />
        </label>
        <div className="flex flex-wrap gap-4 text-[13px] text-text-strong">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enAnalista} onChange={(e) => setEnAnalista(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Entrevista con analista
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enLider} onChange={(e) => setEnLider(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Entrevista con líder
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={enPortal} onChange={(e) => setEnPortal(e.target.checked)} className="h-4 w-4 accent-brand-600" />
            Mostrar en el portal
          </label>
        </div>
        {texto.trim() && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-text-subtle mb-1">
              Vista previa (no envía nada)
            </p>
            <div className="rounded-md border-l-2 border-brand-600 bg-brand-50/60 px-3 py-2">
              {titulo.trim() && <p className="text-[13px] font-semibold text-text-strong">{titulo.trim()}</p>}
              <p className="text-[13px] text-text-body whitespace-pre-line mt-0.5">
                {interpolarEjemplo(texto.trim(), EJEMPLO_AVISO)}
              </p>
            </div>
          </div>
        )}
        <Mensaje msg={msg} />
        <Button
          variant="brand-primary"
          onClick={guardar}
          loading={guardando}
          disabled={guardando}
          icon={<Save size={13} strokeWidth={1.75} />}
        >
          Guardar aviso
        </Button>
      </div>
    </Card>
  );
}

// ─── Reloj del líder tras el Concepto ─────────────────────────────────────

interface UsuarioMin {
  id: string;
  nombre?: string;
  apellido?: string;
  email?: string;
  rol?: string;
  activo?: boolean;
}

interface ResultadoSimulacion {
  apagado: boolean;
  motivo: string | null;
  horario_laboral: boolean;
  revisadas: number;
  acciones: { consecutivo: string; accion: string; motivo?: string }[];
}

const TEXTOS_RELOJ: { campo: keyof ConfigRelojLiderDoc; label: string; ayuda: string }[] = [
  { campo: 'texto_aviso_lider', label: 'Aviso al líder al enviar el Concepto', ayuda: 'Explica la regla y la fecha límite.' },
  { campo: 'texto_recordatorio_lider', label: 'Recordatorio al líder', ayuda: 'Sale al cumplirse el tiempo de recordatorio.' },
  { campo: 'texto_pausa_lider', label: 'Suspensión · mensaje al líder', ayuda: 'Sale cuando el proceso se suspende.' },
  { campo: 'texto_pausa_equipo', label: 'Suspensión · aviso al equipo', ayuda: 'A coordinación y a la analista asignada.' },
];

function RelojLiderCard() {
  const { user } = useAuth();
  const { doc: config } = useDoc<ConfigRelojLiderDoc>('configuracion_global', 'reloj_lider');
  const { docs: usuarios } = useColeccion<UsuarioMin>('usuarios', {
    filtros: [['activo', '==', true]],
    limit: 300,
  });
  const candidatosEquipo = useMemo(
    () =>
      usuarios
        .filter((u) => (u.rol === 'admin' || u.rol === 'coordinador') && !(u.email ?? '').toLowerCase().endsWith('.test'))
        .sort((a, b) => `${a.nombre ?? ''}`.localeCompare(`${b.nombre ?? ''}`, 'es')),
    [usuarios],
  );

  const [activo, setActivo] = useState(false);
  const [modo, setModo] = useState<ModoPlazoReloj>('dias_habiles');
  const [horasRecordatorio, setHorasRecordatorio] = useState(24);
  const [horasPausa, setHorasPausa] = useState(48);
  const [textos, setTextos] = useState<Record<string, string>>({});
  const [destinatarios, setDestinatarios] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);
  const [simulando, setSimulando] = useState(false);
  const [simulacion, setSimulacion] = useState<ResultadoSimulacion | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  useEffect(() => {
    if (!config) return;
    setActivo(config.activo === true);
    setModo(config.modo_plazo === 'calendario' ? 'calendario' : 'dias_habiles');
    setHorasRecordatorio(typeof config.horas_recordatorio === 'number' ? config.horas_recordatorio : 24);
    setHorasPausa(typeof config.horas_pausa === 'number' ? config.horas_pausa : 48);
    setTextos({
      texto_aviso_lider: config.texto_aviso_lider ?? '',
      texto_recordatorio_lider: config.texto_recordatorio_lider ?? '',
      texto_pausa_lider: config.texto_pausa_lider ?? '',
      texto_pausa_equipo: config.texto_pausa_equipo ?? '',
    });
    setDestinatarios(new Set(config.destinatarios_equipo_uids ?? []));
  }, [config]);

  const estado = validarRelojLider(config);
  const enDias = modo === 'dias_habiles';

  async function guardar() {
    if (!user) return;
    setMsg(null);
    const datos: ConfigRelojLiderDoc = {
      id: 'reloj_lider',
      activo,
      modo_plazo: modo,
      horas_recordatorio: horasRecordatorio,
      horas_pausa: horasPausa,
      texto_aviso_lider: (textos.texto_aviso_lider ?? '').trim(),
      texto_recordatorio_lider: (textos.texto_recordatorio_lider ?? '').trim(),
      texto_pausa_lider: (textos.texto_pausa_lider ?? '').trim(),
      texto_pausa_equipo: (textos.texto_pausa_equipo ?? '').trim(),
      destinatarios_equipo_uids: [...destinatarios],
    };
    if (activo) {
      const v = validarCamposReloj(datos);
      if (!v.efectivo) {
        setMsg({ tipo: 'err', texto: `No se puede encender: ${v.motivo}.` });
        return;
      }
    }
    const enciende = activo && config?.activo !== true;
    if (
      enciende &&
      !window.confirm(
        'Vas a ENCENDER el reloj del líder.\n\n' +
          '· Solo cuenta para los Conceptos que se envíen desde ahora (los ya enviados no se tocan).\n' +
          '· Aplica solo a líderes con rol líder.\n' +
          '· Si el líder no da fecha a tiempo, el proceso se SUSPENDE y la oferta deja de recibir postulaciones en la página pública.\n\n' +
          'Te recomendamos usar "Simular" después de guardar. ¿Continuar?',
      )
    ) {
      return;
    }
    setGuardando(true);
    try {
      await setDoc(
        doc(db, 'configuracion_global', 'reloj_lider'),
        {
          ...datos,
          // La vigencia se fija SOLO al pasar de apagado a encendido.
          ...(enciende ? { vigente_desde: serverTimestamp() } : {}),
          actualizado_en: serverTimestamp(),
          actualizado_por: user.uid,
        },
        { merge: true },
      );
      setMsg({ tipo: 'ok', texto: activo ? 'Guardado y encendido.' : 'Guardado (apagado).' });
    } catch (err) {
      setMsg({ tipo: 'err', texto: err instanceof Error ? err.message : 'No se pudo guardar.' });
    } finally {
      setGuardando(false);
    }
  }

  async function simular() {
    setSimulando(true);
    setSimulacion(null);
    setMsg(null);
    try {
      const fn = httpsCallable<{ simular: boolean }, ResultadoSimulacion>(functions, 'revisarRecordatoriosLiderCallable');
      const res = await fn({ simular: true });
      setSimulacion(res.data);
    } catch (err) {
      setMsg({ tipo: 'err', texto: err instanceof Error ? err.message : 'No se pudo simular.' });
    } finally {
      setSimulando(false);
    }
  }

  const alternarDestinatario = (uid: string) =>
    setDestinatarios((prev) => {
      const s = new Set(prev);
      if (s.has(uid)) s.delete(uid);
      else s.add(uid);
      return s;
    });

  return (
    <Card padding="lg">
      <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-center gap-2">
          <Timer size={16} strokeWidth={1.75} className="text-brand-600" />
          <h2 className="text-[15px] font-semibold text-text-strong">Reloj del líder tras el Concepto</h2>
        </div>
        <span
          className={cn(
            'text-[11px] font-semibold rounded-full px-2.5 py-0.5',
            estado.efectivo ? 'bg-success-50 text-success-700' : 'bg-slate-100 text-text-muted',
          )}
        >
          {estado.efectivo ? 'Encendido' : `Apagado: ${estado.motivo}`}
        </span>
      </div>
      <p className="text-[12.5px] text-text-muted mb-4 leading-[1.5]">
        Al enviar el Concepto de Atracción, el líder tiene un plazo para dar la fecha de la entrevista.
        Se detiene solo cuando se agenda la entrevista con el líder (o a mano desde el Concepto). Sin
        fecha: recordatorio y luego suspensión del proceso. Nunca se suspende si el aviso o el
        recordatorio no le llegaron por correo, ni fuera del horario laboral.
      </p>
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-[13px] text-text-strong">
          <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          Encendido
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="block">
            <span className="block text-[12px] font-medium text-text-body mb-1">Plazo en</span>
            <select
              value={modo}
              onChange={(e) => {
                const nuevo = e.target.value as ModoPlazoReloj;
                setModo(nuevo);
                if (nuevo === 'dias_habiles') {
                  setHorasRecordatorio((h) => Math.max(24, Math.round(h / 24) * 24));
                  setHorasPausa((h) => Math.max(48, Math.round(h / 24) * 24));
                }
              }}
              className={inputClass}
            >
              <option value="dias_habiles">Días hábiles (lun–vie, sin festivos)</option>
              <option value="calendario">Horas calendario</option>
            </select>
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-text-body mb-1">
              Recordatorio a {enDias ? 'los días' : 'las horas'}
            </span>
            <input
              type="number"
              min={1}
              value={enDias ? horasRecordatorio / 24 : horasRecordatorio}
              onChange={(e) => {
                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setHorasRecordatorio(enDias ? n * 24 : n);
              }}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="block text-[12px] font-medium text-text-body mb-1">
              Suspensión a {enDias ? 'los días' : 'las horas'}
            </span>
            <input
              type="number"
              min={1}
              value={enDias ? horasPausa / 24 : horasPausa}
              onChange={(e) => {
                const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                setHorasPausa(enDias ? n * 24 : n);
              }}
              className={inputClass}
            />
          </label>
        </div>

        {TEXTOS_RELOJ.map((t) => {
          const valor = textos[t.campo as string] ?? '';
          return (
            <label key={t.campo} className="block">
              <span className="block text-[12px] font-medium text-text-body mb-1">{t.label}</span>
              <textarea
                value={valor}
                maxLength={MAX_TEXTO_RELOJ}
                onChange={(e) => setTextos((prev) => ({ ...prev, [t.campo]: e.target.value }))}
                rows={4}
                className={inputClass}
              />
              <p className="text-[11px] text-text-subtle mt-1">{t.ayuda}</p>
              <AvisoDesconocidas texto={valor} permitidas={VARIABLES_RELOJ} />
              {valor.trim() && (
                <p className="mt-1.5 rounded-md bg-slate-50 border border-slate-200 px-3 py-2 text-[12px] text-text-body whitespace-pre-line">
                  {interpolarEjemplo(valor.trim(), EJEMPLO_RELOJ)}
                </p>
              )}
            </label>
          );
        })}
        <Variables lista={VARIABLES_RELOJ} />

        <div>
          <p className="text-[12px] font-medium text-text-body mb-1">Aviso de suspensión al equipo</p>
          <p className="text-[11px] text-text-subtle mb-2">
            Sin marcar a nadie se avisa a coordinación y a los admins activos. La analista asignada
            siempre recibe el aviso.
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {candidatosEquipo.map((u) => (
              <label key={u.id} className="flex items-center gap-2 text-[12.5px] text-text-strong">
                <input
                  type="checkbox"
                  checked={destinatarios.has(u.id)}
                  onChange={() => alternarDestinatario(u.id)}
                  className="h-4 w-4 accent-brand-600"
                />
                {`${u.nombre ?? ''} ${u.apellido ?? ''}`.trim() || u.id}
              </label>
            ))}
          </div>
        </div>

        <Mensaje msg={msg} />
        <div className="flex gap-2 flex-wrap">
          <Button
            variant="brand-primary"
            onClick={guardar}
            loading={guardando}
            disabled={guardando}
            icon={<Save size={13} strokeWidth={1.75} />}
          >
            Guardar reloj
          </Button>
          <Button
            variant="neutral-secondary"
            onClick={simular}
            loading={simulando}
            disabled={simulando}
            icon={<Play size={13} strokeWidth={1.75} />}
          >
            Simular (no envía ni pausa)
          </Button>
        </div>

        {simulacion && (
          <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-text-body">
            {simulacion.apagado ? (
              <p>Apagado: {simulacion.motivo}. No haría nada.</p>
            ) : (
              <>
                <p className="mb-1">
                  {simulacion.revisadas} {simulacion.revisadas === 1 ? 'reloj corriendo' : 'relojes corriendo'}
                  {simulacion.horario_laboral ? '' : ' · fuera de horario laboral'}
                </p>
                {simulacion.acciones.filter((a) => a.accion !== 'ninguna').length === 0 ? (
                  <p>Sin acciones por ahora.</p>
                ) : (
                  <ul className="space-y-0.5">
                    {simulacion.acciones
                      .filter((a) => a.accion !== 'ninguna')
                      .map((a, i) => (
                        <li key={`${a.consecutivo}-${i}`}>
                          <span className="font-mono">{a.consecutivo}</span> · {a.accion}
                          {a.motivo ? ` (${a.motivo})` : ''}
                        </li>
                      ))}
                  </ul>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
