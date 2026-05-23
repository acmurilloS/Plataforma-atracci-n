import { useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../../lib/firebase';

interface SeedResult {
  ok: boolean;
  empresas: number;
  sedes: number;
  unidades: number;
  cargos: number;
  usuarios: number;
  festivos: number;
}

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
    <div className="rounded-xl border border-navy-100 bg-white p-6 max-w-2xl">
      <h3 className="font-display text-xl font-semibold text-navy-900">Seed inicial</h3>
      <p className="text-sm text-navy-600 mt-1">
        Siembra 4 empresas (EQT, CUM, ING, SLP), 5 sedes, 3 unidades ejemplo, 2 cargos ejemplo, 5
        usuarios de prueba y festivos colombianos 2026 + 2027. Solo corre en emulador o como admin
        en producción.
      </p>
      <div className="mt-4 rounded-md bg-cream-100 p-3 text-xs text-navy-700 space-y-1">
        <p className="font-semibold">Usuarios que crea:</p>
        <p><span className="font-mono">admin@equitel.test</span> / Admin1234! · rol <code>admin</code></p>
        <p><span className="font-mono">lider@equitel.test</span> / Lider1234! · rol <code>lider</code></p>
        <p><span className="font-mono">coordinador@equitel.test</span> / Coord1234! · rol <code>coordinador</code></p>
        <p><span className="font-mono">analista@equitel.test</span> / Anal1234! · rol <code>analista</code></p>
        <p><span className="font-mono">gh@equitel.test</span> / GH1234! · rol <code>gh</code></p>
      </div>
      <button
        onClick={correr}
        disabled={loading}
        className="mt-4 rounded-md bg-navy-700 text-white px-4 py-2 text-sm font-semibold hover:bg-navy-800 disabled:bg-navy-300"
      >
        {loading ? 'Ejecutando…' : 'Ejecutar seed'}
      </button>
      {res && (
        <div className="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Seed completado: {res.empresas} empresas, {res.sedes} sedes, {res.unidades} unidades,{' '}
          {res.cargos} cargos, {res.usuarios} usuarios, {res.festivos} festivos.
        </div>
      )}
      {err && (
        <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      )}
    </div>
  );
}
