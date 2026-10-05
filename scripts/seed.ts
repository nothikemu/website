/**
 * Development / demo seed — "Forge Robotics" building an Autonomous Cargo Transport Robot.
 *
 * All demo records live in an organization flagged `is_demo = true`, owned by
 * users flagged `is_demo = true`, so they are clearly separated from real data
 * and can be wiped with `npm run db:reset-demo`. Everything is created through
 * the same services the API uses (activity, search, links, versions are real),
 * then timestamps are back-dated to tell a six-week engineering story.
 *
 * Run with: npm run db:seed   (refuses to run when NODE_ENV=production unless SEED_ALLOW_PRODUCTION=1)
 */
import "dotenv/config";
import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, closeDb } from "@/server/db";
import { organizationMembers, organizations, users, projects } from "@/server/db/schema";
import * as v from "@/lib/validation";
import { hashPassword } from "@/server/auth/password";
import { createOrganization } from "@/server/services/organizations";
import { createProject } from "@/server/services/projects";
import { putFileFromServer } from "@/server/services/files";
import { createSnapshot } from "@/server/services/snapshots";
import { createMilestone } from "@/server/services/milestones";
import { createIssue, updateIssue } from "@/server/services/issues";
import { createTask } from "@/server/services/tasks";
import { createRequirement } from "@/server/services/requirements";
import { createTest, recordRun } from "@/server/services/tests";
import { createDecision } from "@/server/services/decisions";
import { createChange } from "@/server/services/changes";
import { createEntry } from "@/server/services/notebook";
import { createRelease } from "@/server/services/releases";
import { createComment, toggleReaction } from "@/server/services/comments";
import { createLink } from "@/server/services/links";
import { ingestCommits } from "@/server/services/integrations";
import { createEndpoint } from "@/server/services/webhooks";
import { requireProject } from "@/server/authz";
import { Raster } from "./lib/png";
import { boxPoints, bracketStl, driveModuleStl, powerPdf, stepFile } from "./lib/cad";

const DEMO_PASSWORD = "forgebase-demo";
const TABLES = [
  "activities", "issues", "tasks", "requirements", "tests", "test_runs", "decisions", "changes", "notebook_entries",
  "notebook_revisions", "releases", "snapshots", "files", "file_versions", "comments", "notifications", "folders", "milestones", "links",
];

const NO_UPDATED = new Set(["notebook_entries", "activities", "test_runs", "notebook_revisions", "snapshots", "file_versions", "comments", "notifications", "links"]);
const EXTRA_TIMES: [string, string][] = [
  ["test_runs", "run_at"], ["tests", "last_run_at"], ["issues", "closed_at"], ["tasks", "completed_at"], ["decisions", "decided_at"],
  ["changes", "implemented_at"], ["releases", "published_at"], ["milestones", "closed_at"], ["notebook_entries", "edited_at"], ["comments", "edited_at"],
  ["integrations", "last_synced_at"], ["projects", "updated_at"], ["organizations", "updated_at"],
];

// Story clock: six weeks of work ending today.
// Anchored so that "day 41" is today — the demo always looks current.
const BASE = (() => {
  const d = new Date();
  d.setUTCHours(15, 0, 0, 0);
  return d.getTime() - 41 * 86400_000;
})();
const day = (d: number, h = 0) => new Date(BASE + d * 86400_000 + h * 3600_000);
const ds = (d: number) => day(d).toISOString().slice(0, 10);

/** Run fn, then back-date every row it created to `when`. */
async function at<T>(when: Date, fn: () => Promise<T>): Promise<T> {
  const t0 = new Date(Date.now() - 5);
  const r = await fn();
  const iso = when.toISOString();
  const since = t0.toISOString();
  for (const t of TABLES) {
    await db.execute(sql.raw(`update ${t} set created_at = '${iso}' where created_at >= '${since}'`));
    if (!NO_UPDATED.has(t)) await db.execute(sql.raw(`update ${t} set updated_at = '${iso}' where updated_at >= '${since}'`));
  }
  for (const [t, c] of EXTRA_TIMES) await db.execute(sql.raw(`update ${t} set ${c} = '${iso}' where ${c} >= '${since}'`));
  await new Promise((res) => setTimeout(res, 6));
  return r;
}

async function resetDemo() {
  const demoUsers = db.select({ id: users.id }).from(users).where(eq(users.isDemo, true));
  const demoOrgs = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(sql`${organizations.isDemo} = true or ${organizations.createdBy} in ${demoUsers}`);
  if (demoOrgs.length) await db.delete(organizations).where(inArray(organizations.id, demoOrgs.map((o) => o.id)));
  await db.delete(users).where(eq(users.isDemo, true));
  console.log(`✓ removed ${demoOrgs.length} demo organization(s) and demo users`);
}

async function mkUser(email: string, username: string, displayName: string, extra: Partial<typeof users.$inferInsert> = {}) {
  const [u] = await db
    .insert(users)
    .values({ email, username, displayName, passwordHash: await hashPassword(DEMO_PASSWORD), emailVerifiedAt: new Date(), isDemo: true, timezone: "America/Chicago", ...extra })
    .returning();
  return u!;
}

const csv = (rows: (string | number)[][]) => Buffer.from(rows.map((r) => r.join(",")).join("\n") + "\n");

function loadCurve(peak: number, failAt: number | null) {
  const rows: (string | number)[][] = [["time_s", "load_N", "deflection_mm", "strain_ue"]];
  for (let i = 0; i <= 40; i++) {
    const load = Math.round((peak * i) / 40);
    const failed = failAt !== null && load > failAt;
    const defl = failed ? 2.1 + (load - failAt!) * 0.04 : (load / peak) * 1.9 + Math.sin(i) * 0.02;
    rows.push([(i * 0.5).toFixed(1), failed ? Math.round(failAt! * 0.6) : load, defl.toFixed(3), Math.round(defl * 410)]);
    if (failed && i > 34) break;
  }
  return rows;
}

function plotPng(a: (string | number)[][], b: (string | number)[][]) {
  const W = 880;
  const H = 480;
  const r = new Raster(W, H, [20, 21, 24]);
  const L = 70, R = W - 30, T = 40, B = H - 60;
  for (let i = 0; i <= 10; i++) {
    const y = T + ((B - T) * i) / 10;
    r.line(L, y, R, y, [40, 42, 47]);
    const x = L + ((R - L) * i) / 10;
    r.line(x, T, x, B, [40, 42, 47]);
  }
  r.line(L, B, R, B, [120, 124, 132], 1.5);
  r.line(L, T, L, B, [120, 124, 132], 1.5);
  // 500 N requirement line
  const yReq = B - ((B - T) * 500) / 700;
  for (let x = L; x < R; x += 10) r.line(x, yReq, x + 5, yReq, [227, 166, 59], 1.5);
  const plot = (rows: (string | number)[][], c: [number, number, number]) => {
    const pts = rows.slice(1).map((row) => [L + ((R - L) * Number(row[2])) / 4, B - ((B - T) * Number(row[1])) / 700] as const);
    for (let i = 1; i < pts.length; i++) r.line(pts[i - 1]![0], pts[i - 1]![1], pts[i]![0], pts[i]![1], c, 2.5);
    const last = pts[pts.length - 1]!;
    r.circle(last[0], last[1], 5, c, true);
  };
  plot(a, [239, 91, 95]);
  plot(b, [63, 182, 139]);
  r.rect(L + 14, T + 12, 14, 4, [239, 91, 95]);
  r.rect(L + 14, T + 28, 14, 4, [63, 182, 139]);
  r.rect(L + 14, T + 44, 14, 4, [227, 166, 59]);
  return r.png();
}

function roverTopPng() {
  const r = new Raster(720, 520, [246, 246, 244]);
  for (let x = 0; x < 720; x += 24) r.line(x, 0, x, 520, [232, 232, 228]);
  for (let y = 0; y < 520; y += 24) r.line(0, y, 720, y, [232, 232, 228]);
  r.rect(160, 110, 400, 300, [60, 63, 70]);
  r.rect(170, 120, 380, 280, [138, 143, 152]);
  r.rect(260, 180, 200, 160, [212, 85, 15]);
  for (const [x, y] of [[120, 100], [520, 100], [120, 340], [520, 340]] as const) r.rect(x, y, 80, 80, [23, 24, 27]);
  r.rect(540, 230, 40, 60, [63, 182, 139]);
  r.line(160, 460, 560, 460, [86, 90, 98], 2);
  r.line(160, 450, 160, 470, [86, 90, 98], 2);
  r.line(560, 450, 560, 470, [86, 90, 98], 2);
  return r.png();
}

const MAIN_V1 = `// Cargo rover drive controller — STM32H743
#include "drive_controller.h"
#include "imu.h"
#include "estop.h"

static DriveController drive;
static Imu imu;

int main() {
  board_init();
  imu.begin(200);           // Hz
  drive.begin();
  estop_init(ESTOP_PIN);

  while (true) {
    if (estop_triggered()) {
      drive.stop();
      continue;
    }
    drive.update(imu.read());
  }
}
`;
const MAIN_V2 = MAIN_V1.replace("imu.begin(200);           // Hz", "imu.begin(400);           // Hz — TEST-004: halve drift").replace("    drive.update(imu.read());", "    const ImuSample s = imu.read();\n    drive.update(s);\n    telemetry_publish(s, drive.state());");
const MAIN_V3 = MAIN_V2.replace("  drive.begin();", "  drive.begin();\n  drive.set_current_limit(18.0f);  // amps, CHANGE-003").replace("      drive.stop();\n      continue;", "      drive.stop();          // < 200 ms, REQ-005\n      led_set(LED_ESTOP, BLINK_FAST);\n      continue;");

const DRIVE_CPP = `#include "drive_controller.h"

// Differential drive (DEC-001). Wheel base and radius in metres.
constexpr float kWheelBase = 0.41f;
constexpr float kWheelRadius = 0.0625f;  // 125 mm wheels after CHANGE-002

void DriveController::update(const ImuSample& imu) {
  const float v = target_.linear;
  const float w = target_.angular + heading_pid_.step(target_.heading - imu.yaw);
  const float left = (v - w * kWheelBase / 2.0f) / kWheelRadius;
  const float right = (v + w * kWheelBase / 2.0f) / kWheelRadius;
  for (int i = 0; i < 2; ++i) {
    motors_[i].set_velocity(left);
    motors_[i + 2].set_velocity(right);
  }
  traction_.update(motors_, imu);  // slip detection, ISS-002
}
`;

const URDF = `<?xml version="1.0"?>
<robot name="cargo_rover">
  <link name="base_link">
    <inertial>
      <mass value="14.2"/>
      <inertia ixx="0.31" iyy="0.52" izz="0.71" ixy="0" ixz="0" iyz="0"/>
    </inertial>
    <visual><geometry><box size="0.52 0.36 0.12"/></geometry></visual>
  </link>
  <link name="wheel_fl"><visual><geometry><cylinder radius="0.0625" length="0.046"/></geometry></visual></link>
  <joint name="wheel_fl_joint" type="continuous">
    <parent link="base_link"/><child link="wheel_fl"/>
    <origin xyz="0.19 0.205 -0.04" rpy="1.5708 0 0"/><axis xyz="0 0 1"/>
  </joint>
</robot>
`;

const KICAD_SCH = `(kicad_sch (version 20231120) (generator "eeschema")
  (uuid "6a0c3b5e-1d2c-4f6a-9a77-1b2f3c4d5e6f")
  (paper "A3")
  (title_block (title "Cargo Rover Power Board") (rev "B") (company "Forge Robotics"))
  (symbol (lib_id "Battery_Management:BQ76952") (at 120 80 0) (property "Reference" "U1"))
  (symbol (lib_id "Driver_Motor:VNH7070AS") (at 180 60 0) (property "Reference" "U2"))
  (symbol (lib_id "Driver_Motor:VNH7070AS") (at 180 100 0) (property "Reference" "U3"))
  (symbol (lib_id "Regulator_Switching:LMR33630") (at 220 140 0) (property "Reference" "U4"))
  (symbol (lib_id "Device:Fuse") (at 90 60 0) (property "Reference" "F1") (property "Value" "40A"))
)
`;
const KICAD_PCB = `(kicad_pcb (version 20240108) (generator "pcbnew")
  (general (thickness 1.6))
  (layers
    (0 "F.Cu" signal)
    (1 "In1.Cu" signal)
    (2 "In2.Cu" signal)
    (31 "B.Cu" signal)
  )
  (footprint "Package_SO:PowerSSO-36" (layer "F.Cu") (at 120 80))
  (footprint "Package_SO:PowerSSO-36" (layer "F.Cu") (at 140 80))
  (footprint "Fuse:Fuse_Littelfuse_FKS" (layer "F.Cu") (at 90 60))
  (footprint "Connector_AMASS:AMASS_XT60-M" (layer "F.Cu") (at 70 60))
)
`;

async function main() {
  if (process.env.NODE_ENV === "production" && process.env.SEED_ALLOW_PRODUCTION !== "1") throw new Error("Refusing to seed demo data in production");
  process.env.FORGEBASE_DISABLE_RATE_LIMIT = "1";
  await resetDemo();
  if (process.argv.includes("--reset-only")) return;

  // ── People ────────────────────────────────────────────────────────────────
  const demo = await mkUser("demo@forgebase.dev", "demo", "Demo Engineer", { bio: "Shared demo account — explore freely. Data resets with `npm run db:reset-demo`.", company: "Forge Robotics" });
  const lohitaksh = await mkUser("lohitaksh@demo.forgebase.dev", "lohitaksh", "Lohitaksh", { bio: "Mechanical lead. Chassis, drivetrain, brackets.", company: "Forge Robotics" });
  const viraj = await mkUser("viraj@demo.forgebase.dev", "viraj", "Viraj", { bio: "Firmware & controls.", company: "Forge Robotics" });
  const nikhilesh = await mkUser("nikhilesh@demo.forgebase.dev", "nikhilesh", "Nikhilesh", { bio: "Electrical — power, harnessing, PCB.", company: "Forge Robotics" });
  const maya = await mkUser("maya@demo.forgebase.dev", "maya", "Maya", { bio: "Faculty mentor.", company: "Forge Robotics" });

  // ── Organization & projects ───────────────────────────────────────────────
  const org = await at(day(0), () => createOrganization(lohitaksh, { name: "Forge Robotics", slug: "forge-robotics", description: "Student robotics team building autonomous cargo systems for planetary surface logistics. **Demo organization** — all data here is sample data." }));
  await db.update(organizations).set({ isDemo: true, plan: "pro" }).where(eq(organizations.id, org.id));
  await db.insert(organizationMembers).values([
    { organizationId: org.id, userId: demo.id, role: "admin" },
    { organizationId: org.id, userId: viraj.id, role: "engineer" },
    { organizationId: org.id, userId: nikhilesh.id, role: "engineer" },
    { organizationId: org.id, userId: maya.id, role: "viewer" },
  ]);
  for (const u of [demo, viraj, nikhilesh, maya, lohitaksh]) await db.update(users).set({ lastActiveOrgId: org.id }).where(eq(users.id, u.id));

  const project = await at(day(0, 1), () =>
    createProject(lohitaksh, v.createProjectSchema.parse({
      organization: org.slug,
      name: "Autonomous Cargo Transport Robot",
      slug: "cargo-transport-robot",
      type: "robotics",
      description: "Four-wheel differential-drive rover that autonomously carries a **20 kg** payload between habitat modules across uneven terrain. Season goal: field demonstration at the regional NASA HUNCH showcase in December.",
    })),
  );
  await db.update(projects).set({ repository: "forge-robotics/cargo-rover-firmware", status: "active" }).where(eq(projects.id, project.id));
  const P = project.slug;
  const L = lohitaksh, V = viraj, N = nikhilesh;

  // ── Milestones ────────────────────────────────────────────────────────────
  const ms = [];
  for (const [i, [title, due, desc]] of ([
    ["Prototype", ds(14), "Rolling chassis with teleoperated drive."],
    ["Drive System", ds(49), "Drivetrain meets load, slope and speed requirements."],
    ["Cargo Handling", ds(67), "Payload tray, latch and lift arm."],
    ["Integration", ds(81), "Autonomy stack on the vehicle; full harness."],
    ["Testing", ds(95), "Endurance, thermal and navigation verification."],
    ["Competition", ds(109), "Field demonstration."],
  ] as const).entries())
    ms.push(await at(day(0, 2 + i * 0.1), () => createMilestone(L, P, v.createMilestoneSchema.parse({ title, dueDate: due, description: desc }))));
  const [M1, M2, M3, M4, M5] = ms as [typeof ms[0], typeof ms[0], typeof ms[0], typeof ms[0], typeof ms[0]];

  // ── Requirements ──────────────────────────────────────────────────────────
  const reqDefs: [string, string, "must" | "should" | "could", "test" | "analysis" | "inspection" | "demonstration", typeof L, string][] = [
    ["The robot shall transport a 20 kg payload.", "Payload is a standard 40 × 30 × 25 cm cargo tote. Mass measured with calibrated scale.", "must", "test", L, "HUNCH design brief §2.1"],
    ["The robot shall traverse a 15° slope while loaded.", "Slope surface: compacted regolith simulant. Must climb without wheel slip > 20%.", "must", "test", L, "Habitat site survey"],
    ["The robot shall reach a sustained speed of at least 0.5 m/s on flat ground.", null as unknown as string, "should", "test", V, "Logistics throughput model"],
    ["The robot shall operate for at least 45 minutes per battery charge.", "Duty cycle: 60% driving, 40% idle with autonomy stack powered.", "must", "test", N, "Shift duration between charging windows"],
    ["The emergency stop shall halt all motion within 200 ms.", "Measured from button press to zero wheel velocity.", "must", "test", V, "Safety review SR-01"],
    ["The stowed envelope shall not exceed 60 × 45 × 40 cm.", null as unknown as string, "should", "inspection", L, "Airlock dimensions"],
    ["Total vehicle mass shall not exceed 18 kg without payload.", null as unknown as string, "should", "analysis", L, "Two-person lift limit"],
    ["The robot shall navigate autonomously to a waypoint within 10 cm.", "Using onboard localization only; no external beacons.", "should", "test", V, "Docking tolerance of cargo station"],
    ["The chassis shall withstand a 500 N static load without structural failure.", "Load applied at payload mounting points; 1.5 safety factor on 20 kg dynamic loads.", "must", "test", L, "Structural analysis SA-02"],
    ["The robot shall operate between −10 °C and 40 °C.", null as unknown as string, "could", "test", N, "Unheated storage bay"],
  ];
  const reqs: { id: string }[] = [];
  for (const [i, [title, description, priority, method, owner, rationale]] of reqDefs.entries())
    reqs.push(await at(day(1, i * 0.3), () => createRequirement(owner, P, v.createRequirementSchema.parse({ title, description, priority, verificationMethod: method, ownerId: owner.id, status: "approved", rationale: `Source: ${rationale}.` }))));

  // ── Decisions ─────────────────────────────────────────────────────────────
  await at(day(2), () =>
    createDecision(L, P, v.createDecisionSchema.parse({
      title: "Drive architecture",
      decision: "Use differential drive with four independently driven wheels.",
      context: "We need to carry 20 kg (REQ-001) up a 15° slope (REQ-002) on loose regolith simulant, with a team of three building and maintaining it.",
      alternatives: [
        { name: "Mecanum wheels", pros: "Omnidirectional, easy docking", cons: "Rollers clog in loose regolith; poor slope traction", chosen: false },
        { name: "Tank tracks", pros: "Best traction on slopes", cons: "Heavy, complex tensioning, high power draw", chosen: false },
        { name: "Differential drive (4WD)", pros: "Simple, robust, good traction, easy to model", cons: "Skid-steer turning scrubs tires", chosen: true },
      ],
      rationale: "Lower mechanical complexity and better terrain performance than mecanum, at roughly half the mass of a tracked system. Skid-steer scrub is acceptable at our speeds.",
      consequences: "Turning on high-friction surfaces draws peak current — motor drivers must handle 18 A transients. Docking precision relies on localization (REQ-008).",
      status: "accepted",
      ownerId: L.id,
    })),
  );
  await at(day(3), () =>
    createDecision(V, P, v.createDecisionSchema.parse({
      title: "Motor control compute",
      decision: "Run motor control and safety on an STM32H743; keep autonomy on the Jetson.",
      context: "E-stop must act within 200 ms (REQ-005) regardless of the autonomy computer's state.",
      alternatives: [
        { name: "Everything on Jetson Orin", pros: "One computer, simpler wiring", cons: "Linux scheduling jitter; e-stop depends on OS health" },
        { name: "STM32H743 + Jetson", pros: "Deterministic control loop; hardware e-stop path", cons: "Two codebases, UART bridge", chosen: true },
      ],
      rationale: "Safety-critical loop must be deterministic and independent of the autonomy stack.",
      status: "accepted",
      ownerId: V.id,
    })),
  );
  await at(day(4), () =>
    createDecision(N, P, v.createDecisionSchema.parse({
      title: "Battery chemistry",
      decision: "Use a 24 V LiFePO4 pack (8S, 20 Ah).",
      alternatives: [
        { name: "Li-ion NMC 6S", pros: "Higher energy density", cons: "Thermal runaway risk indoors; stricter shipping rules" },
        { name: "LiFePO4 8S", pros: "Safer chemistry, flat discharge, 2000+ cycles", cons: "Heavier for same energy", chosen: true },
      ],
      rationale: "Habitat operation favours the safer chemistry; mass penalty (~0.9 kg) still keeps us under REQ-007.",
      status: "accepted",
      ownerId: N.id,
    })),
  );

  // ── Files: initial baseline ───────────────────────────────────────────────
  const put = (who: typeof L, path: string, content: Buffer, message?: string) => putFileFromServer(who, P, { path, content, message });
  await at(day(5), async () => {
    await put(L, "/cad/chassis.step", stepFile({ name: "chassis", author: "Lohitaksh", system: "SolidWorks 2025", date: "2026-08-29T10:12:00", desc: "Cargo rover chassis weldment", points: boxPoints(520, 360, 120) }));
    await put(L, "/cad/front-bracket.step", stepFile({ name: "front-bracket", author: "Lohitaksh", system: "SolidWorks 2025", date: "2026-08-29T11:40:00", desc: "Front motor mounting bracket, 3 mm PLA+", points: boxPoints(80, 60, 3) }));
    await put(L, "/cad/front-bracket.stl", bracketStl(3), "Print file for prototype bracket");
    await put(L, "/cad/drive-module.stl", driveModuleStl(100), "Prototype drive module, 100 mm wheels");
    await put(L, "/cad/arm-base.step", stepFile({ name: "arm-base", author: "Lohitaksh", system: "Fusion 360", date: "2026-08-30T09:00:00", desc: "Cargo lift arm base", points: boxPoints(120, 120, 40) }));
  });
  await at(day(6), async () => {
    await put(N, "/electronics/power-board.kicad_sch", Buffer.from(KICAD_SCH));
    await put(N, "/electronics/power-board.kicad_pcb", Buffer.from(KICAD_PCB));
    await put(N, "/electronics/schematic.pdf", powerPdf(), "Power distribution drawing rev B");
  });
  await at(day(6, 4), async () => {
    await put(V, "/firmware/src/main.cpp", Buffer.from(MAIN_V1), "Initial drive loop");
    await put(V, "/firmware/src/drive_controller.cpp", Buffer.from(DRIVE_CPP.replace("0.0625f;  // 125 mm wheels after CHANGE-002", "0.05f;")));
    await put(V, "/firmware/platformio.ini", Buffer.from("[env:nucleo_h743zi]\nplatform = ststm32\nboard = nucleo_h743zi\nframework = stm32cube\nmonitor_speed = 921600\nbuild_flags = -O2 -DUSE_FULL_LL_DRIVER\n"));
    await put(V, "/simulation/rover.urdf", Buffer.from(URDF.replace('mass value="14.2"', 'mass value="9.0"')));
  });
  await at(day(7), async () => {
    await put(L, "/documentation/requirements.md", Buffer.from("# Cargo rover — requirements summary\n\nThe authoritative list lives in Forgebase (REQ-001 … REQ-010). This page is exported for the design review packet.\n\n| Ref | Requirement | Priority |\n|---|---|---|\n| REQ-001 | Transport 20 kg payload | Must |\n| REQ-002 | Traverse 15° slope loaded | Must |\n| REQ-005 | E-stop < 200 ms | Must |\n| REQ-009 | Chassis withstands 500 N | Must |\n"));
    await put(L, "/documentation/test-plan.md", Buffer.from("# Verification plan\n\n1. **Structural** — TEST-001 load test on the stand in the machine shop.\n2. **Mobility** — TEST-002 payload run, TEST-003 slope traverse.\n3. **Safety** — TEST-006 e-stop latency with high-speed camera.\n4. **Endurance** — TEST-005 battery run-down at 60% duty cycle.\n"));
    await put(L, "/media/rover-top-view.png", roverTopPng(), "Layout sketch for design review");
  });
  const v1 = await at(day(7, 3), () => createSnapshot(L, P, { name: "Prototype baseline", description: "Rolling chassis, 3 mm printed brackets, 100 mm wheels, first drive firmware. Used for the M1 teleop demo.", tag: "proto-a" }));

  // ── Tests ─────────────────────────────────────────────────────────────────
  const tdefs: [string, string, string, number[], typeof L, string][] = [
    ["Drivetrain load test", "500 N minimum", "No structural failure; deflection < 3 mm", [9, 1], L, "1. Mount chassis on load frame using production fasteners.\n2. Apply load at payload points in 50 N steps, 30 s dwell.\n3. Record deflection with dial indicator and strain gauge SG-1.\n4. Stop at 600 N or first sign of yielding."],
    ["Payload transport — 20 kg", "20 kg over 30 m", "Completes course without stall", [1, 3], L, "Carry the standard tote loaded to 20.0 kg over the 30 m course."],
    ["Slope traverse — 15°", "15° slope, loaded", "Wheel slip < 20%", [2], L, "Drive up the 15° ramp with 20 kg payload; compute slip from encoder vs. ground-truth tracker."],
    ["IMU drift", "≤ 1.5 °/min", "Heading drift within limit", [8], V, "Rover stationary for 10 minutes with motors energised; log yaw."],
    ["Battery endurance", "≥ 45 min", "Completes 45-minute duty cycle", [4], N, "60% driving / 40% idle duty cycle, autonomy stack on."],
    ["E-stop latency", "< 200 ms", "Zero wheel velocity within 200 ms", [5], V, "Trigger e-stop at 0.5 m/s; measure with 240 fps camera and encoder log."],
    ["Waypoint accuracy", "≤ 10 cm", "Final position error ≤ 10 cm", [8], V, null as unknown as string],
    ["Thermal chamber", "−10 °C to 40 °C", "All subsystems operate", [10], N, null as unknown as string],
  ];
  const tests = [];
  for (const [i, [name, criteria, expected, reqNums, owner, procedure]] of tdefs.entries())
    tests.push(await at(day(8, i * 0.4), () => createTest(owner, P, v.createTestSchema.parse({ name, criteria, expected, requirements: reqNums, ownerId: owner.id, procedure }))));

  await at(day(9, 2), () => createRelease(L, P, v.createReleaseSchema.parse({ tag: "v0.1", name: "Prototype", snapshotId: v1.id, firmwareCommit: "4b1d0c7e9a2f", notes: "First rolling prototype for the M1 teleop demo.\n\n- Chassis weldment, 3 mm printed brackets, 100 mm wheels (Version 1)\n- Teleop drive firmware\n- Verification plan defined: TEST-001 … TEST-008", publish: true })));

  // ── Week 3: the bracket failure ───────────────────────────────────────────
  const failCsv = loadCurve(600, 410);
  const failFile = await at(day(14, 2), () => put(L, "/tests/drivetrain-load-test-01.csv", csv(failCsv), "Load test 1 raw data"));
  await at(day(14, 3), () =>
    recordRun(L, P, 1, v.createTestRunSchema.parse({
      status: "failed",
      actual: "Front bracket yielded at 410 N",
      notes: "Visible cracking at the bend of the left front bracket at **410 N**; deflection jumped from 1.3 mm to 2.6 mm. Load test stopped. Layer delamination along the print direction — see photos in ISS-001.",
      measurements: [
        { name: "Peak load", value: 410, unit: "N", min: 500 },
        { name: "Deflection at peak", value: 2.6, unit: "mm", max: 3 },
        { name: "Strain SG-1", value: 1066, unit: "µε" },
      ],
      attachments: [failFile.file.id],
    })),
  );
  const iss1 = await at(day(14, 4), () =>
    createIssue(L, P, v.createIssueSchema.parse({
      title: "Front mounting bracket yields under load",
      description: "During TEST-001 the left front bracket cracked at 410 N, below the 500 N requirement (REQ-009).\n\n**Observed**\n- Delamination along print layers at the inner bend\n- Deflection jump 1.3 → 2.6 mm\n\n**Likely cause:** 3 mm PLA+ printed with layers parallel to the bending load.\n\n@viraj can you check whether the motor torque spikes during the stand test could have contributed?",
      priority: "urgent",
      status: "open",
      assigneeId: L.id,
      milestoneId: M2.id,
      labels: ["mechanical", "testing"],
      links: { requirements: [9, 1], tests: [1] },
    })),
  );
  await at(day(14, 6), () => createComment(V, P, v.createCommentSchema.parse({ targetType: "issue", targetId: iss1.id, body: "Checked the drive logs — motors were unpowered during the stand test, so this is purely static. Agree it's the print orientation." })));
  await at(day(15), () =>
    createEntry(L, P, v.createNotebookSchema.parse({
      title: "Load test 1 — bracket failure",
      entryDate: ds(14),
      tags: ["testing", "mechanical", "failure"],
      body: "## Goal\nVerify chassis against REQ-009 (500 N static).\n\n## What we did\nLoaded the chassis on the shop frame in 50 N steps. At **410 N** the left front bracket cracked at the inner bend — classic delamination between print layers.\n\n| Load (N) | Deflection (mm) | Note |\n|---|---|---|\n| 300 | 0.95 | linear |\n| 400 | 1.31 | linear |\n| 410 | 2.60 | crack visible |\n\n## Result & next steps\nFailed TEST-001. Opened ISS-001. Options: thicker print (5 mm) or machined aluminium. Leaning aluminium — @nikhilesh can we get shop time this week?",
    })),
  );
  await at(day(16), () =>
    createDecision(L, P, v.createDecisionSchema.parse({
      title: "Bracket material",
      decision: "Machine all load-bearing brackets from 6061-T6 aluminium.",
      context: "Printed PLA+ brackets failed TEST-001 at 410 N (ISS-001).",
      alternatives: [
        { name: "5 mm PLA+ reprint", pros: "Fast, cheap", cons: "Layer adhesion still the weak axis" },
        { name: "PETG-CF", pros: "Stiffer, no machining", cons: "Supply lead time; still anisotropic" },
        { name: "6061-T6 machined", pros: "Isotropic, predictable, ~3× margin", cons: "Shop time; +80 g per bracket", chosen: true },
      ],
      rationale: "Isotropic material removes the print-orientation failure mode entirely and the mass penalty (320 g total) keeps us within REQ-007.",
      status: "accepted",
      ownerId: L.id,
    })),
  );
  await at(day(18), async () => {
    await put(L, "/cad/front-bracket.step", stepFile({ name: "front-bracket", author: "Lohitaksh", system: "SolidWorks 2025", date: "2026-09-11T16:20:00", desc: "Front motor mounting bracket, 5 mm 6061-T6", points: boxPoints(80, 65, 5) }), "5 mm 6061-T6, hole spacing 45 mm (CHANGE-001)");
    await put(L, "/cad/front-bracket.stl", bracketStl(5), "Reference mesh for 5 mm bracket");
  });
  const chg1 = await at(day(18, 2), () =>
    createChange(L, P, v.createChangeSchema.parse({
      title: "Reinforced front mounting bracket",
      reason: "Bracket failed during load testing (TEST-001) at 410 N — below REQ-009.",
      items: [
        { parameter: "Thickness", from: "3 mm", to: "5 mm" },
        { parameter: "Material", from: "PLA+ (printed)", to: "6061-T6 aluminium" },
        { parameter: "Mounting hole spacing", from: "40 mm", to: "45 mm" },
      ],
      description: "Per DEC-004. Hole spacing widened to clear the larger M5 fastener heads.",
      status: "implemented",
      links: { issues: [1], requirements: [9], tests: [1], decisions: [4] },
    })),
  );
  const passCsv = loadCurve(620, null);
  const passFile = await at(day(21, 2), () => put(L, "/tests/drivetrain-load-test-02.csv", csv(passCsv), "Load test 2 raw data (aluminium brackets)"));
  await at(day(21, 2.5), () => put(L, "/media/load-test-comparison.png", plotPng(failCsv, passCsv), "Load vs deflection: test 1 (red) vs test 2 (green), 500 N requirement dashed"));
  await at(day(21, 3), () =>
    recordRun(L, P, 1, v.createTestRunSchema.parse({
      status: "passed",
      actual: "No failure at 620 N; max deflection 1.9 mm",
      notes: "Re-test with 6061-T6 brackets (CHANGE-001). Loaded to 620 N (124% of requirement) with no yielding. Unloaded deflection returned to 0.02 mm.",
      measurements: [
        { name: "Peak load", value: 620, unit: "N", min: 500 },
        { name: "Deflection at peak", value: 1.9, unit: "mm", max: 3 },
        { name: "Residual deflection", value: 0.02, unit: "mm", max: 0.1 },
      ],
      attachments: [passFile.file.id],
    })),
  );
  await at(day(21, 4), async () => {
    await updateIssue(L, P, 1, { status: "closed" });
    const { updateChange } = await import("@/server/services/changes");
    await updateChange(L, P, 1, v.updateChangeSchema.parse({ status: "verified", result: "Passed subsequent test — TEST-001 run #2 held 620 N with 1.9 mm deflection." }));
  });
  await at(day(21, 5), () => createComment(L, P, v.createCommentSchema.parse({ targetType: "change", targetId: chg1.id, body: "Verified ✅ — 124% of requirement with plenty of margin. Plot is in /media/load-test-comparison.png" })));

  // ── Mobility tests & wheels ───────────────────────────────────────────────
  await at(day(22), () => recordRun(L, P, 2, v.createTestRunSchema.parse({ status: "passed", actual: "30 m in 51 s with 20.0 kg, no stall", measurements: [{ name: "Payload", value: 20.0, unit: "kg", min: 20 }, { name: "Average speed", value: 0.59, unit: "m/s", min: 0.5 }, { name: "Peak motor current", value: 11.4, unit: "A", max: 18 }] })));
  await at(day(23), () => recordRun(L, P, 3, v.createTestRunSchema.parse({ status: "failed", actual: "Stalled at 60% of ramp — 34% wheel slip", notes: "Rear wheels dig in on the loose section. 100 mm wheels with shallow tread don't get enough contact patch.", measurements: [{ name: "Wheel slip", value: 34, unit: "%", max: 20 }, { name: "Distance achieved", value: 2.4, unit: "m", min: 4 }] })));
  const iss2 = await at(day(23, 2), () =>
    createIssue(L, P, v.createIssueSchema.parse({ title: "Wheel slip exceeds 30% on 15° loaded slope", description: "TEST-003 failed at 34% slip. Rear wheels dig into loose simulant. Considering larger wheels (CHANGE-002) plus traction control in firmware.", priority: "high", status: "in_progress", assigneeId: V.id, milestoneId: M2.id, labels: ["mechanical", "firmware"], links: { requirements: [2], tests: [3] } })),
  );
  await at(day(24), () =>
    createChange(L, P, v.createChangeSchema.parse({ title: "Increase wheel diameter to 125 mm", reason: "Insufficient traction on 15° slope (ISS-002, TEST-003).", items: [{ parameter: "Wheel diameter", from: "100 mm", to: "125 mm" }, { parameter: "Tread depth", from: "2 mm", to: "5 mm" }, { parameter: "Gear ratio", from: "19:1", to: "27:1" }], status: "implemented", description: "Gear ratio raised to keep wheel torque at the slope operating point.", links: { issues: [2], requirements: [2, 3], tests: [3] } })),
  );
  await at(day(25), async () => {
    await put(L, "/cad/drive-module.stl", driveModuleStl(125), "125 mm wheels (CHANGE-002)");
    await put(V, "/firmware/src/drive_controller.cpp", Buffer.from(DRIVE_CPP), "Wheel radius 62.5 mm; slip detection hook (ISS-002)");
    await put(V, "/simulation/rover.urdf", Buffer.from(URDF), "Fix base_link inertia from CAD mass properties");
  });
  const v2 = await at(day(25, 3), () => createSnapshot(L, P, { name: "Bracket rev B + 125 mm wheels", description: "Aluminium brackets (CHANGE-001) and larger wheels (CHANGE-002). Baseline for the M2 drive-system review.", tag: "drive-b" }));

  // ── Firmware & electrical ─────────────────────────────────────────────────
  await at(day(26), () => put(V, "/firmware/src/main.cpp", Buffer.from(MAIN_V2), "IMU at 400 Hz; telemetry"));
  await at(day(26, 2), () => recordRun(V, P, 4, v.createTestRunSchema.parse({ status: "passed", actual: "0.8 °/min over 10 min", source: "ci:hil-rig", measurements: [{ name: "Yaw drift", value: 0.8, unit: "deg/min", max: 1.5 }] })));
  await at(day(27), () => recordRun(V, P, 6, v.createTestRunSchema.parse({ status: "passed", actual: "142 ms mean over 10 trials", measurements: [{ name: "Mean latency", value: 142, unit: "ms", max: 200 }, { name: "Worst case", value: 171, unit: "ms", max: 200 }] })));
  const iss4 = await at(day(28), () => createIssue(N, P, v.createIssueSchema.parse({ title: "XT60 battery connector reaches 71 °C at sustained 20 A", description: "Thermal camera during TEST-005 prep: connector at 71 °C after 12 min at 20 A. Rated for 60 A but our crimps look marginal. Blocking endurance testing (REQ-004).", priority: "urgent", status: "open", assigneeId: N.id, milestoneId: M2.id, labels: ["electrical", "safety"], links: { requirements: [4], tests: [5] } })));
  await at(day(28, 1), () => createComment(L, P, v.createCommentSchema.parse({ targetType: "issue", targetId: iss4.id, body: "@nikhilesh want me to pull TEST-005 until this is fixed? I don't want to cook the pack." })));
  await at(day(28, 2), () => createComment(N, P, v.createCommentSchema.parse({ targetType: "issue", targetId: iss4.id, body: "Yes — re-crimping with the proper die tomorrow and switching to XT90 on the pack side. Will re-measure." })));
  await at(day(29), () => recordRun(N, P, 5, v.createTestRunSchema.parse({ status: "running", actual: "Run in progress — 31 min elapsed at last check", measurements: [{ name: "Elapsed", value: 31, unit: "min", min: 45 }, { name: "Pack voltage", value: 25.1, unit: "V", min: 22 }] })));
  await at(day(29, 3), () => createIssue(V, P, v.createIssueSchema.parse({ title: "CAN bus dropouts on the long rear harness", description: "Intermittent bus-off on the rear motor drivers. Suspect missing termination on the rear branch. Waiting on new harness from @nikhilesh.", priority: "medium", status: "blocked", assigneeId: V.id, milestoneId: M4.id, labels: ["electrical", "firmware"] })));
  await at(day(30), () => createChange(V, P, v.createChangeSchema.parse({ title: "Raise motor current limit to 18 A", reason: "Skid-steer turns on carpet trip the 12 A limit (DEC-001 consequence).", items: [{ parameter: "Current limit", from: "12 A", to: "18 A" }, { parameter: "Limit ramp", from: "instant", to: "50 ms soft-start" }], status: "proposed", links: { decisions: [1], requirements: [4] } })));
  await at(day(31), () => put(V, "/firmware/src/main.cpp", Buffer.from(MAIN_V3), "18 A current limit, e-stop LED (CHANGE-003)"));
  await at(day(32), () => createIssue(V, P, v.createIssueSchema.parse({ title: "Odometry drifts on gravel", description: "Encoder odometry overestimates distance by ~7% on gravel. Impacts REQ-008.", priority: "medium", status: "open", milestoneId: M4.id, labels: ["software"], links: { requirements: [8] } })));
  await at(day(33), () => createIssue(L, P, v.createIssueSchema.parse({ title: "Payload tray latch rattles loose over rough ground", priority: "low", status: "open", assigneeId: demo.id, milestoneId: M3.id, labels: ["mechanical"], links: { requirements: [1] } })));
  await at(day(34), () => createIssue(N, P, v.createIssueSchema.parse({ title: "E-stop indicator LED not visible in direct sunlight", priority: "low", status: "open", assigneeId: demo.id, labels: ["electrical", "safety"], links: { requirements: [5] } })));
  const iss9 = await at(day(20), () => createIssue(V, P, v.createIssueSchema.parse({ title: "URDF inertia values don't match CAD", description: "Simulated rover tips over in Gazebo on 10° slopes.", priority: "medium", status: "open", assigneeId: V.id, labels: ["software"] })));
  await at(day(25, 1), () => updateIssue(V, P, iss9.number, { status: "resolved" }));
  await at(day(35), () => recordRun(L, P, 8, v.createTestRunSchema.parse({ status: "blocked", actual: "Thermal chamber booked until Oct 20", measurements: [] })));
  await at(day(36), () => recordRun(L, P, 3, v.createTestRunSchema.parse({ status: "failed", actual: "Reached top of ramp but slip peaked at 23%", notes: "Big improvement with 125 mm wheels (CHANGE-002): 34% → 23%. Still above the 20% limit on the loose section. Traction control (ISS-002) should close the gap.", measurements: [{ name: "Wheel slip", value: 23, unit: "%", max: 20 }, { name: "Distance achieved", value: 4.1, unit: "m", min: 4 }] })));

  // ── Tasks ─────────────────────────────────────────────────────────────────
  const T = async (when: number, who: typeof L, input: Record<string, unknown>) => at(day(when), () => createTask(who, P, v.createTaskSchema.parse(input)));
  const t1 = await T(1, L, { title: "Weld chassis frame", status: "done", assigneeId: L.id, milestoneId: M1.id, priority: "high", labels: ["mechanical"] });
  await T(2, N, { title: "Wire prototype power harness", status: "done", assigneeId: N.id, milestoneId: M1.id, labels: ["electrical"] });
  await T(3, V, { title: "Teleop drive firmware", status: "done", assigneeId: V.id, milestoneId: M1.id, labels: ["firmware"] });
  const { updateMilestone } = await import("@/server/services/milestones");
  await at(day(9, 4), () => updateMilestone(L, P, M1.id, { status: "closed" }));
  await T(16, L, { title: "Machine 6061-T6 brackets (×4)", status: "done", assigneeId: L.id, milestoneId: M2.id, priority: "urgent", labels: ["mechanical"], description: "Per CHANGE-001 drawing. Deburr and anodize not required for test." });
  await T(19, L, { title: "Re-run TEST-001 with aluminium brackets", status: "done", assigneeId: L.id, milestoneId: M2.id, labels: ["testing"] });
  const tTraction = await T(24, V, { title: "Traction control: slip detection & torque limiting", status: "in_progress", assigneeId: V.id, milestoneId: M2.id, priority: "high", dueDate: ds(46), labels: ["firmware"], description: "Fixes ISS-002. Compare wheel speed to IMU-integrated ground speed; cut torque on slipping side." });
  await T(24, V, { title: "Log encoder vs ground-truth on slope", status: "done", assigneeId: V.id, parentId: tTraction.id });
  await T(25, V, { title: "Implement per-side torque limiting", status: "in_progress", assigneeId: V.id, parentId: tTraction.id });
  await T(25, V, { title: "Tune slip threshold on ramp", status: "todo", assigneeId: demo.id, parentId: tTraction.id, dueDate: ds(45) });
  const tCrimp = await T(28, N, { title: "Re-crimp battery leads, switch pack side to XT90", status: "review", assigneeId: N.id, milestoneId: M2.id, priority: "urgent", dueDate: ds(43), labels: ["electrical", "safety"] });
  await T(29, N, { title: "Complete TEST-005 battery endurance run", status: "todo", assigneeId: N.id, milestoneId: M2.id, dueDate: ds(47), dependsOn: [tCrimp.number], labels: ["testing"] });
  await T(30, L, { title: "Design payload tray latch v2", status: "todo", assigneeId: demo.id, milestoneId: M3.id, dueDate: ds(53), labels: ["mechanical"] });
  await T(30, L, { title: "Lift arm gearbox selection", status: "backlog", milestoneId: M3.id, labels: ["mechanical"] });
  await T(31, N, { title: "Rear harness with 120 Ω CAN termination", status: "in_progress", assigneeId: N.id, milestoneId: M4.id, dueDate: ds(51), labels: ["electrical"] });
  await T(32, V, { title: "Bring up ROS 2 bridge on Jetson", status: "todo", assigneeId: V.id, milestoneId: M4.id, labels: ["software"] });
  await T(33, V, { title: "Waypoint navigation test course layout", status: "backlog", milestoneId: M5.id, labels: ["testing"] });
  await T(34, demo, { title: "Book thermal chamber for TEST-008", status: "todo", assigneeId: demo.id, milestoneId: M5.id, dueDate: ds(40), labels: ["testing"] });
  void t1;

  // ── Notebook ──────────────────────────────────────────────────────────────
  const nb: [number, typeof L, string, string, string[]][] = [
    [3, L, "Chassis welded, first roll", "## What we did\nFinished welding the 25 × 25 mm square tube frame. Checked diagonals: **0.8 mm** difference — acceptable.\n\nFirst push test with wheels bolted on, rolls straight.\n\n## Next\nHarness from @nikhilesh, then teleop with @viraj's firmware (TASK-003).", ["mechanical", "chassis"]],
    [9, V, "Teleop demo for M1", "Drove the prototype around the lab for 20 minutes on the 100 mm wheels. Top speed **0.62 m/s** (REQ-003 looks fine). Turning on carpet trips the 12 A current limit — noted as a consequence of DEC-001.", ["firmware", "milestone"]],
    [22, L, "Payload run — passed", "20.0 kg tote over the 30 m course in 51 s. Peak current 11.4 A. TEST-002 passed. The tray latch rattled loose near the end — opened ISS-008.", ["testing"]],
    [23, L, "Slope test — not good enough", "Ramp set to 15° with loose simulant over plywood. Rear wheels dig in and the rover stalls at 60% of the ramp. **34% slip.** Wheels are the limiting factor — drafting CHANGE-002 for 125 mm wheels.", ["testing", "mobility", "failure"]],
    [28, N, "Battery connector thermal check", "Thermal camera on the XT60 after 12 min at 20 A: **71 °C**. Crimps on the pack side are visibly under-compressed. Pausing endurance testing (ISS-004).", ["electrical", "safety"]],
    [36, L, "Tested the arm at 50% motor power…", "Tested the arm at 50% motor power with the 5 kg test mass. Shoulder joint lifted cleanly to 70° in 2.1 s; the gearbox whined above 60°. Backlash measured at **1.4°** at the end effector.\n\nRe-ran the slope with 125 mm wheels: slip down from 34% to 23% (TEST-003 run #2). Close — traction control should get us under 20%.\n\n@viraj let's pair on TASK-006 tomorrow.", ["arm", "testing", "mobility"]],
  ];
  for (const [d, who, title, body, tags] of nb) {
    const date = day(d).toISOString().slice(0, 10);
    await at(day(d, 6), () => createEntry(who, P, v.createNotebookSchema.parse({ title, body, entryDate: date, tags })));
  }

  // ── Commits (as delivered by the GitHub webhook) ──────────────────────────
  const access = await requireProject(V, P, "project.write");
  const commitDefs: [number, string, string][] = [
    [6, "drive: initial differential drive loop", "viraj"],
    [10, "estop: hardware interrupt path, measured 142 ms (REQ-005)", "viraj"],
    [20, "sim: fix base_link inertia from CAD mass properties, fixes ISS-009", "viraj"],
    [25, "drive: 62.5 mm wheel radius for CHANGE-002", "viraj"],
    [26, "imu: 400 Hz sampling for TEST-004", "viraj"],
    [31, "drive: 18 A current limit with 50 ms soft-start (CHANGE-003)", "viraj"],
    [35, "traction: per-side slip estimate, refs ISS-002", "viraj"],
  ];
  for (const [d, message, login] of commitDefs) {
    const sha = Buffer.from(`${message}${d}`).toString("hex").padEnd(40, "a").slice(0, 40);
    await at(day(d, 8), () => ingestCommits(access, [{ sha, message, authorName: "Viraj", authorLogin: login, url: `https://github.com/forge-robotics/cargo-rover-firmware/commit/${sha}`, committedAt: day(d, 8).toISOString(), branch: "main" }], null));
  }
  await db.execute(sql`update commits set committed_at = created_at where project_id = ${project.id}`);
  await createEndpoint(L, P, { kind: "generic", description: "HIL test rig (CI)" });

  // ── Versions, releases, discussion ────────────────────────────────────────
  await at(day(26, 6), () => createRelease(L, P, v.createReleaseSchema.parse({ tag: "v0.2", name: "Drive system", snapshotId: v2.id, publish: true })));
  await at(day(36, 4), () => createSnapshot(V, P, { name: "Traction work in progress", description: "Firmware with 18 A limit and slip estimation; rear harness pending.", tag: null }));
  // Design artifacts → requirements (the "Design" column of the traceability matrix).
  const fileIds = await db.execute<{ id: string; path: string }>(sql`select id, path from files where project_id = ${project.id} and deleted_at is null`);
  const fid = (p: string) => [...fileIds].find((f) => f.path === p)!.id;
  const reqId = (n: number) => reqs[n - 1]!.id;
  for (const [path, n, rel] of [
    ["/cad/chassis.step", 9, "implements"],
    ["/cad/front-bracket.step", 9, "implements"],
    ["/cad/chassis.step", 1, "implements"],
    ["/cad/drive-module.stl", 2, "implements"],
    ["/cad/drive-module.stl", 3, "implements"],
    ["/firmware/src/main.cpp", 5, "implements"],
    ["/firmware/src/drive_controller.cpp", 2, "implements"],
    ["/electronics/schematic.pdf", 4, "implements"],
    ["/electronics/power-board.kicad_sch", 5, "implements"],
    ["/simulation/rover.urdf", 8, "implements"],
    ["/documentation/test-plan.md", 9, "references"],
  ] as const)
    await at(day(26), () => createLink(L, P, { sourceType: "file", sourceId: fid(path), targetType: "requirement", targetId: reqId(n), relation: rel }));
  const iss2Link = await createLink(V, P, { sourceType: "issue", sourceId: iss2.id, targetRef: "DEC-001", relation: "references" });
  void iss2Link;

  const c = await at(day(36, 7), () => createComment(V, P, v.createCommentSchema.parse({ targetType: "issue", targetId: iss2.id, body: "Slip estimate is in (see commit `traction: per-side slip estimate`). First ramp run with torque limiting tomorrow. @demo can you own the threshold tuning subtask?" })));
  await toggleReaction(L, P, c.id, "🚀");
  await toggleReaction(N, P, c.id, "👀");
  await at(day(36, 8), () => createComment(L, P, v.createCommentSchema.parse({ targetType: "issue", targetId: iss2.id, parentId: c.id, body: "Nice. I'll have the ramp set up at 4pm." })));

  // Make sure the demo account has something waiting in its inbox.
  await db.execute(sql`update notifications set read_at = null where user_id = ${demo.id}`);
  const [counts] = await db.execute<{ a: number; f: number; i: number }>(sql`select (select count(*)::int from activities where project_id = ${project.id}) a, (select count(*)::int from files where project_id = ${project.id}) f, (select count(*)::int from issues where project_id = ${project.id}) i`);

  // ── Second, smaller project ───────────────────────────────────────────────
  const arm = await at(day(10), () => createProject(L, v.createProjectSchema.parse({ organization: org.slug, name: "Sample Return Arm", slug: "sample-return-arm", type: "mechanical", description: "Three-DOF arm that loads sample canisters onto the cargo rover." })));
  await at(day(11), () => createRequirement(L, arm.slug, v.createRequirementSchema.parse({ title: "The arm shall lift a 2 kg canister to 40 cm.", priority: "must", status: "approved" })));
  await at(day(11, 1), () => createTask(L, arm.slug, v.createTaskSchema.parse({ title: "Shoulder gearbox trade study", status: "in_progress", assigneeId: L.id })));
  await at(day(12), () => putFileFromServer(L, arm.slug, { path: "/cad/shoulder-joint.step", content: stepFile({ name: "shoulder-joint", author: "Lohitaksh", system: "Fusion 360", date: "2026-09-05T12:00:00", desc: "Shoulder joint housing", points: boxPoints(90, 90, 60) }) }));

  const tables = await db.select({ id: users.id }).from(users).where(and(eq(users.isDemo, true), gte(users.createdAt, new Date(0))));
  console.log(`✓ seeded demo workspace: ${tables.length} users, ${counts?.f} files, ${counts?.i} issues, ${counts?.a} activity events`);
  console.log(`  sign in: demo@forgebase.dev / ${DEMO_PASSWORD}  →  /project/${P}`);
}

const reset = process.argv.includes("--reset");
(async () => {
  try {
    if (reset) await resetDemo();
    if (!process.argv.includes("--reset-only")) await main();
  } catch (e) {
    console.error(e);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
})();
