"use client";

import { Command } from "cmdk";
import { Dialog as D } from "radix-ui";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Bell,
  Bot,
  Boxes,
  Building2,
  CheckSquare,
  CircleDot,
  FileText,
  FlaskConical,
  FolderTree,
  GitCommitHorizontal,
  History,
  LayoutDashboard,
  ListChecks,
  Milestone,
  NotebookPen,
  Plus,
  Scale,
  Search,
  Settings,
  SunMoon,
  Tag,
  Upload,
  UserPlus,
  Wrench,
} from "lucide-react";
import { api } from "@/lib/api-client";
import { Avatar } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/kbd";
import type { ShellOrg, ShellProject } from "@/server/services/shell";

type Hit = { id: string; entityType: string; ref: string | null; title: string; snippet: string | null; url: string; projectId: string | null };
type Person = { id: string; username: string; displayName: string; avatarUrl: string | null };

const TYPE_ICON: Record<string, React.ReactNode> = {
  project: <Boxes />,
  file: <FileText />,
  issue: <CircleDot />,
  task: <CheckSquare />,
  requirement: <ListChecks />,
  test: <FlaskConical />,
  decision: <Scale />,
  change: <Wrench />,
  notebook_entry: <NotebookPen />,
  release: <Tag />,
  snapshot: <History />,
  commit: <GitCommitHorizontal />,
};
const TYPE_LABEL: Record<string, string> = {
  project: "Project",
  file: "File",
  issue: "Issue",
  task: "Task",
  requirement: "Requirement",
  test: "Test",
  decision: "Decision",
  change: "Change",
  notebook_entry: "Notebook",
  release: "Release",
  snapshot: "Version",
  commit: "Commit",
};

export function CommandPalette({
  open,
  onOpenChange,
  projects,
  orgs,
  activeOrg,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  projects: ShellProject[];
  orgs: ShellOrg[];
  activeOrg: ShellOrg | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);

  const projectSlug = /^\/project\/([^/]+)/.exec(pathname)?.[1];
  const project = projects.find((p) => p.slug === projectSlug);
  const projectById = useMemo(() => new Map(projects.map((p) => [p.id, p])), [projects]);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) {
      setQuery("");
      setHits([]);
      setPeople([]);
    }
  }

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const id = ++seq.current;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await api<{ hits: Hit[]; people: Person[] }>("GET", `/api/v1/search?q=${encodeURIComponent(q)}&limit=20`);
        if (id === seq.current) {
          setHits(res.hits);
          setPeople(res.people);
        }
      } catch {
        // search is best-effort in the palette
      } finally {
        if (id === seq.current) setLoading(false);
      }
    }, 120);
    return () => clearTimeout(t);
  }, [query]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };
  const run = (fn: () => void) => {
    onOpenChange(false);
    fn();
  };

  const base = project ? `/project/${project.slug}` : null;
  const searching = query.trim().length >= 2;
  const item = "flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-sm text-fg-muted data-[selected=true]:bg-surface-2 data-[selected=true]:text-fg [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-fg-subtle";
  const group = "px-1.5 pb-1 [&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:pt-2.5 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-fg-subtle [&_[cmdk-group-heading]]:uppercase";

  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-fade-in" />
        <D.Content className="fixed top-[14vh] left-1/2 z-50 w-[calc(100vw-24px)] max-w-[640px] -translate-x-1/2 overflow-hidden rounded-lg border border-border-strong bg-surface shadow-[var(--shadow)] data-[state=open]:animate-slide-up">
          <D.Title className="sr-only">Command palette</D.Title>
          <D.Description className="sr-only">Search Forgebase or run a command</D.Description>
          <Command loop shouldFilter={query.trim().length < 2} label="Command palette">
            <div className="flex items-center gap-2.5 border-b border-border px-3.5">
              <Search className="size-4 text-fg-subtle" />
              <Command.Input
                value={query}
                onValueChange={setQuery}
                autoFocus
                placeholder={project ? `Search ${project.name} and everywhere else, or type a command…` : "Search everything, or type a command…"}
                className="h-12 flex-1 bg-transparent text-[15px] text-fg outline-none placeholder:text-fg-subtle"
              />
              {loading ? <span className="font-mono text-2xs text-fg-subtle">searching…</span> : <Kbd>esc</Kbd>}
            </div>
            <Command.List className="max-h-[min(60vh,440px)] overflow-y-auto overscroll-contain py-1">
              <Command.Empty className="px-4 py-10 text-center text-sm text-fg-muted">
                {query.trim().length >= 2 && !loading ? "No results. Try a reference like REQ-004 or a file name." : "Type to search."}
              </Command.Empty>

              {searching && hits.length > 0 ? (
                <Command.Group heading="Results" className={group}>
                  {hits.map((h) => {
                    const p = h.projectId ? projectById.get(h.projectId) : null;
                    return (
                      <Command.Item key={h.id} value={`hit-${h.id}`} onSelect={() => (h.url.startsWith("http") ? window.open(h.url, "_blank", "noopener") : go(h.url))} className={item}>
                        {TYPE_ICON[h.entityType] ?? <ArrowRight />}
                        {h.ref ? <span className="w-[72px] shrink-0 font-mono text-xs text-fg-subtle">{h.ref}</span> : null}
                        <span className="min-w-0 flex-1 truncate text-fg">{h.title}</span>
                        <span className="hidden shrink-0 text-xs text-fg-subtle sm:inline">{p && h.entityType !== "project" ? p.name : TYPE_LABEL[h.entityType]}</span>
                      </Command.Item>
                    );
                  })}
                </Command.Group>
              ) : null}
              {searching && people.length > 0 ? (
                <Command.Group heading="People" className={group}>
                  {people.map((u) => (
                    <Command.Item key={u.id} value={`person-${u.id}`} onSelect={() => go(`/dashboard`)} className={item}>
                      <Avatar user={u} size={18} />
                      <span className="text-fg">{u.displayName}</span>
                      <span className="font-mono text-xs text-fg-subtle">@{u.username}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              ) : null}

              {query.trim().length < 2 ? (
                <>
                  {base ? (
                    <Command.Group heading={`Create in ${project!.name}`} className={group}>
                      <Command.Item onSelect={() => go(`${base}/issues/new`)} className={item} keywords={["new", "bug"]}>
                        <Plus /> Create issue <Shortcut k="C" />
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/tasks?new=1`)} className={item} keywords={["new", "todo"]}>
                        <Plus /> Create task
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/files?upload=1`)} className={item} keywords={["cad", "step", "file", "add"]}>
                        <Upload /> Upload files
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/requirements/new`)} className={item} keywords={["new", "req"]}>
                        <Plus /> Create requirement
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/tests/new`)} className={item} keywords={["new", "verification"]}>
                        <Plus /> Create test
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/decisions/new`)} className={item} keywords={["new", "adr"]}>
                        <Plus /> Record decision
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/changes/new`)} className={item} keywords={["new", "eco", "ecr", "change"]}>
                        <Plus /> File engineering change
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/notebook/new`)} className={item} keywords={["journal", "log", "entry"]}>
                        <Plus /> Write notebook entry
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/versions?new=1`)} className={item} keywords={["snapshot", "version"]}>
                        <Plus /> Create project version
                      </Command.Item>
                      <Command.Item onSelect={() => go(`${base}/releases/new`)} className={item} keywords={["tag", "ship"]}>
                        <Plus /> Draft release
                      </Command.Item>
                    </Command.Group>
                  ) : null}
                  {base ? (
                    <Command.Group heading="Go to" className={group}>
                      {[
                        ["Overview", "", <Boxes key="o" />, "G O"],
                        ["Files", "/files", <FolderTree key="f" />, "G F"],
                        ["Issues", "/issues", <CircleDot key="i" />, "G I"],
                        ["Tasks", "/tasks", <CheckSquare key="t" />, "G T"],
                        ["Requirements", "/requirements", <ListChecks key="r" />, "G R"],
                        ["Tests", "/tests", <FlaskConical key="x" />, "G E"],
                        ["Decisions", "/decisions", <Scale key="d" />, "G D"],
                        ["Engineering changes", "/changes", <Wrench key="c" />, ""],
                        ["Notebook", "/notebook", <NotebookPen key="n" />, "G N"],
                        ["Milestones", "/milestones", <Milestone key="m" />, ""],
                        ["Versions", "/versions", <History key="v" />, ""],
                        ["Releases", "/releases", <Tag key="rl" />, ""],
                        ["Activity", "/activity", <Activity key="a" />, "G A"],
                        ["Forge assistant", "/forge", <Bot key="fg" />, ""],
                        ["Project settings", "/settings", <Settings key="s" />, ""],
                      ].map(([label, path, icon, k]) => (
                        <Command.Item key={label as string} value={`goto ${label}`} onSelect={() => go(`${base}${path}`)} className={item}>
                          {icon}
                          {label}
                          {k ? <Shortcut k={k as string} /> : null}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                  <Command.Group heading="General" className={group}>
                    <Command.Item onSelect={() => go("/dashboard")} className={item}>
                      <LayoutDashboard /> Dashboard <Shortcut k="G H" />
                    </Command.Item>
                    <Command.Item onSelect={() => go("/notifications")} className={item}>
                      <Bell /> Notifications
                    </Command.Item>
                    <Command.Item onSelect={() => go(activeOrg ? `/project/new?org=${activeOrg.slug}` : "/organizations/new")} className={item} keywords={["new"]}>
                      <Plus /> Create project
                    </Command.Item>
                    {activeOrg ? (
                      <Command.Item onSelect={() => go(`/org/${activeOrg.slug}/members?invite=1`)} className={item} keywords={["add", "member", "team"]}>
                        <UserPlus /> Invite teammate
                      </Command.Item>
                    ) : null}
                    <Command.Item onSelect={() => go("/organizations/new")} className={item}>
                      <Building2 /> Create organization
                    </Command.Item>
                    <Command.Item onSelect={() => run(() => setTheme(resolvedTheme === "dark" ? "light" : "dark"))} className={item} keywords={["dark", "light", "mode"]}>
                      <SunMoon /> Toggle theme
                    </Command.Item>
                    <Command.Item onSelect={() => go("/settings")} className={item} keywords={["profile", "account", "preferences"]}>
                      <Settings /> Settings
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Open project" className={group}>
                    {projects.map((p) => (
                      <Command.Item key={p.id} value={`project ${p.name} ${p.slug}`} onSelect={() => go(`/project/${p.slug}`)} className={item}>
                        <Boxes />
                        <span className="flex-1 truncate">{p.name}</span>
                        <span className="font-mono text-2xs text-fg-subtle">{p.orgSlug}</span>
                      </Command.Item>
                    ))}
                  </Command.Group>
                  {orgs.length > 1 ? (
                    <Command.Group heading="Switch organization" className={group}>
                      {orgs.map((o) => (
                        <Command.Item
                          key={o.id}
                          value={`org ${o.name}`}
                          onSelect={() =>
                            run(async () => {
                              await api("POST", `/api/v1/orgs/${o.slug}/switch`).catch(() => {});
                              router.push(`/org/${o.slug}`);
                              router.refresh();
                            })
                          }
                          className={item}
                        >
                          <Building2 /> {o.name}
                        </Command.Item>
                      ))}
                    </Command.Group>
                  ) : null}
                </>
              ) : null}
            </Command.List>
            <div className="flex items-center gap-3 border-t border-border bg-bg-subtle px-3.5 py-2 text-2xs text-fg-subtle">
              <span className="flex items-center gap-1">
                <Kbd>↑</Kbd>
                <Kbd>↓</Kbd> navigate
              </span>
              <span className="flex items-center gap-1">
                <Kbd>↵</Kbd> open
              </span>
              <span className="ml-auto">Search covers files, issues, requirements, tests, decisions, notebook & more</span>
            </div>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

function Shortcut({ k }: { k: string }) {
  return (
    <span className="ml-auto flex gap-1">
      {k.split(" ").map((c, i) => (
        <Kbd key={i}>{c}</Kbd>
      ))}
    </span>
  );
}
