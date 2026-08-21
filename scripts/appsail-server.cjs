/**
 * appsail-server.cjs — AppSail entry point for the Next.js standalone server.
 *
 * Catalyst AppSail tells the container which port to bind via
 * X_ZOHO_CATALYST_LISTEN_PORT, but Next's generated `server.js` only reads
 * PORT (`.next/standalone/server.js`: `parseInt(process.env.PORT, 10) || 3000`).
 * Without this bridge the app binds 3000, AppSail's health check never
 * connects, and the deployment is marked failed.
 *
 * Copied to the bundle root by scripts/package-appsail.mjs and started with
 * `node appsail-server.cjs`.
 */

const port = process.env.X_ZOHO_CATALYST_LISTEN_PORT || process.env.PORT;

if (port) process.env.PORT = String(port);
process.env.HOSTNAME = process.env.HOSTNAME || "0.0.0.0";
process.env.NODE_ENV = process.env.NODE_ENV || "production";

console.log(`[appsail] starting Next.js standalone server on ${process.env.HOSTNAME}:${process.env.PORT ?? 3000}`);

require("./server.js");