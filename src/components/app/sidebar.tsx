import Link from "next/link";
import {
  Activity,
  ArrowLeft,
  Bell,
  Bot,
  Boxes,
  CheckSquare,
  CircleDot,
  FlaskConical,
  FolderTree,
  History,
  LayoutDashboard,
  ListChecks,
  Milestone,
  NotebookPen,
  Plus,
  Scale,
  Settings,
  Tag,
  Wrench,
  Building2,
  Keyboard,
} from "lucide-react";
import type { SessionUser } from "@/server/auth/session";
import type { ProjectNavCounts, ShellOrg, ShellProject } from "@/server/services/shell";
import { NavLink } from "./nav-link";
import { OrgSwitcher } from "./org-switcher";
import { UserMenu } from "./user-menu";
import { SearchButton } from "./shell-frame";
import { ProjectGlyph } from "./project-glyph";

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between px-2">
        <span className="text-2xs font-medium tracking-[0.08em] text-fg-subtle uppercase">{title}</span>
        {action}
      </div>
      <nav className="flex flex-col gap-px">{children}</nav>
    </div>
  );
}

export function Sidebar({
  user,
  orgs,
  activeOrg,
  projects,
  unread,
  project,
}: {
  user: SessionUser;
  orgs: ShellOrg[];
  activeOrg: ShellOrg | null;
  projects: ShellProject[];
  unread: number;
  project?: { slug: string; name: string; type: string; role: string; counts: ProjectNavCounts; forge: boolean } | null;
}) {
  const base = project ? `/project/${project.slug}` : "";
  return (
    <div className="flex h-full flex-col">
      <div className="px-2 pt-2">
        <OrgSwitcher orgs={orgs} active={activeOrg} />
      </div>
      <div className="px-3 pt-2">
        <SearchButton />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        {project ? (
          <>
            <div className="mt-3 flex flex-col gap-px">
              <Link href={activeOrg ? `/org/${activeOrg.slug}` : "/dashboard"} className="flex h-7 items-center gap-2 rounded-md px-2 text-xs text-fg-subtle hover:text-fg">
                <ArrowLeft className="size-3.5" /> All projects
              </Link>
              <div className="flex items-center gap-2 px-2 py-1.5">
                <ProjectGlyph type={project.type} />
                <span className="truncate text-sm font-semibold">{project.name}</span>
              </div>
            </div>
            <Section title="Project">
              <NavLink href={base} exact icon={<Boxes />}>
                Overview
              </NavLink>
              <NavLink href={`${base}/files`} icon={<FolderTree />} count={project.counts.files}>
                Files
              </NavLink>
              <NavLink href={`${base}/versions`} icon={<History />} count={project.counts.versions}>
                Versions
              </NavLink>
              <NavLink href={`${base}/issues`} icon={<CircleDot />} count={project.counts.issues}>
                Issues
              </NavLink>
              <NavLink href={`${base}/tasks`} icon={<CheckSquare />} count={project.counts.tasks}>
                Tasks
              </NavLink>
              <NavLink href={`${base}/milestones`} icon={<Milestone />}>
                Milestones
              </NavLink>
            </Section>
            <Section title="Engineering">
              <NavLink href={`${base}/requirements`} icon={<ListChecks />} count={project.counts.requirements}>
                Requirements
              </NavLink>
              <NavLink href={`${base}/tests`} icon={<FlaskConical />} count={project.counts.failingTests || project.counts.tests} tone={project.counts.failingTests ? "danger" : undefined}>
                Tests
              </NavLink>
              <NavLink href={`${base}/decisions`} icon={<Scale />} count={project.counts.decisions}>
                Decisions
              </NavLink>
              <NavLink href={`${base}/changes`} icon={<Wrench />} count={project.counts.changes}>
                Changes
              </NavLink>
              <NavLink href={`${base}/notebook`} icon={<NotebookPen />} count={project.counts.notebook}>
                Notebook
              </NavLink>
              <NavLink href={`${base}/releases`} icon={<Tag />} count={project.counts.releases}>
                Releases
              </NavLink>
            </Section>
            <Section title="Workspace">
              <NavLink href={`${base}/activity`} icon={<Activity />}>
                Activity
              </NavLink>
              <NavLink href={`${base}/forge`} icon={<Bot />}>
                Forge
              </NavLink>
              <NavLink href={`${base}/settings`} icon={<Settings />}>
                Settings
              </NavLink>
            </Section>
          </>
        ) : (
          <>
            <div className="mt-3 flex flex-col gap-px">
              <NavLink href="/dashboard" icon={<LayoutDashboard />}>
                Dashboard
              </NavLink>
              <NavLink href="/notifications" icon={<Bell />} count={unread}>
                Notifications
              </NavLink>
              <NavLink href="/organizations" exact icon={<Building2 />}>
                Organizations
              </NavLink>
            </div>
            {activeOrg ? (
              <Section
                title="Projects"
                action={
                  <Link href={`/project/new?org=${activeOrg.slug}`} className="rounded-sm p-0.5 text-fg-subtle hover:bg-surface-2 hover:text-fg" aria-label="New project">
                    <Plus className="size-3.5" />
                  </Link>
                }
              >
                {projects.length ? (
                  projects.map((p) => (
                    <NavLink key={p.id} href={`/project/${p.slug}`} icon={<ProjectGlyph type={p.type} small />}>
                      {p.name}
                    </NavLink>
                  ))
                ) : (
                  <Link href={`/project/new?org=${activeOrg.slug}`} className="rounded-md border border-dashed border-border px-2 py-2 text-xs text-fg-subtle hover:border-border-strong hover:text-fg-muted">
                    Create your first project
                  </Link>
                )}
              </Section>
            ) : null}
          </>
        )}
      </div>
      <div className="border-t border-border p-2">
        {project ? (
          <div className="mb-1 flex flex-col gap-px">
            <NavLink href="/dashboard" icon={<LayoutDashboard />}>
              Dashboard
            </NavLink>
            <NavLink href="/notifications" icon={<Bell />} count={unread}>
              Notifications
            </NavLink>
          </div>
        ) : null}
        <UserMenu user={{ displayName: user.displayName, username: user.username, email: user.email, avatarUrl: user.avatarUrl }} />
        <div className="mt-1 hidden items-center gap-1.5 px-2 text-2xs text-fg-subtle md:flex">
          <Keyboard className="size-3" /> Press <span className="font-mono">?</span> for shortcuts
        </div>
      </div>
    </div>
  );
}
