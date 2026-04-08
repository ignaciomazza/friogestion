import type { ReactNode } from "react";
import Topbar from "@/components/Topbar";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto max-w-[1680px]">
      <div className="lg:grid lg:grid-cols-[auto_minmax(0,1fr)] lg:items-start lg:gap-4">
        <Topbar />
        <main className="min-w-0 pb-10 lg:pt-4">
          <div
            id="rates-slot"
            className="pointer-events-none hidden lg:mb-4 lg:flex lg:justify-end"
          />
          <div className="space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}
