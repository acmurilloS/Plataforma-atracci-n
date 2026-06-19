import { useParams } from 'react-router-dom';
import type { Timestamp } from 'firebase/firestore';
import { useDoc } from '../../hooks/useDoc';
import { useColeccion } from '../../hooks/useColeccion';
import { formatearFecha } from '../../utils/fechas';
import {
  DocumentoImprimible,
  type SeccionImprimible,
} from '../../components/firma/DocumentoImprimible';
import { empresaConsentimiento } from '../../components/consentimientos/consentimientoLegal';
import type { PostulacionDoc, DatosBasicosIntegranteDoc } from '../../schemas';

const fts = (t?: Timestamp | null) => (t?.toDate ? formatearFecha(t.toDate()) : '');

/** Hoja imprimible del formato DGH-F-05 (datos básicos) con firma del candidato. */
export default function DatosBasicosPdfPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: postulacion } = useDoc<PostulacionDoc>('postulaciones', id);
  const { docs } = useColeccion<DatosBasicosIntegranteDoc>('datos_basicos_integrante', {
    filtros: id ? [['postulacion_id', '==', id]] : [],
    limit: 1,
  });
  const d = docs[0] ?? null;

  if (!postulacion || !d)
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-[13px] text-text-muted">
        {postulacion ? 'Aún no hay datos básicos diligenciados para imprimir.' : 'Cargando…'}
      </div>
    );

  const empresa = empresaConsentimiento(d.empresa_codigo);
  const nombre = [d.nombres, d.apellidos].filter(Boolean).join(' ');

  const secciones: SeccionImprimible[] = [
    {
      titulo: 'Tipo de contratación',
      campos: [
        { label: 'Tipo de contratación', valor: d.tipo_contratacion },
        { label: 'Empresa', valor: d.empresa_nombre },
      ],
    },
    {
      titulo: '1. Información personal',
      campos: [
        { label: 'Nombres', valor: d.nombres },
        { label: 'Apellidos', valor: d.apellidos },
        { label: 'Documento', valor: `${d.documento_tipo} ${d.documento_numero}` },
        { label: 'Ciudad expedición', valor: d.documento_ciudad_expedicion },
        { label: 'Fecha nacimiento', valor: fts(d.fecha_nacimiento) },
        { label: 'Lugar nacimiento', valor: d.lugar_nacimiento },
        { label: 'Estado civil', valor: d.estado_civil ?? '' },
        { label: 'Género', valor: d.genero ?? '' },
        { label: 'Grupo sanguíneo', valor: d.grupo_sanguineo ?? '' },
        { label: 'Dirección', valor: d.direccion },
        { label: 'Barrio', valor: d.barrio },
        { label: 'Ciudad', valor: d.ciudad_domicilio },
        { label: 'Teléfono fijo', valor: d.telefono_fijo },
        { label: 'Celular', valor: d.celular },
        { label: 'Correo', valor: d.correo_electronico },
        { label: 'Profesión / actividad', valor: d.profesion_actividad },
        { label: 'Alérgico a', valor: d.alergico_a },
        { label: 'Libreta militar', valor: d.libreta_militar_numero },
      ],
    },
    {
      titulo: '2. Información laboral',
      campos: [
        { label: 'Banco', valor: d.entidad_bancaria },
        { label: 'Cuenta', valor: d.cuenta_banco_numero },
        { label: 'EPS', valor: d.entidad_promotora_salud },
        { label: 'AFP (pensiones)', valor: d.fondo_pensiones_obligatorias },
        { label: 'Cesantías', valor: d.fondo_cesantias },
        { label: 'Caja compensación', valor: d.caja_compensacion },
        { label: 'ARL', valor: d.arl },
        { label: 'Riesgo (%)', valor: d.riesgo_porcentaje },
      ],
    },
    {
      titulo: '3. Información familiar',
      campos: [
        { label: 'Cónyuge', valor: d.conyuge_nombre },
        { label: 'Doc. cónyuge', valor: d.conyuge_documento },
        {
          label: 'Hijos',
          valor: (d.hijos ?? [])
            .map((h) => `${h.nombre}${h.fecha_nacimiento ? ` (${h.fecha_nacimiento})` : ''}`)
            .join('; '),
        },
      ],
    },
    {
      titulo: '4. En caso de emergencia',
      campos: [
        {
          label: 'Contacto 1',
          valor: `${d.emergencia_contacto_1?.nombre ?? ''} ${d.emergencia_contacto_1?.telefono ?? ''}`.trim(),
        },
        {
          label: 'Contacto 2',
          valor: `${d.emergencia_contacto_2?.nombre ?? ''} ${d.emergencia_contacto_2?.telefono ?? ''}`.trim(),
        },
      ],
    },
    {
      titulo: '5. Dotación · tallas',
      campos: [
        { label: 'Calzado', valor: d.talla_calzado },
        { label: 'Pantalón', valor: d.talla_pantalon },
        { label: 'Camisa / blusa', valor: d.talla_camisa_blusa },
        { label: 'Chaleco', valor: d.talla_chaleco },
        { label: 'Guantes', valor: d.talla_guantes },
        { label: 'Overol', valor: d.talla_overol },
      ],
    },
    {
      titulo: '6. Observaciones',
      campos: [
        { label: 'Observaciones', valor: d.observaciones },
        {
          label: 'Familiar en la organización',
          valor: d.tiene_familiares_organizacion ? d.nombre_familiar_organizacion || 'Sí' : 'No',
        },
      ],
    },
  ];

  const p = postulacion as unknown as Record<string, unknown>;
  return (
    <DocumentoImprimible
      volverA={`/postulaciones/${postulacion.id}`}
      titulo="Datos Básicos del Integrante (DGH-F-05)"
      subtitulo="Información para registro en nómina"
      empresaNombre={empresa.nombre}
      empresaNit={empresa.nit}
      secciones={secciones}
      nombreFirmante={nombre}
      documentoFirmante={d.documento_numero}
      firmaImagenUrl={p.firma_datos_basicos_imagen_url as string | undefined}
      firmaFecha={p.firma_datos_basicos_en as Timestamp | undefined}
      firmaPdfUrl={p.firma_datos_basicos_url as string | undefined}
    />
  );
}
