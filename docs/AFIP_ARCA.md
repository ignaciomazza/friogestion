# AFIP + ARCA (Afip SDK)

## Objetivo
- Conectar ARCA para obtener cert/key y autorizar servicios.
- Emitir Facturas A/B y Notas de Credito A/B.
- Validar comprobantes de compra (WSCDC).
- Hacer lookup de contribuyentes por CUIT (constancia de inscripción).
- Generar PDFs con QR AFIP y branding por organization.

## Variables de entorno
- `ARCA_SECRETS_KEY`: base64 de 32 bytes para cifrado AES-256-GCM.
- `AFIP_SDK_ACCESS_TOKEN` o `ACCESS_TOKEN`: token Afip SDK.
- `AFIP_ACCESS_TOKEN`: compatibilidad legacy.
- `AFIP_ENV`: `production` | `testing`.
- `AFIP_CERT_BASE64` / `AFIP_KEY_BASE64`: fallback global de cert/key.
- `AFIP_SECRET_KEY`: clave fallback de cifrado si falta `ARCA_SECRETS_KEY`.

## Flujo ARCA
1) `POST /api/arca/connect` crea un job y guarda la clave fiscal solo en memoria (TTL 15 min).
2) `create_cert`: llama `v1/afip/certs` con CUIT representado, CUIT login, alias y clave.
3) `auth_ws`: llama `v1/afip/ws-auths` con los servicios seleccionados.
4) Guarda `cert/key` cifrados en `OrganizationFiscalConfig` y deja `status=CONNECTED`.
5) Si `status=pending`, se persiste `long_job_id` y se reintenta con `POST /api/arca/connect/[jobId]`.

## Servicios ARCA habilitables
- `wsfe`: emisión fiscal.
- `wscdc`: constatación de comprobantes de compra.
- `ws_sr_constancia_inscripcion`: lookup por CUIT.

Notas:
- Si no se envían servicios, se mantiene fallback a `wsfe` para compatibilidad.
- Si un endpoint requiere un servicio no autorizado, responde error funcional `ARCA_SERVICE_NOT_AUTHORIZED` con links de ayuda.
- No se usa `ws_sr_padron_a5` (deprecado).

## Emision AFIP (WSFE)
- El comprobante se arma desde `Sale + SaleItem` y datos de request.
- Si hay tasas por item, se calcula IVA; si no, se exige `manualTotals`.
- Se consulta `getSalesPoints` para determinar punto de venta.
- Se emite con `ElectronicBilling.createNextVoucher` (segun doc oficial).
- Se persiste en `FiscalInvoice.payloadAfip` y se marca `Sale.billingStatus=BILLED`.
- Concepto soportado: productos (1). No se usan fechas de servicio.

## Notas de credito
- Se generan a partir de `FiscalInvoice` original (CbtesAsoc).
- IVA se reconstruye desde el voucher original o `manualTotals`.
- Se respeta la moneda del comprobante original.
- Concepto soportado: productos (1). No se usan fechas de servicio.

## Validaciones ARCA
- Lookup contribuyente:
  - Endpoint: `POST /api/arca/taxpayer-lookup`
  - Servicio requerido: `ws_sr_constancia_inscripcion`
  - Cache por organización con TTL 24h.
- Verificación proveedor:
  - Endpoint: `POST /api/suppliers/verify`
  - Usa lookup por CUIT y guarda historial de verificación.
- Constatación comprobante compra:
  - Endpoints: `POST /api/purchases/validate`, `POST /api/purchases/[id]/revalidate`
  - Servicio requerido: `wscdc`
  - Guarda request/response normalizados e historial.

## Referencias oficiales (Afip SDK)
- Factura electronica: https://docs.afipsdk.com/siguientes-pasos/web-services/factura-electronica.md

## QR AFIP
- Base: `https://www.afip.gob.ar/fe/qr/?p=`.
- `p` es base64 de un JSON con datos del comprobante.
- Se guarda `qrBase64` en `payloadAfip` y se muestra en PDF.

## PDFs
- Render con `@react-pdf/renderer`.
- Logo: `OrganizationFiscalConfig.logoUrl`, luego `logoFilename`, luego `/public/logo.png`.

## Solucion de problemas (ARCA)
- Crear punto de venta: https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/crear-punto-de-venta
- Habilitar administrador de certificados (testing): https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/habilitar-administrador-de-certificados-de-testing
- Habilitar administrador de certificados (produccion): https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/habilitar-administrador-de-certificados-de-produccion
- Obtener certificado (testing): https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/obtener-certificado-de-testing
- Obtener certificado (produccion): https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/obtener-certificado-de-produccion
- Autorizar web service (testing): https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/autorizar-web-service-de-testing
- Autorizar web service (produccion): https://docs.afipsdk.com/recursos/tutoriales-pagina-de-arca/autorizar-web-service-de-produccion

## Endpoints clave
- `GET /api/arca`
- `POST /api/arca/connect`
- `GET|POST /api/arca/connect/[jobId]`
- `POST /api/arca/rotate`
- `GET /api/arca/test`
- `POST /api/arca/taxpayer-lookup`
- `POST /api/suppliers/verify`
- `POST /api/purchases/validate`
- `POST /api/purchases/[id]/revalidate`
- `GET|POST /api/fiscal-invoices`
- `GET /api/fiscal-invoices/[id]`
- `GET /api/fiscal-invoices/[id]/pdf`
- `GET|POST /api/credit-notes`
- `GET /api/credit-notes/[id]/pdf`
