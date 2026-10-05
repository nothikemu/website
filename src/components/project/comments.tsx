"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CornerDownRight, MoreHorizontal, Paperclip, SmilePlus } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { api } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { MarkdownEditor } from "@/components/forms/markdown-editor";
import { Time } from "@/components/app/time";
import { cn } from "@/lib/utils";

type C = {
  id: string;
  parentId: string | null;
  body: string;
  deleted: boolean;
  editedAt: string | Date | null;
  createdAt: string | Date;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null } | null;
  reactions: { emoji: string; count: number; mine: boolean }[];
  attachments: { id: string; name: string; path: string }[];
  canEdit: boolean;
  canDelete: boolean;
};

const EMOJI = ["👍", "🎉", "🚀", "👀", "⚠️", "✅", "👎"];

function Body({ text }: { text: string }) {
  return (
    <div className="prose-forge">
      <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function Composer({ project, target, parentId, onDone, placeholder, files }: { project: string; target: { type: string; id: string }; parentId?: string; onDone?: () => void; placeholder?: string; files: { id: string; path: string }[] }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [attachments, setAttachments] = useState<string[]>([]);
  const [pick, setPick] = useState(false);
  const [loading, setLoading] = useState(false);
  async function submit() {
    if (!body.trim()) return;
    setLoading(true);
    try {
      await api("POST", `/api/v1/projects/${project}/comments`, { targetType: target.type, targetId: target.id, parentId: parentId ?? null, body, attachments });
      setBody("");
      setAttachments([]);
      onDone?.();
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <MarkdownEditor value={body} onChange={setBody} rows={parentId ? 2 : 3} placeholder={placeholder ?? "Leave a comment… @mention teammates, reference REQ-001"} onSubmitShortcut={submit} />
      {attachments.length ? (
        <div className="flex flex-wrap gap-1">
          {attachments.map((a) => (
            <span key={a} className="rounded-sm border border-border px-1.5 py-0.5 font-mono text-2xs text-fg-muted">
              {files.find((f) => f.id === a)?.path}
            </span>
          ))}
        </div>
      ) : null}
      {pick ? (
        <select
          className="h-8 rounded-md border border-border bg-surface px-2 text-sm"
          onChange={(e) => {
            if (e.target.value) setAttachments((a) => [...new Set([...a, e.target.value])]);
            setPick(false);
          }}
          defaultValue=""
        >
          <option value="">Attach a project file…</option>
          {files.map((f) => (
            <option key={f.id} value={f.id}>
              {f.path}
            </option>
          ))}
        </select>
      ) : null}
      <div className="flex items-center gap-2">
        <Button size="sm" variant="primary" onClick={submit} loading={loading} disabled={!body.trim()}>
          {parentId ? "Reply" : "Comment"}
        </Button>
        {files.length ? (
          <Button size="sm" variant="ghost" onClick={() => setPick((p) => !p)}>
            <Paperclip className="size-3.5" /> Attach file
          </Button>
        ) : null}
        {onDone ? (
          <Button size="sm" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function CommentItem({ c, project, target, replies, files, canComment }: { c: C; project: string; target: { type: string; id: string }; replies: C[]; files: { id: string; path: string }[]; canComment: boolean }) {
  const router = useRouter();
  const [replying, setReplying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(c.body);
  const [reactions, setReactions] = useState(c.reactions);
  async function react(emoji: string) {
    const prev = reactions;
    const has = reactions.find((r) => r.emoji === emoji);
    setReactions(
      has
        ? reactions.map((r) => (r.emoji === emoji ? { ...r, mine: !r.mine, count: r.count + (r.mine ? -1 : 1) } : r)).filter((r) => r.count > 0)
        : [...reactions, { emoji, count: 1, mine: true }],
    );
    try {
      await api("POST", `/api/v1/projects/${project}/comments/${c.id}/reactions`, { emoji });
    } catch (e) {
      setReactions(prev);
      toast.error((e as Error).message);
    }
  }
  return (
    <div id={`comment-${c.id}`} className="scroll-mt-20">
      <div className="flex gap-3">
        <Avatar user={c.author ?? { displayName: "Deleted user" }} size={24} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs">
            <span className="font-medium text-fg">{c.author?.displayName ?? "Deleted user"}</span>
            <Time date={c.createdAt} className="text-fg-subtle" />
            {c.editedAt ? <span className="text-fg-subtle">· edited</span> : null}
            {c.canEdit || c.canDelete ? (
              <Menu>
                <MenuTrigger asChild>
                  <button className="ml-auto rounded-sm p-0.5 text-fg-subtle hover:bg-surface-2" aria-label="Comment actions">
                    <MoreHorizontal className="size-3.5" />
                  </button>
                </MenuTrigger>
                <MenuContent>
                  {c.canEdit ? <MenuItem onSelect={() => setEditing(true)}>Edit</MenuItem> : null}
                  {c.canDelete ? (
                    <MenuItem
                      danger
                      onSelect={async () => {
                        if (!confirm("Delete this comment?")) return;
                        await api("DELETE", `/api/v1/projects/${project}/comments/${c.id}`).catch((e) => toast.error(e.message));
                        router.refresh();
                      }}
                    >
                      Delete
                    </MenuItem>
                  ) : null}
                </MenuContent>
              </Menu>
            ) : null}
          </div>
          <div className="mt-1">
            {c.deleted ? (
              <p className="text-sm text-fg-subtle italic">This comment was deleted.</p>
            ) : editing ? (
              <div className="flex flex-col gap-2">
                <MarkdownEditor value={draft} onChange={setDraft} rows={3} />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={async () => {
                      try {
                        await api("PATCH", `/api/v1/projects/${project}/comments/${c.id}`, { body: draft });
                        setEditing(false);
                        router.refresh();
                      } catch (e) {
                        toast.error((e as Error).message);
                      }
                    }}
                  >
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Body text={c.body} />
            )}
          </div>
          {c.attachments.length ? (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {c.attachments.map((a) => (
                <Link key={a.id} href={`/project/${project}/files/${a.id}`} className="flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-2xs text-fg-muted hover:text-fg">
                  <Paperclip className="size-3" /> {a.path}
                </Link>
              ))}
            </div>
          ) : null}
          {!c.deleted ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-1">
              {reactions.map((r) => (
                <button key={r.emoji} onClick={() => react(r.emoji)} className={cn("flex h-6 items-center gap-1 rounded-full border px-2 text-xs", r.mine ? "border-accent/50 bg-accent-soft" : "border-border hover:bg-surface-2")}>
                  {r.emoji} <span className="font-mono text-2xs">{r.count}</span>
                </button>
              ))}
              {canComment ? (
                <>
                  <Menu>
                    <MenuTrigger asChild>
                      <button className="flex h-6 items-center rounded-full px-1.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="Add reaction">
                        <SmilePlus className="size-3.5" />
                      </button>
                    </MenuTrigger>
                    <MenuContent align="start" className="min-w-0">
                      <div className="flex gap-0.5">
                        {EMOJI.map((e) => (
                          <MenuItem key={e} onSelect={() => react(e)} className="justify-center px-1.5 text-base">
                            {e}
                          </MenuItem>
                        ))}
                      </div>
                    </MenuContent>
                  </Menu>
                  {!c.parentId ? (
                    <button onClick={() => setReplying(true)} className="flex h-6 items-center gap-1 rounded-full px-2 text-xs text-fg-subtle hover:bg-surface-2 hover:text-fg">
                      <CornerDownRight className="size-3" /> Reply
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
          {replies.length || replying ? (
            <div className="mt-3 flex flex-col gap-4 border-l border-border pl-4">
              {replies.map((r) => (
                <CommentItem key={r.id} c={r} project={project} target={target} replies={[]} files={files} canComment={canComment} />
              ))}
              {replying ? <Composer project={project} target={target} parentId={c.id} onDone={() => setReplying(false)} placeholder="Reply…" files={files} /> : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Comments({ project, target, comments, files = [], canComment = true }: { project: string; target: { type: string; id: string }; comments: C[]; files?: { id: string; path: string }[]; canComment?: boolean }) {
  const roots = comments.filter((c) => !c.parentId);
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-fg-muted uppercase">
        Discussion <span className="font-mono font-normal text-fg-subtle">{comments.filter((c) => !c.deleted).length}</span>
      </h2>
      <div className="flex flex-col gap-5">
        {roots.map((c) => (
          <CommentItem key={c.id} c={c} project={project} target={target} replies={comments.filter((r) => r.parentId === c.id)} files={files} canComment={canComment} />
        ))}
        {canComment ? <Composer project={project} target={target} files={files} /> : null}
      </div>
    </section>
  );
}
