# Modelo de datos Firestore — Plataforma de Atracción EQUITEL

> Versión 1.0 · 2026-04-22 · diseñado contra `flujo_atraccion_talento.pdf` y el contexto maestro.

Este documento es el contrato de datos del holding EQUITEL. Antes de materializarlo en schemas zod + `firestore.rules` + `firestore.indexes.json`, se valida aquí y se cierran las preguntas abiertas del final.

---

## 0 · Convenciones transversales

Aplica a todas las colecciones salvo que se diga lo contrario.

### IDs
- Los IDs de documento son auto-generados por Firestore (`addDoc`) salvo casos con clave natural explícita:
  - `empresas/{codigo}` — **clave natural** (ej. `EQT`, `CUM`, `ING`, `SLP`). Decisión 2026-04-22.
  - `sedes/{codigo}` — **clave natural** (ej. `BOG`, `MED`, `CTG`, `CLI`, `BAR`). Decisión 2026-04-22.
  - `unidades/{id}`, `cargos_catalogo/{id}` — auto-generado.
  - `contadores/{codigo_empresa}_{codigo_sede}_{anio}` — clave natural.
  - `usuarios/{uid}` — usa el UID de Firebase Auth.
  - `festivos/{YYYY-MM-DD}` — clave natural para evitar duplicados.

### Auditoría (todos los docs)
- `creado_en` — `Timestamp` (server). Obligatorio.
- `creado_por` — `string` (UID del usuario). Obligatorio.
- `actualizado_en` — `Timestamp` (server). Se setea en cada mutación.
- `actualizado_por` — `string` (UID). Idem.

Nunca usar `new Date()` del cliente. Siempre `serverTimestamp()`.

### Nombres
- Colecciones y campos en **snake_case español**.
- Enums como strings lowercase con snake_case (`reemplazo`, `aumento`, `aprobado_por_lider`).

### Fechas
- Todas como `Timestamp` de Firestore.
- Timezone lógico: **America/Bogota**. El cliente convierte con `date-fns-tz`.
- Lógica de días hábiles: L-V, excluyendo los documentos de `festivos`.

### Denormalización estratégica
Al crear una entidad, se congelan los nombres legibles de las referencias para evitar reads en listados y sobrevivir cambios de catálogo:

| Documento | Campos denormalizados |
|---|---|
| `vacantes` | `empresa_nombre`, `empresa_codigo`, `sede_nombre`, `sede_codigo`, `unidad_nombre`, `cargo_nombre`, `cargo_criticidad_al_crear` |
| `procesos` | igual que `vacantes` + `analista_nombre` |
| `postulaciones` | `candidato_nombre`, `candidato_email`, `candidato_telefono`, `vacante_consecutivo`, `cargo_nombre` |
| `tickets_conexion` | `vacante_consecutivo`, `candidato_nombre`, `area_nombre` |

Las denormalizaciones **no** se actualizan cuando cambian sus fuentes: son un snapshot del momento.

### Soft-delete
No se borran documentos. Se usa `estado` (ej. `cancelada`, `archivada`) o campo `eliminado_en` (`Timestamp | null`) cuando aplique.

---

## 1 · Catálogos (mantenidos por admin / GH)

### 1.1 `empresas/{codigo}`
Clave natural = código (ej. `EQT`). Doc ID === `codigo`.
```
{
  id: string,                        // === codigo
  codigo: string,                    // redundante con id, para denormalización
  nombre: string,                    // "Equitel"
  razon_social: string,
  nit: string,
  activo: boolean,
  // auditoría
}
```
**Índices:** `(activo, nombre)`.

### 1.2 `sedes/{codigo}`
Clave natural = código (ej. `BOG`). Los códigos de sede deben ser únicos globales.
```
{
  id: string,                        // === codigo
  codigo: string,
  empresa_codigo: string,            // FK a empresas.codigo
  nombre: string,                    // "Bogotá"
  direccion: string,
  ciudad: string,
  activo: boolean,
  // auditoría
}
```
**Índices compuestos:** `(empresa_codigo, activo, nombre)`.

### 1.3 `unidades`
```
{
  id: string,                        // auto
  empresa_codigo: string,
  sede_codigo: string,               // FK a sedes.codigo
  nombre: string,                    // "Comercial Retail", "Operaciones Bogotá"
  activo: boolean,
  // auditoría
}
```
**Índices:** `(sede_codigo, activo, nombre)`.

### 1.4 `cargos_catalogo`
Vivo: GH lo actualiza durante 2026. Las vacantes ya creadas no se alteran por cambios acá (denormalización en `vacantes.cargo_nombre` y `cargo_criticidad_al_crear`).
```
{
  id: string,
  nombre: string,                    // "Asesor Comercial Senior"
  categoria: "comercial" | "tecnico" | "administrativo" | "operativo" | "liderazgo",
  criticidad_sugerida: "Alta" | "Media" | "Baja",
  banda_min: number | null,          // COP; null si GH aún no formalizó la banda
  banda_max: number | null,
  requiere_licencia: boolean,
  requiere_moto: boolean,
  requiere_tarjeta_profesional: boolean,
  requiere_titulo_profesional: boolean,
  pruebas_sugeridas: string[],       // ids de `plantillas_prueba` o nombres normalizados
  herramientas_sugeridas: {          // para disparar IT/compras desde paso 3
    computador: boolean,
    office: boolean,
    labroides: boolean,
    dotacion: boolean,
    // extensible
  },
  activo: boolean,
  // auditoría
}
```
**Índices:** `(activo, nombre)`, `(categoria, activo)`.

### 1.5 `festivos`
Clave natural `YYYY-MM-DD`. **Poblados vía Cloud Function scheduled** que corre cada 1 de diciembre y usa el paquete `colombian-holidays` para sembrar el año siguiente (decisión 2026-04-22).
```
{
  id: "2026-01-01",
  fecha: Timestamp,                  // medianoche Bogotá
  descripcion: "Año Nuevo",
  anio: 2026,
  origen: "colombian-holidays" | "manual",
}
```
**Índices:** `(anio)`.

### 1.6 `plantillas_comunicacion`
```
{
  id: string,
  tipo: "whatsapp" | "email",
  codigo: string,                    // "preentrevista_invitacion", "oferta_enviada"
  asunto: string | null,             // solo email
  cuerpo: string,                    // con placeholders {{candidato_nombre}}, {{vacante_cargo}}, ...
  variables_requeridas: string[],
  activa: boolean,
  // auditoría
}
```

### 1.7 `plantillas_graficas`
```
{
  id: string,
  codigo: string,                    // "oferta_comercial", "oferta_operativa"
  nombre: string,
  url_template: string,              // ruta a plantilla SVG/PNG en Storage
  tokens: string[],                  // {{cargo}}, {{sede}}, {{salario_texto}}
  activa: boolean,
  // auditoría
}
```

---

## 2 · Identidad y roles

### 2.1 `usuarios/{uid}`
Redundante con custom claims de Auth para permitir queries.
```
{
  id: string,                        // === uid
  email: string,
  nombre: string,
  apellido: string,
  rol: "lider" | "analista" | "coordinador" | "gh" | "apoyo" | "admin",
  area_apoyo: "it" | "compras" | "bodega" | "contabilidad" | "administrativo" | "talentos" | null,
  empresa_id: string | null,         // para líderes: a qué empresa pertenecen
  sede_id: string | null,
  unidad_id: string | null,          // para líderes: su unidad
  activo: boolean,
  // auditoría
}
```
**Índices:** `(rol, activo)`, `(area_apoyo, activo)`, `(unidad_id, activo)`.

---

## 3 · Contadores (atomicidad)

### 3.1 `contadores/{empresa_codigo}_{sede_codigo}_{anio}`
Clave natural, ej. `EQT_BOG_2026`.
```
{
  id: "EQT_BOG_2026",
  empresa_codigo: "EQT",
  sede_codigo: "BOG",
  anio: 2026,
  ultimo_numero: 45,                 // incrementa por Cloud Function en transacción
  actualizado_en: Timestamp,
}
```
La Cloud Function `onVacanteCreate` hace una transacción: lee contador, incrementa, escribe de vuelta y escribe `vacantes.consecutivo = EQT-BOG-2026-0045`.

---

## 4 · Núcleo del flujograma

### 4.1 `vacantes` (pasos 1–2)
```
{
  id: string,
  consecutivo: string,                // "" al crear; setea Cloud Function
  estado: "borrador" | "aprobada" | "lista_para_publicar" | "publicada"
        | "en_proceso" | "terna_enviada" | "seleccionado" | "en_contratacion"
        | "cerrada" | "desierta" | "cancelada" | "pausada",

  // identidad y denormalizaciones
  empresa_id: string,
  empresa_codigo: string,
  empresa_nombre: string,
  sede_id: string,
  sede_codigo: string,
  sede_nombre: string,
  unidad_id: string,
  unidad_nombre: string,
  cargo_id: string,
  cargo_nombre: string,
  cargo_criticidad_al_crear: "Alta" | "Media" | "Baja",

  // decisión humana
  criticidad: "Alta" | "Media" | "Baja",   // sobreescribible por líder
  tipo_solicitud: "reemplazo" | "aumento",
  justificacion: string,

  // condiciones
  salario_base: number,               // COP
  comisiones_texto: string,
  rodamiento: boolean,
  garantizado_texto: string,
  en_banda: boolean | null,           // null si cargo sin banda definida
  sin_banda_validada: boolean,        // true si cargo no tiene banda: GH debe revisar
  requiere_validacion_gh: boolean,    // true si en_banda === false

  // aval
  aval_url: string,                   // Storage URL al PDF
  aval_aprobado_por: string | null,   // uid de Alejandro cuando firme
  aval_aprobado_en: Timestamp | null,

  // agenda
  fecha_entrevista_propuesta: Timestamp,   // del formulario
  fecha_entrevista_pactada: Timestamp | null, // cerrada en perfilamiento (paso 3)

  // proceso activo
  proceso_activo_id: string | null,   // FK procesos; actualizado al abrir proceso

  // líder solicitante
  lider_uid: string,
  lider_nombre: string,

  // analista asignado (se llena en paso 3)
  analista_uid: string | null,
  analista_nombre: string | null,

  // cierre
  cerrada_en: Timestamp | null,
  razon_cierre: string | null,
  // auditoría
}
```
**Índices compuestos:**
- `(empresa_id, estado, creado_en desc)`
- `(analista_uid, estado, creado_en desc)`
- `(lider_uid, estado, creado_en desc)`
- `(estado, cargo_criticidad_al_crear, creado_en desc)` — para dashboards por criticidad

### 4.2 `procesos` (abre en paso 3, puede haber N históricos por vacante)
Una vacante puede quedar desierta y reabrirse: nuevo `proceso`. Solo uno activo por vacante.
```
{
  id: string,
  vacante_id: string,
  vacante_consecutivo: string,       // denormalizado
  numero_intento: number,             // 1, 2, 3 para reaperturas
  estado: "activo" | "cerrado_seleccion" | "desierto" | "cancelado",

  analista_uid: string,
  analista_nombre: string,

  // perfilamiento (paso 3)
  perfilamiento: {
    criterios_texto: string,
    empresas_competencia: string[],
    herramientas_requeridas: {
      computador: boolean,
      office: boolean,
      labroides: boolean,
      dotacion: boolean,
      // extensible
    },
    fecha_entrevista_lider_pactada: Timestamp,
    compromiso_agenda_lider_cumplido: boolean | null, // se setea en paso 13
    notas: string,
    completado_en: Timestamp | null,
  } | null,

  // denormalizaciones de vacante
  empresa_id, empresa_codigo, sede_id, sede_codigo, unidad_id,
  cargo_id, cargo_nombre, cargo_criticidad_al_crear,

  abierto_en: Timestamp,
  cerrado_en: Timestamp | null,
  // auditoría
}
```
**Índices:**
- `(vacante_id, estado)`
- `(analista_uid, estado, abierto_en desc)`

### 4.3 `publicaciones` (paso 4)
Una fila por canal donde se publica la oferta.
```
{
  id: string,
  proceso_id: string,
  vacante_id: string,
  vacante_consecutivo: string,
  canal: "magneto" | "linkedin_pagina" | "caja_compensacion" | "institucion" | "otro",
  canal_detalle: string | null,       // "Compensar", "SENA Bogotá"
  url_externa: string | null,         // link a la publicación en el canal
  id_externo: string | null,          // id del lado del canal para sync
  pieza_grafica_url: string | null,
  estado: "programada" | "publicada" | "retirada" | "error",
  publicada_en: Timestamp | null,
  retirada_en: Timestamp | null,
  postulaciones_recibidas: number,    // cache denormalizado
  // auditoría
}
```
**Índices:** `(proceso_id, canal)`, `(vacante_id, estado)`.

### 4.4 `candidatos` (creados en paso 5, cross-vacante)
**Clave de deduplicación: `documento_numero` + `documento_tipo`** (decisión 2026-04-22). Cuando el candidato aún no ha entregado documento (postulación temprana por Magneto/LinkedIn), se crea un candidato "provisional" y se mergea cuando llega el documento. La Cloud Function `onCandidatoCreate` verifica duplicados por `documento_numero`.
```
{
  id: string,                         // auto
  nombres: string,
  apellidos: string,
  email: string,
  telefono: string,
  documento_tipo: "CC" | "CE" | "PEP" | "PA" | null,
  documento_numero: string | null,    // clave de dedupe
  provisional: boolean,               // true si aún no tiene documento
  ciudad_residencia: string | null,

  origen: "magneto" | "linkedin" | "caja" | "referido" | "hunter" | "directo" | "migracion",
  magneto_id: string | null,
  linkedin_url: string | null,

  fuente_hv_url: string | null,
  observaciones: string,

  // Alertas: array flexible (decisión 2026-04-22)
  alertas: [
    {
      tipo: string,                   // "antecedentes_penales" | "demandas_laborales" | "pareja_embarazo" | "recomendacion_medica" | ...
      valor: string | boolean,
      evidencia_url: string | null,
      verificada_en: Timestamp | null,
      verificada_por_uid: string | null,
      notas: string | null,
    }
  ],
  alertas_tipos: string[],            // denormalización para queries (ej. array-contains)

  // auditoría
}
```
**Índices:** `(documento_tipo, documento_numero)` único por reglas, `(email)`, `(origen, creado_en desc)`, `(alertas_tipos array-contains, creado_en desc)`.

### 4.5 `postulaciones` (relación candidato ↔ proceso, paso 5 en adelante)
```
{
  id: string,
  candidato_id: string,
  proceso_id: string,
  vacante_id: string,
  vacante_consecutivo: string,
  cargo_nombre: string,
  candidato_nombre: string,
  candidato_email: string,
  candidato_telefono: string,

  estado: "postulado" | "pre_entrevistado" | "pruebas_enviadas" | "entrevistado"
        | "referencias_ok" | "documentacion_candidato_ok" | "en_terna"
        | "aprobado_por_lider" | "descartado"
        | "en_medicos" | "apto_medico" | "no_apto_medico"
        | "carpeta_entregada" | "ingresado",

  // trazabilidad temporal por etapa (facilita ANS)
  marcas: {
    postulado_en: Timestamp,
    pre_entrevistado_en: Timestamp | null,
    pruebas_enviadas_en: Timestamp | null,
    entrevistado_en: Timestamp | null,
    en_terna_en: Timestamp | null,
    decidido_en: Timestamp | null,
    en_medicos_en: Timestamp | null,
    apto_medico_en: Timestamp | null,
    carpeta_entregada_en: Timestamp | null,
    ingresado_en: Timestamp | null,
    descartado_en: Timestamp | null,
  },

  origen_publicacion_id: string | null, // FK publicaciones (si aplica)
  razon_descarte: string | null,
  descarte_etapa: string | null,        // en qué etapa se descartó (drop-off)

  // denormalizaciones ligeras
  analista_uid: string,

  // auditoría
}
```
**Índices:**
- `(proceso_id, estado)`
- `(vacante_id, estado)`
- `(candidato_id, creado_en desc)` — historial cross-vacante
- `(analista_uid, estado)`

### 4.6 `contactos_candidato` (paso 6 y cualquier comunicación)
Trazabilidad de mensajes WhatsApp y llamadas.
```
{
  id: string,
  candidato_id: string,
  postulacion_id: string | null,      // si es dentro de un proceso
  canal: "whatsapp" | "llamada" | "email",
  direccion: "saliente" | "entrante",
  plantilla_id: string | null,        // FK plantillas_comunicacion
  mensaje_texto: string | null,
  respuesta_texto: string | null,
  respuesta_recibida_en: Timestamp | null,
  respondido_interes: boolean | null, // true/false según preentrevista
  autor_uid: string,                  // quién envió/registró
  enviado_en: Timestamp,
  // auditoría (creado_en igual a enviado_en en la mayoría de casos)
}
```
**Índices:** `(candidato_id, enviado_en desc)`, `(postulacion_id, enviado_en desc)`.

### 4.7 `pruebas` (paso 7)
Una por postulación × prueba aplicada. **Reutilización cross-vacante con TTL 6 meses** (decisión 2026-04-22): si el candidato ya tiene prueba `realizada_en` < 6 meses, la UI sugiere reutilizar con botón explícito; el analista decide.
```
{
  id: string,
  postulacion_id: string,
  candidato_id: string,
  proceso_id: string,
  tipo: "psicotecnica" | "tecnica" | "conocimiento",
  proveedor: "magneto" | "interna",
  codigo_prueba: string,              // identificador de la plantilla/prueba
  nombre: string,
  enviada_en: Timestamp,
  realizada_en: Timestamp | null,
  resultado_url: string | null,       // Storage URL al PDF descargado de Magneto
  resultado_resumen: string | null,
  competencias: {                     // si la prueba genera score por competencia
    [competencia: string]: number,    // 0-100
  } | null,
  cumple_expectativas: boolean | null,
  // auditoría
}
```
**Índices:** `(postulacion_id, tipo)`, `(candidato_id, realizada_en desc)` — reutilización cross-vacante.

### 4.8 `entrevistas` (pasos 8 y 13)
```
{
  id: string,
  postulacion_id: string,
  candidato_id: string,
  proceso_id: string,
  tipo: "analista" | "lider",
  modalidad: "presencial" | "virtual" | "telefonica",
  programada_para: Timestamp,
  duracion_min: number,
  sala_o_link: string | null,
  entrevistador_uid: string,
  entrevistador_nombre: string,
  google_calendar_event_id: string | null,
  estado: "programada" | "realizada" | "no_asistio" | "cancelada",
  realizada_en: Timestamp | null,

  // feedback post-entrevista
  feedback: {
    cumple_perfil: boolean | null,
    fortalezas: string,
    oportunidades: string,
    recomendacion: "avanzar" | "descartar" | "considerar_otro_cargo" | null,
    notas: string,
    completado_en: Timestamp | null,
    completado_por_uid: string | null,
  } | null,

  // auditoría
}
```
**Índices:** `(postulacion_id, tipo)`, `(entrevistador_uid, programada_para asc)`, `(proceso_id, tipo, programada_para asc)`.

### 4.9 `referencias` (paso 9)
```
{
  id: string,
  postulacion_id: string,
  candidato_id: string,
  empresa: string,
  cargo_ocupado: string,
  nombre_contacto: string,
  cargo_contacto: string,
  telefono_contacto: string,
  email_contacto: string | null,
  verificada: boolean,
  verificada_en: Timestamp | null,
  verificada_por_uid: string | null,
  resultado: "positiva" | "neutra" | "negativa" | null,
  observaciones: string,
  // auditoría
}
```
**Índices:** `(postulacion_id, verificada)`.

### 4.10 `documentos_candidato` (paso 10)
Documentos que el candidato entrega para el informe.
```
{
  id: string,
  candidato_id: string,
  postulacion_id: string | null,      // null si es subida del candidato cross-vacante
  tipo: "hoja_vida" | "cedula" | "titulo" | "diploma" | "certificacion"
      | "certificado_laboral" | "pase_judicial" | "otro",
  nombre_original: string,
  archivo_url: string,                // Storage
  tamano_bytes: number,
  verificado: boolean,
  verificado_en: Timestamp | null,
  verificado_por_uid: string | null,
  notas: string,
  // auditoría
}
```
**Índices:** `(candidato_id, tipo)`, `(postulacion_id, tipo)`.

### 4.11 `informes` (pasos 11–12)
Informe consolidado que el analista envía al líder.
```
{
  id: string,
  postulacion_id: string,
  proceso_id: string,
  vacante_id: string,

  resumen_ejecutivo: string,
  trayectoria: string,
  cumplimiento_criterios: {
    [criterio: string]: "cumple" | "parcial" | "no_cumple",
  },
  competencias_destacadas: string[],
  alertas: string[],
  aspiracion_salarial: number | null,
  disponibilidad_ingreso: Timestamp | null,
  recomendacion_analista: "avanzar" | "descartar" | "con_reservas",
  version: number,                    // si el informe se revisa y reenvía

  enviado_al_lider_en: Timestamp | null,
  enviado_por_uid: string | null,
  url_pdf: string | null,             // export a PDF opcional
  // auditoría
}
```
**Índices:** `(postulacion_id, version desc)`, `(proceso_id, enviado_al_lider_en desc)`.

### 4.12 `ternas` (agrupa N postulaciones presentadas al líder)
El loop del paso 14 "no aprobado → nuevo candidato" se modela así: la `terna` crece o se reemplaza; cuando el líder decide sobre una postulación y la descarta, otra postulación del pool entra a la terna.
```
{
  id: string,
  proceso_id: string,
  vacante_id: string,
  vacante_consecutivo: string,
  numero_version: number,             // 1, 2, 3 cuando se re-terna tras descarte
  postulaciones_ids: string[],        // 3-5 elementos
  enviada_al_lider_en: Timestamp | null,
  vigente: boolean,                   // true si es la versión activa
  cerrada_en: Timestamp | null,
  razon_cierre: "seleccion" | "reterna" | "proceso_desierto" | null,
  // auditoría
}
```
**Índices:** `(proceso_id, vigente)`, `(vacante_id, numero_version desc)`.

### 4.13 `decisiones` (paso 14)
```
{
  id: string,
  postulacion_id: string,
  proceso_id: string,
  terna_id: string,
  lider_uid: string,
  lider_nombre: string,
  aprobado: boolean,
  feedback_lider: string,
  condiciones_adicionales: string | null,
  decidido_en: Timestamp,
  // auditoría
}
```
**Índices:** `(proceso_id, aprobado)`, `(lider_uid, decidido_en desc)`.

### 4.14 `validaciones_salariales` (paso 2 cuando salario fuera de banda)
```
{
  id: string,
  vacante_id: string,
  vacante_consecutivo: string,
  salario_solicitado: number,
  banda_min: number | null,
  banda_max: number | null,
  estado: "pendiente" | "aprobada" | "rechazada" | "ajustada",
  respuesta_gh: string | null,
  salario_aprobado: number | null,
  respondida_por_uid: string | null,
  respondida_en: Timestamp | null,
  // auditoría
}
```
**Índices:** `(estado, creado_en asc)` — para cola de GH.

### 4.15 `examenes_medicos` (pasos 15–17)
Un documento por candidato seleccionado.
```
{
  id: string,
  postulacion_id: string,
  candidato_id: string,
  vacante_id: string,
  proceso_id: string,

  // paso 15: solicitud a GH
  solicitada_en: Timestamp,
  solicitada_por_uid: string,

  // paso 16: orden y envío
  orden_url: string | null,           // PDF de la orden
  enviada_al_candidato_en: Timestamp | null,
  centro_medico: string | null,

  // paso 17: concepto
  concepto_recibido_en: Timestamp | null,
  concepto_url: string | null,
  apto: boolean | null,
  recomendaciones: string | null,

  estado: "solicitada" | "enviada" | "realizada" | "apto" | "no_apto",
  // auditoría
}
```
**Índices:** `(estado)`, `(postulacion_id)`.

### 4.16 `carpetas_digitales` (pasos 18–19)
Agregador final de documentos para GH.
```
{
  id: string,
  postulacion_id: string,
  candidato_id: string,
  vacante_id: string,
  estado: "armando" | "lista" | "entregada_gh" | "observada" | "aprobada",
  checklist: {
    hoja_vida: boolean,
    cedula: boolean,
    titulos: boolean,
    referencias_verificadas: boolean,
    concepto_medico: boolean,
    documentos_adicionales_completos: boolean,
  },
  documentos_ids: string[],           // FK documentos_candidato
  entregada_en: Timestamp | null,
  entregada_a_uid: string | null,     // asistente de GH
  observaciones_gh: string | null,
  aprobada_en: Timestamp | null,
  // auditoría
}
```
**Índices:** `(estado)`, `(postulacion_id)`.

### 4.17 `tickets_conexion` (paso 20, decisión 2026-04-22: tickets nativos)
Una fila por área × candidato. Se disparan por Cloud Function al cambiar `postulaciones.estado = "carpeta_entregada"` y también en adelanto desde paso 3 cuando se conocen herramientas.
```
{
  id: string,
  postulacion_id: string,
  candidato_id: string,
  candidato_nombre: string,           // denormalizado
  vacante_id: string,
  vacante_consecutivo: string,
  cargo_nombre: string,

  area: "talentos" | "it" | "compras" | "bodega" | "contabilidad" | "administrativo",
  sub_area_detalle: string | null,    // "office", "dotacion", "labroides", "puesto_fisico"

  tipo_disparo: "adelantado" | "final",  // adelantado = paso 3; final = paso 20
  titulo: string,
  descripcion: string,
  requisitos: object,                 // detalle específico por área (flexible)

  estado: "abierto" | "en_progreso" | "bloqueado" | "resuelto" | "cancelado",
  asignado_a_uid: string | null,      // responsable en esa área
  asignado_a_nombre: string | null,
  bloqueado_motivo: string | null,

  ans_horas_habiles: number,          // cuánto tiempo hábil tiene el ticket según criticidad
  ans_expira_en: Timestamp,           // cálculo hecho al crear
  resuelto_en: Timestamp | null,
  evidencia_url: string | null,
  // auditoría
}
```
**Índices:**
- `(area, estado, ans_expira_en asc)` — cola por área
- `(postulacion_id, area)` — estado completo de un candidato
- `(vacante_id, estado)`
- `(asignado_a_uid, estado)`

---

## 5 · Transversales

### 5.1 `ans_seguimiento`
Un documento por etapa activa de cada vacante/postulación. Alimenta dashboards (Módulo 9) y el semáforo verde/ámbar/rojo.
```
{
  id: string,
  entidad_tipo: "vacante" | "postulacion" | "ticket_conexion",
  entidad_id: string,
  vacante_id: string,                 // para agregaciones
  etapa: string,                      // ej. "perfilamiento", "publicacion", "medicos"
  responsable_uid: string,
  responsable_rol: string,
  iniciada_en: Timestamp,
  vence_en: Timestamp,
  horas_habiles_objetivo: number,
  cumplida_en: Timestamp | null,
  estado: "en_curso" | "cumplida" | "vencida",
  // auditoría
}
```
**Índices:** `(estado, vence_en asc)`, `(responsable_uid, estado)`, `(vacante_id, etapa)`.

### 5.2 `eventos` (audit log append-only)
```
{
  id: string,
  tipo: string,                       // "vacante.creada", "postulacion.estado_cambiado", ...
  entidad_tipo: string,
  entidad_id: string,
  vacante_id: string | null,          // para filtrar por vacante
  autor_uid: string,
  autor_rol: string,
  payload: object,                    // diff o detalle
  creado_en: Timestamp,
  // NOTA: no lleva actualizado_en/actualizado_por. Append-only.
}
```
**Índices:** `(entidad_id, creado_en desc)`, `(vacante_id, creado_en desc)`, `(tipo, creado_en desc)`.

Reglas de seguridad: **nadie** puede `update` ni `delete` en esta colección. Solo `create` por Cloud Functions (via `request.auth == null` con runtime de functions) o por usuarios con custom claim admin.

### 5.3 `notificaciones`
```
{
  id: string,
  destinatario_uid: string,
  tipo: "agenda_pendiente" | "terna_recibida" | "examenes_listos"
      | "ticket_nuevo" | "ans_por_vencer" | "ans_vencido" | "mensaje",
  titulo: string,
  mensaje: string,
  url_accion: string | null,          // ruta interna ej. "/vacantes/abc123"
  leida: boolean,
  leida_en: Timestamp | null,
  relevante_hasta: Timestamp | null,
  entidad_id: string | null,
  // auditoría
}
```
**Índices:** `(destinatario_uid, leida, creado_en desc)`.

---

## 6 · Relaciones (mapa textual)

```
empresas ─┬─< sedes ─┬─< unidades
          │          │
          │          └─< vacantes (paso 1)
          │                │
          │                ├── contador (EQT_BOG_2026) ──< consecutivos
          │                │
          │                ├── validaciones_salariales (paso 2, si fuera de banda)
          │                │
          │                └─< procesos (paso 3 abre uno; N históricos)
          │                        │
          │                        ├─< publicaciones (paso 4, N por canal)
          │                        │
          │                        └─< postulaciones (paso 5)
          │                                 │
          │                                 ├── candidato (paso 5, cross-vacante)
          │                                 │
          │                                 ├─< contactos_candidato (paso 6)
          │                                 │
          │                                 ├─< pruebas (paso 7)
          │                                 │
          │                                 ├─< entrevistas (pasos 8, 13)
          │                                 │
          │                                 ├─< referencias (paso 9)
          │                                 │
          │                                 ├─< documentos_candidato (paso 10)
          │                                 │
          │                                 ├── informe (pasos 11-12)
          │                                 │
          │                                 ├── terna (paso 12)
          │                                 │      └── decisión (paso 14)
          │                                 │
          │                                 ├── examen_medico (pasos 15-17)
          │                                 │
          │                                 ├── carpeta_digital (pasos 18-19)
          │                                 │
          │                                 └─< tickets_conexion (paso 20; N por área)
          │
cargos_catalogo ─┴─< vacantes (al crear: denormaliza nombre + criticidad)

usuarios ──< vacantes.lider_uid, procesos.analista_uid, tickets_conexion.asignado_a_uid, ...

ans_seguimiento ──> cualquier entidad cuyo ANS se mide
eventos          ──> append-only sobre todo
notificaciones   ──> usuarios
```

---

## 7 · Reglas de seguridad (alto nivel)

Las reglas detalladas se escriben en `firestore.rules` como paso siguiente. Principios:

- **Default deny.** Cualquier operación requiere autenticación.
- **Roles vienen de custom claims**, verificados en las reglas como `request.auth.token.rol`.
- **Escrituras de catálogos:** solo admin y gh.
- **Escrituras de `contadores`:** solo Cloud Function (sin auth).
- **Creación de `vacantes`:** rol `lider` o superior, con `empresa_id` ∈ empresas del usuario.
- **Lectura de `vacantes`:**
  - lider: solo sus unidades o las creadas por él.
  - analista: solo las asignadas a su uid.
  - coordinador / gh / admin: todas.
  - apoyo: solo vacantes donde haya un ticket para su área.
- **`eventos`:** read solo admin/coordinador/gh; write solo functions.
- **`examenes_medicos`, `validaciones_salariales`:** read analista + gh + admin; write gh + admin.
- **`tickets_conexion`:** read según area del usuario + analista dueño + coordinador/admin; write por quien esté asignado.
- **`postulaciones.estado`:** transiciones controladas por Cloud Functions cuando toquen cambios sensibles (ej. `aprobado_por_lider`, `apto_medico`). El cliente sólo propone la intención; la function valida y escribe.

---

## 8 · Índices compuestos (resumen consolidado)

| Colección | Índice | Uso |
|---|---|---|
| `vacantes` | (empresa_id, estado, creado_en desc) | tablero por empresa |
| `vacantes` | (analista_uid, estado, creado_en desc) | tablero analista |
| `vacantes` | (lider_uid, estado, creado_en desc) | tablero líder |
| `vacantes` | (estado, cargo_criticidad_al_crear, creado_en desc) | segmentación por criticidad |
| `sedes` | (empresa_id, activo, nombre) | dropdown dependiente |
| `unidades` | (sede_id, activo, nombre) | dropdown dependiente |
| `procesos` | (vacante_id, estado) | proceso activo por vacante |
| `procesos` | (analista_uid, estado, abierto_en desc) | carga del analista |
| `postulaciones` | (proceso_id, estado) | embudo del proceso |
| `postulaciones` | (candidato_id, creado_en desc) | historial cross-vacante |
| `postulaciones` | (analista_uid, estado) | cola del analista |
| `pruebas` | (postulacion_id, tipo) | vista de postulación |
| `pruebas` | (candidato_id, realizada_en desc) | reutilización |
| `entrevistas` | (entrevistador_uid, programada_para asc) | agenda |
| `entrevistas` | (proceso_id, tipo, programada_para asc) | calendario proceso |
| `tickets_conexion` | (area, estado, ans_expira_en asc) | cola por área |
| `tickets_conexion` | (postulacion_id, area) | vista candidato |
| `ans_seguimiento` | (estado, vence_en asc) | semáforo global |
| `ans_seguimiento` | (responsable_uid, estado) | dashboard personal |
| `eventos` | (entidad_id, creado_en desc) | línea de tiempo |
| `eventos` | (vacante_id, creado_en desc) | línea de tiempo por vacante |
| `notificaciones` | (destinatario_uid, leida, creado_en desc) | buzón |
| `validaciones_salariales` | (estado, creado_en asc) | cola GH |

---

## 9 · Verificación del modelo contra el flujograma

| Paso flujograma | Colección(es) que lo capturan |
|---|---|
| 1. Solicitud de vacante | `vacantes` (estado `borrador`) |
| 2. Revisión aval y condiciones | `vacantes.aval_aprobado_*`, `validaciones_salariales` |
| 3. Perfilamiento | `procesos.perfilamiento`, `vacantes.fecha_entrevista_pactada` |
| 4. Publicación | `publicaciones` |
| 5. Reclutamiento HV | `candidatos`, `postulaciones` |
| 6. Preentrevista | `contactos_candidato`, `postulaciones.estado = pre_entrevistado` |
| 7. Pruebas psicológicas | `pruebas` |
| 8. Entrevista analista | `entrevistas` (tipo `analista`) |
| 9. Validación referencias | `referencias` |
| 10. Solicitud documentos | `documentos_candidato` |
| 11. Informe | `informes` |
| 12. Envío informe al líder | `informes.enviado_al_lider_en`, `ternas` (si se arma) |
| 13. Citación entrevista líder | `entrevistas` (tipo `lider`) |
| 14. Feedback → aprobado? | `decisiones` + update `postulaciones.estado` |
| 14. No aprobado | nueva versión de `ternas` + nueva `postulacion` al pool |
| 15. Solicitud exámenes | `examenes_medicos` (solicitada) |
| 16. Envío al candidato | `examenes_medicos.enviada_al_candidato_en` |
| 17. Concepto médico | `examenes_medicos.apto`, `.recomendaciones` |
| 18. Organización documentos | `carpetas_digitales` |
| 19. Entrega carpeta | `carpetas_digitales.entregada_en` |
| 20. Procesos de conexión | `tickets_conexion` |

Todos los 20 pasos tienen representación. Fases del flujograma = proyección del campo `vacantes.estado` a color de fase para la UI.

---

## 10 · Decisiones cerradas (2026-04-22)

Todas las preguntas abiertas quedaron resueltas:

1. **IDs empresas y sedes = clave natural (`codigo`).** `empresas/{EQT}`, `sedes/{BOG}`. Lookups directos y reglas simples.
2. **Terna como colección separada con versionado** (`ternas.numero_version`, `vigente: boolean`). Soporta el loop del paso 14 con historial.
3. **Informe como colección separada con versionado** (`informes.version`). Permite re-envíos corregidos y exports a PDF.
4. **Alertas del candidato como array flexible** con `tipo`, `valor`, `evidencia_url`, `verificada_en`, `verificada_por_uid`, `notas`. Se denormaliza `alertas_tipos: string[]` para queries `array-contains`.
5. **Deduplicación de candidatos por `documento_tipo + documento_numero`** con Cloud Function `onCandidatoCreate`. Soporta candidatos "provisional" cuando aún no hay documento.
6. **Festivos vía paquete npm + Cloud Function scheduled** anual (`colombian-holidays`). Una function programada cada 1 de diciembre siembra el año siguiente.
7. **Reutilización de pruebas con TTL 6 meses + sugerencia al analista.** La UI ofrece botón "reutilizar" si existe prueba válida reciente; el analista decide.
8. **Cargos sin banda salarial avanzan con flag `sin_banda_validada=true`.** No bloquean al líder. GH revisa en paralelo desde su tablero.

---

## 11 · Próximos pasos de construcción

Ejecución en este orden:

1. **Bootstrap del proyecto** — package.json, tsconfig, Vite, Tailwind (paleta navy/gold/cream), Firebase config con emuladores, rutas base.
2. **Schemas zod compartidos** (`src/schemas/*.ts`) — un archivo por colección del MVP: empresas, sedes, unidades, cargos_catalogo, usuarios, vacantes, contadores, festivos. Resto en fases siguientes.
3. **`firestore.rules`** con default-deny + matriz de permisos por rol.
4. **`firestore.indexes.json`** con los índices compuestos listados en §8.
5. **Cloud Functions iniciales:**
   - `onVacanteCreate` → asigna consecutivo atómicamente.
   - `onCandidatoCreate` → valida dedupe por documento.
   - `scheduledSeedFestivos` → siembra festivos anuales.
6. **Seed inicial** — 4 empresas, sedes base (BOG/MED/CTG/CLI/BAR), 1 admin, 1 líder de prueba, 2 cargos ejemplo, festivos 2026 (vía emulador).
7. **Adaptación Módulo 1** — `vacanteSchema.ts` y `useVacantes.ts` al nuevo modelo + componentes `VacanteForm`, `AvalUploader`, `SelectorCargo`, `ValidadorSalario` + página `NuevaVacantePage` + ruta en `App.tsx`.
8. **Módulo 10 mínimo (admin catálogos)** — UI para crear/editar empresas, sedes, unidades y cargos desde el panel admin.
