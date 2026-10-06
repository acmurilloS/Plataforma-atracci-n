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
`CUM`, `ING`, `SLP`). Si no mandas `?empresa=`, recibes todo lo de **tus** empresas. Si mandas
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

### `GET /ingresos` · nuevos ingresos (permiso `ingresos:read`)

Personas **contratadas** (Gestión Humana aprobó la carpeta), con lo que necesita dotación.
Ordenadas de la más antigua a la más reciente por `fecha_ingreso`.

| Parámetro | Tipo | Descripción |
|---|---|---|
| `desde` | fecha ISO 8601 | Solo ingresos con `fecha_ingreso` ≥ `desde`. Ej.: `2026-10-01` o `2026-10-01T00:00:00-05:00`. **Guarda la última `fecha_ingreso` que procesaste y úsala aquí la próxima vez.** |
| `empresa` | código | Limita a una empresa (debe estar autorizada en tu llave). |
| `solo_dotacion` | `true`/`false` | Solo cargos marcados como que requieren dotación. |
| `page` | entero ≥ 1 | Página (por defecto 1). |
| `limit` | 1–100 | Tamaño de página (por defecto 50; **tope duro 100**). |

```bash
curl -s "https://ptm-atraccion.web.app/api/v1/ingresos?desde=2026-10-01&solo_dotacion=true" \
  -H "Authorization: Bearer $LLAVE"
```

```json
{
  "data": [
    {
      "id": "RFbqzJfqiu5E35E3vm59",
      "estado": "contratado",
      "fecha_ingreso": "2026-10-03T14:12:09.000Z",
      "fecha_vinculacion": "2026-10-15T05:00:00.000Z",
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
        "sede": { "codigo": "BOG", "nombre": "Bogotá" },
        "unidad": { "id": "…", "nombre": "Servicio postventa", "centro_costos": "4101" }
      },
      "dotacion": {
        "requerida": true,
        "solicitud_enviada_en": "2026-10-04T13:00:00.000Z",
        "tallas": { "calzado": "41", "pantalon": "32", "chaleco": "M", "guantes": "9", "overol": "M", "camisa_blusa": "M", "otros": "" }
      }
    }
  ],
  "pagination": { "page": 1, "limit": 50, "total": 1 }
}
```

Notas de los campos:

- `fecha_ingreso`: momento en que quedó contratado en la plataforma. `fecha_vinculacion`:
  fecha real de inicio, si ya se registró (puede ser `null`).
- `movimiento_interno`: la persona ya era empleada y cambió de cargo (normalmente sin tallas
  nuevas).
- `persona.*`: sale del formato de datos básicos (DGH-F-05) que llena el integrante; si aún no
  lo llenó, se completa con lo registrado en la postulación. `genero`: `masculino`,
  `femenino`, `otro` o `null`.
- `vacante.unidad.centro_costos`: lo llena Atracción en el catálogo de unidades con la tabla
  de contabilidad. Mientras esté `null`, cruza por `unidad.nombre`/`unidad.id`.
- `dotacion.tallas`: `null` si el integrante aún no diligenció el DGH-F-05; cada talla puede
  venir vacía (`""`).

### `GET /ingresos/{id}` · un ingreso

Mismo objeto que en la lista. `404` si no existe, si no está contratado o si es de una
empresa que tu llave no puede ver.

## Patrón recomendado para DOTATRACK

1. Al arrancar, llama `/me` para verificar la llave y ver tus empresas.
2. Cada X minutos (o al abrir el módulo de ingresos), llama
   `/ingresos?desde=<última fecha_ingreso procesada>&solo_dotacion=true`, recorre las páginas
   en orden y guarda la última `fecha_ingreso` como marca. Usa `id` para no duplicar.
3. Si recibes `429`, espera `Retry-After` segundos. Si recibes `401 llave_vencida` o
   `403 integracion_inactiva`, avisa a Atracción.

## Seguridad

- La llave es un secreto: solo en tu servidor. Si se filtra, pide **rotarla** (se crea una
  nueva antes de revocar la vieja, sin ventana sin servicio).
- Nunca sale más de lo listado arriba: las columnas se eligen una por una.
- Cada petición queda registrada (también las rechazadas): quién, cuándo, qué ruta, estado.

Contacto: Andrea Murillo (acmurillo@equitel.com.co).
