import { TagDetailClient } from "@/components/tags/tag-detail-client";

export default async function TagDetailPage({ params }: { params: Promise<{ tag: string }> }) {
  const { tag } = await params;
  return <TagDetailClient tag={decodeURIComponent(tag)} />;
}
