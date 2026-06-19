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
import type { PostulacionDoc, DebidaDiligenciaDoc } from '../../schemas';

const fts = (t?: Timestamp | null) => (t?.toDate ? formatearFecha(t.toDate()) : '');
const si = (b?: boolean | null) => (b === true ? 'Sí' : b === false ? 'No' : '');

/** Hoja imprimible del formato F-CAR-01 (SAGRILAFT) con firma del candidato. */
export default function DebidaDiligenciaPdfPage() {
  const { id } = useParams<{ id: string }>();
  const { doc: postulacion } = useDoc<PostulacionDoc>('postulaciones', id);
  const { docs } = useColeccion<DebidaDiligenciaDoc>('debida_diligencia', {
    filtros: id ? [['postulacion_id', '==', id]] : [],
    limit: 1,
  });
  const d = docs[0] ?? null;

  if (!postulacion || !d)
    return (
      <div className="max-w-4xl mx-auto px-6 py-12 text-[13px] text-text-muted">
        {postulacion ? 'Aún no hay debida diligencia diligenciada para imprimir.' : 'Cargando…'}
      </div>
    );

  const empresa = empresaConsentimiento(d.empresa_codigo);
  const nombre = [d.nombres, d.primer_apellido, d.segundo_apellido].filter(Boolean).join(' ');

  const secciones: SeccionImprimible[] = [
    {
      titulo: '1. Empresa y registro',
      campos: [
        { label: 'Empresa', valor: d.empresa_nombre },
        { label: 'Cargo', valor: d.cargo },
        { label: 'Tipo de vinculación', valor: d.tipo_vinculacion },
        { label: 'Departamento', valor: d.departamento },
        { label: 'Ciudad / municipio', valor: d.ciudad_municipio },
        { label: 'Fecha diligenciamiento', valor: fts(d.fecha_diligenciamiento) },
      ],
    },
    {
      titulo: '2. Datos generales del integrante',
      campos: [
        { label: 'Nombres', valor: d.nombres },
        { label: 'Primer apellido', valor: d.primer_apellido },
        { label: 'Segundo apellido', valor: d.segundo_apellido },
        { label: 'Documento', valor: `${d.tipo_documento} ${d.identificacion}` },
        { label: 'Fecha nacimiento', valor: fts(d.fecha_nacimiento) },
        { label: 'Expedición', valor: `${fts(d.fecha_expedicion_documento)} ${d.lugar_expedicion}`.trim() },
        { label: 'País', valor: d.pais },
        { label: 'Celular', valor: d.celular },
        { label: 'Correo', valor: d.correo_electronico },
        { label: 'Dirección', valor: d.direccion_residencial },
      ],
    },
    {
      titulo: '2b. Familiar en la empresa',
      campos: [
        { label: '¿Tiene familiar?', valor: si(d.tiene_familiar_empresa) },
        { label: 'Familiar', valor: d.nombre_apellidos_familiar },
        { label: 'Parentesco', valor: d.parentesco_familiar },
        { label: 'Cargo familiar', valor: d.cargo_familiar },
      ],
    },
    {
      titulo: '3. Cónyuge',
      campos: [
        {
          label: 'Nombre',
          valor: [d.conyuge_nombres, d.conyuge_primer_apellido, d.conyuge_segundo_apellido]
            .filter(Boolean)
            .join(' '),
        },
        { label: 'Identificación', valor: d.conyuge_identificacion },
        { label: 'Teléfono', valor: d.conyuge_telefono },
        { label: 'Ocupación', valor: d.conyuge_ocupacion },
        { label: 'Empleador', valor: d.conyuge_empleador },
        { label: 'Parentesco', valor: d.conyuge_parentesco },
      ],
    },
    {
      titulo: '4. Información financiera',
      campos: [
        { label: 'Operaciones moneda extranjera', valor: si(d.realiza_operaciones_moneda_extranjera) },
        { label: 'Detalle', valor: d.operaciones_moneda_extranjera_detalle },
        { label: 'Productos financieros exterior', valor: si(d.posee_productos_financieros_extranjero) },
        { label: 'Detalle', valor: d.productos_financieros_extranjero_detalle },
        { label: 'Ingresos adicionales', valor: si(d.realiza_actividad_ingresos_adicionales) },
        { label: 'Observaciones', valor: d.ingresos_adicionales_observaciones },
      ],
    },
    {
      titulo: '5. PEP',
      campos: [
        { label: 'Reconocimiento público', valor: si(d.posee_reconocimiento_publico) },
        { label: 'Vínculo con PEP', valor: si(d.posee_vinculo_pep) },
        {
          label: 'Vinculados PEP',
          valor: (d.vinculados_pep ?? [])
            .map((v) => `${v.nombre} (${v.relacion}, ${v.cargo_ocupacion})`)
            .join('; '),
        },
      ],
    },
    {
      titulo: '6-8. Cláusulas y declaraciones',
      campos: [
        { label: '6. Anticorrupción / antisoborno', valor: si(d.acepta_clausulas_anticorrupcion) },
        { label: '7. Orígenes de ingreso', valor: si(d.acepta_declaracion_origenes_ingreso) },
        { label: '8. Políticas LA/FT', valor: si(d.acepta_politicas_laft) },
        { label: 'Firmado por integrante', valor: fts(d.fecha_firma_integrante) },
      ],
    },
    {
      titulo: '9. Verificación oficial de cumplimiento',
      campos: [
        { label: 'Verificado en listas', valor: si(d.verificado_listas_vinculantes) },
        { label: 'Fecha consulta', valor: fts(d.fecha_consulta_listas) },
        { label: 'Verificado por', valor: d.verificado_por_nombre ?? '' },
        { label: 'Cargo verificador', valor: d.cargo_verificador },
        { label: 'Observaciones', valor: d.observaciones_verificacion },
        { label: 'VoBo cumplimiento', valor: si(d.vobo_oficial_cumplimiento) },
      ],
    },
  ];

  const p = postulacion as unknown as Record<string, unknown>;
  return (
    <DocumentoImprimible
      volverA={`/postulaciones/${postulacion.id}`}
      titulo="Debida Diligencia · SAGRILAFT (F-CAR-01)"
      subtitulo="Circular 100-000016/2020 · Decreto 830/2021"
      empresaNombre={empresa.nombre}
      empresaNit={empresa.nit}
      secciones={secciones}
      nombreFirmante={nombre}
      documentoFirmante={d.identificacion}
      firmaImagenUrl={p.firma_debida_diligencia_imagen_url as string | undefined}
      firmaFecha={p.firma_debida_diligencia_en as Timestamp | undefined}
      firmaPdfUrl={p.firma_debida_diligencia_url as string | undefined}
    />
  );
}
