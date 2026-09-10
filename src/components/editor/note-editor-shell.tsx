"use client";

import { useLiveQuery } from "@/lib/storage/use-live-query";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LazyScrollList } from "@/components/ui/lazy-scroll-list";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { type NoteScope, noteActions } from "@/lib/storage/note-actions";
import { kokuDb, type NoteDraft } from "@/lib/storage/db";
import { stageNote, commitNote, detachNoteSave, discardNoteSave } from "@/lib/storage/note-saves";

// TipTap uses browser-only APIs (ProseMirror, lowlight, WebWorkers).
// Skip SSR entirely so the OpenNext serverless function never attempts to
// evaluate these imports in a Node.js context.
const TiptapEditor = dynamic(
  () => import("@/components/editor/tiptap-editor").then((m) => m.TiptapEditor),
  {
    ssr: false,
    loading: () => <Skeleton className="h-64 w-full rounded-3xl" />,
  },
);

interface NoteEditorShellProps {
  noteId: string;
  scope?: NoteScope;
}

export function NoteEditorShell(props: NoteEditorShellProps) {
  return <NoteEditorInner key={`${props.scope ?? "shared"}:${props.noteId}`} {...props} />;
}
function NoteEditorInner({ noteId, scope = "shared" }: NoteEditorShellProps) {
  const isPersonal = scope === "personal";
  const router = useRouter();
  const { getNote, createNote, deleteNote } = noteActions(scope);
  const note = useLiveQuery(() => getNote(noteId), [noteId, scope]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState<unknown>(null);
  const [tags, setTags] = useState("");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("Saved");
  const [isHydrated, setIsHydrated] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const baseRef = useRef("");
  const payloadRef = useRef<NoteDraft["payload"]>({ title: "", content: null, tags: [] });
  const saveIdRef = useRef<string | null>(null);
  const recoveredIdRef = useRef<string | null>(null);
  const hydratedRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (saveIdRef.current) {
        detachNoteSave(saveIdRef.current);
        void commitNote(saveIdRef.current).catch(() => undefined);
      }
    };
  }, []);

  useEffect(() => {
    if (!note || hydratedRef.current) return;
    let active = true;
    void kokuDb.noteDrafts.where("[scope+noteId]").equals([scope, noteId]).sortBy("updatedAt").then((drafts) => {
      if (!active) return;
      const draft = drafts.at(-1);
      const value = draft?.payload ?? note;
      baseRef.current = draft?.baseUpdatedAt ?? note.updatedAt;
      payloadRef.current = { title: value.title, content: value.content, tags: value.tags };
      recoveredIdRef.current = draft?.id ?? null;
      setTitle(value.title);
      setContent(value.content);
      setTags(value.tags.join(", "));
      setSlug(note.slug);
      setStatus(draft ? "Recovered draft — save or keep as a copy" : "Saved locally");
      hydratedRef.current = true;
      setIsHydrated(true);
    }).catch(() => { if (active) setStatus("Unable to load draft — reload to retry"); });
    return () => { active = false; };
  }, [note, noteId, scope]);

  function savePayload(patch: Partial<NoteDraft["payload"]>) {
    const payload = { ...payloadRef.current, ...patch };
    payloadRef.current = payload;
    saveIdRef.current = stageNote(noteId, scope, payload, baseRef.current, (nextStatus, nextSlug, updatedAt) => {
      if (!aliveRef.current) return;
      setStatus(nextStatus);
      if (nextSlug) setSlug(nextSlug);
      if (updatedAt) {
        baseRef.current = updatedAt;
        if (recoveredIdRef.current) {
          void kokuDb.noteDrafts.delete(recoveredIdRef.current);
          recoveredIdRef.current = null;
        }
      }
    });
  }

  async function saveCopy() {
    try {
      const copy = await createNote({ ...payloadRef.current, title: `${payloadRef.current.title} (recovered)` });
      if (saveIdRef.current) await discardNoteSave(saveIdRef.current);
      if (recoveredIdRef.current) await kokuDb.noteDrafts.delete(recoveredIdRef.current);
      router.push(`/notes?id=${copy.id}${isPersonal ? "&tab=personal" : ""}`);
    } catch { toast.error("Unable to save copy. Keep this editor open and retry."); }
  }

  if (note === undefined) {
    return (
      <div className="space-y-8">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-64" />
        </div>
        <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
          <div className="space-y-5">
            <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="space-y-2">
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-12 w-full" />
              </div>
              <div className="space-y-2">
                <Skeleton className="h-4 w-10" />
                <Skeleton className="h-9 w-full" />
              </div>
            </div>
            <Skeleton className="h-64 w-full rounded-3xl" />
          </div>
          <Skeleton className="h-48 w-full rounded-3xl" />
        </div>
      </div>
    );
  }

  if (!note) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Note not found</CardTitle>
          <CardDescription>This note may have been deleted locally.</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href={isPersonal ? "/notes?tab=personal" : "/notes"} className="text-sm font-medium text-primary hover:underline">
            Back to notes
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={isPersonal ? "Personal note" : "Note editor"}
        title={isPersonal ? "Private to you" : "Write, connect, remember"}
        actions={<>
          <Link href={isPersonal ? "/notes?tab=personal" : "/notes"}>
            <Button variant="outline" size="sm">← All notes</Button>
          </Link>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => setDeleteOpen(true)}
          >
            Delete note
          </Button>
        </>}
      />

      {/* Delete confirmation dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete &quot;{note.title}&quot;?</DialogTitle>
            <DialogDescription>
              This note and all its wiki-links will be permanently removed from your local storage. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={deleting}
              onClick={async () => {
                setDeleting(true);
                try {
                  if (saveIdRef.current) await discardNoteSave(saveIdRef.current);
                  await deleteNote(noteId);
                  toast.success("Note deleted.");
                  router.push(isPersonal ? "/notes?tab=personal" : "/notes");
                } catch {
                  toast.error("Unable to delete this note.");
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Deleting…" : "Delete permanently"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          <div className="space-y-4 rounded-3xl border border-border bg-card p-6 shadow-sm">
            <div className="space-y-2">
              <Label htmlFor="note-title">Title</Label>
              <Input
                id="note-title"
                disabled={!isHydrated}
                value={title}
                onChange={(event) => {
                  setStatus("Saving…");
                  setTitle(event.target.value);
                  savePayload({ title: event.target.value });
                }}
                className="h-12 text-lg font-semibold"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note-tags">Tags</Label>
              <Input
                id="note-tags"
                disabled={!isHydrated}
                value={tags}
                onChange={(event) => {
                  setStatus("Saving…");
                  setTags(event.target.value);
                  savePayload({ tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) });
                }}
                placeholder="work, research, architecture"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>/{slug}</span>
              <span role="status" aria-live="polite">{status}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" disabled={!isHydrated} onClick={() => { savePayload({}); if (saveIdRef.current) void commitNote(saveIdRef.current).catch(() => undefined); }}>Save now</Button>
            {(status.includes("copy") || status.includes("failed")) && <Button variant="secondary" size="sm" onClick={saveCopy}>Save as a copy</Button>}
          </div>
          {isHydrated && <TiptapEditor
            content={content}
            onChange={(value) => {
              setStatus("Saving…");
              setContent(value);
              savePayload({ content: value });
            }}
          />}
        </div>
        {!isPersonal && <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Linked notes</CardTitle>
              <CardDescription>Connections surfaced from wiki links in this note.</CardDescription>
            </CardHeader>
            <CardContent>
              <LazyScrollList
                items={note.linkedNotes}
                getKey={(linkedNote) => linkedNote.id}
                pageSize={8}
                className="h-80"
                moreLabel="Load more links"
                empty={<div className="text-sm text-muted-foreground">Create <Badge>[[wiki-links]]</Badge> in the editor to connect notes.</div>}
                renderItem={(linkedNote) => (
                  <Link href={`/notes?id=${linkedNote.id}`} className="block rounded-2xl border border-border bg-muted/30 p-4 transition-colors hover:bg-muted">
                    <p className="font-medium text-foreground">{linkedNote.title}</p>
                    <p className="mt-1 text-sm text-muted-foreground">/{linkedNote.slug}</p>
                  </Link>
                )}
              />
            </CardContent>
          </Card>
        </div>}
      </div>
    </div>
  );
}
