import Link from "next/link";
import { Columns3, List } from "lucide-react";
import { requireUser } from "@/server/auth/current";
import { listTasks } from "@/server/services/tasks";
import { listMilestones } from "@/server/services/milestones";
import { projectPeople } from "@/server/services/shared";
import { load } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { ProjectHeader, TableShell } from "@/components/project/shared";
import { FilterBar } from "@/components/project/filter-bar";
import { TaskBoard } from "@/components/project/task-board";
import { TaskStatusIcon, PriorityIcon, Ref } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { taskFields } from "@/components/project/field-sets";
import { shortDate } from "@/lib/dates";
import { TASK_STATUS } from "@/lib/status";
import { cn } from "@/lib/utils";
import { NewTaskDialog } from "@/components/project/new-task-dialog";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ view?: string; assignee?: string; milestone?: string; q?: string; new?: string }> }) {
  const { slug } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const { access, tasks } = await load(listTasks(user, slug, sp));
  const { project, org, role } = access;
  const [people, ms] = await Promise.all([projectPeople(access), listMilestones(user, slug)]);
  const base = `/project/${project.slug}`;
  const view = sp.view === "list" ? "list" : "board";
  const canWrite = role !== "viewer";
  const q = (v: string) => {
    const p = new URLSearchParams(Object.entries({ ...sp, view: v, new: undefined }).filter(([, x]) => x) as [string, string][]);
    return `${base}/tasks?${p}`;
  };
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Tasks" }]}
        actions={canWrite ? <NewTaskDialog project={project.slug} defaultOpen={sp.new === "1"} fields={taskFields(people, ms.milestones)} /> : null}
      />
      <Content wide className="max-w-none">
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <div className="flex rounded-md border border-border p-0.5">
            <Link href={q("board")} className={cn("flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs", view === "board" ? "bg-surface-2 text-fg" : "text-fg-muted")}>
              <Columns3 className="size-3.5" /> Board
            </Link>
            <Link href={q("list")} className={cn("flex h-6 items-center gap-1.5 rounded-sm px-2 text-xs", view === "list" ? "bg-surface-2 text-fg" : "text-fg-muted")}>
              <List className="size-3.5" /> List
            </Link>
          </div>
          <FilterBar
            searchPlaceholder="Search tasks…"
            filters={[
              { key: "assignee", label: "Assignee", options: [{ value: "none", label: "Unassigned" }, ...people.map((p) => ({ value: p.username, label: p.displayName }))] },
              { key: "milestone", label: "Milestone", options: ms.milestones.map((m) => ({ value: String(m.number), label: `M${m.number} ${m.title}` })) },
            ]}
          />
        </div>
        {view === "board" ? (
          <TaskBoard project={project.slug} tasks={tasks} canWrite={canWrite} />
        ) : (
          <TableShell>
            {(["in_progress", "review", "todo", "backlog", "done"] as const).map((s) => {
              const list = tasks.filter((t) => t.status === s);
              if (!list.length) return null;
              return (
                <section key={s}>
                  <h3 className="flex items-center gap-2 border-b border-border bg-bg-subtle px-3 py-1.5 text-xs font-medium">
                    <TaskStatusIcon status={s} /> {TASK_STATUS[s]!.label} <span className="font-mono text-fg-subtle">{list.length}</span>
                  </h3>
                  <ul className="divide-y divide-border">
                    {list.map((t) => (
                      <li key={t.id}>
                        <Link href={`${base}/tasks/${t.number}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                          <PriorityIcon priority={t.priority} />
                          <Ref className="w-20">{t.ref}</Ref>
                          <span className={cn("min-w-0 flex-1 truncate text-sm", t.parentId && "pl-4 text-fg-muted")}>{t.title}</span>
                          {t.milestone ? <span className="hidden font-mono text-2xs text-fg-subtle sm:inline">M{t.milestone.number}</span> : null}
                          <span className="w-16 text-right font-mono text-2xs text-fg-subtle">{t.dueDate ? shortDate(t.dueDate) : ""}</span>
                          <Avatar user={t.assignee} size={20} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
            {!tasks.length ? <p className="px-3 py-8 text-center text-sm text-fg-subtle">No tasks match.</p> : null}
          </TableShell>
        )}
      </Content>
    </>
  );
}
