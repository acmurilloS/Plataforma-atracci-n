import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
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
      <div className="min-h-screen flex items-center justify-center text-navy-500">Cargando…</div>
    );
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  if (roles && (!rol || !roles.includes(rol))) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md rounded-xl border border-navy-100 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-navy-900">Sin permisos</h1>
          <p className="mt-2 text-sm text-navy-600">
            Tu rol ({rol ?? '—'}) no puede acceder a esta sección.
          </p>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
