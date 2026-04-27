import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/format";

type FiscalPdfData = {
  title: string;
  issuer: {
    name: string;
    legalName?: string | null;
    taxId?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    fiscalCondition?: string | null;
  };
  receiver: {
    name: string;
    legalName?: string | null;
    taxId?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    fiscalCondition?: string | null;
  };
  voucher: {
    pointOfSale?: string | null;
    number?: string | null;
    issuedAt?: string | null;
    cae?: string | null;
    caeDueDate?: string | null;
    currencyCode?: string | null;
    total?: number | null;
    net?: number | null;
    iva?: number | null;
    exempt?: number | null;
    otherTaxes?: number | null;
    serviceDates?: { from: string; to: string; due?: string | null } | null;
  };
  items: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
    taxRate?: number | null;
    taxAmount?: number | null;
  }>;
  transparency?: {
    enabled?: boolean;
    ivaContained?: number | null;
    otherNationalIndirectTaxes?: number | null;
  } | null;
  logoSrc?: string | null;
  qrBase64?: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 34,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#172033",
    backgroundColor: "#ffffff",
  },
  accent: {
    height: 4,
    backgroundColor: "#0f172a",
    borderRadius: 999,
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 18,
  },
  logo: {
    width: 150,
    height: 56,
    objectFit: "contain",
  },
  issuerBrand: {
    maxWidth: "48%",
  },
  brandName: {
    fontSize: 14,
    fontWeight: 700,
  },
  titleBlock: {
    alignItems: "flex-end",
    gap: 4,
    maxWidth: "52%",
  },
  title: {
    fontSize: 20,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 9,
    color: "#667085",
  },
  voucherNumber: {
    fontSize: 10,
    fontWeight: 700,
    color: "#172033",
  },
  section: {
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  label: {
    fontSize: 7,
    color: "#6b7280",
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  strong: {
    fontSize: 10,
    fontWeight: 700,
  },
  muted: {
    color: "#667085",
  },
  partyCard: {
    width: "50%",
    borderWidth: 1,
    borderColor: "#e4e7ec",
    backgroundColor: "#fcfcfd",
    borderRadius: 10,
    padding: 10,
    minHeight: 94,
  },
  partyHeader: {
    marginBottom: 6,
  },
  detailLine: {
    marginTop: 3,
    color: "#344054",
  },
  serviceDates: {
    marginBottom: 12,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    backgroundColor: "#ffffff",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#eef2f7",
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    borderBottomWidth: 1,
    borderBottomColor: "#d0d5dd",
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 600,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    backgroundColor: "#fcfcfd",
  },
  colDesc: { width: "44%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "16%", textAlign: "right" },
  colTax: { width: "14%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  subText: {
    fontSize: 7,
    color: "#667085",
    marginTop: 2,
  },
  totals: {
    marginTop: 12,
    marginLeft: "auto",
    width: "44%",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalHighlight: {
    fontSize: 10,
    fontWeight: 700,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 16,
  },
  transparencyBox: {
    width: "52%",
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#ffffff",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  transparencyTitle: {
    fontSize: 8,
    fontWeight: 700,
    marginBottom: 6,
  },
  transparencyRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
  },
  footer: {
    marginTop: 18,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#d0d5dd",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  authorization: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  authorizationCard: {
    width: 170,
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "#ffffff",
  },
  authorizationTitle: {
    fontSize: 8,
    color: "#667085",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  authorizationValue: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 6,
  },
  authorizationDue: {
    fontSize: 9,
    color: "#344054",
  },
  qr: {
    width: 104,
    height: 104,
  },
});

export function FiscalPdfDocument({ data }: { data: FiscalPdfData }) {
  const currency = data.voucher.currencyCode === "USD" ? "USD" : "ARS";
  const voucherNumber = [data.voucher.pointOfSale, data.voucher.number]
    .filter(Boolean)
    .join("-");
  const totals = [
    { label: "Neto", value: data.voucher.net },
    { label: "IVA", value: data.voucher.iva },
    { label: "Exento", value: data.voucher.exempt },
    { label: "Otros impuestos", value: data.voucher.otherTaxes },
    { label: "Total", value: data.voucher.total },
  ].filter(
    (item) =>
      item.value !== null &&
      item.value !== undefined &&
      (item.label === "Total" || Number(item.value) !== 0)
  );
  const transparency =
    data.transparency?.enabled === true
      ? {
          ivaContained:
            data.transparency.ivaContained ?? data.voucher.iva ?? 0,
          otherNationalIndirectTaxes:
            data.transparency.otherNationalIndirectTaxes ??
            data.voucher.otherTaxes ??
            0,
        }
      : null;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accent} />
        <View style={styles.header}>
          <View style={styles.issuerBrand}>
            {data.logoSrc ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.logoSrc} style={styles.logo} />
            ) : (
              <Text style={styles.brandName}>{data.issuer.name}</Text>
            )}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.voucherNumber}>{voucherNumber || "-"}</Text>
            {data.voucher.issuedAt ? (
              <Text style={styles.subtitle}>
                Emitido el {data.voucher.issuedAt}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.partyCard}>
              <View style={styles.partyHeader}>
                <Text style={styles.label}>Emisor</Text>
                <Text style={styles.strong}>
                  {data.issuer.legalName ?? data.issuer.name}
                </Text>
              </View>
              {data.issuer.legalName &&
              data.issuer.legalName !== data.issuer.name ? (
                <Text style={styles.detailLine}>{data.issuer.name}</Text>
              ) : null}
              {data.issuer.taxId ? (
                <Text style={styles.detailLine}>CUIT {data.issuer.taxId}</Text>
              ) : null}
              {data.issuer.fiscalCondition ? (
                <Text style={styles.detailLine}>
                  {data.issuer.fiscalCondition}
                </Text>
              ) : null}
              {data.issuer.address ? (
                <Text style={styles.detailLine}>{data.issuer.address}</Text>
              ) : null}
              {data.issuer.email ? (
                <Text style={styles.detailLine}>{data.issuer.email}</Text>
              ) : null}
              {data.issuer.phone ? (
                <Text style={styles.detailLine}>{data.issuer.phone}</Text>
              ) : null}
            </View>
            <View style={styles.partyCard}>
              <View style={styles.partyHeader}>
                <Text style={styles.label}>Receptor</Text>
                <Text style={styles.strong}>
                  {data.receiver.legalName ?? data.receiver.name}
                </Text>
              </View>
              {data.receiver.legalName &&
              data.receiver.legalName !== data.receiver.name ? (
                <Text style={styles.detailLine}>{data.receiver.name}</Text>
              ) : null}
              {data.receiver.taxId ? (
                <Text style={styles.detailLine}>CUIT {data.receiver.taxId}</Text>
              ) : null}
              {data.receiver.fiscalCondition ? (
                <Text style={styles.detailLine}>
                  {data.receiver.fiscalCondition}
                </Text>
              ) : null}
              {data.receiver.address ? (
                <Text style={styles.detailLine}>{data.receiver.address}</Text>
              ) : null}
              {data.receiver.email ? (
                <Text style={styles.detailLine}>{data.receiver.email}</Text>
              ) : null}
              {data.receiver.phone ? (
                <Text style={styles.detailLine}>{data.receiver.phone}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {data.voucher.serviceDates ? (
          <View style={styles.serviceDates}>
            <Text style={styles.label}>Servicio</Text>
            <Text>
              {data.voucher.serviceDates.from} → {data.voucher.serviceDates.to}
            </Text>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colDesc, styles.tableHeaderText]}>Detalle</Text>
              <Text style={[styles.colQty, styles.tableHeaderText]}>Cant.</Text>
              <Text style={[styles.colUnit, styles.tableHeaderText]}>Unit.</Text>
              <Text style={[styles.colTax, styles.tableHeaderText]}>IVA</Text>
              <Text style={[styles.colTotal, styles.tableHeaderText]}>Neto</Text>
            </View>
            {data.items.map((item, index) => {
              const taxRate =
                item.taxRate !== undefined && item.taxRate !== null
                  ? item.taxRate
                  : null;
              const taxAmount =
                item.taxAmount !== undefined && item.taxAmount !== null
                  ? item.taxAmount
                  : taxRate !== null
                    ? item.total * (taxRate / 100)
                    : null;

              return (
                <View
                  key={`${item.description}-${index}`}
                  style={
                    index % 2 === 0
                      ? [styles.tableRow, styles.tableRowAlt]
                      : styles.tableRow
                  }
                >
                  <View style={styles.colDesc}>
                    <Text>{item.description}</Text>
                    {taxRate !== null ? (
                      <Text style={styles.subText}>IVA {taxRate.toFixed(2)}%</Text>
                    ) : null}
                  </View>
                  <Text style={styles.colQty}>{item.qty.toFixed(2)}</Text>
                  <Text style={styles.colUnit}>
                    {formatCurrency(item.unitPrice, currency)}
                  </Text>
                  <Text style={styles.colTax}>
                    {taxAmount !== null
                      ? formatCurrency(taxAmount, currency)
                      : "-"}
                  </Text>
                  <Text style={styles.colTotal}>
                    {formatCurrency(item.total, currency)}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.summaryRow}>
          {transparency ? (
            <View style={styles.transparencyBox}>
              <Text style={styles.transparencyTitle}>
                Regimen de Transparencia Fiscal al Consumidor (Ley 27.743)
              </Text>
              <View style={styles.transparencyRow}>
                <Text style={styles.muted}>IVA contenido</Text>
                <Text>
                  {formatCurrency(transparency.ivaContained, currency)}
                </Text>
              </View>
              <View style={styles.transparencyRow}>
                <Text style={styles.muted}>
                  Otros impuestos nacionales indirectos
                </Text>
                <Text>
                  {formatCurrency(
                    transparency.otherNationalIndirectTaxes,
                    currency
                  )}
                </Text>
              </View>
            </View>
          ) : (
            <View style={{ width: "52%" }} />
          )}
          <View style={styles.totals}>
            {totals.map((item) => (
              <View key={item.label} style={styles.totalRow}>
                <Text
                  style={
                    item.label === "Total" ? styles.totalHighlight : undefined
                  }
                >
                  {item.label}
                </Text>
                <Text
                  style={
                    item.label === "Total" ? styles.totalHighlight : undefined
                  }
                >
                  {formatCurrency(item.value ?? 0, currency)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footer} wrap={false}>
          <View style={styles.authorization} wrap={false}>
            <View style={styles.authorizationCard}>
              <Text style={styles.authorizationTitle}>
                Comprobante autorizado ARCA
              </Text>
              <Text style={styles.label}>CAE</Text>
              <Text style={styles.authorizationValue}>
                {data.voucher.cae ?? "-"}
              </Text>
              <Text style={styles.label}>Vto. CAE</Text>
              <Text style={styles.authorizationDue}>
                {data.voucher.caeDueDate ?? "-"}
              </Text>
            </View>
            {data.qrBase64 ? (
              // eslint-disable-next-line jsx-a11y/alt-text
              <Image src={data.qrBase64} style={styles.qr} />
            ) : null}
          </View>
        </View>
      </Page>
    </Document>
  );
}
