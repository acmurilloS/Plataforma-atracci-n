import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AuthProvider } from './hooks/useAuth';
import CatalogosAdminPage from './pages/admin/CatalogosAdminPage';
import PanelAdminPage from './pages/admin/PanelAdminPage';
import TicketsPage from './pages/apoyo/TicketsPage';
import CarreraPublicaPage from './pages/carreras/CarreraPublicaPage';
import PortalCandidatoPage from './pages/portal/PortalCandidatoPage';
import DashboardCoordPage from './pages/coord/DashboardCoordPage';
import CarpetasPage from './pages/gh/CarpetasPage';
import ExamenesMedicosPage from './pages/gh/ExamenesMedicosPage';
import AprobacionAvalPage from './pages/gh/AprobacionAvalPage';
import LiderMisVacantesPage from './pages/lider/MisVacantesPage';
import LoginPage from './pages/LoginPage';
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
import ReferenciasPdfPage from './pages/postulaciones/ReferenciasPdfPage';
import PoolPage from './pages/pool/PoolPage';
import VacantesAbiertasPage from './pages/internos/VacantesAbiertasPage';

function AppShell() {
  return (
    <ProtectedRoute>
      <Layout />
    </ProtectedRoute>
  );
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
            <Route path="/" element={<Navigate to="/seguimiento" replace />} />
            <Route path="/seguimiento" element={<SeguimientoPage />} />
            <Route path="/vacantes/nueva" element={<NuevaVacantePage />} />
            <Route path="/vacantes" element={<VacantesListaPage />} />
            <Route path="/mis-vacantes" element={<LiderMisVacantesPage />} />
            <Route path="/vacantes/:id" element={<VacanteDetallePage />} />
            <Route path="/vacantes/:id/perfilamiento" element={<PerfilamientoPage />} />
            <Route path="/vacantes/:id/publicacion" element={<PublicacionPage />} />
            <Route
              path="/vacantes/:id/sourcing"
              element={
                <ProtectedRoute roles={['analista', 'coordinador', 'admin']}>
                  <SourcingPage />
                </ProtectedRoute>
              }
            />
            <Route path="/vacantes/:id/postulaciones" element={<PostulacionesPage />} />
            <Route path="/vacantes/:id/terna" element={<TernaPage />} />
            <Route path="/vacantes/:id/concepto-atraccion" element={<ConceptoAtraccionPage />} />
            <Route path="/postulaciones/:id" element={<PostulacionDetallePage />} />
            <Route path="/postulaciones/:id/referencias-pdf" element={<ReferenciasPdfPage />} />
            <Route path="/postulaciones/:id/autorizacion-datos" element={<AutorizacionDatosPage />} />
            <Route path="/postulaciones/:id/autorizacion-imagen" element={<AutorizacionImagenPage />} />
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
                <ProtectedRoute roles={['gh', 'admin', 'coordinador']}>
                  <ExamenesMedicosPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/carpetas"
              element={
                <ProtectedRoute roles={['gh', 'analista', 'admin', 'coordinador']}>
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
            <Route path="/vacantes-abiertas" element={<VacantesAbiertasPage />} />
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
                <ProtectedRoute roles={['admin']}>
                  <CatalogosAdminPage />
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
