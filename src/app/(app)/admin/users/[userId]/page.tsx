import { AdminUserDetail } from "@/components/admin/user-detail/admin-user-detail";

export default async function AdminUserPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <AdminUserDetail userId={decodeURIComponent(userId)} />;
}
