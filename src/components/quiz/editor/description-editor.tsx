"use client";

// description-editor.tsx — Sustituye CKEditor (view_edit_quiz #txtdesc) por
// TipTap: toolbar equivalente a la configuración del legacy (undo/redo,
// basicstyles, listas, blockquote, align, links) y el `desc` se guarda como
// HTML igual que antes. Toggle "HTML source" = grupo 'mode' del CKEditor.

import { useEditor, EditorContent, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import { useState } from "react";
import {
  Undo2,
  Redo2,
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Link as LinkIcon,
  Unlink,
  Eraser,
  Code,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import "./description-editor.css";

interface DescriptionEditorProps {
  value: string;
  onChange: (html: string) => void;
}

export function DescriptionEditor({ value, onChange }: DescriptionEditorProps) {
  const [showSource, setShowSource] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: false }),
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    immediatelyRender: false,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor }) => ({
      canUndo: editor?.can().undo() ?? false,
      canRedo: editor?.can().redo() ?? false,
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      strike: editor?.isActive("strike") ?? false,
      bulletList: editor?.isActive("bulletList") ?? false,
      orderedList: editor?.isActive("orderedList") ?? false,
      blockquote: editor?.isActive("blockquote") ?? false,
      alignLeft: editor?.isActive({ textAlign: "left" }) ?? false,
      alignCenter: editor?.isActive({ textAlign: "center" }) ?? false,
      alignRight: editor?.isActive({ textAlign: "right" }) ?? false,
      link: editor?.isActive("link") ?? false,
    }),
  });
  const s = state ?? {
    canUndo: false,
    canRedo: false,
    bold: false,
    italic: false,
    underline: false,
    strike: false,
    bulletList: false,
    orderedList: false,
    blockquote: false,
    alignLeft: false,
    alignCenter: false,
    alignRight: false,
    link: false,
  };

  if (showSource) {
    return (
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">HTML source</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              editor?.commands.setContent(value);
              setShowSource(false);
            }}
          >
            <Code className="mr-1 size-3.5" /> rich
          </Button>
        </div>
        <Textarea
          className="min-h-[120px] w-full font-mono text-xs"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  return (
    <div className="ol-desc-editor rounded-md border bg-background">
      <div className="flex flex-wrap items-center gap-0.5 border-b bg-muted/30 p-1">
        <ToolbarButton
          title="Undo"
          disabled={!s.canUndo}
          onClick={() => editor?.chain().focus().undo().run()}
        >
          <Undo2 className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Redo"
          disabled={!s.canRedo}
          onClick={() => editor?.chain().focus().redo().run()}
        >
          <Redo2 className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton title="Bold" active={s.bold} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <Bold className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton title="Italic" active={s.italic} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <Italic className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Underline"
          active={s.underline}
          onClick={() => editor?.chain().focus().toggleUnderline().run()}
        >
          <UnderlineIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Strike-through"
          active={s.strike}
          onClick={() => editor?.chain().focus().toggleStrike().run()}
        >
          <Strikethrough className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          title="Bullet list"
          active={s.bulletList}
          onClick={() => editor?.chain().focus().toggleBulletList().run()}
        >
          <List className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Numbered list"
          active={s.orderedList}
          onClick={() => editor?.chain().focus().toggleOrderedList().run()}
        >
          <ListOrdered className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Blockquote"
          active={s.blockquote}
          onClick={() => editor?.chain().focus().toggleBlockquote().run()}
        >
          <Quote className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          title="Align left"
          active={s.alignLeft}
          onClick={() => editor?.chain().focus().setTextAlign("left").run()}
        >
          <AlignLeft className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Align center"
          active={s.alignCenter}
          onClick={() => editor?.chain().focus().setTextAlign("center").run()}
        >
          <AlignCenter className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Align right"
          active={s.alignRight}
          onClick={() => editor?.chain().focus().setTextAlign("right").run()}
        >
          <AlignRight className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          title="Insert link"
          active={s.link}
          onClick={() => {
            if (!editor) return;
            const prev = editor.getAttributes("link").href as string | undefined;
            const href = window.prompt("URL", prev ?? "https://");
            if (href === null) return;
            if (href === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
            else editor.chain().focus().extendMarkRange("link").setLink({ href }).run();
          }}
        >
          <LinkIcon className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton
          title="Remove link"
          disabled={!s.link}
          onClick={() => editor?.chain().focus().extendMarkRange("link").unsetLink().run()}
        >
          <Unlink className="size-3.5" />
        </ToolbarButton>
        <div className="mx-1 h-4 w-px bg-border" />
        <ToolbarButton
          title="Remove formatting"
          onClick={() => editor?.chain().focus().clearNodes().unsetAllMarks().run()}
        >
          <Eraser className="size-3.5" />
        </ToolbarButton>
        <ToolbarButton title="HTML source" onClick={() => setShowSource(true)}>
          <Code className="size-3.5" />
        </ToolbarButton>
      </div>
      <EditorContent editor={editor} className="p-2" />
    </div>
  );
}

function ToolbarButton({
  title,
  active,
  disabled,
  onClick,
  children,
}: {
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={cn("h-7 w-7 px-0", active && "bg-accent text-accent-foreground")}
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </Button>
  );
}
