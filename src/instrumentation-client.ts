import { auditLogger } from "@/lib/audit/logger";

auditLogger.event("app.client.init", "performance");

export function onRouterTransitionStart(
  url: string,
  navigationType: "push" | "replace" | "traverse",
) {
  auditLogger.event("router.transition.start", "performance", {
    url,
    navigationType,
  });
}
