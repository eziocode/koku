import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import path from "node:path";

import { ZipArchive } from "archiver";

import { db } from "@/lib/db";

async function createArchive(destination: string, payload: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });

  await new Promise<void>((resolve, reject) => {
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
    throw new Error("ENCRYPTION_KEY environment variable is not set. Cannot encrypt backup.");
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
  const user = await db.user.findUnique({
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

  return user;
}

export async function createUserBackup({
  userId,
  backupId,
  provider,
}: {
  userId: string;
  backupId: string;
  provider: string;
}) {
  const backupRoot = path.join(process.cwd(), "backups", provider);
  const archivePath = path.join(backupRoot, `${backupId}.zip`);
  const encryptedPath = path.join(backupRoot, `${backupId}.enc`);

  await db.backup.update({ where: { id: backupId }, data: { status: "processing" } });

  try {
    const payload = await gatherBackupPayload(userId);
    await createArchive(archivePath, payload);
    const checksum = await encryptArchive(archivePath, encryptedPath);
    const encrypted = await readFile(encryptedPath);

    await db.backup.update({
      where: { id: backupId },
      data: {
        status: "completed",
        path: encryptedPath,
        size: encrypted.byteLength,
        checksum,
      },
    });

    await rm(archivePath, { force: true });

    return {
      path: encryptedPath,
      size: encrypted.byteLength,
      checksum,
    };
  } catch (error) {
    await db.backup.update({ where: { id: backupId }, data: { status: "failed" } });
    throw error;
  }
}
