import { Suspense } from "react";

import { LogClient } from "@/components/time-tracker/log-client";

export default function TimeLogPage() {
  return (
    <Suspense>
      <LogClient />
    </Suspense>
  );
}
