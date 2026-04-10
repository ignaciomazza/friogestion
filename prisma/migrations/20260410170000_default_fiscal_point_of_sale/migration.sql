-- Default punto de venta de facturacion por organizacion (ARCA/WSFE)
ALTER TABLE "OrganizationFiscalConfig"
ADD COLUMN "defaultPointOfSale" INTEGER;
