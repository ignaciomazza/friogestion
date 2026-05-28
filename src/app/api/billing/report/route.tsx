import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import { requireOrg } from "@/lib/auth/tenant";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { parseOptionalDate } from "@/lib/validation";
import {
  buildBillingMonthlyReport,
  buildBillingReportCsv,
  type BillingMonthlyReport,
} from "@/lib/sales/report";
import { logServerError } from "@/lib/server/log";

export const runtime = "nodejs";

const styles = StyleSheet.create({
  page: {
    padding: 28,
    fontSize: 9,
    color: "#27272a",
    fontFamily: "Helvetica",
  },
  title: {
    fontSize: 16,
    fontWeight: 700,
    marginBottom: 4,
  },
  subtitle: {
    color: "#71717a",
    marginBottom: 18,
  },
  sectionTitle: {
    marginTop: 14,
    marginBottom: 6,
    fontSize: 10,
    fontWeight: 700,
    textTransform: "uppercase",
    color: "#52525b",
  },
  summaryGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  summaryBox: {
    width: "24%",
    border: "1 solid #e4e4e7",
    padding: 8,
  },
  summaryLabel: {
    color: "#71717a",
    fontSize: 7,
    textTransform: "uppercase",
    marginBottom: 3,
  },
  summaryValue: {
    fontSize: 10,
    fontWeight: 700,
  },
  table: {
    borderTop: "1 solid #e4e4e7",
    borderLeft: "1 solid #e4e4e7",
  },
  row: {
    flexDirection: "row",
  },
  headerCell: {
    padding: 4,
    fontSize: 7,
    fontWeight: 700,
    color: "#52525b",
    backgroundColor: "#f4f4f5",
    borderRight: "1 solid #e4e4e7",
    borderBottom: "1 solid #e4e4e7",
  },
  cell: {
    padding: 4,
    fontSize: 7,
    borderRight: "1 solid #e4e4e7",
    borderBottom: "1 solid #e4e4e7",
  },
  right: {
    textAlign: "right",
  },
});

const parseDateRange = (value?: string | null, endOfDay = false) => {
  if (!value) return null;
  const result = parseOptionalDate(value);
  if (result.error || !result.date) return null;
  const date = result.date;
  if (endOfDay) {
    date.setHours(23, 59, 59, 999);
  } else {
    date.setHours(0, 0, 0, 0);
  }
  return date;
};

const monthStart = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
};

const monthEnd = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
};

const formatMoney = (value: number) =>
  new Intl.NumberFormat("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);

const formatDate = (value: string) =>
  new Date(value).toLocaleDateString("es-AR");

function buildBillingReportPdf(
  report: BillingMonthlyReport,
): Parameters<typeof renderToBuffer>[0] {
  const summary = [
    ["Facturas", report.totals.invoicesCount.toString()],
    ["Notas de credito", report.totals.creditNotesCount.toString()],
    ["Notas de debito", report.totals.debitNotesCount.toString()],
    ["Neto gravado", formatMoney(report.totals.netTaxed)],
    ["IVA", formatMoney(report.totals.vatTotal)],
    ["Total neto", formatMoney(report.totals.netTotal)],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Reporte mensual de facturacion</Text>
        <Text style={styles.subtitle}>
          Periodo {formatDate(report.period.from)} al {formatDate(report.period.to)}
        </Text>

        <View style={styles.summaryGrid}>
          {summary.map(([label, value]) => (
            <View key={label} style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Facturas emitidas</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.headerCell, { width: "12%" }]}>Fecha</Text>
            <Text style={[styles.headerCell, { width: "26%" }]}>Cliente</Text>
            <Text style={[styles.headerCell, { width: "15%" }]}>Comprobante</Text>
            <Text style={[styles.headerCell, { width: "7%" }]}>Tipo</Text>
            <Text style={[styles.headerCell, styles.right, { width: "13%" }]}>
              Neto
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "13%" }]}>
              IVA
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "14%" }]}>
              Total
            </Text>
          </View>
          {report.invoices.slice(0, 24).map((invoice) => (
            <View key={invoice.id} style={styles.row}>
              <Text style={[styles.cell, { width: "12%" }]}>
                {formatDate(invoice.date)}
              </Text>
              <Text style={[styles.cell, { width: "26%" }]}>
                {invoice.customerName}
              </Text>
              <Text style={[styles.cell, { width: "15%" }]}>{invoice.voucher}</Text>
              <Text style={[styles.cell, { width: "7%" }]}>
                {invoice.type ?? "-"}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "13%" }]}>
                {formatMoney(invoice.netTaxed)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "13%" }]}>
                {formatMoney(invoice.vatTotal)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "14%" }]}>
                {formatMoney(invoice.total)}
              </Text>
            </View>
          ))}
        </View>

        {report.creditNotes.length ? (
          <>
            <Text style={styles.sectionTitle}>Notas de credito</Text>
            <View style={styles.table}>
              <View style={styles.row}>
                <Text style={[styles.headerCell, { width: "14%" }]}>Fecha</Text>
                <Text style={[styles.headerCell, { width: "30%" }]}>Cliente</Text>
                <Text style={[styles.headerCell, { width: "20%" }]}>NC</Text>
                <Text style={[styles.headerCell, { width: "12%" }]}>Tipo</Text>
                <Text style={[styles.headerCell, styles.right, { width: "24%" }]}>
                  Total
                </Text>
              </View>
              {report.creditNotes.slice(0, 12).map((note) => (
                <View key={note.id} style={styles.row}>
                  <Text style={[styles.cell, { width: "14%" }]}>
                    {formatDate(note.date)}
                  </Text>
                  <Text style={[styles.cell, { width: "30%" }]}>
                    {note.customerName}
                  </Text>
                  <Text style={[styles.cell, { width: "20%" }]}>{note.voucher}</Text>
                  <Text style={[styles.cell, { width: "12%" }]}>
                    {note.type ?? "-"}
                  </Text>
                  <Text style={[styles.cell, styles.right, { width: "24%" }]}>
                    {formatMoney(note.total)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {report.debitNotes.length ? (
          <>
            <Text style={styles.sectionTitle}>Notas de debito</Text>
            <View style={styles.table}>
              <View style={styles.row}>
                <Text style={[styles.headerCell, { width: "14%" }]}>Fecha</Text>
                <Text style={[styles.headerCell, { width: "30%" }]}>Cliente</Text>
                <Text style={[styles.headerCell, { width: "20%" }]}>ND</Text>
                <Text style={[styles.headerCell, { width: "12%" }]}>Tipo</Text>
                <Text style={[styles.headerCell, styles.right, { width: "24%" }]}>
                  Total
                </Text>
              </View>
              {report.debitNotes.slice(0, 12).map((note) => (
                <View key={note.id} style={styles.row}>
                  <Text style={[styles.cell, { width: "14%" }]}>
                    {formatDate(note.date)}
                  </Text>
                  <Text style={[styles.cell, { width: "30%" }]}>
                    {note.customerName}
                  </Text>
                  <Text style={[styles.cell, { width: "20%" }]}>{note.voucher}</Text>
                  <Text style={[styles.cell, { width: "12%" }]}>
                    {note.type ?? "-"}
                  </Text>
                  <Text style={[styles.cell, styles.right, { width: "24%" }]}>
                    {formatMoney(note.total)}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {report.invoices.length > 24 ||
        report.creditNotes.length > 12 ||
        report.debitNotes.length > 12 ? (
          <Text style={[styles.subtitle, { marginTop: 6 }]}>
            El PDF muestra un resumen de documentos. El CSV incluye el detalle
            completo.
          </Text>
        ) : null}
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  try {
    const organizationId = await requireOrg(req);
    const format = req.nextUrl.searchParams.get("format") ?? "json";
    if (!["json", "csv", "pdf"].includes(format)) {
      return NextResponse.json({ error: "Formato invalido" }, { status: 400 });
    }

    const from =
      parseDateRange(req.nextUrl.searchParams.get("from"), false) ??
      monthStart();
    const to = parseDateRange(req.nextUrl.searchParams.get("to"), true) ?? monthEnd();

    if (from.getTime() > to.getTime()) {
      return NextResponse.json(
        { error: "Rango de fechas invalido" },
        { status: 400 },
      );
    }

    const report = await buildBillingMonthlyReport({
      organizationId,
      from,
      to,
    });

    if (format === "json") {
      return NextResponse.json(report);
    }

    const fileSuffix = `${from.toISOString().slice(0, 10)}_${to
      .toISOString()
      .slice(0, 10)}`;

    if (format === "csv") {
      return new NextResponse(`\uFEFF${buildBillingReportCsv(report)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="facturacion-fiscal-${fileSuffix}.csv"`,
        },
      });
    }

    const buffer = await renderToBuffer(buildBillingReportPdf(report));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="facturacion-fiscal-${fileSuffix}.pdf"`,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.billing.report.get", error);
    return NextResponse.json(
      { error: "No se pudo generar el reporte" },
      { status: 400 },
    );
  }
}
