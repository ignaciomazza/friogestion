# Arquitectura y convenciones

## Objetivos
- Mantener el codigo facil de leer y escalar sin acumular archivos sueltos.
- Evitar duplicacion de UI y logica entre paginas.
- Separar responsabilidades (UI, data, helpers, server).

## Estructura propuesta
```
src/
  app/                     # Next App Router (rutas y layouts)
    (app)/
      app/                 # /app/*
        purchases/
          page.tsx
          components/      # UI especifica de compras
          hooks/           # hooks locales de compras
  components/
    ui/                    # Button, Input, Card, Badge, Table
    layout/                # Topbar, Sidebar, wrappers
    shared/                # StatsCard, EmptyState, SectionHeader
  features/
    purchases/             # si se reutiliza en varias rutas
      components/
      hooks/
      types.ts
      utils.ts
  lib/
    server/                # prisma, auth, afip (solo server)
    format.ts
    units.ts
  types/                   # tipos compartidos entre features (si aplica)
```

## Reglas de tamano de archivos
- page/layout: intentar <= 250-300 lineas. Si supera eso, dividir.
- componentes: <= 200 lineas. Si hay multiples secciones, separar.
- hooks: <= 150 lineas. Si crece, dividir por responsabilidad.

## Cuando dividir en componentes
- La UI se repite en 2+ paginas (ej: stats, tablas, badges de estado).
- El componente maneja mas de una seccion visual (form + tabla + resumen).
- El archivo mezcla helpers, estado y render muy extensos.

## Convenciones de trabajo
- Default: Server Component. Usar "use client" solo si hay estado o browser APIs.
- Data fetch en paginas o en hooks locales si es client.
- Helpers puros en `src/lib` o `features/*/utils.ts`.
- Tipos compartidos en `features/*/types.ts` o `src/types/*`.
- Evitar carpetas vacias: si no se usa, no se crea.
- Si se crea una carpeta nueva, agregar al menos un archivo real.

## Plan incremental sugerido
1) Extraer UI repetida (StatsCard, TableHeader, StatusBadge) a `components/shared`.
2) Dividir paginas grandes en `components/` locales por feature.
3) Mover tipos/helpers de dominio a `features/<feature>`.
