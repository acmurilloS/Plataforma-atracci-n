import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { rutaHome } from '../utils/rutaHome';

/**
 * SaludoInicio · saludo personalizado que aparece SOLO en el home del perfil
 * (reu 03-jul): "Buenos días, Alisson." Se autooculta si la ruta actual no es
 * el home del rol, así que se puede colocar en varias páginas-home sin repetir.
 */

const ROL_TEXTO: Record<string, string> = {
  admin: 'Vista de administración',
  coordinador: 'Vista de coordinación',
  gh: 'Gestión Humana',
  analista: 'Atracción de talento',
  lider: 'Tus vacantes',
  talentos: 'Conexión de Talentos',
  apoyo: 'Tus tickets',
  gestor: 'Exámenes médicos',
  documentacion: 'Carpetas',
};

function saludoHora(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
}

const FECHA_FMT = new Intl.DateTimeFormat('es-CO', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Bogota',
});

export function SaludoInicio() {
  const { perfil, rol } = useAuth();
  const location = useLocation();

  if (!perfil || !rol) return null;
  if (location.pathname !== rutaHome(rol)) return null; // solo en el home del perfil

  const nombre = (perfil.nombre || '').trim() || 'de nuevo';
  const fecha = FECHA_FMT.format(new Date());

  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.10em] text-brand-600">
        {ROL_TEXTO[rol] ?? 'Plataforma de Atracción'} · <span className="text-text-subtle">{fecha}</span>
      </p>
      <h1 className="mt-2.5 text-[40px] leading-[1.05] font-light tracking-[-0.03em] text-text-strong">
        {saludoHora()}, {nombre}.
      </h1>
    </div>
  );
}
