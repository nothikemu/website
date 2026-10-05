"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarClock, GitBranch, Link2, Plus } from "lucide-react";
import { api } from "@/lib/api-client";
import { TaskStatusIcon, PriorityIcon } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { TASK_STATUS } from "@/lib/status";
import { shortDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type BoardTask = {
  id: string;
  number: number;
  ref: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  sortOrder: number;
  parentId: string | null;
  assignee: { id: string; displayName: string; username: string; avatarUrl: string | null } | null;
  labels: { name: string; color: string }[];
  milestone: { number: number; title: string } | null;
  subtasks: { total: number; done: number };
  blockedBy: number;
};

const COLUMNS = ["backlog", "todo", "in_progress", "review", "done"] as const;

/** Kanban board with drag & drop. Moves are applied optimistically and rolled back on error. */
export function TaskBoard({ project, tasks: initial, canWrite }: { project: string; tasks: BoardTask[]; canWrite: boolean }) {
  const router = useRouter();
  const [tasks, setTasks] = useState(initial);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  // Keep in sync with server refreshes.
  const [prevInitial, setPrevInitial] = useState(initial);
  if (initial !== prevInitial) {
    setPrevInitial(initial);
    setTasks(initial);
  }
  const today = new Date().toISOString().slice(0, 10);

  async function move(id: string, status: string) {
    const t = tasks.find((x) => x.id === id);
    if (!t || t.status === status) return;
    const prev = tasks;
    setTasks((ts) => ts.map((x) => (x.id === id ? { ...x, status } : x)));
    try {
      await api("PATCH", `/api/v1/projects/${project}/tasks/${t.number}`, { status });
      router.refresh();
    } catch (e) {
      setTasks(prev);
      toast.error((e as Error).message);
    }
  }

  async function create(status: string) {
    if (!title.trim()) return;
    try {
      await api("POST", `/api/v1/projects/${project}/tasks`, { title, status });
      setTitle("");
      setAdding(null);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  useEffect(() => {
    const end = () => {
      setDragging(null);
      setOver(null);
    };
    window.addEventListener("dragend", end);
    return () => window.removeEventListener("dragend", end);
  }, []);

  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-4 md:mx-0 md:px-0">
      {COLUMNS.map((col) => {
        const list = tasks.filter((t) => t.status === col && !t.parentId).sort((a, b) => a.sortOrder - b.sortOrder);
        return (
          <div
            key={col}
            onDragOver={(e) => {
              if (!canWrite || !dragging) return;
              e.preventDefault();
              setOver(col);
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (dragging) move(dragging, col);
              setDragging(null);
              setOver(null);
            }}
            className={cn("flex w-[276px] shrink-0 flex-col rounded-lg border bg-bg-subtle transition-colors", over === col ? "border-accent/60 bg-accent-soft/20" : "border-border")}
          >
            <div className="flex items-center gap-2 px-3 py-2.5">
              <TaskStatusIcon status={col} />
              <span className="text-sm font-medium">{TASK_STATUS[col]!.label}</span>
              <span className="font-mono text-2xs text-fg-subtle">{list.length}</span>
              {canWrite ? (
                <button onClick={() => setAdding(col)} className="ml-auto rounded-sm p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label={`Add task to ${TASK_STATUS[col]!.label}`}>
                  <Plus className="size-3.5" />
                </button>
              ) : null}
            </div>
            <div className="flex min-h-24 flex-1 flex-col gap-1.5 px-2 pb-2">
              {adding === col ? (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    create(col);
                  }}
                  className="rounded-md border border-accent/60 bg-surface p-2"
                >
                  <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onBlur={() => !title && setAdding(null)} onKeyDown={(e) => e.key === "Escape" && setAdding(null)} placeholder="Task title, then ↵" className="w-full bg-transparent text-sm outline-none" />
                </form>
              ) : null}
              {list.map((t) => (
                <div
                  key={t.id}
                  draggable={canWrite}
                  onDragStart={(e) => {
                    setDragging(t.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  className={cn("group rounded-md border border-border bg-surface shadow-[0_1px_0_rgb(0_0_0/0.04)] transition-all hover:border-border-strong", dragging === t.id && "opacity-40", canWrite && "cursor-grab active:cursor-grabbing")}
                >
                  <Link href={`/project/${project}/tasks/${t.number}`} className="block p-2.5" draggable={false}>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-2xs text-fg-subtle">{t.ref}</span>
                      {t.blockedBy ? (
                        <span className="flex items-center gap-0.5 rounded-sm bg-red-soft px-1 text-2xs text-red" title={`Blocked by ${t.blockedBy} task(s)`}>
                          <Link2 className="size-2.5" /> blocked
                        </span>
                      ) : null}
                      <span className="ml-auto">
                        <Avatar user={t.assignee} size={18} />
                      </span>
                    </div>
                    <p className="mt-1 text-sm leading-snug">{t.title}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-2xs text-fg-subtle">
                      <PriorityIcon priority={t.priority} className="size-3" />
                      {t.dueDate ? (
                        <span className={cn("flex items-center gap-1 font-mono", t.dueDate < today && t.status !== "done" ? "text-red" : "")}>
                          <CalendarClock className="size-3" /> {shortDate(t.dueDate)}
                        </span>
                      ) : null}
                      {t.subtasks.total ? (
                        <span className="flex items-center gap-1 font-mono">
                          <GitBranch className="size-3" /> {t.subtasks.done}/{t.subtasks.total}
                        </span>
                      ) : null}
                      {t.milestone ? <span className="font-mono">M{t.milestone.number}</span> : null}
                      {t.labels.slice(0, 2).map((l) => (
                        <span key={l.name} className="flex items-center gap-1">
                          <span className="size-1.5 rounded-full" style={{ background: l.color }} />
                          {l.name}
                        </span>
                      ))}
                    </div>
                  </Link>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
