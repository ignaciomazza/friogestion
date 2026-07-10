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
    activityStart?: string | null;
    address?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    socialMedia?: string | null;
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
  logoSrc?: string | null;
  qrBase64?: string | null;
  paymentMethod?: string | null;
  hideTaxBreakdown?: boolean;
  transparencyLegend?: {
    enabled?: boolean;
    ivaContained?: number | null;
    otherNationalIndirectTaxes?: number | null;
  } | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 24,
    fontSize: 8.2,
    fontFamily: "Helvetica",
    color: "#172033",
    backgroundColor: "#ffffff",
  },
  accent: {
    height: 3,
    backgroundColor: "#0f172a",
    borderRadius: 999,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 10,
    paddingHorizontal: 9,
  },
  logo: {
    width: 126,
    height: 46,
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
    gap: 3,
    maxWidth: "52%",
  },
  title: {
    fontSize: 17,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 8.5,
    color: "#667085",
  },
  voucherNumber: {
    fontSize: 9.5,
    fontWeight: 700,
    color: "#172033",
  },
  section: {
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  label: {
    fontSize: 7,
    color: "#6b7280",
    marginBottom: 2,
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
    borderRadius: 8,
    padding: 7,
    minHeight: 70,
  },
  partyHeader: {
    marginBottom: 4,
  },
  detailLine: {
    marginTop: 2.4,
    color: "#344054",
  },
  serviceDates: {
    marginBottom: 6,
  },
  tableContainer: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#eef2f7",
    borderTopLeftRadius: 7,
    borderTopRightRadius: 7,
    borderBottomWidth: 1,
    borderBottomColor: "#d0d5dd",
    paddingVertical: 4.2,
    paddingHorizontal: 7,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 600,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4.5,
    paddingHorizontal: 7,
  },
  tableRowAlt: {
    backgroundColor: "#fcfcfd",
  },
  tableRowLast: {
    borderBottomLeftRadius: 7,
    borderBottomRightRadius: 7,
  },
  colDesc: { width: "44%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "16%", textAlign: "right" },
  colTax: { width: "14%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  colTotalNoTax: { width: "30%" },
  subText: {
    fontSize: 7,
    color: "#667085",
    marginTop: 2,
  },
  totals: {
    marginTop: 6,
    width: "100%",
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#f8fafc",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4.5,
  },
  settlementRow: {
    flexDirection: "row",
    alignItems: "stretch",
    gap: 8,
  },
  settlementSummary: {
    width: "42%",
  },
  paymentBox: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  paymentLabel: {
    fontSize: 7,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 3,
  },
  paymentValue: {
    fontSize: 9,
    color: "#172033",
  },
  totalRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2.4,
  },
  totalHighlight: {
    fontSize: 10,
    fontWeight: 700,
  },
  footer: {
    width: "58%",
    flexDirection: "row",
    justifyContent: "flex-end",
    alignItems: "flex-start",
  },
  authorization: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  authorizationCard: {
    width: 150,
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 7,
    backgroundColor: "#ffffff",
  },
  authorizationTitle: {
    fontSize: 7.3,
    color: "#667085",
    marginBottom: 5,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  authorizationValue: {
    fontSize: 10,
    fontWeight: 700,
    marginBottom: 4,
  },
  authorizationDue: {
    fontSize: 9,
    color: "#344054",
  },
  qr: {
    width: 88,
    height: 88,
  },
  transparencyLegend: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    backgroundColor: "#ffffff",
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  transparencyLegendLabel: {
    width: 95,
    fontSize: 6.8,
    fontWeight: 700,
    color: "#475467",
    textTransform: "uppercase",
    letterSpacing: 0.25,
  },
  transparencyLegendText: {
    flex: 1,
    fontSize: 7.2,
    color: "#475467",
    lineHeight: 1.25,
  },
  issuerContactFooter: {
    marginTop: 8,
    paddingHorizontal: 9,
  },
  issuerContactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  issuerContactItem: {
    width: "50%",
    marginTop: 1,
  },
  issuerContactItemLeft: {
    paddingRight: 8,
  },
  issuerContactItemRight: {
    paddingLeft: 8,
  },
  issuerContactText: {
    fontSize: 7.2,
    color: "#475467",
    lineHeight: 1.25,
  },
  issuerContactTextRight: {
    textAlign: "right",
  },
});

function formatVoucherDisplay(
  pointOfSale?: string | null,
  number?: string | null,
) {
  const pointDigits = (pointOfSale ?? "").replace(/\D/g, "");
  const numberDigits = (number ?? "").replace(/\D/g, "");

  if (pointDigits && numberDigits) {
    return `${pointDigits.padStart(4, "0")}-${numberDigits.padStart(8, "0")}`;
  }

  if (numberDigits) return numberDigits;
  return number?.trim() || "-";
}

function normalizeMultilineDetail(value?: string | null) {
  if (!value) return null;
  const lines = value
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) return null;
  return lines.join("\n");
}

export function FiscalPdfDocument({ data }: { data: FiscalPdfData }) {
  const currency = data.voucher.currencyCode === "USD" ? "USD" : "ARS";
  const voucherNumber = formatVoucherDisplay(
    data.voucher.pointOfSale,
    data.voucher.number,
  );
  const forceHideTaxBreakdown = data.hideTaxBreakdown === true;
  const hideVatBreakdown = forceHideTaxBreakdown;
  const issuerSocialMedia = normalizeMultilineDetail(data.issuer.socialMedia);
  const hasIssuerContactDetails = Boolean(
    data.issuer.address ||
      data.issuer.email ||
      data.issuer.phone ||
      data.issuer.website ||
      issuerSocialMedia
  );
  const issuerContactLines = [
    data.issuer.address,
    data.issuer.email,
    data.issuer.phone,
    data.issuer.website,
    issuerSocialMedia,
  ].filter((value): value is string => Boolean(value));
  const totals = hideVatBreakdown
    ? [{ label: "Total", value: data.voucher.total }]
    : [
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
  const transparencyLegend =
    data.transparencyLegend?.enabled === true
      ? {
          ivaContained: data.transparencyLegend.ivaContained ?? 0,
          otherNationalIndirectTaxes:
            data.transparencyLegend.otherNationalIndirectTaxes ?? 0,
        }
      : null;
  const showOtherTransparencyTaxes =
    transparencyLegend !== null &&
    Math.abs(transparencyLegend.otherNationalIndirectTaxes) > 0.004;

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
              <Text style={styles.detailLine}>
                Condicion fiscal: {data.issuer.fiscalCondition?.trim() || "No informada"}
              </Text>
              <Text style={styles.detailLine}>
                Inicio de actividad: {data.issuer.activityStart?.trim() || "No informado"}
              </Text>
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
              {!hideVatBreakdown ? (
                <Text style={[styles.colTax, styles.tableHeaderText]}>IVA</Text>
              ) : null}
              <Text
                style={[
                  styles.colTotal,
                  ...(hideVatBreakdown ? [styles.colTotalNoTax] : []),
                  styles.tableHeaderText,
                ]}
              >
                {hideVatBreakdown ? "Total" : "Neto"}
              </Text>
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
              const lineTotal =
                taxAmount !== null ? item.total + taxAmount : item.total;
              const unitTaxAmount =
                taxRate !== null ? item.unitPrice * (taxRate / 100) : null;
              const unitTotal =
                unitTaxAmount !== null ? item.unitPrice + unitTaxAmount : item.unitPrice;

              return (
                <View
                  key={`${item.description}-${index}`}
                  wrap={false}
                  style={[
                    styles.tableRow,
                    ...(index % 2 === 0 ? [styles.tableRowAlt] : []),
                    ...(index === data.items.length - 1
                      ? [styles.tableRowLast]
                      : []),
                  ]}
                >
                  <View style={styles.colDesc}>
                    <Text>{item.description}</Text>
                    {!hideVatBreakdown && taxRate !== null ? (
                      <Text style={styles.subText}>IVA {taxRate.toFixed(2)}%</Text>
                    ) : null}
                  </View>
                  <Text style={styles.colQty}>{item.qty.toFixed(2)}</Text>
                  <Text style={styles.colUnit}>
                    {formatCurrency(
                      hideVatBreakdown ? unitTotal : item.unitPrice,
                      currency
                    )}
                  </Text>
                  {!hideVatBreakdown ? (
                    <Text style={styles.colTax}>
                      {taxAmount !== null
                        ? formatCurrency(taxAmount, currency)
                        : "-"}
                    </Text>
                  ) : null}
                  <Text
                    style={[
                      styles.colTotal,
                      ...(hideVatBreakdown ? [styles.colTotalNoTax] : []),
                    ]}
                  >
                    {formatCurrency(
                      hideVatBreakdown ? lineTotal : item.total,
                      currency
                    )}
                  </Text>
                </View>
              );
            })}
          </View>
        </View>

        <View style={styles.settlementRow} wrap={false}>
          <View style={styles.settlementSummary}>
            <View style={styles.paymentBox}>
              <Text style={styles.paymentLabel}>Metodo de pago</Text>
              <Text style={styles.paymentValue}>
                {data.paymentMethod?.trim() || "No informado"}
              </Text>
            </View>
            <View style={styles.totals}>
              {totals.map((item) => (
                <View key={item.label} style={styles.totalRow}>
                  {item.label === "Total" ? (
                    <>
                      <Text style={styles.totalHighlight}>{item.label}</Text>
                      <Text style={styles.totalHighlight}>
                        {formatCurrency(item.value ?? 0, currency)}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Text>{item.label}</Text>
                      <Text>{formatCurrency(item.value ?? 0, currency)}</Text>
                    </>
                  )}
                </View>
              ))}
            </View>
          </View>

          <View style={styles.footer}>
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
        </View>

        {transparencyLegend ? (
          <View style={styles.transparencyLegend} wrap={false}>
            <Text style={styles.transparencyLegendLabel}>
              Transparencia fiscal
            </Text>
            <Text style={styles.transparencyLegendText}>
              Regimen Fiscal de Transparencia al Consumidor (Ley 27.743):
              IVA contenido {formatCurrency(transparencyLegend.ivaContained, currency)}
              {showOtherTransparencyTaxes
                ? `; otros impuestos nacionales indirectos ${formatCurrency(
                    transparencyLegend.otherNationalIndirectTaxes,
                    currency
                  )}`
                : ""}
              .
            </Text>
          </View>
        ) : null}

        {hasIssuerContactDetails ? (
          <View style={styles.issuerContactFooter}>
            <View style={styles.issuerContactGrid}>
              {issuerContactLines.map((line, index) => (
                <View
                  key={`${line}-${index}`}
                  style={[
                    styles.issuerContactItem,
                    ...(index % 2 === 0
                      ? [styles.issuerContactItemLeft]
                      : [styles.issuerContactItemRight]),
                  ]}
                >
                  <Text
                    style={[
                      styles.issuerContactText,
                      ...(index % 2 === 1
                        ? [styles.issuerContactTextRight]
                        : []),
                    ]}
                  >
                    {line}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
