import assert from "node:assert/strict";
import test from "node:test";

import { getAdminKeys, isOwnerUser } from "@/lib/auth/user-registry";

function appWithRows(rows: Record<string, unknown>[]) {
  return { zcql: () => ({ executeZCQLQuery: async () => rows }) } as never;
}

test("recognizes manually entered owner row when logical key is in id", async () => {
  const app = appWithRows([{
    id: "admin_owner",
    user_id: "owner-1",
    value_koku: "admin_owner",
    key_koku: JSON.stringify({ role: "owner", userId: "owner-1" }),
  }]);

  assert.equal(await isOwnerUser(app, "owner-1"), true);
});

test("recognizes current owner and delegated admin registry keys", async () => {
  const app = appWithRows([
    { id: "admin_owner", user_id: "owner-1", key_koku: "admin_owner" },
    { id: "admin_user:user-2", user_id: "user-2", key_koku: "admin_user:user-2" },
  ]);

  assert.equal(await isOwnerUser(app, "owner-1"), true);
  assert.deepEqual(await getAdminKeys(app), ["admin_user:user-2"]);
});
