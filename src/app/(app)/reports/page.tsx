import { Suspense } from "react";

import { ReportsDashboard } from "@/components/reports/reports-dashboard";

export default function ReportsPage() {
  return (
    <Suspense>
      <ReportsDashboard />
    </Suspense>
  );
}
