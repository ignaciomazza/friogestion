# Investigacion: Ingresos Brutos e impacto posible en Friogestion

Fecha de corte: 2026-05-12.

Este documento es un relevamiento funcional y fiscal para entender como Ingresos Brutos podria relacionarse con el sistema. No es asesoramiento impositivo ni reemplaza la revision de un contador: las alicuotas y padrones dependen de CUIT, jurisdiccion, actividad declarada, tramo de ingresos, condicion local/Convenio Multilateral, certificados de exclusion y regimenes especiales.

## 1. Donde toca al sistema

Superficie actual encontrada:

- Ventas: `Sale`, `SaleItem`, `FiscalInvoice`, notas de credito y PDF fiscal. Hoy se calcula neto, IVA, exento y total para factura electronica AFIP/ARCA. No hay modelo de percepcion de IIBB a clientes ni campo de "otros tributos" provinciales.
- Compras: `PurchaseInvoice` guarda subtotal, taxes y total. La pantalla permite `purchaseVatAmount`, pero no separa percepciones de IIBB sufridas en facturas de proveedor.
- Pagos a proveedores: `SupplierPaymentRetention` ya admite `IIBB` como tipo manual. Esto sirve para registrar retenciones practicadas al pagar proveedores, pero no calcula padrones ni emite certificados.
- Remitos: `DeliveryNote` R/X no fiscal. Sirve para documentar traslado/entrega, pero no reemplaza factura ni COT de ARBA cuando corresponda.
- Clientes/proveedores: hay CUIT, perfil fiscal IVA y lookup ARCA. No hay condicion IIBB, jurisdicciones, coeficientes CM, actividad NAES/NAIIB, padrones AGIP/ARBA ni certificados de exclusion.
- Caja/cuentas: los cobros por banco/tarjeta pueden sufrir SIRCREB/SIRTAC. Hoy el sistema registra movimientos y conciliacion, pero no clasifica automaticamente deducciones IIBB.

Conclusion de sistema: Friogestion esta bien ubicado para facturacion IVA/ARCA y operatoria comercial, pero IIBB seria una capa distinta: jurisdiccional, por padrones y por DDJJ. Si se incorporara alguna vez, no deberia mezclarse con IVA ni con costo de producto sin separar conceptos.

## 2. Conceptos base

Ingresos Brutos grava el ejercicio habitual y oneroso de actividades en una jurisdiccion. La base general son los ingresos brutos del periodo, usualmente por devengado, con exclusiones especificas como IVA debito fiscal para responsables que corresponda. En Provincia de Buenos Aires, ARBA explica que la base imponible general se cuantifica por los ingresos brutos del periodo y que se atribuyen al periodo de devengamiento. En CABA, el Codigo Fiscal establece la base sobre ingresos brutos devengados por la actividad gravada.

Hay tres planos distintos:

- Impuesto propio: lo debe el vendedor/contribuyente sobre sus ingresos. Normalmente no se suma como linea de factura; se liquida en DDJJ mensual.
- Percepcion sufrida o practicada: un agente vendedor agrega un importe en factura y lo cobra al cliente como pago a cuenta de IIBB del cliente.
- Retencion sufrida o practicada: un pagador/agente descuenta una parte al pagar. Para el retenido es pago a cuenta; para el agente es deuda a depositar al fisco.

Esto es clave para el sistema:

- En una venta, el IIBB propio no cambia el total facturado salvo que exista percepcion.
- En una compra, una percepcion de IIBB no es IVA. Si es computable, se registra como credito fiscal provincial/pago a cuenta; si no es computable, puede terminar como mayor costo/gasto segun criterio contable.
- En un pago a proveedor, una retencion IIBB reduce el efectivo entregado pero cancela parte de la deuda comercial.

## 3. CABA / AGIP

Regimenes:

- Regimen Simplificado: para actividad exclusiva en CABA y dentro de parametros. Desde 2026 AGIP se incorpora al Monotributo Unificado nacional: el pago se centraliza con ARCA y las categorias se igualan a ARCA.
- Contribuyente Local: actividad exclusivamente en CABA, salvo simplificado. Presenta DDJJ mensual por e-SICOL.
- Convenio Multilateral: actividad en CABA y otra jurisdiccion. Presenta por SIFERE Web.

Alicuotas 2026 relevantes:

- Ley Impositiva CABA 2026, Anexo Ley 6927: produccion/elaboracion de bienes 1,00%; construccion 2,00%.
- Comercializacion mayorista/minorista, reparaciones y otras actividades de servicios: 3,00% si los ingresos brutos anuales del ejercicio fiscal anterior son hasta $364.000.000; 5,00% si superan ese importe.
- Restaurantes/hoteles: 3,00% hasta $2.004.000.000; 4,50% si superan.
- Servicios inmobiliarios/empresariales/alquiler: 3,00% hasta $2.004.000.000; 5,00% si superan.
- Intermediacion sobre base especial: 5,50%.
- Actividades financieras especificas: 5,50% u 8,00%, segun actividad.

Agentes CABA:

- AGIP publica padrones y alicuotas para agentes de recaudacion.
- Una FAQ de AGIP indica que, para ciertas ventas de bienes con entrega en CABA a sujetos no incluidos en padron/no inscriptos en CABA, puede aplicar percepcion del 6%.
- AGIP muestra un ejemplo de Factura A a monotributista con percepcion ISIB CABA calculada sobre subtotal con IVA incluido: neto $100.000 + IVA $21.000 = $121.000; percepcion 3,50% sobre $121.000 = $4.235; total $125.235.

## 4. Provincia de Buenos Aires / ARBA

Regimenes:

- Contribuyente local PBA: actividad solo en Provincia de Buenos Aires. Presenta DDJJ Web mensual, salvo simplificado u otros regimenes.
- Ingresos Brutos Simplificado: monotributistas locales adheridos a Monotributo Unificado. ARBA indica pago unico mensual junto con Monotributo; no se practican retenciones/percepciones a adheridos.
- Convenio Multilateral: actividad en PBA y otra jurisdiccion, liquidacion por SIFERE.

Alicuotas 2026:

- Ley PBA 15.558 fija alicuotas por NAIIB-18 y por tramos de ingresos.
- Muchas actividades de comercio minorista, por ejemplo electrodomesticos y articulos para el hogar, figuran con alicuota general 5,00% y reducidas por tramos: 3,50%, 2,50% o 1,50% segun actividad/tramo.
- El articulo 20 de la Ley 15.558 exige mirar actividad NAIIB-18, tratamiento general/especial y tramos de ingresos. No conviene codificar una "alicuota PBA" unica.

Agentes PBA:

- ARBA usa padrones por sujeto para regimenes generales de retencion y percepcion.
- Si el contribuyente no figura en padron, ARBA informa que pueden aplicar alicuotas maximas: 8% para percepciones y 4% para retenciones, bajo la DN Serie B 01/04.
- Para 2026, ARBA publico umbrales de agentes: regimen general retencion/percepcion desde $7.800.000.000 de ingresos, con otros importes para actividades especificas.
- ARBA explica que el impuesto determinado surge de base imponible por alicuota, menos deducciones como retenciones, percepciones y saldos a favor.

COT y remitos:

- ARBA informa que desde 2026 el valor minimo para emitir COT es $9.529.691.
- El COT informa operaciones vinculadas al transporte de bienes dentro de PBA o con origen/destino en jurisdicciones adheridas.
- Debe obtenerse antes del traslado, salvo excepciones. Un remito del sistema no equivale automaticamente a COT; puede ser insumo documental para generarlo.

## 5. Convenio Multilateral

Aplica cuando la actividad se desarrolla en dos o mas jurisdicciones, incluso si la venta se formaliza por medios remotos, cuando hay sustento territorial: gastos, deposito, entrega, clientes, viajantes, local, servicios prestados o bienes usados economicamente en otra jurisdiccion.

Regla general del art. 2:

- 50% de la base se distribuye segun gastos efectivamente soportados en cada jurisdiccion.
- 50% se distribuye segun ingresos provenientes de cada jurisdiccion.
- Para operaciones del ultimo parrafo del art. 1, los ingresos se atribuyen al domicilio del adquirente de bienes, obras o servicios.

Presentaciones:

- SIFERE Web DDJJ: CM03/CM04 mensuales y CM05 anual.
- SIFERE Consultas permite ver DDJJ, pagos, padron y deducciones informadas por agentes.
- Deducciones frecuentes: SIRCAR (retenciones/percepciones), SIRCREB (acreditaciones bancarias), SIRPEI (aduana/importaciones), SIRTAC (tarjetas/agrupadores de pago).

## 6. Importados

La importacion de mercaderia no es "ingreso" por si misma para el importador, pero puede generar percepciones de IIBB en Aduana.

- SIRPEI es el sistema de percepciones de IIBB sobre importacion definitiva a consumo de mercaderias.
- Comarb indica que opera sobre contribuyentes del gravamen registrados por el Sistema Informatico Malvina.
- La RG CA 6/2020 ratifica que Aduana practique percepciones de IIBB en operaciones de importacion definitiva a consumo.
- Las jurisdicciones informan alicuotas/coeficientes; en Convenio Multilateral se usan coeficientes de la ultima DDJJ registrada.

Para Friogestion:

- Una percepcion SIRPEI deberia registrarse como pago a cuenta IIBB, no como IVA.
- Si se carga dentro del costo del producto importado, se distorsiona margen y stock.
- La venta posterior del producto importado tributa IIBB igual que un producto local segun actividad/jurisdiccion; el origen importado no elimina el impuesto.

## 7. Facturacion electronica y "otros tributos"

ARCA/Factura Electronica contempla tablas de "Otros Tributos" y en WSFEv1 el campo `ImpTrib` como suma de tributos asociados. Las percepciones provinciales de IIBB, cuando se incluyen en factura, deben informarse como tributo/otros tributos segun corresponda.

El sistema hoy arma comprobantes con neto, IVA, exento y total. Si se quisiera emitir percepciones IIBB en factura, habria que soportar:

- jurisdiccion de percepcion;
- regimen y padron/alicuota;
- base de calculo;
- importe de percepcion;
- inclusion en `Tributos`/`ImpTrib`;
- PDF fiscal mostrando la percepcion;
- nota de credito revirtiendo proporcionalmente la percepcion cuando corresponda.

## 8. Ejemplos numericos

### Caso A: venta local CABA sin percepcion

Supuestos:

- Responsable inscripto en IVA.
- Contribuyente local CABA, actividad comercial en tramo de 3%.
- Venta de producto local: neto $100.000, IVA 21%.

Factura:

- Neto gravado: $100.000
- IVA: $21.000
- Total factura: $121.000

IIBB propio:

- Base estimada IIBB: $100.000
- Impuesto del mes por esta operacion: $3.000
- No se agrega al comprobante como linea. Se liquida en DDJJ mensual e-SICOL, restando deducciones si las hubiera.

### Caso B: venta CABA con percepcion a cliente

Supuestos:

- Vendedor designado agente AGIP.
- Cliente pasible con alicuota percepcion 3,50%.
- AGIP, para el ejemplo de Factura A a monotributista, calcula sobre subtotal con IVA.

Factura:

- Neto: $100.000
- IVA 21%: $21.000
- Subtotal: $121.000
- Percepcion ISIB CABA 3,50%: $4.235
- Total a cobrar: $125.235

Efectos:

- Cliente paga $125.235 y toma $4.235 como pago a cuenta IIBB CABA, si corresponde.
- Vendedor cobra esa percepcion, pero no es ingreso propio: debe depositarla como agente.
- En facturacion electronica deberia ir como "otros tributos"; el sistema actual no lo modela.

### Caso C: venta PBA con percepcion

Supuestos:

- Vendedor agente ARBA.
- Cliente en padron con percepcion 2%.
- Base de percepcion asumida para ejemplo: neto sin IVA. En la practica se valida regimen y condicion IVA.

Factura:

- Neto: $100.000
- IVA: $21.000
- Percepcion IIBB PBA 2% sobre $100.000: $2.000
- Total: $123.000

Efectos:

- El vendedor deposita $2.000 a ARBA como agente.
- El cliente deduce $2.000 en su DDJJ PBA/CM.
- Si el cliente no figura en padron, ARBA puede llevar a alicuotas maximas segun supuesto normativo; hay que validar antes de facturar.

### Caso D: compra local con percepcion IIBB

Supuestos:

- Compra mercaderia local para reventa en PBA.
- Neto proveedor: $1.000.000
- IVA 21%: $210.000
- Percepcion IIBB PBA sufrida: 2% sobre neto = $20.000

Factura proveedor:

- Neto: $1.000.000
- IVA credito fiscal: $210.000
- Percepcion IIBB: $20.000
- Total a pagar: $1.230.000

Lectura contable:

- Stock/costo: $1.000.000, salvo gastos adicionales capitalizables.
- IVA credito: $210.000.
- IIBB percepcion a computar: $20.000.
- Proveedor: $1.230.000.

Riesgo en sistema actual:

- Si se carga `totalAmount = 1.230.000` y `purchaseVatAmount = 210.000`, el subtotal queda $1.020.000. Ese subtotal mezcla costo con percepcion y distorsiona margen.

### Caso E: pago a proveedor con retencion IIBB

Supuestos:

- Factura proveedor total $1.210.000 (neto $1.000.000 + IVA $210.000).
- La empresa es agente de retencion.
- Retencion IIBB: 2,5% sobre base neta = $25.000.

Pago:

- Deuda comercial cancelada: $1.210.000
- Transferencia al proveedor: $1.185.000
- Retencion IIBB a depositar: $25.000

En Friogestion:

- `SupplierPayment.total` deberia reflejar cancelacion total.
- `withheldTotal` $25.000.
- `SupplierPaymentRetention(type=IIBB, baseAmount=1.000.000, rate=2.5, amount=25.000)`.
- Falta automatizacion de padron, certificado y archivo/DDJJ agente.

### Caso F: venta CABA/PBA bajo Convenio Multilateral

Supuestos mensuales:

- Ventas netas totales: $10.000.000.
- Ingresos por domicilio/destino cliente: CABA 40%, PBA 60%.
- Gastos computables: CABA 30%, PBA 70%.

Coeficiente unificado:

- CABA: 50% * 40% ingresos + 50% * 30% gastos = 35%.
- PBA: 50% * 60% ingresos + 50% * 70% gastos = 65%.

Base por jurisdiccion:

- CABA: $3.500.000.
- PBA: $6.500.000.

Impuesto ilustrativo:

- Si CABA aplica 3%: $105.000.
- Si PBA aplica 3,5%: $227.500.
- Total determinado antes de deducciones: $332.500.

Las facturas no se "parten" por jurisdiccion. La distribucion se hace en SIFERE. Remito, domicilio de entrega y cliente ayudan a justificar atribucion.

### Caso G: importacion con SIRPEI

Supuestos:

- Mercaderia importada para reventa.
- Base aduanera para percepcion IIBB: $2.000.000.
- Alicuota SIRPEI ilustrativa: 2,5%.

Percepcion:

- $2.000.000 * 2,5% = $50.000.

Lectura:

- Es pago a cuenta de IIBB, distribuido/atribuido segun jurisdiccion y padron.
- No es IVA credito ni derecho de importacion.
- Si es computable, no deberia formar costo de producto.
- Cuando se venda la mercaderia importada, la venta local/CM vuelve a generar IIBB propio como cualquier otra venta.

### Caso H: remito sin factura

Supuestos:

- Se emite remito X por traslado de equipos desde deposito a cliente PBA.
- Valor de bienes: $10.000.000.

Efecto:

- El remito no genera por si solo debito fiscal IVA ni factura.
- Puede ser evidencia de entrega/devengamiento y de jurisdiccion.
- Como supera el minimo COT 2026 informado por ARBA, podria requerir COT antes del traslado si el origen/destino queda alcanzado y no aplica excepcion.

## 9. Reglas practicas para no equivocarse

- Separar siempre IVA, percepciones IIBB, retenciones IIBB y costo.
- No tratar IIBB propio como item de factura salvo obligacion informativa o percepcion.
- Antes de percibir/retener, validar si la empresa es agente, regimen aplicable, CUIT del tercero, padron mensual y certificados de exclusion.
- Para PBA/CABA, la entrega fisica y el domicilio del comprador importan; remitos y domicilios no son meramente logisticos.
- En Convenio Multilateral, la clave no es solo "donde facture", sino sustento territorial, ingresos y gastos.
- En importaciones, revisar SIRPEI y su deduccion en SIFERE/ARBA/AGIP antes de cargar costo.
- Las ventas por tarjetas, Mercado Pago u otros PSP pueden sufrir SIRTAC/SIRCREB/SIRCUPA; esas deducciones deben conciliarse contra cobros reales.

## 10. Fuentes oficiales consultadas

- ARBA - Ingresos Brutos: https://web.arba.gov.ar/ingresos-brutos
- ARBA - Base imponible IIBB: https://www.arba.gov.ar/Informacion/IBrutos/IBContribuyentes/baseimponible.asp?lugar=E
- ARBA - Ley Impositiva PBA 2026 Ley 15.558: https://www.arba.gov.ar/archivos/Publicaciones/leyimpositiva2026.pdf
- ARBA - Regimen de recaudacion por sujeto: https://web.arba.gov.ar/regimen-de-recaudacion-por-sujeto
- ARBA - Agentes de recaudacion: https://web.arba.gov.ar/agentes
- ARBA - COT: https://web.arba.gov.ar/agente/cot
- AGIP - Ingresos Brutos: https://imagenes.agip.gob.ar/impuestos/ingresos-brutos
- AGIP - Normativa 2026: https://imagenes.agip.gob.ar/normativa/inicio
- BOCBA - Ley Impositiva CABA 2026 Ley 6927: https://boletinoficial.buenosaires.gob.ar/normativaba/norma/829857
- BOCBA - Anexo Ley 6927: https://documentosboletinoficial.buenosaires.gob.ar/publico/PL-FEERR-LCABA-LCABA-6927-25-ANX.pdf
- AGIP - Agentes de recaudacion, alicuotas: https://imagenes.agip.gob.ar/agentes/agentes-de-recaudacion/ib-agentes-recaudacion/informacion-general/datos/agentes-de-recaudacion-alicuotas
- AGIP - FAQ regimen general recaudacion: https://imagenes.agip.gob.ar/agentes/agentes-de-recaudacion/ib-agentes-recaudacion/informacion-general/datos/ag-preg-res-939
- Comarb - Convenio Multilateral: https://www.ca.gob.ar/convenio-multilateral-menu-pagina-legales
- Comarb - SIFERE Web: https://www.ca.gob.ar/preguntas-frecuentes/sistemas/sifere/sifere-web-consultas/que-funcionalidad-tiene-cada-uno-de-los-modulos-del-sifere-web
- Comarb - SIRCAR: https://ed.comarb.gob.ar/sistemas/sircar
- Comarb - SIRCREB: https://www.ca.gob.ar/sircreb
- Comarb - SIRTAC: https://www.ca.gob.ar/preguntas-frecuentes/sistemas/sirtac/general/que-es-el-sistema-sirtac
- Comarb - SIRCUPA: https://www.ca.gob.ar/preguntas-frecuentes/sistemas/sircupa/que-es-el-sircupa
- Comarb - SIRPEI: https://www.ca.gob.ar/sistemas/sirpei
- ARCA - Factura Electronica tablas del sistema: https://www.arca.gob.ar/fe/ayuda/tablas.asp
- ARCA - Factura Electronica WebService: https://www.arca.gob.ar/fe/ayuda/webservice.asp
