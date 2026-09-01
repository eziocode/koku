#!/usr/bin/env node
/**
 * Koku local bridge: a tiny loopback daemon that lets the Koku web app (even
 * when served from a cloud deployment like Zoho Catalyst) drive a CLI that
 * only exists on your machine (codex / claude / copilot). Runs the CLI with
 * execFile (never a shell), only touches the binaries in the allowlist
 * below, and only listens on 127.0.0.1.
 *
 * Usage: node index.mjs [port]
 */

import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { randomBytes } from "node:crypto";

const PORT = Number(process.argv[2]) || 4319;
const TOKEN = randomBytes(24).toString("hex");
const ALLOWED_ORIGIN_SUFFIXES = [".koku.app", "localhost", "127.0.0.1"];

const CLIS = {
  codex: {
    binary: "codex",
    loginArgs: ["login"],
    statusArgs: ["login", "status"],
    versionArgs: ["--version"],
    execArgs: (prompt) => ["exec", "--json", prompt],
  },
  claude: {
    binary: "claude",
    loginArgs: ["setup-token"],
    statusArgs: ["--version"],
    versionArgs: ["--version"],
    execArgs: (prompt) => ["-p", prompt, "--output-format", "text"],
  },
  copilot: {
    binary: "copilot",
    loginArgs: ["auth", "login"],
    statusArgs: ["auth", "status"],
    versionArgs: ["--version"],
    execArgs: (prompt) => ["-p", prompt],
  },
};

const EXTRA_ARG_PATTERN = /^[A-Za-z0-9._/=@:-]+$/;

function corsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  try {
    const { hostname } = new URL(origin);
    return ALLOWED_ORIGIN_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(suffix)) ? origin : null;
  } catch {
    return null;
  }
}

function run(binary, args) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { timeout: 45_000, maxBuffer: 200_000 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr?.trim() || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 200_000) req.destroy();
    });
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        reject(new Error("Invalid JSON body."));
      }
    });
    req.on("error", reject);
  });
}

const server = createServer(async (req, res) => {
  const origin = corsOrigin(req);
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  }

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const auth = req.headers.authorization;
  if (auth !== `Bearer ${TOKEN}`) {
    res.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Unauthorized." }));
    return;
  }

  try {
    const body = await readBody(req);
    const cli = CLIS[body.cliId];
    if (!cli) {
      throw new Error("Unknown CLI.");
    }

    if (req.url === "/status") {
      let version = null;
      let installed = true;
      try {
        version = (await run(cli.binary, cli.versionArgs)).trim();
      } catch {
        installed = false;
      }
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ installed, version, loggedIn: null }));
      return;
    }

    if (req.url === "/login") {
      const text = await run(cli.binary, cli.loginArgs);
      res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ text }));
      return;
    }

    if (req.url === "/run") {
      const prompt = typeof body.prompt === "string" ? body.prompt.slice(0, 4000) : "";
      if (!prompt) throw new Error("A prompt is required.");
      const extraArgs = Array.isArray(body.extraArgs)
        ? body.extraArgs.filter((arg) => typeof arg === "string" && EXTRA_ARG_PATTERN.test(arg)).slice(0, 8)
        : [];
      const text = await run(cli.binary, [...cli.execArgs(prompt), ...extraArgs]);
      res.writeHead(200, { "Content-Type": "text/plain" }).end(text);
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found." }));
  } catch (error) {
    res.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: error.message }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Koku bridge listening on http://127.0.0.1:${PORT}`);
  console.log(`Bridge token (paste into Koku's AI settings): ${TOKEN}`);
});
