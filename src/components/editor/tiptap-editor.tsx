"use client";

import type { Content } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import CodeBlockLowlight from "@tiptap/extension-code-block-lowlight";
import { common, createLowlight } from "lowlight";
import { Bold, Code2, Heading2, ImagePlus, Italic, Link2, List, ListOrdered, Quote } from "lucide-react";
import { useEffect } from "react";

import { WikiLink } from "@/components/editor/extensions/wiki-link";
import { Button } from "@/components/ui/button";

const lowlight = createLowlight(common);

interface TiptapEditorProps {
  content: unknown;
  onChange: (value: unknown) => void;
}

function ToolbarButton({ onClick, active, children }: { onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <Button type="button" variant={active ? "default" : "ghost"} size="icon" onClick={onClick}>
      {children}
    </Button>
  );
}

export function TiptapEditor({ content, onChange }: TiptapEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ codeBlock: false }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        // Block javascript: and data: URIs to prevent XSS via crafted link nodes
        isAllowedUri: (url) => /^https?:\/\//i.test(url),
      }),
      Image,
      Placeholder.configure({ placeholder: "Capture a note, insight, or linked thought…" }),
      CodeBlockLowlight.configure({ lowlight }),
      WikiLink,
    ],
    editorProps: {
      attributes: {
        class:
          "min-h-[420px] rounded-b-3xl border border-t-0 border-border bg-background px-6 py-5 text-base leading-8 outline-none prose prose-neutral dark:prose-invert max-w-none",
      },
    },
    content: content as Content,
    onUpdate({ editor }) {
      onChange(editor.getJSON());
    },
  });

  useEffect(() => {
    if (!editor) {
      return;
    }

    const current = editor.getJSON();
    if (JSON.stringify(current) !== JSON.stringify(content)) {
      editor.commands.setContent(content as Content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="rounded-3xl border border-border bg-card shadow-sm">
      <div className="flex flex-wrap gap-2 border-b border-border px-4 py-3">
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}><Bold /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}><Italic /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })}><Heading2 /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}><List /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}><ListOrdered /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}><Quote /></ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive("codeBlock")}><Code2 /></ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const url = window.prompt("Paste an image URL");
            if (url) {
              editor.chain().focus().setImage({ src: url }).run();
            }
          }}
        ><ImagePlus /></ToolbarButton>
        <ToolbarButton
          onClick={() => {
            const url = window.prompt("Paste a link URL");
            if (url && /^https?:\/\//i.test(url.trim())) {
              editor.chain().focus().setLink({ href: url.trim() }).run();
            } else if (url) {
              window.alert("Only http:// and https:// links are allowed.");
            }
          }}
        ><Link2 /></ToolbarButton>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
