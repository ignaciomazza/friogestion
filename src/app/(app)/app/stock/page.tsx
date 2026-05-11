import { redirect } from "next/navigation";

export default function LegacyStockPage() {
  redirect("/app/prices");
}
