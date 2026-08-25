#!/usr/bin/env node

import { randomUUID } from "crypto";
import { writeFileSync } from "fs";
import { resolve } from "path";

// Every production build gets a new opaque marker. Open tabs poll this file
// without caching, so they can offer a reload after any newly uploaded build.
const version = process.env.KOKU_BUILD_VERSION || `${Date.now()}-${randomUUID()}`;
writeFileSync(
  resolve(process.cwd(), "public", "build-version.json"),
  `${JSON.stringify({ version })}\n`,
);
