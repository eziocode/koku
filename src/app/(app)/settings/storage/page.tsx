import { StorageSettingsManager } from "@/components/settings/storage-settings-manager";
import { auth } from "@/lib/auth";
import { getCurrentWorkspace } from "@/lib/workspace";

export default async function StorageSettingsPage() {
  const session = await auth();
  const workspace = await getCurrentWorkspace(session!.user.id);
  const storage =
    typeof workspace.settings === "object" && workspace.settings
      ? ((workspace.settings as Record<string, unknown>).storage as
          | { provider?: string; schedule?: string; credentials?: string }
          | undefined)
      : undefined;

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Storage</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Backups & cloud destinations</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">Choose where Koku should store encrypted exports and how often backups should run.</p>
      </div>
      <StorageSettingsManager initialValue={storage} />
    </div>
  );
}
