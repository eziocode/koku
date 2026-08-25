import "fake-indexeddb/auto";

import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

import { RETRY_INTERVAL_MS } from "@/components/providers/cloud-sync-bootstrap";
import { kokuDb } from "@/lib/storage/db";
import {
  cancelSyncConflict,
  deleteRow,
  flushPendingChanges,
  invalidateAuthCache,
  syncNow,
  syncRow,
} from "./sync-engine";

const originalFetch = globalThis.fetch;
const originalNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");

function setOnline(online: boolean) {
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { onLine: online },
  });
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(async () => {
  setOnline(true);
  cancelSyncConflict();
  invalidateAuthCache();
  await Promise.all([
    kokuDb.projects.clear(),
    kokuDb.categories.clear(),
    kokuDb.timeEntries.clear(),
    kokuDb.notes.clear(),
    kokuDb.personalNotes.clear(),
    kokuDb.noteLinks.clear(),
    kokuDb.settings.clear(),
    kokuDb.pendingUpserts.clear(),
    kokuDb.pendingDeletes.clear(),
  ]);
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalNavigator) {
    Object.defineProperty(globalThis, "navigator", originalNavigator);
  }
});

describe("background sync recovery", () => {
  it("uses a 15-minute interval", () => {
    assert.equal(RETRY_INTERVAL_MS, 15 * 60 * 1000);
  });

  it("makes no auth or cloud request when both pending queues are empty", async () => {
    let requests = 0;
    globalThis.fetch = async () => {
      requests += 1;
      return jsonResponse({});
    };

    assert.deepEqual(await flushPendingChanges(), {
      pushed: 0,
      deleted: 0,
      pending: 0,
    });
    assert.equal(requests, 0);
  });

  it("queues saves quietly while authentication is still unavailable", async () => {
    const requests: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = async (input, init) => {
      requests.push({ url: String(input), init });
      return jsonResponse({ user: null });
    };

    await syncRow("projects", {
      id: "project-1",
      name: "Local only for now",
      color: "#123456",
      hourlyRate: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    });

    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "/api/auth/me");
    assert.equal(requests[0].init?.cache, "no-store");
    assert.equal(await kokuDb.pendingUpserts.count(), 1);
  });

  it("coalesces failed edits and clears the latest row after a successful retry", async () => {
    globalThis.fetch = async (input) => {
      if (String(input) === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      return jsonResponse({
        synced: 0,
        syncedIds: [],
        errors: [{ rowId: "project-1", error: "Temporary push failure." }],
      }, 502);
    };

    const base = {
      id: "project-1",
      name: "First name",
      color: "#123456",
      hourlyRate: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    };
    await syncRow("projects", base);
    await syncRow("projects", { ...base, name: "Latest name" });

    assert.equal(await kokuDb.pendingUpserts.count(), 1);
    const [pending] = await kokuDb.pendingUpserts.toArray();
    assert.equal((pending.row as { name: string }).name, "Latest name");

    globalThis.fetch = async (input) => {
      if (String(input) === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      return jsonResponse({
        synced: 1,
        syncedIds: ["project-1"],
        errors: [],
      });
    };

    assert.deepEqual(await flushPendingChanges(), {
      pushed: 1,
      deleted: 0,
      pending: 0,
    });
    assert.equal(await kokuDb.pendingUpserts.count(), 0);
  });

  it("does not upload queued local edits when cloud is chosen as source of truth", async () => {
    await kokuDb.pendingUpserts.put({
      id: "projects:project-1",
      table: "projects",
      rowId: "project-1",
      row: {
        id: "project-1",
        name: "Local edit",
        color: "#123456",
        createdAt: "2026-08-24T10:00:00.000Z",
      },
      revision: "revision-1",
      updatedAt: "2026-08-24T10:01:00.000Z",
    });

    const methods: string[] = [];
    globalThis.fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      methods.push(method);
      if (String(input) === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      return jsonResponse({ rows: [] });
    };

    await syncNow("cloud");

    assert.equal(await kokuDb.pendingUpserts.count(), 0);
    assert.equal(methods.includes("POST"), false);
    assert.equal(methods.includes("DELETE"), false);
  });

  it("stops a local sync when queued work cannot be delivered", async () => {
    await kokuDb.pendingDeletes.put({
      id: "projects:project-1",
      table: "projects",
      rowId: "project-1",
      revision: "revision-1",
      createdAt: "2026-08-24T10:00:00.000Z",
    });

    const requests: { url: string; method: string }[] = [];
    globalThis.fetch = async (input, init) => {
      const request = {
        url: String(input),
        method: init?.method ?? "GET",
      };
      requests.push(request);
      if (request.url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      if (request.method === "DELETE") {
        return jsonResponse({ error: "Delete failed." }, 502);
      }
      return jsonResponse({ rows: [] });
    };

    await assert.rejects(() => syncNow("local"), /Delete failed/);
    assert.equal(requests.some((request) => request.method === "POST"), false);
    assert.equal(
      requests.some((request) => request.method === "GET" && request.url.startsWith("/api/sync/")),
      false,
    );
  });

  it("serializes an upsert before a later delete for the same row", async () => {
    let finishPost: (() => void) | undefined;
    const postFinished = new Promise<void>((resolve) => {
      finishPost = resolve;
    });
    const methods: string[] = [];

    globalThis.fetch = async (input, init) => {
      const method = init?.method ?? "GET";
      if (String(input) === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      methods.push(method);
      if (method === "POST") {
        await postFinished;
        return jsonResponse({
          synced: 1,
          syncedIds: ["project-1"],
          errors: [],
        });
      }
      return jsonResponse({ deleted: true });
    };

    const row = {
      id: "project-1",
      name: "Project",
      color: "#123456",
      createdAt: "2026-08-24T10:00:00.000Z",
    };
    const upsert = syncRow("projects", row);
    await new Promise((resolve) => setTimeout(resolve, 0));
    const deletion = deleteRow("projects", row.id);
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(methods, ["POST"]);
    finishPost?.();
    await Promise.all([upsert, deletion]);
    assert.deepEqual(methods, ["POST", "DELETE"]);
    assert.equal(await kokuDb.pendingUpserts.count(), 0);
    assert.equal(await kokuDb.pendingDeletes.count(), 0);
  });

  it("queues new edits without uploading while a conflict choice is open", async () => {
    const local = {
      id: "project-1",
      name: "Local",
      color: "#123456",
      hourlyRate: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    };
    await kokuDb.projects.put(local);
    const methods: string[] = [];

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      methods.push(method);
      if (url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      if (url === "/api/sync/projects") {
        return jsonResponse({ rows: [{ ...local, name: "Cloud" }] });
      }
      return jsonResponse({ rows: [] });
    };

    const result = await syncNow();
    assert.ok(result.conflict);

    await syncRow("projects", { ...local, name: "Edited during prompt" });
    assert.equal(methods.includes("POST"), false);
    assert.equal(await kokuDb.pendingUpserts.count(), 1);
  });

  it("keeps edit delivery in invocation order even when the first auth check is delayed", async () => {
    let finishAuth: (() => void) | undefined;
    const authFinished = new Promise<void>((resolve) => {
      finishAuth = resolve;
    });
    const names: string[] = [];

    globalThis.fetch = async (input, init) => {
      if (String(input) === "/api/auth/me") {
        await authFinished;
        return jsonResponse({ user: { id: "user-1" } });
      }
      const body = JSON.parse(String(init?.body)) as {
        rows: { id: string; name: string }[];
      };
      names.push(body.rows[0].name);
      return jsonResponse({
        synced: 1,
        syncedIds: ["project-1"],
        errors: [],
      });
    };

    const base = {
      id: "project-1",
      color: "#123456",
      createdAt: "2026-08-24T10:00:00.000Z",
    };
    const first = syncRow("projects", { ...base, name: "First" });
    const second = syncRow("projects", { ...base, name: "Second" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    finishAuth?.();
    await Promise.all([first, second]);

    assert.deepEqual(names, ["First", "Second"]);
    assert.equal(await kokuDb.pendingUpserts.count(), 0);
  });

  it("waits for an in-flight row delivery before applying the cloud snapshot", async () => {
    let finishPost: (() => void) | undefined;
    let markPostStarted: (() => void) | undefined;
    const postFinished = new Promise<void>((resolve) => {
      finishPost = resolve;
    });
    const postStarted = new Promise<void>((resolve) => {
      markPostStarted = resolve;
    });
    const syncRequests: string[] = [];

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      if (init?.method === "POST") {
        syncRequests.push("POST");
        markPostStarted?.();
        await postFinished;
        return jsonResponse({
          synced: 1,
          syncedIds: ["project-1"],
          errors: [],
        });
      }
      syncRequests.push("GET");
      return jsonResponse({ rows: [] });
    };

    const mutation = syncRow("projects", {
      id: "project-1",
      name: "Pending local edit",
      color: "#123456",
      createdAt: "2026-08-24T10:00:00.000Z",
    });
    await postStarted;
    const cloudSync = syncNow("cloud");
    await new Promise((resolve) => setTimeout(resolve, 0));

    assert.deepEqual(syncRequests, ["POST"]);
    finishPost?.();
    await Promise.all([mutation, cloudSync]);
    assert.equal(syncRequests[0], "POST");
    assert.ok(syncRequests.slice(1).every((method) => method === "GET"));
  });

  it("replays and delivers edits created while a cloud snapshot is loading", async () => {
    let releaseProjects: (() => void) | undefined;
    let markProjectsStarted: (() => void) | undefined;
    const projectsReleased = new Promise<void>((resolve) => {
      releaseProjects = resolve;
    });
    const projectsStarted = new Promise<void>((resolve) => {
      markProjectsStarted = resolve;
    });
    const pushedNames: string[] = [];
    const cloudProject = {
      id: "project-1",
      name: "Cloud",
      color: "#123456",
      hourlyRate: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    };

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          rows: { id: string; name: string }[];
        };
        pushedNames.push(body.rows[0].name);
        return jsonResponse({
          synced: 1,
          syncedIds: [body.rows[0].id],
          errors: [],
        });
      }
      if (url === "/api/sync/projects") {
        markProjectsStarted?.();
        await projectsReleased;
        return jsonResponse({ rows: [cloudProject] });
      }
      return jsonResponse({ rows: [] });
    };

    const cloudSync = syncNow("cloud");
    await projectsStarted;
    const newEdit = syncRow("projects", {
      ...cloudProject,
      name: "Edited while syncing",
    });
    await newEdit;
    releaseProjects?.();
    await cloudSync;

    assert.equal((await kokuDb.projects.get("project-1"))?.name, "Edited while syncing");
    assert.deepEqual(pushedNames, ["Edited while syncing"]);
    assert.equal(await kokuDb.pendingUpserts.count(), 0);
  });

  it("restores edits queued during a cloud sync when a later table pull fails", async () => {
    let releaseProjects: (() => void) | undefined;
    let markProjectsStarted: (() => void) | undefined;
    const projectsReleased = new Promise<void>((resolve) => {
      releaseProjects = resolve;
    });
    const projectsStarted = new Promise<void>((resolve) => {
      markProjectsStarted = resolve;
    });
    const cloudProject = {
      id: "project-1",
      name: "Cloud",
      color: "#123456",
      hourlyRate: null,
      createdAt: "2026-08-24T10:00:00.000Z",
    };

    globalThis.fetch = async (input) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      if (url === "/api/sync/projects") {
        markProjectsStarted?.();
        await projectsReleased;
        return jsonResponse({ rows: [cloudProject] });
      }
      if (url === "/api/sync/categories") {
        return jsonResponse({ error: "Category pull failed." }, 502);
      }
      return jsonResponse({ rows: [] });
    };

    const cloudSync = syncNow("cloud");
    await projectsStarted;
    await syncRow("projects", {
      ...cloudProject,
      name: "Local edit during failed sync",
    });
    releaseProjects?.();

    await assert.rejects(() => cloudSync, /Category pull failed/);
    assert.equal(
      (await kokuDb.projects.get("project-1"))?.name,
      "Local edit during failed sync",
    );
    assert.equal(await kokuDb.pendingUpserts.count(), 1);
  });

  it("keeps local storage on the latest edit made during a local-source pull", async () => {
    let releaseSettings: (() => void) | undefined;
    let markSettingsStarted: (() => void) | undefined;
    const settingsReleased = new Promise<void>((resolve) => {
      releaseSettings = resolve;
    });
    const settingsStarted = new Promise<void>((resolve) => {
      markSettingsStarted = resolve;
    });
    const pushedValues: unknown[] = [];

    globalThis.fetch = async (input, init) => {
      const url = String(input);
      if (url === "/api/auth/me") {
        return jsonResponse({ user: { id: "user-1" } });
      }
      if (init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as {
          rows: { key?: string; value?: unknown }[];
        };
        for (const row of body.rows) {
          if (row.key === "accent") pushedValues.push(row.value);
        }
        return jsonResponse({
          synced: body.rows.length,
          syncedIds: body.rows.map((row) => row.key),
          errors: [],
        });
      }
      if (url.startsWith("/api/sync/settings")) {
        markSettingsStarted?.();
        await settingsReleased;
        return jsonResponse({ rows: [{ key: "accent", value: "cloud-old" }] });
      }
      return jsonResponse({ rows: [] });
    };

    const localSync = syncNow("local");
    await settingsStarted;
    await kokuDb.settings.put({ key: "accent", value: "local-latest" });
    await syncRow("settings", { key: "accent", value: "local-latest" });
    releaseSettings?.();
    await localSync;

    assert.equal((await kokuDb.settings.get("accent"))?.value, "local-latest");
    assert.deepEqual(pushedValues, ["local-latest"]);
    assert.equal(await kokuDb.pendingUpserts.count(), 0);
  });
});
