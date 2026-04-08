# Project Review & Roadmap (2026-02-02)

## Hallazgos

1) Cancelaciones no revierten la cuenta corriente de ventas
- Al cancelar ventas se crea un evento, pero no se crea un asiento inverso en `CurrentAccountEntry`.
- Resultado: la cuenta corriente de clientes puede quedar inflada si se cancela una venta.
- Referencia: `src/app/api/sales/route.ts#L385`.

2) Aging no refleja ajustes manuales ni créditos fuera de facturas abiertas
- El saldo total se calcula con `CurrentAccountEntry`, pero los buckets de aging se calculan solo desde ventas/ compras abiertas.
- Si hay ajustes manuales o notas/créditos no vinculados a documentos abiertos, el aging puede no coincidir con el saldo.
- Referencia: `src/app/api/current-accounts/route.ts#L52`.

3) Arqueo incluye movimientos sin double check verificado
- El reporte usa `AccountMovement` sin filtrar por `requiresVerification` + `verifiedAt`.
- Puede haber diferencias entre “Control ingresos” y “Arqueo” si hay movimientos pendientes.
- Referencia: `src/app/api/cash-reconciliation/report/route.ts#L50`.

4) UI expone acciones sin permiso efectivo
- Menú y acciones muestran páginas/acciones que requieren OWNER/ADMIN, pero no se ocultan en UI.
- Resultado: usuarios sin rol ven botones que devuelven 401.
- Referencias: `src/components/TopbarClient.tsx#L28`, `src/app/(app)/app/current-accounts/page.tsx` (ajustes), `src/app/(app)/app/purchases/components/SupplierPaymentsPanel.tsx` (anular pago).

5) Ajustes manuales sin “quién lo hizo”
- `CurrentAccountEntry` no guarda `createdByUserId` para ajustes.
- Dificulta auditoría cuando hay varios usuarios.
- Referencia: `src/app/api/current-accounts/adjustments/route.ts#L43`.

6) Anulación de pagos no guarda vínculo a líneas de pago
- La reversa crea `AccountMovement` sin `supplierPaymentLineId`, dificultando trazabilidad 1:1.
- Referencia: `src/app/api/supplier-payments/cancel/route.ts#L49`.

## Notas de estructura/arquitectura

- Centralizar lógica contable: `CurrentAccountEntry` y `AccountMovement` se actualizan en varios endpoints. Conviene un servicio de dominio (ej: `src/lib/ledger.ts`) para altas/ reversos, y minimizar duplicación.
- Estandarizar el “sourceType”: es la clave para reportes y auditoría. Agregar helpers para mapear `sourceType -> label -> referencia`.
- Definir política clara de cancelaciones/reversiones: ventas, compras, cobros, pagos y ajustes deberían tener reversas consistentes.
- Consolidar “reportes” bajo `src/app/api/reports/*` para facilitar nuevos informes.

## Roadmap propuesto

### Cuenta corriente
- Estados de cuenta (PDF/CSV) por cliente/proveedor.
- Aging configurable (0-15, 16-30, 31-60, etc.).
- Envío por email o WhatsApp del estado de cuenta.
- Ajustes con auditoría (quién, cuándo, motivo, adjuntos).
- Filtros avanzados por documento, estado de cobro, moneda.

### Arqueo / conciliación
- Reporte con filtro de “solo verificados”.
- Diferencias por cuenta y registro de “motivo”.
- Comparación vs periodo anterior.
- Export CSV y PDF del arqueo.
- Flujo de aprobación por gerente.

### Pagos a proveedores
- Reglas automáticas de retenciones (por proveedor/importe/actividad).
- Certificados de retención (PDF) y numeración.
- Notas de débito/crédito a proveedor.
- Anulación con motivo obligatorio y archivo adjunto.
- Flujo de aprobación para pagos mayores a X.

### Reportes y estadísticas
- Cashflow diario/ semanal/ mensual.
- Aging resumen por segmento.
- Margen por producto/cliente.
- Ranking de clientes por riesgo (mora).
- Reporte de intereses (tarjeta vs crédito directo).

### Integraciones
- Bancos (extractos y conciliación automática).
- AFIP/ARCA: certificados de retención y padrones.
- Sistemas contables externos (export contable).
- Alertas (email/WhatsApp/Slack).

### UX/UI
- Permisos visibles: ocultar/ deshabilitar acciones por rol.
- “Centro de control financiero” con KPIs.
- Panel unificado de pendientes (double check, pagos, moras).

## Plan de testing (manual)

### Ventas y cobros
- Crear venta con saldo, registrar cobro parcial en ARS y USD (con TC).
- Confirmar cobro y validar: `paidTotal`, `balance`, `paymentStatus`.
- Marcar pago con double check y verificar que aparece en “Control ingresos”.
- Abrir PDF de venta/recibo y validar metadatos (double check, interés, cuotas).

### Cuenta corriente
- Crear venta y cobro → ver que el saldo de cliente cambie.
- Crear compra y pago → ver que el saldo de proveedor cambie.
- Registrar ajuste manual y verificar impacto en saldo y en detalle.
- Revisar aging vs saldo total.

### Arqueo / conciliación
- Reporte con periodo: validar ingresos/egresos por cuenta.
- Cargar contado distinto al esperado → ver diferencia.
- Guardar arqueo y verificar historial/auditoría.

### Pagos a proveedores
- Registrar pago con múltiples líneas + retenciones.
- Ver total impacto y retenciones en la UI.
- Descargar PDF del pago.
- Anular pago y verificar reversa contable y saldo.

### Permisos / roles
- Probar con rol no ADMIN/OWNER: verificar acceso a arqueo, ajustes y anulaciones.

## Release notes interno (2026-02-02)

### Nuevas funcionalidades
- Cuenta corriente avanzada (aging, filtros, export CSV, ajustes manuales).
- Arqueo/conciliación con reporte de caja, diferencias y auditoría.
- Pagos a proveedores con retenciones, anulación y PDF.
- Double check de ingresos con historial y export CSV.

### Cambios técnicos
- Nuevas tablas: `CashReconciliation`, `CashReconciliationLine`,
  `SupplierPaymentRetention`.
- Nuevos campos en `SupplierPayment`: `status`, `withheldTotal`,
  `cancelledAt`, `cancelledByUserId`, `cancellationNote`.
- Nuevos endpoints: `/api/cash-reconciliation`, `/api/cash-reconciliation/report`,
  `/api/current-accounts/adjustments`, `/api/pdf/supplier-payment`,
  `/api/supplier-payments/cancel`.
