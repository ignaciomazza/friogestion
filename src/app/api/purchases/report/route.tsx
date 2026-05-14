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
import { requireRole } from "@/lib/auth/tenant";
import { ADMIN_ROLES } from "@/lib/auth/rbac";
import { authErrorStatus, isAuthError } from "@/lib/auth/errors";
import { parseOptionalDate } from "@/lib/validation";
import {
  buildPurchasesMonthlyReport,
  buildPurchasesReportCsv,
  type PurchasesMonthlyReport,
} from "@/lib/purchases/report";
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

function buildPurchasesReportPdf(
  report: PurchasesMonthlyReport,
): Parameters<typeof renderToBuffer>[0] {
  const summary = [
    ["Compras", report.totals.purchasesCount.toString()],
    ["Neto gravado", formatMoney(report.totals.netTaxed)],
    ["IVA", formatMoney(report.totals.vatTotal)],
    ["Percepciones/otros", formatMoney(report.totals.otherTaxesTotal)],
    ["Total compras", formatMoney(report.totals.total)],
    ["Retenciones pagos", formatMoney(report.totals.retentionsTotal)],
  ];

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>Reporte mensual de compras</Text>
        <Text style={styles.subtitle}>
          Periodo {formatDate(report.period.from)} al{" "}
          {formatDate(report.period.to)}
        </Text>

        <View style={styles.summaryGrid}>
          {summary.map(([label, value]) => (
            <View key={label} style={styles.summaryBox}>
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>{value}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.sectionTitle}>Compras</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.headerCell, { width: "11%" }]}>Fecha</Text>
            <Text style={[styles.headerCell, { width: "24%" }]}>
              Proveedor
            </Text>
            <Text style={[styles.headerCell, { width: "16%" }]}>
              Comprobante
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "12%" }]}>
              Neto
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "11%" }]}>
              IVA
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "13%" }]}>
              Perc./otros
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "13%" }]}>
              Total
            </Text>
          </View>
          {report.purchases.slice(0, 36).map((purchase) => (
            <View key={purchase.id} style={styles.row}>
              <Text style={[styles.cell, { width: "11%" }]}>
                {formatDate(purchase.date)}
              </Text>
              <Text style={[styles.cell, { width: "24%" }]}>
                {purchase.supplierName}
              </Text>
              <Text style={[styles.cell, { width: "16%" }]}>
                {purchase.voucher ?? "-"}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "12%" }]}>
                {formatMoney(purchase.netTaxed)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "11%" }]}>
                {formatMoney(purchase.vatTotal)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "13%" }]}>
                {formatMoney(purchase.otherTaxesTotal)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "13%" }]}>
                {formatMoney(purchase.total)}
              </Text>
            </View>
          ))}
        </View>
        {report.purchases.length > 36 ? (
          <Text style={[styles.subtitle, { marginTop: 6 }]}>
            El PDF muestra las primeras 36 compras. El CSV incluye el detalle
            completo.
          </Text>
        ) : null}

        <Text style={styles.sectionTitle}>Retenciones practicadas en pagos</Text>
        <View style={styles.table}>
          <View style={styles.row}>
            <Text style={[styles.headerCell, { width: "13%" }]}>Fecha</Text>
            <Text style={[styles.headerCell, { width: "35%" }]}>
              Proveedor
            </Text>
            <Text style={[styles.headerCell, { width: "18%" }]}>Tipo</Text>
            <Text style={[styles.headerCell, styles.right, { width: "17%" }]}>
              Base
            </Text>
            <Text style={[styles.headerCell, styles.right, { width: "17%" }]}>
              Importe
            </Text>
          </View>
          {report.retentions.slice(0, 18).map((retention) => (
            <View key={retention.id} style={styles.row}>
              <Text style={[styles.cell, { width: "13%" }]}>
                {formatDate(retention.date)}
              </Text>
              <Text style={[styles.cell, { width: "35%" }]}>
                {retention.supplierName}
              </Text>
              <Text style={[styles.cell, { width: "18%" }]}>
                {retention.type}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "17%" }]}>
                {retention.baseAmount === null
                  ? "-"
                  : formatMoney(retention.baseAmount)}
              </Text>
              <Text style={[styles.cell, styles.right, { width: "17%" }]}>
                {formatMoney(retention.amount)}
              </Text>
            </View>
          ))}
        </View>
      </Page>
    </Document>
  );
}

export async function GET(req: NextRequest) {
  try {
    const { membership } = await requireRole(req, [...ADMIN_ROLES]);
    const format = req.nextUrl.searchParams.get("format") ?? "json";
    if (!["json", "csv", "pdf"].includes(format)) {
      return NextResponse.json({ error: "Formato invalido" }, { status: 400 });
    }

    const from =
      parseDateRange(req.nextUrl.searchParams.get("from"), false) ??
      monthStart();
    const to =
      parseDateRange(req.nextUrl.searchParams.get("to"), true) ?? monthEnd();

    if (from.getTime() > to.getTime()) {
      return NextResponse.json(
        { error: "Rango de fechas invalido" },
        { status: 400 },
      );
    }

    const report = await buildPurchasesMonthlyReport({
      organizationId: membership.organizationId,
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
      return new NextResponse(`\uFEFF${buildPurchasesReportCsv(report)}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="compras-fiscales-${fileSuffix}.csv"`,
        },
      });
    }

    const buffer = await renderToBuffer(buildPurchasesReportPdf(report));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="compras-fiscales-${fileSuffix}.pdf"`,
      },
    });
  } catch (error) {
    if (isAuthError(error)) {
      return NextResponse.json(
        { error: "No autorizado" },
        { status: authErrorStatus(error) },
      );
    }
    logServerError("api.purchases.report.get", error);
    return NextResponse.json(
      { error: "No se pudo generar el reporte" },
      { status: 400 },
    );
  }
}
