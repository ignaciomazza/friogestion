# Testing Guide (manual)

Purpose: quick, consistent validation of the current finance features after a pause.

## 0) Prerequisites / Setup

### Organization config
- Currency: ARS default, USD active.
- Exchange rate: USD -> ARS (latest).
- Accounts:
  - Caja ARS (CASH, ARS)
  - Banco ARS (BANK, ARS)
  - Caja USD (CASH, USD)
  - Banco USD (BANK, USD)
- Payment methods:
  - Efectivo (requiresAccount: false)
  - Transferencia (requiresAccount: true, requiresDoubleCheck: true)
  - Tarjeta (requiresAccount: true, requiresDoubleCheck: true, requiresApproval: true)

### Base data
- Customers:
  - Cliente Demo SRL (taxId: 30-00000000-0)
  - Consumidor Final (taxId empty)
- Suppliers:
  - Proveedor ACME (taxId: 30-11111111-1)
- Products:
  - Silla (price 50000)
  - Escritorio (price 120000)

## 1) Ventas y cobros

1. Create a sale (Cliente Demo SRL):
   - Items: 1x Silla, 1x Escritorio.
   - Confirmed sale.
2. Register a partial receipt:
   - ARS cash, amount < total.
   - Confirm receipt.
3. Register second receipt in USD:
   - USD amount + FX rate.
   - Payment method with double check.
4. Go to "Control ingresos":
   - The receipt line must appear as pending.
   - Verify it and confirm it disappears from pending.
5. Check sale:
   - paymentStatus: PARTIAL then PAID after full amount.
   - paidTotal and balance updated.
   - double check badge appears while pending.
6. PDFs:
   - Sale PDF shows double check status + financing meta when applicable.
   - Receipt PDF shows double check status.

Expected:
- partial -> balance > 0
- final -> balance ~ 0, paymentStatus PAID
- double check pending visible until verified

## 2) Cuenta corriente

1. Open "Cuenta corriente" (Clientes):
   - Verify balances reflect sales and receipts.
   - Aging buckets populated for open balances.
2. Open detail:
   - Filter by date and source type.
3. Create manual adjustment:
   - Direction: CREDIT (customer favor) or DEBIT (customer owes).
   - Verify balance changes and detail entry appears.
4. Export CSV (summary and detail).

Expected:
- balances consistent with entries
- adjustment affects balance and detail

## 3) Compras y pagos a proveedores

1. Create purchase for Proveedor ACME (confirmed).
2. Register supplier payment:
   - Multiple lines (ARS + USD).
   - Retentions (one or more).
   - Allocate partial amount to purchase.
3. Validate:
   - total impact = payment + retentions
   - purchase paidTotal/balance updated
4. Download supplier payment PDF.
5. Cancel payment:
   - Verify it shows status CANCELLED.
   - Verify purchase balance re-opens.

Expected:
- cancellation reverses supplier balance and purchase paidTotal

## 4) Arqueo / conciliacion

1. Open "Arqueo" and run report for today.
2. Change counted amounts to create differences.
3. Save reconciliation and validate history entry.

Expected:
- expectedNet equals incoming - outgoing per account
- differences stored in history

## 5) Exports

- Current account summary CSV.
- Current account detail CSV.
- Double check report CSV (income check report).
- Verified history CSV (income check history).

## 6) Role checks

- Login with non-ADMIN role:
  - Access to arqueo, adjustments, cancellations should be blocked or hidden.
  - APIs should return 401/403 when access is denied.

## 7) Known risk checks

- Cancel a sale and verify current account does not stay inflated.
- Compare current account balance vs aging totals (should be consistent).
- Arqueo should optionally exclude unverified movements (if configured).
