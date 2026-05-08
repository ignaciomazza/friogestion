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
  headerMeta?: Array<{ label: string; value: string }>;
  currency?: "ARS" | "USD";
  logoSrc?: string | null;
  taxColumnLabel?: string;
  totalColumnLabel?: string;
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
  headerMeta: {
    fontSize: 8,
    color: "#667085",
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
  metaCard: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    backgroundColor: "#ffffff",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d0d5dd",
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

function PartyCard({
  label,
  name,
  legalName,
  taxId,
  email,
  address,
}: {
  label: string;
  name: string;
  legalName?: string | null;
  taxId?: string | null;
  email?: string | null;
  address?: string | null;
}) {
  const primaryName = legalName?.trim() ? legalName : name;
  const commercialName = legalName && legalName !== name ? name : null;

  return (
    <View style={styles.partyCard}>
      <View style={styles.partyHeader}>
        <Text style={styles.label}>{label}</Text>
        <Text style={styles.strong}>{primaryName}</Text>
      </View>
      {commercialName ? (
        <Text style={styles.detailLine}>{commercialName}</Text>
      ) : null}
      {taxId ? <Text style={styles.detailLine}>CUIT {taxId}</Text> : null}
      {address ? <Text style={styles.detailLine}>{address}</Text> : null}
      {email ? <Text style={styles.detailLine}>{email}</Text> : null}
    </View>
  );
}

export function CommercialPdfDocument({ data }: { data: CommercialPdfData }) {
  const currency = data.currency === "USD" ? "USD" : "ARS";
  const taxColumnLabel = data.taxColumnLabel ?? "Imp.";
  const totalColumnLabel = data.totalColumnLabel ?? "Total";

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
              <Text style={styles.brandName}>{data.organization.name}</Text>
            )}
          </View>
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{data.title}</Text>
            {data.issuedAt ? (
              <Text style={styles.subtitle}>Emitido el {data.issuedAt}</Text>
            ) : null}
            {data.headerMeta?.map((item) => (
              <Text key={item.label} style={styles.headerMeta}>
                {item.label} - {item.value}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <PartyCard
              label="Empresa"
              name={data.organization.name}
              legalName={data.organization.legalName}
              taxId={data.organization.taxId}
            />
            <PartyCard
              label="Cliente"
              name={data.customer.name}
              taxId={data.customer.taxId}
              email={data.customer.email}
              address={data.customer.address}
            />
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
          <View style={styles.tableContainer}>
            <View style={styles.tableHeader}>
              <Text style={[styles.colDesc, styles.tableHeaderText]}>Detalle</Text>
              <Text style={[styles.colQty, styles.tableHeaderText]}>Cant.</Text>
              <Text style={[styles.colUnit, styles.tableHeaderText]}>Unit.</Text>
              <Text style={[styles.colTax, styles.tableHeaderText]}>
                {taxColumnLabel}
              </Text>
              <Text style={[styles.colTotal, styles.tableHeaderText]}>
                {totalColumnLabel}
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
