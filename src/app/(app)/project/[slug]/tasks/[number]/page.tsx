import Link from "next/link";
import { requireUser } from "@/server/auth/current";
import { getTask } from "@/server/services/tasks";
import { listMilestones } from "@/server/services/milestones";
import { projectPeople } from "@/server/services/shared";
import { loadDiscussion } from "@/server/services/comments";
import { load, pageNumber } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, DocSection, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { RecordTitle } from "@/components/project/detail-header";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { ResourceForm } from "@/components/forms/resource-form";
import { PropertySelect, ActionButton } from "@/components/forms/actions";
import { taskFields } from "@/components/project/field-sets";
import { NewTaskDialog } from "@/components/project/new-task-dialog";
import { StatusBadge, TaskStatusIcon } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { LabelChip } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Progress } from "@/components/ui/misc";
import { PRIORITY, TASK_STATUS } from "@/lib/status";
import { shortDate } from "@/lib/dates";

export const metadata = { title: "Task" };

export default async function TaskPage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { access, task, subtasks, dependsOn, blocks, links } = await load(getTask(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const [people, ms, discussion] = await Promise.all([projectPeople(access), listMilestones(user, slug), loadDiscussion(user, slug, "task", task.id)]);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/tasks/${task.number}`;
  const canWrite = role !== "viewer";
  const fields = taskFields(people, ms.milestones);
  const done = subtasks.filter((s) => s.status === "done").length;
  return (
    <>
      <ProjectHeader project={project} org={org} crumbs={[{ label: "Tasks", href: `${base}/tasks` }, ...(task.parent ? [{ label: `TASK-${String(task.parent.number).padStart(3, "0")}`, href: `${base}/tasks/${task.parent.number}` }] : []), { label: task.ref }]} />
      <Content wide>
        <DetailLayout
          main={
            edit && canWrite ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save task"
                  redirectTo={`${base}/tasks/${task.number}`}
                  cancelHref={`${base}/tasks/${task.number}`}
                  layout="grid"
                  initial={{
                    title: task.title,
                    description: task.description ?? "",
                    status: task.status,
                    priority: task.priority,
                    assigneeId: task.assigneeId ?? "",
                    dueDate: task.dueDate ?? "",
                    milestoneId: task.milestoneId ?? "",
                    labels: task.labels.map((l) => l.name).join(", "),
                    dependsOn: dependsOn.map((d) => d.ref).join(", "),
                  }}
                  fields={fields}
                />
              </div>
            ) : (
              <>
                <RecordTitle refLabel={task.ref} title={task.title} badges={<StatusBadge map={TASK_STATUS} value={task.status} />} author={task.author} createdAt={task.createdAt} editHref={canWrite ? "?edit=1" : null} />
                {task.parent ? (
                  <p className="mb-4 text-xs text-fg-subtle">
                    Subtask of{" "}
                    <Link href={`${base}/tasks/${task.parent.number}`} className="text-fg-muted hover:text-fg">
                      TASK-{String(task.parent.number).padStart(3, "0")} {task.parent.title}
                    </Link>
                  </p>
                ) : null}
                {task.description ? <Markdown projectSlug={project.slug}>{task.description}</Markdown> : <p className="text-sm text-fg-subtle italic">No description.</p>}
                {!task.parentId ? (
                  <DocSection title={`Subtasks ${subtasks.length ? `· ${done}/${subtasks.length}` : ""}`} action={canWrite ? <NewTaskDialog project={project.slug} fields={fields.filter((f) => !["dependsOn", "milestoneId"].includes(f.name))} parentId={task.id} label="Add subtask" /> : null}>
                    {subtasks.length ? (
                      <div className="rounded-lg border border-border bg-surface">
                        <Progress value={subtasks.length ? done / subtasks.length : 0} tone="green" className="h-1 rounded-none" />
                        <ul className="divide-y divide-border">
                          {subtasks.map((s) => (
                            <li key={s.id}>
                              <Link href={`${base}/tasks/${s.number}`} className="flex items-center gap-3 px-3 py-2 hover:bg-surface-2/60">
                                <TaskStatusIcon status={s.status} />
                                <span className="font-mono text-2xs text-fg-subtle">{s.ref}</span>
                                <span className="min-w-0 flex-1 truncate text-sm">{s.title}</span>
                                <Avatar user={s.assignee} size={18} />
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <p className="text-sm text-fg-subtle">Break the work down into subtasks.</p>
                    )}
                  </DocSection>
                ) : null}
                {dependsOn.length || blocks.length ? (
                  <DocSection title="Dependencies">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {[
                        ["Blocked by", dependsOn],
                        ["Blocks", blocks],
                      ].map(([label, list]) => (
                        <div key={label as string} className="rounded-lg border border-border bg-surface">
                          <div className="border-b border-border px-3 py-1.5 text-2xs tracking-wide text-fg-subtle uppercase">{label as string}</div>
                          {(list as typeof dependsOn).length ? (
                            <ul className="divide-y divide-border">
                              {(list as typeof dependsOn).map((d) => (
                                <li key={d.ref}>
                                  <Link href={`${base}/tasks/${d.number}`} className="flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-surface-2/60">
                                    <TaskStatusIcon status={d.status} /> <span className="font-mono text-2xs text-fg-subtle">{d.ref}</span>
                                    <span className="truncate">{d.title}</span>
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="px-3 py-2 text-xs text-fg-subtle">None</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </DocSection>
                ) : null}
                <Comments project={project.slug} target={{ type: "task", id: task.id }} comments={discussion.comments} files={discussion.files} />
              </>
            )
          }
          side={
            <>
              <SideSection title="Properties">
                <Prop label="Status">
                  <PropertySelect url={api} field="status" value={task.status} disabled={!canWrite} display="taskStatus" options={Object.entries(TASK_STATUS).map(([v, m]) => ({ value: v, label: m.label }))} />
                </Prop>
                <Prop label="Priority">
                  <PropertySelect url={api} field="priority" value={task.priority} disabled={!canWrite} display="priority" options={Object.entries(PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))} />
                </Prop>
                <Prop label="Assignee">
                  <PropertySelect url={api} field="assigneeId" value={task.assigneeId} nullable disabled={!canWrite} display="person" people={people} options={people.map((p) => ({ value: p.id, label: p.displayName }))} />
                </Prop>
                <Prop label="Milestone">
                  <PropertySelect url={api} field="milestoneId" value={task.milestoneId} nullable disabled={!canWrite} options={ms.milestones.map((m) => ({ value: m.id, label: `M${m.number} ${m.title}` }))} />
                </Prop>
                <Prop label="Due">
                  <span className="px-1.5 font-mono text-xs">{task.dueDate ? shortDate(task.dueDate) : "—"}</span>
                </Prop>
                <Prop label="Labels">
                  <div className="flex flex-wrap gap-1 px-1.5 py-1">{task.labels.length ? task.labels.map((l) => <LabelChip key={l.name} {...l} />) : <span className="text-fg-subtle">None</span>}</div>
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "task", id: task.id }} links={links} canEdit={canWrite} />
              {canWrite ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete ${task.ref}?`} redirectTo={`${base}/tasks`} className="self-start text-red">
                  Delete task
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
