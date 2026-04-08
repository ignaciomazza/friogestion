# ARCA Validaciones + Remitos

## Objetivo
Implementar validaciones ARCA y remitos sin romper los flujos actuales, con UX simple y sobre pantallas existentes.

## Criterios de diseño aplicados
- Sin nuevas pantallas para validaciones de proveedores/compras: se adapta `Suppliers`, `Customers`, `Quotes`, `Purchases` y `Billing`.
- Remitos integrados en `Presupuestos` (`/app/quotes`), no como módulo aislado.
- Regla de consumidor final con advertencias claras, sin bloqueo duro por umbral o deducción.
- Multi-tenant estricto: toda consulta/escritura filtra por `organizationId`.
- Sin persistir secretos sensibles de ARCA (clave fiscal/token/sign).

## Flujos implementados

### 1) Lookup por CUIT (reutilizable)
- Endpoint: `POST /api/arca/taxpayer-lookup`
- Usa cache por organización (`ArcaTaxpayerLookupCache`) con TTL 24h.
- Si el cache está vigente, responde `source=cache`; si no, consulta ARCA (`ws_sr_constancia_inscripcion`) y refresca cache.
- El parser de respuesta es tolerante a cambios de tags (ej. `fechaSolicitud` en variantes de `getPersona_v2`).
- Se usa para autocompletar en:
  - proveedores (`/app/suppliers`)
  - clientes (`/app/customers`)
  - cliente inline en presupuestos (`/app/quotes`)

### 2) Verificación ARCA de proveedor
- Endpoint: `POST /api/suppliers/verify`
- Guarda historial en `SupplierArcaVerification`.
- Actualiza snapshot y estado rápido en `Supplier`:
  - `arcaVerificationStatus`
  - `arcaVerificationCheckedAt`
  - `arcaVerificationMessage`
  - `arcaVerificationSnapshot`
- Estado visual esperado:
  - `MATCH` (verde)
  - `PARTIAL` (amarillo)
  - `MISMATCH` / `NO_ENCONTRADO` (rojo)
  - `ERROR` (gris/aviso)

### 3) Validación ARCA de comprobante de compra (WSCDC)
- Endpoints:
  - `POST /api/purchases/validate`
  - `POST /api/purchases/[id]/revalidate`
  - `POST /api/purchases` (opcional en alta con `validateWithArca` y `arcaValidation`)
- Historial en `PurchaseArcaValidation`.
- Estado rápido en `PurchaseInvoice`:
  - `arcaValidationStatus`
  - `arcaValidationCheckedAt`
  - `arcaValidationMessage`
  - `arcaValidationRequest`
  - `arcaValidationResponse`
- Mapeo de estado:
  - `AUTHORIZED`: validada
  - `REJECTED`: rechazada (se muestra fuerte en UI)
  - `OBSERVED`: permitida con advertencia
  - `ERROR`: pendiente técnica/reintento

### 4) Regla consumidor final para emisión fiscal
- Endpoint ajustado: `POST /api/fiscal-invoices`
- Input nuevo: `requiresIncomeTaxDeduction`.
- Regla centralizada:
  - umbral `10.000.000 ARS`
  - o deducción de Ganancias
  - decide si se requiere identificación del receptor.
- Comportamiento UX:
  - si falta identificación y aplica regla, se emite advertencia.
  - no se bloquea automáticamente por umbral/deducción.

### 5) Remitos
- Endpoints:
  - `GET|POST /api/remitos`
  - `GET|PATCH /api/remitos/[id]`
  - `POST /api/remitos/[id]/emit`
  - `POST /api/remitos/[id]/deliver`
  - `POST /api/remitos/[id]/cancel`
  - `GET /api/remitos/[id]/pdf`
- Entidades:
  - `DeliveryNote`
  - `DeliveryNoteItem`
- Transiciones válidas:
  - `DRAFT -> ISSUED -> DELIVERED`
  - `CANCELLED` solo desde `DRAFT` o `ISSUED`
- PDF no fiscal con leyenda obligatoria:
  - `DOCUMENTO NO VALIDO COMO FACTURA`

## Estados y lectura rápida

### Proveedor (`SupplierArcaVerificationStatus`)
- `PENDING`, `MATCH`, `PARTIAL`, `MISMATCH`, `NO_ENCONTRADO`, `ERROR`

### Compra (`PurchaseArcaValidationStatus`)
- `PENDING`, `AUTHORIZED`, `OBSERVED`, `REJECTED`, `ERROR`

### Remito (`DeliveryNoteStatus`)
- `DRAFT`, `ISSUED`, `DELIVERED`, `CANCELLED`

## Errores funcionales y recuperación
- `ARCA_SERVICE_NOT_AUTHORIZED`: falta autorizar servicio en ARCA. Recuperación: habilitar servicio desde admin ARCA y reintentar.
- `ARCA_CONFIG_MISSING` / `ARCA_CONFIG_NOT_CONNECTED`: falta configuración/conexión activa.
- `CUIT_INVALID` / `ARCA_ISSUER_CUIT_INVALID`: dato fiscal inválido en input.
- `ERROR` técnico en validación de compra: no bloquea alta; deja pendiente de validación y habilita revalidación.

## Qué bloquea y qué advierte
- **Advertencia (no bloquea):**
  - consumidor final >= 10M sin identificación
  - deducción Ganancias sin identificación
  - comprobante `OBSERVED`
  - validación técnica `ERROR`
- **Bloqueo:**
  - errores de integridad de datos (CUIT inválido, entidad no encontrada, servicio no autorizado, etc.).
  - transiciones inválidas de remito.

## Servicios ARCA soportados
- `wsfe` (emisión fiscal)
- `wscdc` (constatación de comprobantes)
- `ws_sr_constancia_inscripcion` (lookup contribuyente)

Desde Admin ARCA ya se pueden seleccionar servicios autorizados al conectar/rotar, manteniendo compatibilidad con organizaciones que solo usan `wsfe`.
