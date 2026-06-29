import { auth } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function AccountSettingsPage() {
  const session = await auth();

  return (
    <div className="space-y-8">
      <div>
        <p className="text-sm uppercase tracking-[0.3em] text-primary">Account</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">Profile & preferences</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>{session?.user.name || "Koku User"}</CardTitle>
          <CardDescription>{session?.user.email}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Badge>Authenticated</Badge>
          <Badge variant="secondary">Theme: system</Badge>
          <Badge variant="outline">Workspaces enabled</Badge>
        </CardContent>
      </Card>
    </div>
  );
}
