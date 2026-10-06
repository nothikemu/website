/**
 * Forgebase portable launcher.
 *
 * Layout (built by desktop/build.sh):
 *   Forgebase.exe          native launcher → runs runtime/node.exe app/launcher.cjs
 *   runtime/node.exe       Node.js runtime (no install)
 *   app/                   Next.js standalone server, migrations, bootstrap.cjs
 *
 * Everything is per-user: data lives in %LOCALAPPDATA%\Forgebase (or
 * ~/.forgebase elsewhere). No admin rights, services, registry keys or
 * installers are needed — delete the folder to uninstall.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const net = require("node:net");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");

const appDir = __dirname;
const dataDir = process.env.FORGEBASE_DATA_DIR || (process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Forgebase") : path.join(os.homedir(), ".forgebase"));
const configPath = path.join(dataDir, "config.json");
const lockPath = path.join(dataDir, "running.json");

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function loadConfig() {
  fs.mkdirSync(dataDir, { recursive: true });
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    // first run
  }
  let changed = false;
  if (!cfg.authSecret) (cfg.authSecret = crypto.randomBytes(48).toString("base64")), (changed = true);
  if (!cfg.encryptionKey) (cfg.encryptionKey = crypto.randomBytes(32).toString("base64")), (changed = true);
  if (!cfg.port) (cfg.port = 3737), (changed = true);
  if (changed) fs.writeFileSync(configPath, JSON.stringify(cfg, null, 2), { mode: 0o600 });
  return cfg;
}

function freePort(start) {
  return new Promise((resolve) => {
    const tryPort = (p) => {
      const srv = net.createServer();
      srv.once("error", () => tryPort(p + 1));
      srv.once("listening", () => srv.close(() => resolve(p)));
      srv.listen(p, "127.0.0.1");
    };
    tryPort(start);
  });
}

function openBrowser(url) {
  if (process.env.FORGEBASE_NO_BROWSER) return;
  const cmd = process.platform === "win32" ? ["rundll32", ["url.dll,FileProtocolHandler", url]] : process.platform === "darwin" ? ["open", [url]] : ["xdg-open", [url]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: "ignore" }).unref();
  } catch {
    // no browser available; the URL is printed below
  }
}

async function waitForServer(url, ms = 60000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/**
 * One server per data folder — the embedded database must never be opened
 * twice. The lock file is created exclusively; a lock left behind by a crashed
 * process (dead pid) is taken over. Returns the running copy's lock if there
 * is one.
 */
function acquireLock() {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = fs.openSync(lockPath, "wx");
      fs.writeSync(fd, JSON.stringify({ pid: process.pid }));
      fs.closeSync(fd);
      const release = () => {
        try {
          if (JSON.parse(fs.readFileSync(lockPath, "utf8")).pid === process.pid) fs.unlinkSync(lockPath);
        } catch {
          // already gone
        }
      };
      process.on("exit", release);
      for (const sig of ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"]) process.on(sig, () => process.exit(0));
      return null;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      let other = null;
      try {
        other = JSON.parse(fs.readFileSync(lockPath, "utf8"));
      } catch {
        // half-written by a copy that is starting right now
        return { pid: 0 };
      }
      if (other && other.pid && other.pid !== process.pid && isAlive(other.pid)) return other;
      fs.rmSync(lockPath, { force: true });
    }
  }
  throw new Error(`Could not lock ${lockPath}`);
}

function updateLock(data) {
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ...data }));
}

/** Returns false when the lock turns out to be stale (crashed copy, reused pid). */
async function reuseRunning(other) {
  log("  Forgebase is already running — opening it in your browser.");
  // The other copy may still be starting up (first run takes a while).
  const until = Date.now() + 180000;
  while (Date.now() < until) {
    let lock = other;
    try {
      lock = JSON.parse(fs.readFileSync(lockPath, "utf8"));
    } catch {
      // keep the last value
    }
    if (lock.url && (await waitForServer(lock.url, 1500))) {
      log(`  ${lock.url}`);
      openBrowser(lock.url);
      return true;
    }
    if ((lock.pid && !isAlive(lock.pid)) || lock.ready) return false;
    await new Promise((r) => setTimeout(r, 500));
  }
  log("  The running copy isn't responding. Close its window and try again.");
  return true;
}

async function main() {
  log("");
  log("  Forgebase — portable edition");
  log("  ─────────────────────────────");
  const cfg = loadConfig();
  let other = acquireLock();
  if (other) {
    if (await reuseRunning(other)) {
      // Give the user a moment to read the message before the window closes.
      await new Promise((r) => setTimeout(r, 3000));
      return;
    }
    log("  The previous copy didn't shut down cleanly — starting fresh.");
    fs.rmSync(lockPath, { force: true });
    other = acquireLock();
    if (other) throw new Error("Another copy of Forgebase is starting. Try again in a moment.");
  }
  const port = await freePort(Number(process.env.PORT) || cfg.port);
  const url = `http://localhost:${port}`;
  const dbDir = path.join(dataDir, "database");
  updateLock({ port, url });
  const firstRun = !fs.existsSync(path.join(dbDir, "PG_VERSION"));

  Object.assign(process.env, {
    NODE_ENV: "production",
    APP_URL: url,
    PORT: String(port),
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: `pglite:${dbDir}`,
    AUTH_SECRET: cfg.authSecret,
    ENCRYPTION_KEY: cfg.encryptionKey,
    STORAGE_DRIVER: "local",
    STORAGE_LOCAL_DIR: path.join(dataDir, "files"),
    EMAIL_DRIVER: "console",
    LOG_LEVEL: process.env.LOG_LEVEL || "warn",
    FORGEBASE_SEED_AS_LIBRARY: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  if (cfg.ai && cfg.ai.provider) {
    process.env.AI_PROVIDER = cfg.ai.provider;
    if (cfg.ai.apiKey) process.env[{ openai: "OPENAI_API_KEY", anthropic: "ANTHROPIC_API_KEY", google: "GOOGLE_AI_API_KEY" }[cfg.ai.provider]] = cfg.ai.apiKey;
  }

  log(`  Data folder: ${dataDir}`);
  log(firstRun ? "  First run — creating the database…" : "  Checking the database…");
  const bootstrap = require(path.join(appDir, "bootstrap.cjs"));
  await bootstrap.prepareDatabase(dbDir, path.join(appDir, "drizzle"));
  if (firstRun && !process.env.FORGEBASE_NO_DEMO) {
    log("  Loading the demo workspace (Forge Robotics)…");
    await bootstrap.loadDemo();
  }

  log("  Starting the server…");
  require(path.join(appDir, "server.js"));
  if (!(await waitForServer(url))) {
    log("  The server did not start. See the messages above.");
    return;
  }
  updateLock({ port, url, ready: true });
  log("");
  log(`  ✓ Forgebase is running at ${url}`);
  log("");
  log("    Demo account:  demo@forgebase.dev  /  forgebase-demo");
  log("    Or click \"Get started\" to create your own account.");
  log("    Emails (verification, password reset, invites) are printed in this window.");
  log("");
  log("  Keep this window open while you use Forgebase. Close it to stop.");
  log("");
  openBrowser(url);
}

main().catch((err) => {
  log(`\n  Forgebase failed to start:\n  ${err && err.stack ? err.stack : err}`);
  log("\n  Press Ctrl+C to close this window.");
  setInterval(() => {}, 1 << 30);
});
