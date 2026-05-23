# Búsqueda activa con IA · Paso 4.5

> Módulo introducido el 2026-04-30. Se intercala entre publicación (paso 4) y reclutamiento de hojas de vida (paso 5) del flujograma canónico.

## Para qué sirve

Cuando una vacante no atrae postulados pasivos suficientes (publicación en Magneto + LinkedIn + cajas no genera flujo), la analista puede disparar una búsqueda con IA que rastrea perfiles públicos en internet (LinkedIn, GitHub, sitios profesionales) y devuelve hasta 15 personas que coinciden con el job description. La analista revisa cada match y decide cuáles avanzan al flujo normal del paso 5.

Ataca el caso "tengo la vacante publicada hace 5 días y todos los CVs que llegaron son descartables" — en lugar de hacer hunting manual con la cuenta personal de LinkedIn, la IA consolida la búsqueda.

## Cómo se usa (vista del analista)

1. La vacante está en estado `publicada` o `en_proceso` (ya pasó por perfilamiento y publicación).
2. Entra a `/vacantes/:id/publicacion` y verás un card que dice "**Paso 4.5 · Búsqueda activa con IA**".
3. Click en "Buscar candidatos con IA" → se abre un modal con preview de la vacante.
4. Click en "Buscar ahora". La IA toma entre 15 y 40 segundos (Gemini hace deep research sobre Google + LinkedIn público).
5. Te redirige a `/vacantes/:id/sourcing` con la lista de candidatos encontrados.
6. Cada tarjeta muestra: nombre, headline, empresa actual, ciudad, score de match, justificación específica del por qué la IA lo trajo, y link al perfil público.
7. Por cada candidato decides:
   - **Promover a postulado**: pasa al flujo normal del paso 5. Aparece en `/vacantes/:id/postulaciones` con `fuente: hunter_linkedin`.
   - **Descartar**: la IA se equivocó, no encaja con el perfil. Estado pasa a `filtrado_no_cumple`.
8. Al promover, **debes** hacer el primer contacto con un mensaje de opt-in claro (ver sección Habeas Data).

## Estados involucrados

```
postulación.estado:
  sourceado_por_ia  ──┬──► postulado (entra al flujo normal)
                     ├──► filtrado_no_cumple (descartado)
                     └──► desistio_candidato (transversal)
```

Después de `postulado`, todo sigue exactamente igual al flujograma original (pre-entrevista → pruebas → entrevistas → terna → decisión).

## Cómo se almacena

- **`candidatos/{id}`**: campos estándar más `origen: 'hunter'`, `provisional: true`, `linkedin_url`, `fuente_hv_url` apuntando al perfil público.
- **`postulaciones/{id}`**: campos estándar más:
  - `estado: 'sourceado_por_ia'`
  - `fuente: 'hunter_linkedin'`
  - `sourcing_busqueda_id`: agrupa todos los candidatos de la misma búsqueda.
  - `sourcing_score`: 0–100, confianza del LLM.
  - `sourcing_headline`, `sourcing_empresa_actual`, `sourcing_cargo_actual`: datos extraídos del perfil.
  - `sourcing_justificacion`: por qué la IA cree que coincide.
- **`eventos/`**: cada búsqueda deja un evento `tipo: 'sourcing_ejecutado'` con `query_usada`, `fuentes_consultadas`, `encontrados`, `modo: 'gemini' | 'dummy'`.

## Configuración técnica

### LLM y proveedor

- **Modelo**: `gemini-2.5-pro` con Google Search grounding habilitado (`tools: [{ googleSearch: {} }]`).
- **SDK**: `@google/genai` en Cloud Functions.
- **Modo dummy**: si `GEMINI_API_KEY` no está configurada, la function devuelve 3 candidatos hardcoded para que el flujo sea testeable sin gastar quota. El campo `modo` en el evento dice si fue `gemini` o `dummy`.

### Variable de entorno

`functions/.env`:

```
GEMINI_API_KEY=tu_key_de_aistudio
```

Genera una key gratuita en https://aistudio.google.com/apikey. La cuota gratuita alcanza para más de 1000 búsquedas al mes.

Para producción Firebase, mejor usar Vertex AI con Application Default Credentials (la function corre con la service account del proyecto, sin necesidad de gestionar el secreto manualmente).

## Habeas Data (Ley 1581 / 2012 Colombia)

Estamos almacenando información personal de personas que **no han dado consentimiento explícito**. Mitigaciones obligatorias:

1. **Primer contacto con opt-in**: el mensaje del analista al promover a postulado debe ser tipo:
   > "Identificamos tu perfil público en LinkedIn y creemos que puedes encajar con una vacante de [cargo] en Equitel. ¿Te interesa que te demos más detalles? Si no, ignora este mensaje y no volveremos a contactarte."

2. **Si no responde en 30 días o se niega**: marcar `desistio_candidato` y anonimizar el candidato (borrar `email`, `telefono`, `documento_numero`; conservar agregado para auditoría).

3. **Cero scraping de LinkedIn**: Gemini con grounding usa Google Search, que indexa páginas públicas legalmente. No estamos haciendo scraping del DOM de LinkedIn.

4. **Cero almacenamiento de emails / teléfonos sourceados por IA**: el esquema de respuesta de Gemini explícitamente NO pide email ni teléfono. El contacto se hace via el link público (LinkedIn InMail u otro).

## Riesgos operativos

| Riesgo | Mitigación |
|---|---|
| Gemini alucina perfiles inexistentes | El analista valida cada `perfil_url` antes de promover. La query usada queda auditada en `eventos/`. |
| Muchos "Descartar" → IA está trayendo basura | Revisar el `criterios_texto` del perfilamiento. Mientras más específico, mejor el match. |
| Costo Gemini se dispara | Para Equitel (~30 vacantes/año) cuesta ~$3/año con Gemini 2.5 Pro. Insignificante. |
| Quota Google Search grounding | Gemini 2.5 Pro permite suficientes búsquedas/día. Si llegamos al límite, agregar throttling. |

## Archivos clave

- **Function**: [functions/src/sourcing/buscarCandidatosIA.ts](../functions/src/sourcing/buscarCandidatosIA.ts)
- **Cliente Gemini**: [functions/src/sourcing/clienteGemini.ts](../functions/src/sourcing/clienteGemini.ts)
- **Constructor de prompt**: [functions/src/sourcing/promptVacante.ts](../functions/src/sourcing/promptVacante.ts)
- **Schema de respuesta**: [functions/src/sourcing/respuestaSchema.ts](../functions/src/sourcing/respuestaSchema.ts)
- **UI lista**: [src/pages/vacantes/SourcingPage.tsx](../src/pages/vacantes/SourcingPage.tsx)
- **UI disparo**: [src/components/vacantes/BuscarCandidatosIAModal.tsx](../src/components/vacantes/BuscarCandidatosIAModal.tsx) (montado en [PublicacionPage.tsx](../src/pages/vacantes/PublicacionPage.tsx))
- **Hook**: [src/hooks/useSourcing.ts](../src/hooks/useSourcing.ts)
- **Estado nuevo**: `sourceado_por_ia` en [src/schemas/postulacionSchema.ts](../src/schemas/postulacionSchema.ts) y [src/schemas/transicionesPostulacion.ts](../src/schemas/transicionesPostulacion.ts).
