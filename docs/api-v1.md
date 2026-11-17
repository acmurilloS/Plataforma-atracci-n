# API pública · Plataforma de Atracción · v1

Para integrar otros sistemas (hoy: **DOTATRACK**, dotación) sin tocar la base de datos. La
plataforma queda siempre en medio: valida quién pregunta y qué puede ver.

- **URL base:** `https://ptm-atraccion.web.app/api/v1`
- **Autenticación:** cabecera `Authorization: Bearer <llave>`. La llave la emite un
  administrador de la plataforma (Catálogos → API y llaves) y se entrega **una sola vez**.
  Formato `pa_live_xxxxxxxxxx_…`. Guárdala como secreto en tu servidor; nunca en el
  navegador, en un repositorio ni en un chat.
- **Solo lectura y solo `GET`.** Todas las respuestas son JSON con `Cache-Control: no-store`
  y la cabecera `X-API-Version: 1`.
- **Tope:** por defecto 60 peticiones por minuto por llave. Al pasarse: `429` con cabecera
  `Retry-After` (segundos).

> **Novedades del 18-nov-2026** (pedidas por DotaTrack el 17-nov, todas compatibles: lo que
> ya funcionaba sigue igual):
> - Los ingresos salen **desde que se pide la dotación** (`estado: en_proceso`), no solo al
>   quedar contratados, y avisan si la persona **no ingresa** (`estado: no_ingresa`).
> - Consulta **por cambios**: `?actualizado_desde=` y el campo `actualizado_en`.
> - Tallas: `"no_aplica"` cuando la prenda no se usa, `tallas_completas` y `prendas_faltantes`.
> - `fecha_ingreso_prevista` (primer día de trabajo acordado).
> - Nuevas listas: `GET /sedes` (con la sede de entrega) y `GET /cargos` (con si llevan dotación).
> - `dotacion.requerida` también es `true` si el cargo está en la lista de cargos con dotación de
>   Cultura y Desarrollo (antes solo si la analista lo marcaba en el perfilamiento).

## Formato de respuesta

```json
{ "data": … }                                             // un objeto
{ "data": [ … ], "pagination": { "page": 1, "limit": 50, "total": 123 } }   // una lista
{ "error": "codigo_estable", "message": "Texto para quien depura" }         // un error
```

`error` es un código estable para programar contra él; `message` puede cambiar de redacción.

| HTTP | `error` | Cuándo |
|---|---|---|
| 401 | `no_autenticado` | Falta la cabecera, la llave no existe, está mal, fue revocada o su integración no existe (siempre el mismo texto, a propósito). |
| 401 | `llave_vencida` | La llave tiene fecha de vencimiento y ya pasó. Pide una nueva. |
| 403 | `integracion_inactiva` | La integración fue desactivada en la plataforma. |
| 403 | `permiso_faltante` | La llave no tiene el permiso del endpoint (el mensaje dice cuál). |
| 403 | `ambito_no_autorizado` | Pediste `?empresa=` de una empresa que la llave no tiene. |
| 403 | `sin_ambitos` | La llave quedó sin empresas (error de configuración; avisa al administrador). |
| 404 | `ambito_desconocido` | Esa empresa no existe. |
| 404 | `no_encontrado` | El ingreso no existe **o no es de una empresa que puedas ver** (no se distingue, a propósito). |
| 404 | `ruta_no_encontrada` | Ruta inexistente. |
| 405 | `metodo_no_permitido` | Solo `GET`. |
| 400 | `parametro_invalido` | Un parámetro ilegible (p. ej. `desde` que no es fecha). Se rechaza, no se ignora. |
| 429 | `demasiadas_peticiones` | Tope por minuto superado (`Retry-After`). |
| 500 | `error_interno` | Falla nuestra. Reintenta; si persiste, avísanos. |

## Empresas (ámbito)

Cada llave está autorizada para una o varias **empresas** del holding (códigos como `EQT`,
`CUM`, `ING`, `LAP`). Si no mandas `?empresa=`, recibes todo lo de **tus** empresas. Si mandas
una que no es tuya, `403`. Consulta las tuyas en `/me`.

## Endpoints

### `GET /me` · ¿quién soy?

No exige ningún permiso: cualquier llave válida puede preguntar qué es. Úsalo para probar
la llave y ver tus empresas y permisos.

```bash
curl -s https://ptm-atraccion.web.app/api/v1/me -H "Authorization: Bearer $LLAVE"
```

```json
{
  "data": {
    "integracion": { "id": "…", "nombre": "DOTATRACK" },
    "llave": { "id": "…", "prefijo": "pa_live_k7m2p9x4qa", "nombre": "Servidor DOTATRACK", "expira_en": null, "tope_por_min": 60 },
    "permisos": [{ "id": "ingresos:read", "nombre": "Leer nuevos ingresos" }],
    "ambitos": [{ "id": "EQT", "nombre": "Equitel" }, { "id": "CUM", "nombre": "Cummins" }],
    "limite": { "tope_por_min": 60, "restantes_en_este_minuto": 59, "degradado": false }
  }
}
```

### `GET /ingresos` · ingresos (permiso `ingresos:read`)

Un **ingreso** es una persona que va a entrar, o entró, por Atracción. Su `estado`:

| `estado` | Qué significa |
|---|---|
| `en_proceso` | Está en contratación y Atracción **ya pidió su dotación** (`dotacion.solicitud_enviada_en`). Todavía no es empleado: es el momento de alistar la dotación. |
| `contratado` | Gestión Humana aprobó la carpeta o se registró la vinculación. |
| `no_ingresa` | Ya había salido por la API y la persona **no va a ingresar** (desistió o salió del proceso). No se dice el motivo. |

Hay dos formas de consultar:

**Por cambios (recomendada).** Trae los tres estados y vuelve a traer un ingreso cada vez que
algo de él cambia (tallas, cargo, centro de costos, estado, fechas…). Ordenada por
`actualizado_en`.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `actualizado_desde` | fecha ISO 8601 | Solo ingresos con `actualizado_en` ≥ `actualizado_desde`. **Guarda el mayor `actualizado_en` que procesaste y úsalo aquí la próxima vez.** Para la primera sincronización usa una fecha antigua (p. ej. `2026-01-01`). |
| `estado` | lista | Opcional: `en_proceso`, `contratado`, `no_ingresa`, separados por coma. Por defecto, los tres. |

**Clásica (la de octubre, sigue igual).** Solo `contratado`, ordenada por `fecha_ingreso`.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `desde` | fecha ISO 8601 | Solo ingresos con `fecha_ingreso` ≥ `desde`. No se combina con `actualizado_desde`. |

Comunes a las dos:

| Parámetro | Tipo | Descripción |
|---|---|---|
| `empresa` | código | Limita a una empresa (debe estar autorizada en tu llave). |
| `solo_dotacion` | `true`/`false` | Solo cargos que requieren dotación. |
| `page` | entero ≥ 1 | Página (por defecto 1). |
| `limit` | 1–100 | Tamaño de página (por defecto 50; **tope duro 100**). |

```bash
curl -s "https://ptm-atraccion.web.app/api/v1/ingresos?actualizado_desde=2026-11-18T00:00:00-05:00&solo_dotacion=true" \
  -H "Authorization: Bearer $LLAVE"
```

```json
{
  "data": [
    {
      "id": "RFbqzJfqiu5E35E3vm59",
      "estado": "en_proceso",
      "actualizado_en": "2026-11-18T15:02:11.004Z",
      "fecha_ingreso": null,
      "fecha_vinculacion": null,
      "fecha_ingreso_prevista": "2026-11-24T17:00:00.000Z",
      "movimiento_interno": false,
      "persona": {
        "nombre_completo": "Ana María Pérez Gómez",
        "nombres": "Ana María",
        "apellidos": "Pérez Gómez",
        "documento_tipo": "CC",
        "documento_numero": "1020304050",
        "genero": "femenino",
        "correo": "ana@correo.com",
        "celular": "3001234567"
      },
      "cargo": { "id": "cg_tecnico_postventa", "nombre": "TÉCNICO POSTVENTA" },
      "vacante": {
        "id": "…",
        "consecutivo": "CU-BOG-1251",
        "empresa": { "codigo": "CUM", "nombre": "Cummins" },
        "sede": { "codigo": "CBO", "nombre": "Bogotá" },
        "unidad": { "id": "…", "nombre": "Servicio postventa", "centro_costos": "4101" }
      },
      "dotacion": {
        "requerida": true,
        "solicitud_enviada_en": "2026-11-18T14:55:40.000Z",
        "tallas": { "calzado": "41", "pantalon": "32", "chaleco": "no_aplica", "guantes": "9", "overol": "no_aplica", "camisa_blusa": "M", "otros": "" },
        "tallas_completas": true,
        "prendas_faltantes": []
      }
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1 }
}
```

Notas de los campos:

- `actualizado_en`: cuándo la API vio cambiar el ingreso por última vez. Si nada cambió, no
  cambia. Procesa los ingresos por `id` (si llega dos veces, actualiza; no dupliques).
- `fecha_ingreso`: momento en que quedó **contratado** en la plataforma (`null` mientras está
  `en_proceso` o si `no_ingresa`). `fecha_vinculacion`: fecha que registró la analista al
  vincularlo (cierra el proceso; puede ser `null`). `fecha_ingreso_prevista`: **primer día de
  trabajo acordado**, lo registra la analista en contratación antes de que entre (puede ser
  `null`). Para el plazo de entrega, usa la prevista si está; si no, la de vinculación.
- `movimiento_interno`: la persona ya era empleada y cambia de cargo o de sede.
- `persona.*`: sale del formato de datos básicos (DGH-F-05) que llena el integrante; si aún no
  lo llenó, se completa con lo registrado en la postulación. `genero`: `masculino`,
  `femenino`, `otro` o `null` (desde el 18-nov es obligatorio en el formato).
- `vacante.sede.codigo` y `cargo.id`: empareja con `GET /sedes` y `GET /cargos`.
- `vacante.unidad.centro_costos`: lo llena Atracción en el catálogo de unidades con la tabla
  de contabilidad. Mientras esté `null`, cruza por `unidad.nombre`/`unidad.id`.
- `dotacion.requerida`: `true` si la analista lo marcó en el perfilamiento **o** el cargo está
  en la lista de cargos con dotación de Cultura y Desarrollo (`GET /cargos` → `dotacion`).
- `dotacion.tallas`: `null` si el integrante aún no diligenció el DGH-F-05. Cada talla trae la
  talla, `"no_aplica"` (esa prenda no se usa) o `""` (falta). `tallas_completas` y
  `prendas_faltantes` resumen las seis prendas (`otros` es libre). Desde el 18-nov la
  plataforma **no pide la dotación** sin las seis prendas.

### `GET /ingresos/{id}` · un ingreso

Mismo objeto que en la lista, en cualquier estado. `404` si no existe, si nunca salió por la
API o si es de una empresa que tu llave no puede ver.

### `GET /sedes` · sedes (permiso `ingresos:read`)

Las sedes de tus empresas, con el código que trae cada ingreso en `vacante.sede.codigo`.

```json
{ "data": [
  { "codigo": "CBO", "nombre": "Bogotá", "ciudad": "Bogotá",
    "empresa": { "codigo": "CUM", "nombre": "Cummins" }, "activo": true,
    "sede_entrega": "Mosquera" }
] }
```

`sede_entrega`: la sede oficial donde se entrega la dotación (la dotación va a la sede de
entrega, no a la ciudad de trabajo). `null` mientras Atracción no la cargue.

### `GET /cargos` · cargos (permiso `ingresos:read`)

El catálogo de cargos, con el `id` que trae cada ingreso en `cargo.id`.

```json
{ "data": [ { "id": "cg_tecnico_postventa", "nombre": "TÉCNICO POSTVENTA", "activo": true, "dotacion": true } ] }
```

`dotacion`: el cargo está en la lista de cargos con dotación de Cultura y Desarrollo.

## Patrón recomendado para DOTATRACK

1. Al arrancar, llama `/me` para verificar la llave y ver tus empresas.
2. Una vez, sincroniza todo: `/ingresos?actualizado_desde=2026-01-01&solo_dotacion=true`
   (todas las páginas). Carga también `/sedes` y `/cargos` para emparejar por código.
3. Cada X minutos, llama `/ingresos?actualizado_desde=<mayor actualizado_en procesado>&solo_dotacion=true`.
   Recorre las páginas; si son muchas, en vez de pasar de página puedes volver a llamar con el
   `actualizado_en` del último que procesaste. Por cada ingreso, según `estado`:
   - `en_proceso`: crea a la persona y su solicitud de dotación (aún no es empleado).
   - `contratado`: confírmalo (y crea lo que falte si no lo tenías).
   - `no_ingresa`: cancela lo que alistaste.
4. Si recibes `429`, espera `Retry-After` segundos. Si recibes `401 llave_vencida` o
   `403 integracion_inactiva`, avisa a Atracción.

## Seguridad

- La llave es un secreto: solo en tu servidor. Si se filtra, pide **rotarla** (se crea una
  nueva antes de revocar la vieja, sin ventana sin servicio).
- Nunca sale más de lo listado arriba: las columnas se eligen una por una. De quien no ingresa
  no se dice el motivo.
- Cada petición queda registrada (también las rechazadas): quién, cuándo, qué ruta, estado.

Contacto: Andrea Murillo (acmurillo@equitel.com.co).
