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
  };
  receiver: {
    name: string;
    taxId?: string | null;
    address?: string | null;
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
    serviceDates?: { from: string; to: string; due?: string | null } | null;
  };
  items: Array<{
    description: string;
    qty: number;
    unitPrice: number;
    total: number;
  }>;
  logoSrc?: string | null;
  qrBase64?: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 36,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  accent: {
    height: 1,
    backgroundColor: "#111827",
    marginBottom: 16,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 18,
  },
  logo: {
    width: 110,
    height: 36,
    objectFit: "contain",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  subtitle: {
    fontSize: 9,
    color: "#4b5563",
  },
  section: {
    marginBottom: 18,
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
  infoBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    padding: 8,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#f3f4f6",
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  tableHeaderText: {
    fontSize: 8,
    fontWeight: 600,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  tableRowAlt: {
    backgroundColor: "#f9fafb",
  },
  colDesc: { width: "48%" },
  colQty: { width: "12%", textAlign: "right" },
  colUnit: { width: "18%", textAlign: "right" },
  colTotal: { width: "22%", textAlign: "right" },
  totals: {
    marginTop: 12,
    marginLeft: "auto",
    width: "48%",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
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
  footer: {
    marginTop: 18,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#d1d5db",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    gap: 16,
  },
  qr: {
    width: 110,
    height: 110,
  },
});

export function FiscalPdfDocument({ data }: { data: FiscalPdfData }) {
  const currency = data.voucher.currencyCode === "USD" ? "USD" : "ARS";
  const totals = [
    { label: "Neto", value: data.voucher.net },
    { label: "IVA", value: data.voucher.iva },
    { label: "Exento", value: data.voucher.exempt },
    { label: "Total", value: data.voucher.total },
  ].filter((item) => item.value !== null && item.value !== undefined);

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accent} />
        <View style={styles.header}>
          {data.logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.logoSrc} style={styles.logo} />
          ) : null}
          <View>
            <Text style={styles.title}>{data.title}</Text>
            <Text style={styles.subtitle}>
              {data.voucher.pointOfSale ?? "-"} · {data.voucher.number ?? "-"}
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View style={{ width: "50%" }}>
              <Text style={styles.label}>Emisor</Text>
              <Text>{data.issuer.legalName ?? data.issuer.name}</Text>
              {data.issuer.taxId ? <Text>{data.issuer.taxId}</Text> : null}
              {data.issuer.address ? <Text>{data.issuer.address}</Text> : null}
            </View>
            <View style={{ width: "50%" }}>
              <Text style={styles.label}>Receptor</Text>
              <Text>{data.receiver.name}</Text>
              {data.receiver.taxId ? <Text>{data.receiver.taxId}</Text> : null}
              {data.receiver.address ? <Text>{data.receiver.address}</Text> : null}
            </View>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.infoBox}>
            <View style={styles.row}>
              <View>
                <Text style={styles.label}>Fecha</Text>
                <Text>{data.voucher.issuedAt ?? "-"}</Text>
              </View>
              <View>
                <Text style={styles.label}>CAE</Text>
                <Text>{data.voucher.cae ?? "-"}</Text>
              </View>
              <View>
                <Text style={styles.label}>Vto CAE</Text>
                <Text>{data.voucher.caeDueDate ?? "-"}</Text>
              </View>
            </View>
          </View>
          {data.voucher.serviceDates ? (
            <View style={{ marginTop: 6 }}>
              <Text style={styles.label}>Servicio</Text>
              <Text>
                {data.voucher.serviceDates.from} → {data.voucher.serviceDates.to}
              </Text>
            </View>
          ) : null}
        </View>

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>Detalle</Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>Cant.</Text>
            <Text style={[styles.colUnit, styles.tableHeaderText]}>Unit.</Text>
            <Text style={[styles.colTotal, styles.tableHeaderText]}>Total</Text>
          </View>
          {data.items.map((item, index) => (
            <View
              key={`${item.description}-${index}`}
              style={
                index % 2 === 0
                  ? [styles.tableRow, styles.tableRowAlt]
                  : styles.tableRow
              }
            >
              <Text style={styles.colDesc}>{item.description}</Text>
              <Text style={styles.colQty}>{item.qty.toFixed(2)}</Text>
              <Text style={styles.colUnit}>
                {formatCurrency(item.unitPrice, currency)}
              </Text>
              <Text style={styles.colTotal}>
                {formatCurrency(item.total, currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          {totals.map((item) => (
            <View key={item.label} style={styles.totalRow}>
              <Text
                style={item.label === "Total" ? styles.totalHighlight : undefined}
              >
                {item.label}
              </Text>
              <Text
                style={item.label === "Total" ? styles.totalHighlight : undefined}
              >
                {formatCurrency(item.value ?? 0, currency)}
              </Text>
            </View>
          ))}
        </View>

        <View style={styles.footer}>
          <View>
            <Text style={styles.label}>Moneda</Text>
            <Text>{data.voucher.currencyCode ?? "ARS"}</Text>
          </View>
          {data.qrBase64 ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.qrBase64} style={styles.qr} />
          ) : null}
        </View>
      </Page>
    </Document>
  );
}
