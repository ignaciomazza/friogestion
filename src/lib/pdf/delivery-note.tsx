import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

type DeliveryNotePdfData = {
  title: string;
  organization: {
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
  legend: string;
  meta: Array<{ label: string; value: string }>;
  items: Array<{
    description: string;
    qty: number;
    unit: string;
  }>;
  observations?: string | null;
  logoSrc?: string | null;
};

const styles = StyleSheet.create({
  page: {
    padding: 34,
    fontSize: 9,
    fontFamily: "Helvetica",
    color: "#111827",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
  },
  logo: {
    width: 120,
    height: 40,
    objectFit: "contain",
  },
  title: {
    fontSize: 18,
    fontWeight: 700,
  },
  legendBox: {
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fff1f2",
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginBottom: 12,
  },
  legend: {
    fontSize: 10,
    fontWeight: 700,
    textAlign: "center",
    color: "#b91c1c",
  },
  section: {
    marginBottom: 14,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  block: {
    width: "50%",
  },
  label: {
    fontSize: 7,
    color: "#6b7280",
    marginBottom: 3,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  metaGrid: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    flexWrap: "wrap",
  },
  metaItem: {
    width: "33%",
    paddingVertical: 2,
    paddingRight: 10,
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
  colDesc: { width: "64%" },
  colQty: { width: "16%", textAlign: "right" },
  colUnit: { width: "20%", textAlign: "right" },
  observationsBox: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
});

export function DeliveryNotePdfDocument({ data }: { data: DeliveryNotePdfData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          {data.logoSrc ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <Image src={data.logoSrc} style={styles.logo} />
          ) : null}
          <Text style={styles.title}>{data.title}</Text>
        </View>

        <View style={styles.legendBox}>
          <Text style={styles.legend}>{data.legend}</Text>
        </View>

        <View style={styles.section}>
          <View style={styles.row}>
            <View style={styles.block}>
              <Text style={styles.label}>Emisor</Text>
              <Text>{data.organization.legalName ?? data.organization.name}</Text>
              {data.organization.taxId ? <Text>{data.organization.taxId}</Text> : null}
              {data.organization.address ? <Text>{data.organization.address}</Text> : null}
            </View>
            <View style={styles.block}>
              <Text style={styles.label}>Receptor</Text>
              <Text>{data.receiver.name}</Text>
              {data.receiver.taxId ? <Text>{data.receiver.taxId}</Text> : null}
              {data.receiver.address ? <Text>{data.receiver.address}</Text> : null}
            </View>
          </View>
        </View>

        {data.meta.length ? (
          <View style={styles.section}>
            <View style={styles.metaGrid}>
              {data.meta.map((item) => (
                <View key={item.label} style={styles.metaItem}>
                  <Text style={styles.label}>{item.label}</Text>
                  <Text>{item.value}</Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.section}>
          <View style={styles.tableHeader}>
            <Text style={[styles.colDesc, styles.tableHeaderText]}>Detalle</Text>
            <Text style={[styles.colQty, styles.tableHeaderText]}>Cant.</Text>
            <Text style={[styles.colUnit, styles.tableHeaderText]}>Unidad</Text>
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
              <Text style={styles.colQty}>{item.qty.toFixed(3)}</Text>
              <Text style={styles.colUnit}>{item.unit}</Text>
            </View>
          ))}
        </View>

        {data.observations ? (
          <View style={styles.observationsBox}>
            <Text style={styles.label}>Observaciones</Text>
            <Text>{data.observations}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}
