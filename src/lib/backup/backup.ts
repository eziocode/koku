import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createReadStream } from "node:fs";
import path from "node:path";

import { ZipArchive } from "archiver";
import { headers } from "next/headers";

import { db } from "@/lib/db";

const TMP_ROOT = "/tmp/koku-backups";

async function createArchive(destination: string, payload: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });

  await new Promise<void>((resolve, reject) => {
    const { createWriteStream } = require("node:fs") as typeof import("node:fs");
    const output = createWriteStream(destination);
    const archive = new ZipArchive({ zlib: { level: 9 } });

    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);

    archive.pipe(output);
    archive.append(JSON.stringify(payload, null, 2), { name: "koku-backup.json" });
    archive.finalize();
  });
}

async function encryptArchive(source: string, destination: string) {
  const keyString = process.env.ENCRYPTION_KEY;
  if (!keyString) {
    throw new Error("ENCRYPTION_KEY is not set.");
  }
  const key = Buffer.from(keyString.padEnd(32, "0").slice(0, 32));
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-cbc", key, iv);
  const sourceBuffer = await readFile(source);
  const encrypted = Buffer.concat([cipher.update(sourceBuffer), cipher.final()]);
  const payload = Buffer.concat([iv, encrypted]);
  await writeFile(destination, payload);
  return createHash("sha256").update(payload).digest("hex");
}

async function gatherBackupPayload(userId: string) {
  return db.user.findUnique({
    where: { id: userId },
    include: {
      workspaces: {
        include: {
          projects: true,
          categories: true,
          tags: true,
          notes: true,
          timeEntries: true,
          pomodoroSessions: true,
        },
      },
      moods: true,
      aiKeys: true,
    },
  });
}

async function uploadToCatalystFileStore(filePath: string, fileName: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const catalyst = require("zcatalyst-sdk-node");
  const headerStore = await headers();
  const headersObj = Object.fromEntries(headerStore.entries());
  const app = catalyst.initialize({ headers: headersObj });

  const folderId = process.env.CATALYST_BACKUP_FOLDER_ID;
  if (!folderId) {
    throw new Error("CATALYST_BACKUP_FOLDER_ID is not set.");
  }

  const folder = app.fileStore().folder(folderId);
  const result = await folder.uploadFile({
    code: createReadStream(filePath),
    name: fileName,
  });

  return String(result.id);
}

export async function createUserBackup({
  userId,
  backupId,
}: {
  userId: string;
  backupId: string;
}) {
  const archivePath = path.join(TMP_ROOT, `${backupId}.zip`);
  const encryptedPath = path.join(TMP_ROOT, `${backupId}.enc`);

  await db.backup.update({ where: { id: backupId }, data: { status: "processing" } });

  try {
    const payload = await gatherBackupPayload(userId);
    await createArchive(archivePath, payload);
    const checksum = await encryptArchive(archivePath, encryptedPath);
    const encrypted = await readFile(encryptedPath);

    // Upload encrypted archive to Catalyst File Store; store the returned file ID.
    const fileId = await uploadToCatalystFileStore(encryptedPath, `${backupId}.enc`);

    await db.backup.update({
      where: { id: backupId },
      data: {
        status: "completed",
        path: fileId,
        size: encrypted.byteLength,
        checksum,
      },
    });

    return { fileId, size: encrypted.byteLength, checksum };
  } catch (error) {
    await db.backup.update({ where: { id: backupId }, data: { status: "failed" } });
    throw error;
  } finally {
    await rm(archivePath, { force: true });
    await rm(encryptedPath, { force: true });
  }
}
