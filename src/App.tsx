import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider, useAuth } from './hooks/useAuth';
import type { RolUsuario } from './schemas';
import { rutaHome } from './utils/rutaHome';
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

// Roles que trabajan el proceso de atracción (vacante/postulación). EXCLUYE
// 'apoyo' (IT/compras/bodega: solo tickets) y 'gh' (Gestión Humana solo ve
// Aprobaciones/Carpetas/Exámenes — reu Karen 09-jul, validado con Mari: no ven
// el pipeline de reclutamiento ni la gestión interna del equipo de atracción).
// Defensa en profundidad para que esas pantallas no se abran por URL directa;
// el nav ya filtra por rol.
const ROLES_PROCESO: RolUsuario[] = ['lider', 'analista', 'coordinador', 'admin'];

// Todo el que NO es GH ni sin-rol: para Seguimiento (GH queda fuera).
const ROLES_SEGUIMIENTO: RolUsuario[] = [
  'lider',
  'analista',
  'coordinador',
  'apoyo',
  'admin',
  'talentos',
];

// Perfilamiento: además del proceso, lo puede VER (solo lectura) 'talentos'
// (José Hoyos · Conexión de Talentos, reu 03-jul). No edita: la página se
// renderiza read-only para su rol y las firestore.rules bloquean su escritura.
const ROLES_PERFILAMIENTO: RolUsuario[] = [...ROLES_PROCESO, 'talentos'];

// Detalle de la POSTULACIÓN: además del proceso, entran 'gh' (Diego/Paola) y
// 'documentacion' (Carla) porque ahí es donde SUBEN y verifican los documentos
// de la carpeta (contrato, ARL, EPS, caja) — Carpetas enlaza aquí con "Ir al tab
// Documentos". NO ven el pipeline: PostulacionDetallePage les muestra solo los
// tabs de carpeta (documentos / diligencia / datos básicos).
const ROLES_POSTULACION_DETALLE: RolUsuario[] = [...ROLES_PROCESO, 'gh', 'documentacion'];

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
                <ProtectedRoute roles={['lider', 'coordinador', 'admin']}>
                  <NuevaVacantePage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes"
              element={
                <ProtectedRoute roles={['analista', 'coordinador', 'admin']}>
                  <VacantesListaPage />
                </ProtectedRoute>
              }
            />
            <Route path="/mis-vacantes" element={<LiderMisVacantesPage />} />
            <Route
              path="/vacantes/:id"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
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
            <Route
              path="/vacantes/:id/postulaciones"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <PostulacionesPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/terna"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <TernaPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes/:id/concepto-atraccion"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
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
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <AutorizacionDatosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/postulaciones/:id/autorizacion-imagen"
              element={
                <ProtectedRoute roles={ROLES_PROCESO}>
                  <AutorizacionImagenPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/aprobaciones-aval"
              element={
                <ProtectedRoute roles={['gh', 'admin', 'coordinador']}>
                  <AprobacionAvalPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/examenes-medicos"
              element={
                <ProtectedRoute roles={['gh', 'gestor', 'analista', 'admin', 'coordinador']}>
                  <ExamenesMedicosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/carpetas"
              element={
                <ProtectedRoute roles={['gh', 'documentacion', 'analista', 'admin', 'coordinador']}>
                  <CarpetasPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/tickets"
              element={
                <ProtectedRoute roles={['apoyo', 'analista', 'admin', 'coordinador']}>
                  <TicketsPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/pool"
              element={
                <ProtectedRoute roles={['analista', 'coordinador', 'admin']}>
                  <PoolPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/vacantes-abiertas"
              element={
                <ProtectedRoute roles={['analista', 'coordinador', 'apoyo', 'admin', 'talentos']}>
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
