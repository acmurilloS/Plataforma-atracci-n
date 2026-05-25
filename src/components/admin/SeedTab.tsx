import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { Check, Database, Play, X } from 'lucide-react';
import { functions } from '../../lib/firebase';
import { Button, Card, Pill } from '../../components/brand';

interface SeedResult {
  ok: boolean;
  empresas: number;
  sedes: number;
  unidades: number;
  cargos: number;
  usuarios: number;
  festivos: number;
}

const USUARIOS_PREVIEW = [
  { email: 'admin@equitel.test', password: 'Admin1234!', rol: 'admin' },
  { email: 'lider@equitel.test', password: 'Lider1234!', rol: 'lider' },
  { email: 'coordinador@equitel.test', password: 'Coord1234!', rol: 'coordinador' },
  { email: 'analista@equitel.test', password: 'Anal1234!', rol: 'analista' },
  { email: 'gh@equitel.test', password: 'GH1234!', rol: 'gh' },
];

export function SeedTab() {
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<SeedResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function correr() {
    setLoading(true);
    setRes(null);
    setErr(null);
    try {
      const fn = httpsCallable<unknown, SeedResult>(functions, 'seedInicial');
      const out = await fn({});
      setRes(out.data);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Falló el seed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <Card padding="lg">
        <div className="flex items-start gap-4 mb-5">
          <div className="w-10 h-10 rounded-md bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
            <Database size={18} strokeWidth={1.75} />
          </div>
          <div>
            <h3 className="text-[18px] font-semibold tracking-[-0.012em] text-text-strong">
              Seed inicial
            </h3>
            <p className="text-[13px] text-text-muted mt-1 leading-[1.55]">
              Siembra 4 empresas (EQT, CUM, ING, SLP), 5 sedes, 3 unidades ejemplo, 2 cargos
              ejemplo, 5 usuarios de prueba y festivos colombianos 2026 + 2027. Solo corre en
              emulador o como admin en producción.
            </p>
          </div>
        </div>

        <div className="rounded-md border border-slate-100 bg-slate-50/60 p-4 mb-5">
          <p className="text-[10px] font-bold tracking-[0.10em] uppercase text-text-muted mb-3">
            Usuarios que crea
          </p>
          <div className="space-y-1.5 font-mono text-[12px] text-text-body">
            {USUARIOS_PREVIEW.map((u) => (
              <div key={u.email} className="flex items-center gap-3">
                <span className="w-20 shrink-0">
                  <Pill tono="neutral">{u.rol}</Pill>
                </span>
                <span className="text-text-strong">{u.email}</span>
                <span className="text-text-subtle">/</span>
                <span className="text-brand-700">{u.password}</span>
              </div>
            ))}
          </div>
        </div>

        <Button
          variant="brand-primary"
          size="medium"
          onClick={correr}
          loading={loading}
          disabled={loading}
          icon={<Play size={13} strokeWidth={1.75} />}
        >
          {loading ? 'Ejecutando…' : 'Ejecutar seed'}
        </Button>

        {res && (
          <div className="mt-5 rounded-md border border-success-500/20 bg-success-50 p-4">
            <div className="flex items-start gap-3">
              <Check size={16} strokeWidth={2} className="text-success-700 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-[13px] font-semibold text-success-700 mb-2">Seed completado</p>
                <div className="grid grid-cols-3 gap-2 text-[12px] text-text-body tabular-nums">
                  <ResultItem label="Empresas" valor={res.empresas} />
                  <ResultItem label="Sedes" valor={res.sedes} />
                  <ResultItem label="Unidades" valor={res.unidades} />
                  <ResultItem label="Cargos" valor={res.cargos} />
                  <ResultItem label="Usuarios" valor={res.usuarios} />
                  <ResultItem label="Festivos" valor={res.festivos} />
                </div>
              </div>
            </div>
          </div>
        )}

        {err && (
          <div className="mt-5 rounded-md border border-danger-500/20 bg-danger-50 p-4">
            <div className="flex items-start gap-3">
              <X size={16} strokeWidth={2} className="text-danger-700 mt-0.5 shrink-0" />
              <p className="text-[13px] text-danger-700">{err}</p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

function ResultItem({ label, valor }: { label: string; valor: number }) {
  return (
    <div className="rounded-md bg-white border border-success-500/10 px-2.5 py-1.5">
      <p className="text-[10px] uppercase tracking-[0.06em] font-semibold text-text-muted">
        {label}
      </p>
      <p className="text-[14px] font-semibold text-success-700">{valor}</p>
    </div>
  );
}
