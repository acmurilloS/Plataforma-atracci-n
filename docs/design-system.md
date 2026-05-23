# Design System · Plataforma de Atracción EQUITEL

> Versión 1.0 · 2026-04-22 · alineado al `Equitel-brand-book-v1-F-06102025.pdf`.

Esta es la referencia viva de componentes y tokens de diseño. **Cualquier cosa que no salga de aquí no debería escribirse inline en páginas**.

## Tokens

### Paleta

| Nombre | Alias legacy | Hex | Uso |
|---|---|---|---|
| `equitel-rojo-500` | `gold-400` | `#ff0000` | Rojo primario brand (badges destacados). **Uso escaso**. |
| `equitel-rojo-600` | `gold-500` | `#be1e0d` | **CTA primario** · logo E · eyebrows fuertes. |
| `equitel-rojo-700` | `gold-600` | `#9c1b06` | Hover CTA · fase E · acentos oscuros. |
| `equitel-rojo-50/100/200/300/400` | `gold-50…400` | escala pastel→medio | Fondos fase A, B, C, D. |
| `equitel-negro-900` | `navy-900` | `#000000` | Texto principal · fondos hero oscuros. |
| `equitel-negro-700` | `navy-700` | `#262626` | Botón secundario · texto fuerte. |
| `equitel-negro-300` | `navy-300` | `#9f9f9f` | Gris 50% oficial · bordes · disabled. |
| `equitel-negro-100` | `navy-100` | `#e5e5e5` | Divisores · fondos tabla. |
| `equitel-blanco-50` | `cream-50` | `#ffffff` | Blanco puro · cards, inputs. |
| `equitel-blanco-100` | `cream-100` | `#fafafa` | Fondo general (body). |

Los aliases `navy`, `gold`, `cream` se mantienen por compatibilidad; internamente apuntan a la paleta Equitel. En código nuevo, preferir los nombres `equitel-*`.

### Colores utilitarios (excepción documentada)

Los siguientes colores **no** son de identidad de marca; solo aparecen en **indicadores semánticos funcionales**:

| Token | Hex | Uso exclusivo |
|---|---|---|
| `util.ok` / `emerald-500` | `#10b981` | Semáforo ANS en regla · apto médico · referencia positiva |
| `util.warn` / `amber-500` | `#f59e0b` | ANS en aviso · referencia neutra · "con reservas" |
| `util.crit` / `red-500` | `#ef4444` | ANS vencido · no apto médico · referencia negativa |

**Nunca usar** estos colores en: logos, CTAs primarias, headers de marca, elementos decorativos, fases del flujograma.

### Escala monocromática de fases del flujograma

| Fase | Nombre | Badge | Stat card |
|---|---|---|---|
| A | Inicio / aval | `fase-a` (rojo-50 + rojo-700) | `variant="fase-a"` |
| B | Reclutamiento | `fase-b` (rojo-100 + rojo-700) | `variant="fase-b"` |
| C | Selección | `fase-c` (rojo-200 + rojo-800) | `variant="fase-c"` |
| D | Decisión | `fase-d` (rojo-400 + blanco) | `variant="fase-d"` |
| E | Ingreso | `fase-e` (rojo-700 + blanco) | `variant="fase-e"` |
| F | Vinculación | `fase-f` (negro-900 + blanco) | `variant="fase-f"` |

Escala claridad→saturación→oscuridad que mantiene progresión visual dentro del brand book.

### Tipografía

- **Familia única**: Open Sans (300/400/500/600/700/800).
- Escala canónica:
  - `text-4xl font-bold` → H1 landing pública
  - `text-3xl font-bold` → H1 interno
  - `text-xl font-semibold` → H2 sección
  - `text-lg font-semibold` → H3 card
  - `text-base font-medium` → label destacado
  - `text-sm` / `text-sm font-medium` → body / label
  - `text-xs` → hints, metadata
  - `text-[11px] uppercase tracking-[0.18em] font-bold` → eyebrow

No usar `font-display` serif — fue legacy. Toda tipografía es Open Sans.

### Radios · Shadows · Spacing

- Radius: `rounded-md` (inputs, botones) · `rounded-lg` (cajas medias) · `rounded-xl` (cards) · `rounded-full` (pills, avatares).
- Shadows: `shadow-sm` (card default) · `shadow-md` (card elevada) · `shadow-xl` (modal, popover).
- Spacing vertical: `space-y-3` form · `space-y-4` secciones · `space-y-6` página · `space-y-8` layout.
- Gaps: `gap-2` inline · `gap-4` grid cards · `gap-6` columnas · `gap-8` layout público.

## Componentes (`src/components/ui/`)

### `<Button>`

```tsx
import { Button } from '@/components/ui';

<Button variant="primary">Enviar</Button>
<Button variant="secondary" icon={<Plus size={14} />}>Nueva vacante</Button>
<Button variant="ghost" size="sm">Filtrar</Button>
<Button variant="destructive">Eliminar</Button>
<Button variant="link">Ver más</Button>
<Button loading>Guardando…</Button>
<Button fullWidth>Enviar postulación</Button>
```

| variant | Uso |
|---|---|
| `primary` | CTA principal (rojo Equitel). 1 por pantalla idealmente. |
| `secondary` | Acción neutral (negro). Crear, navegar. |
| `ghost` | Botones secundarios/filtros. Fondo blanco con borde. |
| `destructive` | Acciones destructivas. Rojo Tailwind (util-crit), no rojo Equitel. |
| `link` | Inline, parece enlace. |

Sizes: `sm` / `md` (default) / `lg`.

### `<Badge>`

```tsx
<Badge variant="fase-c">Selección</Badge>
<Badge variant="criticidad-alta">Alta</Badge>
<Badge variant="util-ok">Apto</Badge>
<Badge variant="neutral" uppercase={false}>Texto libre</Badge>
```

### `<Card>` + `<CardHeader>` / `<CardBody>` / `<CardFooter>`

```tsx
<Card interactive elevation="sm" padding="md">
  <CardHeader>
    <h3 className="font-semibold text-navy-900">Título</h3>
  </CardHeader>
  <CardBody>Contenido</CardBody>
  <CardFooter>Footer</CardFooter>
</Card>
```

Props: `interactive` (hover amplificado) · `padding: none|sm|md|lg` · `elevation: flat|sm|md` · `bordered`.

### `<PageHeader>`

```tsx
<PageHeader
  eyebrow="Seguimiento"
  titulo="¿Cómo va cada vacante?"
  descripcion="Todas las solicitudes del proceso con etapa actual y responsable."
  accion={<Button variant="primary" icon={<Plus size={14} />}>Nueva vacante</Button>}
/>
```

Prop `invertido={true}` para headers sobre fondo oscuro (landing pública).

### `<EmptyState>`

```tsx
<EmptyState
  titulo="Sin vacantes con estos filtros"
  descripcion="Cambia los filtros o crea una nueva."
  icono={<Inbox size={20} />}
  accion={<Button variant="primary">Nueva vacante</Button>}
/>
```

### `<Modal>`

```tsx
<Modal
  open={abierto}
  onClose={cerrar}
  title="Solicitud enviada"
  description="Tu vacante quedó registrada."
  size="md"
  footer={<>
    <Button variant="ghost" onClick={cerrar}>Nueva solicitud</Button>
    <Button variant="primary" onClick={verVacante}>Ver vacante</Button>
  </>}
>
  <p>Contenido del modal.</p>
</Modal>
```

Se renderiza en portal. Cierra con ESC o click afuera (si `dismissable`).

### `<Stat>`

```tsx
<Stat label="Activas" valor={12} variant="destacado" />
<Stat label="Inicio" valor={3} variant="fase-a" />
```

### `<Avatar>`

```tsx
<Avatar nombre="Juan Carlos Pineda" size="md" color="negro" />
```

Genera iniciales automáticamente.

### `<SemaforoANS>`

```tsx
<SemaforoANS dias={6} /> // verde
<SemaforoANS dias={8} /> // ámbar
<SemaforoANS dias={12} /> // rojo
```

Umbrales por defecto: ok ≤7 · warn ≤10 · crit >10.

## Reglas de uso

1. **Rojo Equitel** solo en: logo · CTA primario (`Button variant="primary"`) · eyebrow text · fase activa del timeline · badge de fase.
2. **Colores utilitarios** (emerald, amber, red saturado) **solo** en `<SemaforoANS>` y `<Badge variant="util-*">`. En cualquier otro lugar es violación del brand book.
3. **Eyebrow text** siempre como `<PageHeader eyebrow="…">` — no inline.
4. **Cards** siempre con `<Card>` — nunca `<div className="rounded-xl border …">`.
5. **Modales** siempre con `<Modal>` — renderiza portal y maneja ESC/focus.
6. **Avatares** siempre con `<Avatar>` — garantiza tamaño y color consistente.
7. **Clases Tailwind inline** para color permitidas solo para: alias `navy-*` (gris/negro) y `gold-*` (rojo Equitel). Otros colores requieren justificación (util semántico).

## Página de showcase

Al terminar Ola 4 del plan, habrá una ruta oculta `/admin/design-system` con todas las variantes renderizadas para QA visual continuo.

## Script de auditoría

`scripts/audit-brand.ts` (Ola 4) grepea el código por clases prohibidas y reporta violaciones. Se corre antes de cada release.
