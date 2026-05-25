import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Loader2, ShieldOff } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Card, Pill } from './brand';
import type { RolUsuario } from '../schemas';

interface Props {
  children: ReactNode;
  roles?: RolUsuario[];
}

export function ProtectedRoute({ children, roles }: Props) {
  const { user, rol, cargando } = useAuth();
  const location = useLocation();

  if (cargando) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-text-muted text-sm">
        <Loader2 size={14} strokeWidth={1.75} className="animate-spin" />
        Cargando…
      </div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (roles && (!rol || !roles.includes(rol))) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-slate-50/40">
        <div className="max-w-md">
          <Card padding="lg">
            <div className="text-center space-y-3">
              <div className="mx-auto w-12 h-12 rounded-md bg-danger-50 text-danger-700 flex items-center justify-center">
                <ShieldOff size={20} strokeWidth={1.75} />
              </div>
              <h1 className="text-[20px] font-semibold tracking-[-0.012em] text-text-strong">
                Sin permisos
              </h1>
              <p className="text-[13px] text-text-muted leading-[1.55]">
                Tu rol no puede acceder a esta sección.
              </p>
              <div>
                <Pill tono="danger">{rol ?? 'sin rol'}</Pill>
              </div>
            </div>
          </Card>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
