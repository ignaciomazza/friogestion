import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { formatCurrency } from "@/lib/format";

type CommercialPdfData = {
  title: string;
  organization: {
    name: string;
    legalName?: string | null;
    taxId?: string | null;
  };
  customer: {
    name: string;
    taxId?: string | null;
    email?: string | null;
    address?: string | null;
  };
  meta: Array<{ label: string; value: string }>;
  items: Array<{
    description: string;
    sku?: string | null;
    brand?: string | null;
    model?: string | null;
    qty: number;
    unitPrice: number;
    total: number;
    taxRate?: number | null;
    taxAmount?: number | null;
  }>;
  totals: Array<{ label: string; value: number }>;
  issuedAt?: string | null;
  currency?: "ARS" | "USD";
  logoSrc?: string | null;
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
    width: 120,
    height: 40,
    objectFit: "contain",
  },
  titleBlock: {
    alignItems: "flex-end",
    gap: 4,
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
  metaCard: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  metaGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metaItem: {
    width: "33%",
    paddingRight: 12,
    paddingVertical: 2,
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
  colDesc: { width: "46%" },
  colQty: { width: "10%", textAlign: "right" },
  colUnit: { width: "14%", textAlign: "right" },
  colTax: { width: "14%", textAlign: "right" },
  colTotal: { width: "16%", textAlign: "right" },
  subText: {
    fontSize: 7,
    color: "#6b7280",
    marginTop: 2,
  },
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
  totalsLabel: {
    fontSize: 7,
    color: "#6b7280",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalHighlight: {
    fontSize: 10,
    fontWeight: 700,
  },
});

export function CommercialPdfDocument({ data }: { data: CommercialPdfData }) {
  const currency = data.currency === "USD" ? "USD" : "ARS";

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.accent} />
        <View style={styles.header}>
          {data.logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.logoSrc} style={styles.logo} />
          ) : null}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{data.title}</Text>
            {data.issuedAt ? (
              <Text style={styles.subtitle}>{data.issuedAt}</Text>
            ) : null}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View style={{ width: "50%" }}>
              <Text style={styles.label}>Empresa</Text>
              {data.organization.legalName ? (
                <>
                  <Text style={styles.label}>Razon social</Text>
                  <Text>{data.organization.legalName}</Text>
                </>
              ) : null}
              {data.organization.legalName &&
              data.organization.legalName !== data.organization.name ? (
                <>
                  <Text style={styles.label}>Nombre comercial</Text>
                  <Text>{data.organization.name}</Text>
                </>
              ) : (
                !data.organization.legalName && (
                  <>
                    <Text style={styles.label}>Nombre comercial</Text>
                    <Text>{data.organization.name}</Text>
                  </>
                )
              )}
              {data.organization.taxId ? (
                <>
                  <Text style={styles.label}>CUIT</Text>
                  <Text>{data.organization.taxId}</Text>
                </>
              ) : null}
            </View>
            <View style={{ width: "50%" }}>
              <Text style={styles.label}>Cliente</Text>
              <Text>{data.customer.name}</Text>
              {data.customer.taxId ? <Text>{data.customer.taxId}</Text> : null}
              {data.customer.email ? <Text>{data.customer.email}</Text> : null}
              {data.customer.address ? (
                <Text>{data.customer.address}</Text>
              ) : null}
            </View>
          </View>
        </View>

        {data.meta.length ? (
          <View style={styles.section}>
            <View style={styles.metaCard}>
              <View style={styles.metaGrid}>
                {data.meta.map((item) => (
                  <View key={item.label} style={styles.metaItem}>
                    <Text style={styles.label}>{item.label}</Text>
                    <Text>{item.value}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>Detalle</Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>Cant.</Text>
            <Text style={[styles.colUnit, styles.tableHeaderText]}>Unit.</Text>
            <Text style={[styles.colTax, styles.tableHeaderText]}>Imp.</Text>
            <Text style={[styles.colTotal, styles.tableHeaderText]}>Total</Text>
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
                  ? item.qty * item.unitPrice * (taxRate / 100)
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
                  {item.sku ? (
                    <Text style={styles.subText}>SKU {item.sku}</Text>
                  ) : null}
                  {item.brand || item.model ? (
                    <Text style={styles.subText}>
                      {item.brand ? `Marca ${item.brand}` : ""}
                      {item.brand && item.model ? " · " : ""}
                      {item.model ? `Modelo ${item.model}` : ""}
                    </Text>
                  ) : null}
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

        <View style={styles.totals}>
          <Text style={styles.totalsLabel}>Totales ({currency})</Text>
          {data.totals.map((item) => (
            <View key={item.label} style={styles.totalsRow}>
              <Text
                style={item.label === "Total" ? styles.totalHighlight : undefined}
              >
                {item.label}
              </Text>
              <Text
                style={item.label === "Total" ? styles.totalHighlight : undefined}
              >
                {formatCurrency(item.value, currency)}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}
