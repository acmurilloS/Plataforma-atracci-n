import { z } from 'zod';

export const rolUsuario = z.enum(['lider', 'analista', 'coordinador', 'gh', 'apoyo', 'admin']);
export type RolUsuario = z.infer<typeof rolUsuario>;

export const areaApoyo = z.enum([
  'it',
  'compras',
  'bodega',
  'contabilidad',
  'administrativo',
  'talentos',
]);
export type AreaApoyo = z.infer<typeof areaApoyo>;

export const criticidad = z.enum(['Alta', 'Media', 'Baja']);
export type Criticidad = z.infer<typeof criticidad>;

export const tipoSolicitud = z.enum(['reemplazo', 'aumento']);
export type TipoSolicitud = z.infer<typeof tipoSolicitud>;

export const estadoVacante = z.enum([
  'borrador',
  'aprobada',
  'lista_para_publicar',
  'publicada',
  'en_proceso',
  'terna_enviada',
  'seleccionado',
  'en_contratacion',
  'cerrada',
  'desierta',
  'cancelada',
  'pausada',
]);
export type EstadoVacante = z.infer<typeof estadoVacante>;

// `estadoPostulacion` y `EstadoPostulacion` viven ahora en ./postulacionSchema.ts
// (16 estados — reemplazó al enum legado de 14 estados el 2026-04-29).

export const categoriaCargo = z.enum([
  'comercial',
  'tecnico',
  'administrativo',
  'operativo',
  'liderazgo',
]);
export type CategoriaCargo = z.infer<typeof categoriaCargo>;

export const codigoEmpresaSede = z
  .string()
  .regex(/^[A-Z]{3,4}$/, 'Código inválido (3 o 4 letras mayúsculas)');
