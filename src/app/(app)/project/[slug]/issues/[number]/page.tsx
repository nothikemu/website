import { requireUser } from "@/server/auth/current";
import { getIssue } from "@/server/services/issues";
import { listMilestones } from "@/server/services/milestones";
import { projectPeople } from "@/server/services/shared";
import { loadDiscussion } from "@/server/services/comments";
import { load, pageNumber } from "@/server/services/page-access";
import { Content } from "@/components/app/page-header";
import { DetailLayout, ProjectHeader, Prop, SideSection } from "@/components/project/shared";
import { RecordTitle } from "@/components/project/detail-header";
import { LinksPanel } from "@/components/project/links-panel";
import { Comments } from "@/components/project/comments";
import { ResourceForm } from "@/components/forms/resource-form";
import { PropertySelect, ActionButton } from "@/components/forms/actions";
import { issueFields } from "@/components/project/field-sets";
import { IssueStatusIcon, PriorityIcon, StatusBadge } from "@/components/app/status";
import { Avatar } from "@/components/ui/avatar";
import { LabelChip } from "@/components/ui/badge";
import { Markdown } from "@/components/ui/markdown";
import { Time } from "@/components/app/time";
import { ISSUE_STATUS, PRIORITY } from "@/lib/status";

export const metadata = { title: "Issue" };

export default async function IssuePage({ params, searchParams }: { params: Promise<{ slug: string; number: string }>; searchParams: Promise<{ edit?: string }> }) {
  const { slug, number } = await params;
  const { edit } = await searchParams;
  const user = await requireUser();
  const { access, issue, links } = await load(getIssue(user, slug, pageNumber(number)));
  const { project, org, role } = access;
  const [people, ms, discussion] = await Promise.all([projectPeople(access), listMilestones(user, slug), loadDiscussion(user, slug, "issue", issue.id)]);
  const base = `/project/${project.slug}`;
  const api = `/api/v1/projects/${project.slug}/issues/${issue.number}`;
  const canWrite = role !== "viewer";
  const closed = issue.status === "resolved" || issue.status === "closed";
  return (
    <>
      <ProjectHeader
        project={project}
        org={org}
        crumbs={[{ label: "Issues", href: `${base}/issues` }, { label: issue.ref }]}
        actions={
          canWrite ? (
            closed ? (
              <ActionButton size="sm" method="PATCH" url={api} body={{ status: "open" }} successMessage="Reopened">
                Reopen
              </ActionButton>
            ) : (
              <ActionButton size="sm" method="PATCH" url={api} body={{ status: "closed" }} successMessage={`${issue.ref} closed`}>
                Close issue
              </ActionButton>
            )
          ) : null
        }
      />
      <Content wide>
        <DetailLayout
          main={
            edit && canWrite ? (
              <div className="rounded-lg border border-border bg-surface p-5">
                <ResourceForm
                  method="PATCH"
                  action={api}
                  submitLabel="Save issue"
                  redirectTo={`${base}/issues/${issue.number}`}
                  cancelHref={`${base}/issues/${issue.number}`}
                  layout="grid"
                  initial={{ title: issue.title, description: issue.description ?? "", status: issue.status, priority: issue.priority, assigneeId: issue.assigneeId ?? "", milestoneId: issue.milestoneId ?? "", labels: issue.labels.map((l) => l.name).join(", ") }}
                  fields={issueFields(people, ms.milestones, false)}
                />
              </div>
            ) : (
              <>
                <RecordTitle
                  refLabel={issue.ref}
                  title={issue.title}
                  badges={<StatusBadge map={ISSUE_STATUS} value={issue.status} />}
                  author={issue.author}
                  createdAt={issue.createdAt}
                  editHref={canWrite ? `?edit=1` : null}
                  extra={issue.closedAt ? <span>· closed <Time date={issue.closedAt} /></span> : null}
                />
                {issue.description ? <Markdown projectSlug={project.slug}>{issue.description}</Markdown> : <p className="text-sm text-fg-subtle italic">No description.</p>}
                <Comments project={project.slug} target={{ type: "issue", id: issue.id }} comments={discussion.comments} files={discussion.files} />
              </>
            )
          }
          side={
            <>
              <SideSection title="Properties">
                <Prop label="Status">
                  <PropertySelect
                    url={api}
                    field="status"
                    value={issue.status}
                    disabled={!canWrite}
                    options={Object.entries(ISSUE_STATUS).map(([v, m]) => ({ value: v, label: m.label }))}
                    display="issueStatus"
                  />
                </Prop>
                <Prop label="Priority">
                  <PropertySelect
                    url={api}
                    field="priority"
                    value={issue.priority}
                    disabled={!canWrite}
                    options={Object.entries(PRIORITY).map(([v, m]) => ({ value: v, label: m.label }))}
                    display="priority"
                  />
                </Prop>
                <Prop label="Assignee">
                  <PropertySelect
                    url={api}
                    field="assigneeId"
                    value={issue.assigneeId}
                    nullable
                    disabled={!canWrite}
                    options={people.map((p) => ({ value: p.id, label: p.displayName }))}
                    display="person"
                    people={people}
                  />
                </Prop>
                <Prop label="Milestone">
                  <PropertySelect
                    url={api}
                    field="milestoneId"
                    value={issue.milestoneId}
                    nullable
                    disabled={!canWrite}
                    options={ms.milestones.map((m) => ({ value: m.id, label: `M${m.number} ${m.title}` }))}
                    
                  />
                </Prop>
                <Prop label="Labels">
                  <div className="flex flex-wrap gap-1 px-1.5 py-1">{issue.labels.length ? issue.labels.map((l) => <LabelChip key={l.name} {...l} />) : <span className="text-fg-subtle">None</span>}</div>
                </Prop>
              </SideSection>
              <LinksPanel project={project.slug} source={{ type: "issue", id: issue.id }} links={links} canEdit={canWrite} />
              {canWrite && (role === "admin" || issue.createdBy === user.id) ? (
                <ActionButton variant="ghost" size="xs" method="DELETE" url={api} confirm={`Delete ${issue.ref} permanently?`} redirectTo={`${base}/issues`} className="self-start text-red">
                  Delete issue
                </ActionButton>
              ) : null}
            </>
          }
        />
      </Content>
    </>
  );
}
