# Flujograma → Roles → Pantallas

> Versión 1.0 · 2026-04-22 · pegado al `flujo_atraccion_talento.pdf` + contexto maestro.

Cada uno de los 20 pasos se ejecuta por uno o más roles. Donde hay dos roles involucrados, el **protagonista** es el que acciona, el **acompañante** valida o recibe. Al final de la tabla hay la lista de pantallas que deben existir para cubrir los 20 pasos con espacio propio a lo que no encaja en roles existentes.

## Leyenda de roles

- **líder**: abre vacantes, define criterios, aprueba candidato.
- **analista**: Rosa / Génesis — perfila, publica, reclutea, entrevista, arma terna.
- **coordinador**: Karen — asigna analista, supervisa ANS global, reasigna.
- **gh**: Maribel + asistente — valida salario, tramita exámenes, organiza contratación.
- **apoyo**: IT / compras / bodega / contabilidad / administrativo / talentos — tickets del paso 20.
- **admin**: DOGE — acceso total, configuración.
- **candidato** (externo, no loguea): recibe WhatsApp, correos, links de entrevista, pruebas.
- **sistema**: Cloud Function automática (consecutivo, tickets autoprogramados, notificaciones).

## Tabla maestra: paso → protagonistas → acompañantes → qué dispara

| # | Paso | Protagonista | Acompañante | Qué queda registrado | Quién valida antes de avanzar |
|---|---|---|---|---|---|
| 1 | Solicitud de vacante | **líder** | sistema (consecutivo) | `vacantes` con estado `borrador` | — |
| 2 | Revisión de aval y condiciones | **gh** | Alejandro (firma aval) · coordinador | `vacantes.aval_aprobado_*` · `validaciones_salariales` si fuera de banda | gh confirma → estado `aprobada` |
| 3 | Perfilamiento del cargo | **analista** | líder (define criterios + agenda entrevista) · coordinador (asigna analista) | `procesos.perfilamiento` · `vacantes.fecha_entrevista_pactada` · tickets `adelantado` a IT/compras/bodega | analista + líder cierran → estado `lista_para_publicar` |
| 4 | Publicación y divulgación | **analista** | coordinador (aprueba piezas) | `publicaciones` (1 fila por canal) | — → estado `publicada` |
| 5 | Reclutamiento de HV | **analista** | candidato (se postula) | `candidatos` + `postulaciones` con estado `postulado` | — |
| 6 | Preentrevista | **analista** | candidato (WhatsApp / llamada) | `contactos_candidato` · `postulaciones.estado = pre_entrevistado` | analista marca interés sí/no |
| 7 | Envío de pruebas psicológicas | **analista** (dispara) | candidato (realiza) · sistema (Magneto API) | `pruebas` con resultado PDF | resultados Magneto llegan |
| 8 | Entrevista con analista | **analista** | candidato | `entrevistas` tipo `analista` + feedback | analista guarda feedback |
| 9 | Validación de referencias | **analista** | contactos del candidato | `referencias` | analista marca verificada |
| 10 | Solicitud de documentos | **analista** (pide) | candidato (entrega) | `documentos_candidato` | analista marca verificado |
| 11 | Realización del informe | **analista** | — | `informes` versión 1 | analista revisa |
| 12 | Envío del informe al líder | **analista** | líder (recibe) | `informes.enviado_al_lider_en` · `ternas` (si se arma) · `postulaciones.estado = en_terna` | líder recibe notificación |
| 13 | Citación entrevista con el líder | **analista** (cita) | líder (atiende) | `entrevistas` tipo `lider` + Google Calendar event | — |
| 14 | Feedback líder–analista + decisión | **líder** (decide) | analista (acompaña) | `decisiones` con `aprobado: bool` | **si NO** → postulación `descartado`, regresa al paso 5 con nuevo candidato de la terna. **si SÍ** → `postulaciones.estado = aprobado_por_lider` |
| 15 | Solicitud de exámenes médicos | **gh** (recibe) | analista (dispara ticket) | ticket `examenes_medicos` estado `solicitada` | gh recibe solicitud |
| 16 | Envío de exámenes al candidato | **gh** | candidato (agenda laboratorio) | `examenes_medicos.enviada_al_candidato_en` | candidato cumple cita |
| 17 | Solicitud de concepto médico | **gh** | laboratorio (entrega PDF) | `examenes_medicos.concepto_*` con `apto: bool` | gh clasifica apto/no apto |
| 18 | Organización de documentos | **analista** | gh (valida) | `carpetas_digitales.checklist` | todos los docs del candidato en orden |
| 19 | Entrega de carpeta | **analista** (entrega digital) | gh (recibe) | `carpetas_digitales.entregada_en` + `.aprobada_en` | gh aprueba carpeta |
| 20 | Solicitud de procesos de conexión | **analista** (dispara) · **apoyo** (resuelve cada ticket) | gh (coordina ingreso) · candidato (recibe accesos, equipo, dotación) | `tickets_conexion` por área (it, compras, bodega, contabilidad, administrativo, talentos) + notificaciones automáticas | cada área cierra su ticket → vacante `cerrada` |

## Roles transversales

Aparecen en varios pasos sin ser protagonistas:

- **coordinador (Karen)**: asigna analista en paso 3, supervisa ANS global, reasigna si un analista está saturado. Atraviesa todos los pasos desde un tablero agregado.
- **admin**: todo + configuración de catálogos + seed + impersonación.
- **sistema (Cloud Functions)**:
  - Paso 1 → consecutivo atómico.
  - Paso 3 → disparo adelantado de tickets de herramientas a IT/compras.
  - Paso 2 → ruteo automático si fuera de banda → GH.
  - Paso 14 → al aprobar, auto-crea `examenes_medicos` (paso 15).
  - Paso 19 → al aprobar carpeta, auto-crea `tickets_conexion` (paso 20).
  - Todos → escribe `eventos` y `ans_seguimiento`.

## Pantallas necesarias (agrupadas por rol protagonista)

Las que ya existen hoy van marcadas ✅, las que faltan ⏳.

### Líder
- ✅ `/vacantes/nueva` — solicitud (paso 1).
- ⏳ `/mis-vacantes` — lista de las propias con ANS visible.
- ⏳ `/vacantes/:id/perfilamiento` — confirma criterios + fecha de entrevista con analista (paso 3).
- ⏳ `/vacantes/:id/terna` — revisa los 3–5 finalistas y da feedback + decisión (pasos 13–14).

### Analista
- ✅ `/vacantes` — lista global (hoy compartida con coord/gh/admin; analista debe verla filtrada por `analista_uid`).
- ⏳ `/vacantes/:id/perfilamiento` — cierra perfilamiento (paso 3).
- ⏳ `/vacantes/:id/publicacion` — editor de pieza + multi-canal (paso 4).
- ⏳ `/vacantes/:id/postulaciones` — kanban/lista de HV agregadas (pasos 5–6) con acciones masivas WhatsApp.
- ⏳ `/postulaciones/:id` — vista única del candidato × proceso con sub-paneles: pruebas (7), entrevista analista (8), referencias (9), documentos (10), informe (11–12), entrevista líder (13), feedback (14).
- ⏳ `/vacantes/:id/contratacion` — exámenes (15–17), documentos (18), carpeta (19), tickets conexión (20).

### Coordinador (Karen)
- ✅ `/vacantes` — lista global con filtros por estado/empresa/analista.
- ⏳ `/dashboard` — ANS por analista, drop-off por etapa, vacantes críticas, reasignación.
- ⏳ `/asignaciones` — qué analista lleva qué procesos, carga por persona, botón reasignar.

### GH (Maribel + asistente)
- ⏳ `/validaciones-salariales` — cola de vacantes con `requiere_validacion_gh=true` o `sin_banda_validada=true` (paso 2).
- ⏳ `/examenes-medicos` — cola de solicitudes, orden, concepto (pasos 15–17).
- ⏳ `/carpetas` — cola de entrega digital, aprobar / observar (pasos 18–19).

### Apoyo (IT, compras, bodega, contabilidad, administrativo, talentos)
- ⏳ `/tickets` — cola del área del usuario (paso 20). Cada fila = ticket con ANS, estado, asignado. Filtrada automáticamente por `request.auth.token.area_apoyo`.
- ⏳ `/tickets/:id` — detalle + botones de estado (en_progreso, bloqueado, resuelto) + evidencia URL.

### Admin
- ✅ `/admin` — panel hub con switch de usuario.
- ✅ `/admin/catalogos` — empresas, sedes, unidades, cargos, seed.
- ⏳ `/admin/usuarios` — crear usuarios, asignar roles, reset password.
- ⏳ `/admin/eventos` — línea de tiempo global de auditoría.

### Candidato (externo, portal público sin login)
- ⏳ `/portal/candidato/:token` — página pública con: datos del proceso, realización de prueba (vía Magneto redirect), carga de documentos (10), agenda de entrevista, resultado final. Autenticación por link mágico en WhatsApp/email.

## Pasos sin rol directo: cada uno su espacio

Ningún paso queda sin rol, pero sí hay **momentos sin UI dedicada** en el MVP actual. Los rellenamos con pantallas propias:

- **Paso 7 (Pruebas psicológicas)** — hoy delegado a Magneto externo. Necesita `/postulaciones/:id/pruebas` para ver resultados descargados + botón "sugerir reutilización" (TTL 6 meses).
- **Paso 9 (Validación de referencias)** — pantalla propia `/postulaciones/:id/referencias` con checklist de 2–3 referencias verificables.
- **Paso 10 (Solicitud de documentos)** — bandeja `/postulaciones/:id/documentos` con subida por tipo.
- **Paso 13 (Citación al líder)** — integrable con Google Calendar, pantalla `/postulaciones/:id/entrevista-lider` que dispara invite.
- **Paso 17 (Concepto médico)** — pantalla GH `/examenes-medicos/:id` con cargar PDF + clasificar apto/no apto/recomendaciones.
- **Paso 20 (Procesos de conexión)** — hoy es el **Módulo 8**, pantalla por área (`/tickets` con filtro automático).

## Prioridad de construcción sugerida

Tres olas después del MVP actual (que cubre solo paso 1):

**Ola A (cierra fase A + B del flujograma)** — pasos 2, 3, 4.
- `/validaciones-salariales` (GH)
- `/vacantes/:id/perfilamiento` (analista + líder)
- `/vacantes/:id/publicacion` (analista)

**Ola B (cierra fase C + D)** — pasos 5–14.
- `/vacantes/:id/postulaciones` (analista)
- `/postulaciones/:id` (analista, vista unificada con sub-paneles)
- `/vacantes/:id/terna` (líder)
- Integración WhatsApp (Twilio) para pasos 6, 10, 13.

**Ola C (cierra fase E + F)** — pasos 15–20.
- `/examenes-medicos` (GH)
- `/carpetas` (GH)
- `/tickets` por área (apoyo)
- `/portal/candidato/:token` (externo).

## Notas finales

- El loop del paso 14 "no aprobado → paso 5 con nuevo candidato" queda resuelto en la pantalla `/vacantes/:id/terna` con un botón "Descartar y sugerir siguiente" que: (a) marca postulación `descartado`, (b) crea nueva versión de `terna`, (c) notifica al analista.
- El coordinador siempre puede intervenir en cualquier paso (`staff()` en reglas, badge de "override" en la UI).
- El candidato nunca entra a la plataforma principal — solo al `/portal/candidato/:token`. Todo lo demás sucede vía WhatsApp/email.
