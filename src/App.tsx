import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { rutaHome } from './utils/rutaHome';
import {
  ROLES_APROBACIONES,
  ROLES_CARPETAS,
  ROLES_EXAMENES,
  ROLES_MIS_VACANTES,
  ROLES_MIS_UNIDADES,
  ROLES_NUEVA_VACANTE,
  ROLES_PERFILAMIENTO,
  ROLES_POOL,
  ROLES_POSTULACION_DETALLE,
  ROLES_PROCESO,
  ROLES_SEGUIMIENTO,
  ROLES_TICKETS,
  ROLES_VACANTES_ABIERTAS,
  ROLES_VACANTES_LISTA,
  ROLES_VACANTE_DETALLE,
} from './utils/accesoRutas';
import CatalogosAdminPage from './pages/admin/CatalogosAdminPage';
import PanelAdminPage from './pages/admin/PanelAdminPage';
import UsuariosRolesPage from './pages/admin/UsuariosRolesPage';
import TicketsPage from './pages/apoyo/TicketsPage';
import CarreraPublicaPage from './pages/carreras/CarreraPublicaPage';
import PortalCandidatoPage from './pages/portal/PortalCandidatoPage';
import DashboardCoordPage from './pages/coord/DashboardCoordPage';
import CarpetasPage from './pages/gh/CarpetasPage';
import ExamenesMedicosPage from './pages/gh/ExamenesMedicosPage';
import AprobacionAvalPage from './pages/gh/AprobacionAvalPage';
import LiderMisVacantesPage from './pages/lider/MisVacantesPage';
import MisUnidadesPage from './pages/gerente/MisUnidadesPage';
import LoginPage from './pages/LoginPage';
import OnboardingRolPage from './pages/OnboardingRolPage';
import NuevaVacantePage from './pages/NuevaVacantePage';
import PostulacionDetallePage from './pages/postulaciones/PostulacionDetallePage';
import { AutorizacionDatosPage, AutorizacionImagenPage } from './pages/postulaciones/AutorizacionPage';
import SeguimientoPage from './pages/SeguimientoPage';
import VacanteDetallePage from './pages/VacanteDetallePage';
import VacantesListaPage from './pages/VacantesListaPage';
import PerfilamientoPage from './pages/vacantes/PerfilamientoPage';
import PostulacionesPage from './pages/vacantes/PostulacionesPage';
import PublicacionPage from './pages/vacantes/PublicacionPage';
import SourcingPage from './pages/vacantes/SourcingPage';
import TernaPage from './pages/vacantes/TernaPage';
import ConceptoAtraccionPage from './pages/vacantes/ConceptoAtraccionPage';
import SolicitudIntegrantePage from './pages/vacantes/SolicitudIntegrantePage';
import ReferenciasPdfPage from './pages/postulaciones/ReferenciasPdfPage';
import PoolPage from './pages/pool/PoolPage';
import VacantesAbiertasPage from './pages/internos/VacantesAbiertasPage';

// Quién puede abrir cada ruta vive en UNA sola fuente (src/utils/accesoRutas.ts),
// compartida con el gating de LINKS de cada página. Así no vuelven a aparecer
// "callejones sin salida" (link visible → ruta prohibida). Ver auditoría 14-jul.

function AppShell() {
  return (
    <ProtectedRoute>
      <ShellConRol />
    </ProtectedRoute>
  );
}

/**
 * Dentro de ProtectedRoute ya hay sesión iniciada. Si el usuario aún no tiene
 * rol (primer ingreso, sin doc usuarios), mostramos el onboarding de selección
 * de rol en vez de la app vacía. Con rol asignado, entra normal.
 */
function ShellConRol() {
  const { rol, perfil, cargando, cerrarSesion } = useAuth();
  // Cuenta desactivada por un admin: se bloquea el acceso a la app (además, en
  // Auth la cuenta queda deshabilitada y la sesión cae en el próximo refresco).
  if (!cargando && perfil && perfil.activo === false) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-2xl font-semibold text-text-strong">Cuenta desactivada</h1>
          <p className="text-[14px] text-text-muted leading-relaxed">
            Tu acceso a la Plataforma de Atracción fue desactivado. Si crees que es un
            error, contacta a un administrador.
          </p>
          <button
            type="button"
            onClick={() => cerrarSesion()}
            className="inline-flex items-center rounded-md border border-slate-300 bg-white px-4 py-2 text-[13px] font-medium text-text-strong hover:bg-slate-50"
          >
            Cerrar sesión
          </button>
        </div>
      </div>
    );
  }
  if (!cargando && !rol) return <OnboardingRolPage />;
  return <Layout />;
}

/** La raíz "/" lleva a cada perfil a SU home (admin→dashboard, etc.). */
function InicioRedirect() {
  const { rol, cargando } = useAuth();
  if (cargando) return null;
  return <Navigate to={rutaHome(rol)} replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/carreras/:id" element={<CarreraPublicaPage />} />
          <Route path="/portal/:token" element={<PortalCandidatoPage />} />
          <Route element={<AppShell />}>
            <Route path="/" element={<InicioRedirect />} />
            <Route
              path="/seguimiento"
              element={
                <ProtectedRoute roles={ROLES_SEGUIMIENTO}>
                  <SeguimientoPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/nueva"
              element={
                <ProtectedRoute roles={ROLES_NUEVA_VACANTE}>
                  <NuevaVacantePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes"
              element={
                <ProtectedRoute roles={ROLES_VACANTES_LISTA}>
                  <VacantesListaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mis-vacantes"
              element={
                <ProtectedRoute roles={ROLES_MIS_VACANTES}>
                  <LiderMisVacantesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/mis-unidades"
              element={
                <ProtectedRoute roles={ROLES_MIS_UNIDADES}>
                  <MisUnidadesPage />
                </ProtectedRoute>
              }
            />
            {/* gh (Diego/C&D) entra al detalle de SUS vacantes (es el líder
                solicitante): la página verifica lider_uid == uid y cierra las
                demás (reu Karen 16-sep, decisión 25-sep). No va en la constante
                porque otras pantallas la usan para pintar links a vacantes ajenas. */}
            <Route
              path="/vacantes/:id"
              element={
                <ProtectedRoute roles={[...ROLES_VACANTE_DETALLE, 'gh']}>
                  <VacanteDetallePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/perfilamiento"
              element={
                <ProtectedRoute roles={ROLES_PERFILAMIENTO}>
                  <PerfilamientoPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/publicacion"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <PublicacionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/sourcing"
              element={
                <ProtectedRoute roles={['analista', 'coordinador', 'admin']}>
                  <SourcingPage />
                </ProtectedRoute>
              }
            />
            {/* gh (Diego/C&D) consulta las postulaciones de SUS vacantes (solo
                lectura) y decide la terna como líder: cada página verifica que
                sea el líder solicitante (reu Karen 16-sep, decisión 25-sep). */}
            <Route
              path="/vacantes/:id/postulaciones"
              element={
                <ProtectedRoute roles={[...ROLES_PROCESO, 'gh']}>
                  <PostulacionesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/terna"
              element={
                <ProtectedRoute roles={[...ROLES_PROCESO, 'gh']}>
                  <TernaPage />
                </ProtectedRoute>
              }
            />
            {/* gh (Diego/C&D) entra al concepto de SUS vacantes: la página verifica
                que sea el líder solicitante (reu 26-ago). */}
            <Route
              path="/vacantes/:id/concepto-atraccion"
              element={
                <ProtectedRoute roles={[...ROLES_PROCESO, 'gh']}>
                  <ConceptoAtraccionPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/solicitud-integrante"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <SolicitudIntegrantePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/postulaciones/:id"
              element={
                <ProtectedRoute roles={ROLES_POSTULACION_DETALLE}>
                  <PostulacionDetallePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/postulaciones/:id/referencias-pdf"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <ReferenciasPdfPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/postulaciones/:id/autorizacion-datos"
              element={
                <ProtectedRoute roles={ROLES_POSTULACION_DETALLE}>
                  <AutorizacionDatosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/postulaciones/:id/autorizacion-imagen"
              element={
                <ProtectedRoute roles={ROLES_POSTULACION_DETALLE}>
                  <AutorizacionImagenPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/aprobaciones-aval"
              element={
                <ProtectedRoute roles={ROLES_APROBACIONES}>
                  <AprobacionAvalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/examenes-medicos"
              element={
                <ProtectedRoute roles={ROLES_EXAMENES}>
                  <ExamenesMedicosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/carpetas"
              element={
                <ProtectedRoute roles={ROLES_CARPETAS}>
                  <CarpetasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tickets"
              element={
                <ProtectedRoute roles={ROLES_TICKETS}>
                  <TicketsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pool"
              element={
                <ProtectedRoute roles={ROLES_POOL}>
                  <PoolPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes-abiertas"
              element={
                <ProtectedRoute roles={ROLES_VACANTES_ABIERTAS}>
                  <VacantesAbiertasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute roles={['coordinador', 'admin']}>
                  <DashboardCoordPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin"
              element={
                <ProtectedRoute roles={['admin']}>
                  <PanelAdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/catalogos"
              element={
                <ProtectedRoute roles={['admin']} seccion="catalogos">
                  <CatalogosAdminPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/admin/usuarios"
              element={
                <ProtectedRoute roles={['admin']} seccion="usuarios">
                  <UsuariosRolesPage />
                </ProtectedRoute>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
