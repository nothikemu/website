import Link from "next/link";
import { ArrowRight, Check, FileClock, GitCommitHorizontal, KeyRound, Lock, ScrollText, ShieldCheck, Webhook } from "lucide-react";
import { getCurrentUser } from "@/server/auth/current";
import { Logo } from "@/components/app/logo";
import { Shot } from "@/components/marketing/shot";
import { ProviderIcon } from "@/components/app/provider-icon";
import { buttonClass } from "@/components/ui/button";
import { PLANS, type PlanId } from "@/lib/plans";

export const metadata = { title: { absolute: "Forgebase — the engineering workspace for teams that build real things" } };

const CHAIN: [string, string, string][] = [
  ["REQ-009", "Requirement", "Chassis withstands 500 N"],
  ["DEC-004", "Decision", "Machine brackets from 6061-T6"],
  ["front-bracket.step v2", "CAD revision", "5 mm, 45 mm hole spacing"],
  ["drive-module.stl v2", "Design", "125 mm wheels, 27:1 gearing"],
  ["TEST-001 #1", "Test", "Failed at 410 N"],
  ["CHANGE-001", "Fix", "Reinforced front bracket"],
  ["TEST-001 #2", "Result", "Passed at 620 N"],
  ["v0.2", "Release", "Drive system"],
];

export default async function Landing() {
  const user = await getCurrentUser();
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-30 border-b border-border/60 bg-bg/80 backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-5">
          <Link href="/" aria-label="Forgebase">
            <Logo />
          </Link>
          <nav className="hidden items-center gap-5 text-sm text-fg-muted md:flex">
            <a href="#product" className="hover:text-fg">Product</a>
            <a href="#workflow" className="hover:text-fg">Workflow</a>
            <a href="#integrations" className="hover:text-fg">Integrations</a>
            <a href="#security" className="hover:text-fg">Security</a>
            <a href="#pricing" className="hover:text-fg">Pricing</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {user ? (
              <Link href="/dashboard" className={buttonClass("primary", "sm")}>
                Open dashboard
              </Link>
            ) : (
              <>
                <Link href="/login" className={buttonClass("ghost", "sm")}>
                  Sign in
                </Link>
                <Link href="/signup" className={buttonClass("primary", "sm")}>
                  Get started
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-grid relative border-b border-border">
        <div className="mx-auto max-w-[1200px] px-5 pt-16 pb-12 md:pt-24">
          <p className="font-mono text-xs text-accent">FOR ROBOTICS & HARDWARE TEAMS</p>
          <h1 className="mt-4 max-w-3xl text-[2.1rem] leading-[1.08] font-semibold tracking-[-0.035em] text-fg md:text-[3.25rem]">The engineering workspace for teams that build real things.</h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-fg-muted md:text-lg">
            Forgebase keeps your CAD, firmware, requirements, tests, decisions and lab notebook in one versioned workspace — and links them, so you can trace any part of your robot from the requirement that demanded it to the test that proved it.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/signup" className={buttonClass("primary", "md", "h-10 px-4")}>
              Start building — free <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className={buttonClass("secondary", "md", "h-10 px-4")}>
              Explore the demo workspace
            </Link>
            <span className="font-mono text-xs text-fg-subtle">no credit card · 3 projects free</span>
          </div>
          <Shot src="/screenshots/overview.jpg" alt="Forgebase project overview for an autonomous cargo robot" className="mt-14" priority url="forgebase / forge-robotics / cargo-transport-robot" />
        </div>
      </section>

      {/* Problem */}
      <section className="border-b border-border">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-20 md:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Your robot&apos;s history is spread across ten tools.</h2>
            <p className="mt-4 text-fg-muted">
              The firmware lives in GitHub. The CAD is in someone&apos;s Drive. Test data sits in a spreadsheet, the reason the bracket changed is buried in Discord, and the engineering notebook is a PDF nobody can search. When a part fails three weeks before competition, nobody can answer the simple questions.
            </p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border font-mono text-sm sm:grid-cols-2">
            {[
              ["Which revision of the bracket is on the robot?", "files · versions"],
              ["Why did we choose differential drive?", "decisions"],
              ["What changed after the load test failed?", "change log"],
              ["Is REQ-002 actually verified?", "traceability"],
              ["What did we measure on Tuesday?", "notebook"],
              ["Which commit shipped in v0.2?", "releases"],
            ].map(([q, a]) => (
              <div key={q} className="bg-surface p-4">
                <p className="text-fg">{q}</p>
                <p className="mt-2 text-xs text-accent">→ {a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Product */}
      <section id="product" className="border-b border-border">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <p className="font-mono text-xs text-accent">THE PRODUCT</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.02em]">One workspace per physical system. Every artifact versioned, owned, and connected.</h2>
          {[
            {
              t: "Traceability, not just storage",
              d: "Requirements are verified by tests, implemented by CAD revisions and commits, affected by issues and engineering changes. Verification status is computed from real test results — never ticked by hand.",
              img: "traceability",
              url: "requirements · traceability matrix",
            },
            {
              t: "Files with real version history",
              d: "Upload STEP, STL, KiCad, firmware, CSV logs and video. Every upload of the same path is a new revision. Line diffs for code, metadata and checksum comparison for CAD, a 3D viewer for meshes, and project-wide versions you can compare and restore.",
              img: "diff",
              url: "files / firmware / src / main.cpp",
            },
            {
              t: "Tests that remember every run",
              d: "Define the criterion once, record each run with measurements and attachments — by hand or from CI via a signed webhook. Failures notify owners and flow into the requirement they verify.",
              img: "test",
              url: "tests / TEST-001",
            },
            {
              t: "An engineering change log and notebook",
              d: "CHANGE records capture reason, parameter-level changes and results. Notebook entries are dated, attributed and immutable — amendments are kept as revisions.",
              img: "change",
              url: "changes / CHANGE-001",
            },
          ].map((f, i) => (
            <div key={f.t} className={`mt-16 grid items-center gap-8 ${i % 2 ? "lg:grid-cols-[1fr_360px]" : "lg:grid-cols-[360px_1fr]"}`}>
              <div className={i % 2 ? "lg:order-2" : ""}>
                <h3 className="text-lg font-semibold tracking-[-0.01em]">{f.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-fg-muted">{f.d}</p>
              </div>
              <Shot src={`/screenshots/${f.img}.jpg`} alt={f.t} url={f.url} className={i % 2 ? "lg:order-1" : ""} />
            </div>
          ))}
          <div className="mt-16 grid gap-4 md:grid-cols-3">
            {[
              ["cad", "3D preview for STL meshes; header metadata extracted from STEP, KiCad and PDF."],
              ["tasks", "Linear-style tasks with subtasks, dependencies and milestones that close themselves."],
              ["palette", "⌘K searches everything — issues, tests, decisions, files, notebook — and runs commands."],
            ].map(([img, d]) => (
              <figure key={img}>
                <Shot src={`/screenshots/${img}.jpg`} alt={d!} />
                <figcaption className="mt-3 text-sm text-fg-muted">{d}</figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="border-b border-border bg-bg-subtle">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <p className="font-mono text-xs text-accent">HOW IT WORKS</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.02em]">Follow one failure from requirement to release.</h2>
          <p className="mt-3 max-w-2xl text-sm text-fg-muted">This is the real chain in the demo workspace. Every arrow is a link Forgebase recorded — mostly automatically, from references like <code className="font-mono">REQ-009</code> in commits, comments and notebook entries.</p>
          <ol className="mt-10 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {CHAIN.map(([ref, kind, title], i) => (
              <li key={ref} className="relative rounded-lg border border-border bg-surface p-4">
                <div className="flex items-center justify-between">
                  <span className="text-2xs tracking-wide text-fg-subtle uppercase">{kind}</span>
                  <span className="font-mono text-2xs text-fg-subtle">{String(i + 1).padStart(2, "0")}</span>
                </div>
                <div className={`mt-2 font-mono text-sm ${ref.includes("#1") ? "text-red" : ref.includes("#2") ? "text-green" : "text-fg"}`}>{ref}</div>
                <div className="mt-1 text-sm text-fg-muted">{title}</div>
              </li>
            ))}
          </ol>
          <div className="mt-12 grid gap-6 text-sm md:grid-cols-3">
            {[
              ["1 · Capture", "Create an organization, a project, and upload what you already have. Folders for CAD, electronics, firmware, simulation and tests are set up for you."],
              ["2 · Connect", "Write requirements, define tests, record decisions. Reference anything by ID — links appear in both directions."],
              ["3 · Prove", "Record test runs, file changes when parts fail, cut releases. Release notes are generated from what actually happened."],
            ].map(([t, d]) => (
              <div key={t}>
                <h3 className="font-semibold">{t}</h3>
                <p className="mt-1.5 text-fg-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Integrations */}
      <section id="integrations" className="border-b border-border">
        <div className="mx-auto grid max-w-[1200px] gap-10 px-5 py-20 md:grid-cols-[1fr_1.2fr]">
          <div>
            <p className="font-mono text-xs text-accent">INTEGRATIONS</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Keeps working with the tools you already use.</h2>
            <p className="mt-3 text-sm text-fg-muted">An internal event system turns every action into an event that integrations, notifications and the activity feed subscribe to. A REST API with personal access tokens covers everything the UI does.</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2">
            {[
              [<ProviderIcon key="g" provider="github" />, "GitHub", "Link repositories, import commits, and connect them to issues with “fixes ISS-012”."],
              [<ProviderIcon key="d" provider="discord" />, "Discord", "Post failed tests, releases and engineering changes to your team channel."],
              [<ProviderIcon key="s" provider="slack" />, "Slack", "The same project events, through an incoming webhook."],
              [<span key="w" className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-2"><Webhook className="size-4" /></span>, "CI & test rigs", "Signed webhooks record test runs and measurements from your pipeline or HIL rig."],
              [<ProviderIcon key="gd" provider="google_drive" />, "Google Drive", "Import drawings from shared drives. Coming soon."],
              [<span key="a" className="flex size-7 items-center justify-center rounded-md border border-border bg-surface-2"><KeyRound className="size-4" /></span>, "REST API", "Versioned /api/v1 with validation schemas and token auth."],
            ].map(([icon, name, d]) => (
              <div key={name as string} className="bg-surface p-4">
                <div className="flex items-center gap-2.5 text-sm font-medium">
                  {icon}
                  {name}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-fg-muted">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security */}
      <section id="security" className="border-b border-border bg-bg-subtle">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <p className="font-mono text-xs text-accent">SECURITY</p>
          <h2 className="mt-2 max-w-2xl text-2xl font-semibold tracking-[-0.02em]">Built like infrastructure, because your designs are your team&apos;s work.</h2>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {[
              [Lock, "Organization isolation", "Every query is scoped through one authorization service. IDs from another organization return 404 — tested on every endpoint."],
              [ShieldCheck, "Roles that mean something", "Owner, admin, engineer and viewer, plus private projects with per-project roles."],
              [FileClock, "Signed, short-lived file URLs", "Files go straight to object storage via presigned URLs that expire in minutes. Uploads are type-checked by content, not just extension."],
              [KeyRound, "Sessions done properly", "scrypt password hashing, httpOnly SameSite cookies, CSRF origin checks, rate-limited auth."],
              [ScrollText, "Audit log", "Logins, membership and permission changes, deletions and integration changes — with IP and request ID."],
              [GitCommitHorizontal, "Immutable history", "File revisions, test runs and notebook timestamps are never rewritten. Restores create new versions."],
            ].map(([Icon, t, d]) => {
              const I = Icon as typeof Lock;
              return (
                <div key={t as string}>
                  <I className="size-5 text-fg-muted" strokeWidth={1.6} />
                  <h3 className="mt-3 text-sm font-semibold">{t as string}</h3>
                  <p className="mt-1 text-sm text-fg-muted">{d as string}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-b border-border">
        <div className="mx-auto max-w-[1200px] px-5 py-20">
          <p className="font-mono text-xs text-accent">PRICING</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Free for student teams getting started.</h2>
          <p className="mt-2 text-sm text-fg-muted">Paid plans are in beta and not yet billed.</p>
          <div className="mt-8 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            {(Object.keys(PLANS) as PlanId[]).map((id) => {
              const p = PLANS[id];
              return (
                <div key={id} className={`flex flex-col rounded-lg border p-5 ${id === "team" ? "border-accent bg-surface" : "border-border bg-surface"}`}>
                  <h3 className="text-sm font-semibold">{p.name}</h3>
                  <p className="mt-1 font-mono text-lg">{p.price}</p>
                  <ul className="mt-4 flex-1 space-y-2 text-sm text-fg-muted">
                    {p.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <Check className="mt-0.5 size-3.5 shrink-0 text-green" /> {h}
                      </li>
                    ))}
                  </ul>
                  <Link href={id === "enterprise" ? "mailto:sales@forgebase.dev" : "/signup"} className={buttonClass(id === "team" ? "primary" : "secondary", "sm", "mt-5 justify-center")}>
                    {id === "enterprise" ? "Contact us" : "Get started"}
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="bg-grid">
        <div className="mx-auto max-w-[1200px] px-5 py-24 text-center">
          <h2 className="text-3xl font-semibold tracking-[-0.03em]">Know why every part of your robot is the way it is.</h2>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/signup" className={buttonClass("primary", "md", "h-10 px-4")}>
              Create your workspace <ArrowRight className="size-4" />
            </Link>
            <Link href="/login" className={buttonClass("secondary", "md", "h-10 px-4")}>
              Try the demo
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-[1200px] flex-wrap items-center gap-4 px-5 py-6 text-xs text-fg-subtle">
          <Logo className="scale-90" />
          <span>The engineering workspace for teams that build real things.</span>
          <span className="ml-auto font-mono">/api/health · /api/v1</span>
        </div>
      </footer>
    </div>
  );
}
