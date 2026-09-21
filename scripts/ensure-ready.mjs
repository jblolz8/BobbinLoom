#!/usr/bin/env node
/**
 * BobbinLoom — project readiness check.
 *
 * The ONE place that decides whether dependencies need installing and whether the
 * client bundle needs rebuilding, so cmd.exe and bash cannot drift apart. Both
 * `start.*` (auto) and `update.*` (forced) call it; it exits non-zero with a clear
 * reason when something could not be prepared.
 *
 *   node scripts/ensure-ready.mjs [flags]
 *
 *   --force, -f     install AND rebuild, no detection
 *   --rebuild, -r   force a rebuild only
 *   --reinstall     force an install only
 *   --no-install    skip the install step entirely
 *   --no-build      skip the build step entirely
 *   --pull          fetch and fast-forward from origin BEFORE deciding anything
 *   --check         print the decisions and change nothing
 *
 * `update.*` passes --pull --force; `start.*` never passes --pull, so a launch stays
 * offline and instant and this script's only network call happens when the reader asks
 * for it. See pullFromOrigin for why a refused pull is not a failed update.
 *
 * Why detection instead of always doing both: `npm install` needs the network and
 * costs 5-30s even when nothing moved, and this is a local-first app that has to
 * start offline. An install that was actually required DOES force a rebuild, since
 * new dependencies mean a stale bundle.
 */
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, renameSync, rmSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

/**
 * What the client bundle is actually built FROM. `src/server/**` is deliberately
 * absent: the API is served from source by `tsx src/server/index.ts`, so a
 * server-only edit needs no rebuild. Everything the Vite graph pulls in lives under
 * the three dirs below (client imports `engine/` and `schemas/`).
 */
const BUILD_INPUTS = [
  "src/client",
  "src/engine",
  "src/schemas",
  "index.html",
  "vite.config.ts",
  "package.json"
];

const DIST = join(ROOT, "dist");
const DIST_INDEX = join(DIST, "index.html");
/** Staging output — see runBuild for why the bundle is not built straight into dist/. */
const STAGING = join(ROOT, "dist.staging");
const LOCKFILE = join(ROOT, "package-lock.json");
const PKG = join(ROOT, "package.json");
const NODE_MODULES = join(ROOT, "node_modules");
/** npm rewrites this on every install — the staleness probe for node_modules. */
const INSTALL_MARKER = join(NODE_MODULES, ".package-lock.json");

function parseArgs(argv) {
  const flags = { force: false, rebuild: false, reinstall: false, install: true, build: true, pull: false, check: false };
  for (const arg of argv) {
    switch (arg) {
      case "--force": case "-f": flags.force = true; break;
      case "--rebuild": case "-r": flags.rebuild = true; break;
      case "--reinstall": flags.reinstall = true; break;
      case "--no-install": flags.install = false; break;
      case "--no-build": flags.build = false; break;
      case "--pull": flags.pull = true; break;
      case "--check": flags.check = true; break;
      case "--help": case "-h": usage(); process.exit(0);
      default:
        console.error(`[FAIL] Unknown option: ${arg}`);
        usage();
        process.exit(2);
    }
  }
  if (flags.force) { flags.reinstall = true; flags.rebuild = true; }
  if (!flags.install) flags.reinstall = false;
  if (!flags.build) flags.rebuild = false;
  return flags;
}

function usage() {
  console.log(`Usage: node scripts/ensure-ready.mjs [--force|-f] [--rebuild|-r] [--reinstall]
                                      [--no-install] [--no-build] [--pull] [--check]`);
}

function mtime(path) {
  try { return statSync(path).mtimeMs; } catch { return 0; }
}

/** Best-effort recursive delete — never fatal, the caller reports the real error. */
function rmrf(path) {
  try { rmSync(path, { recursive: true, force: true }); } catch { /* best effort */ }
}

/** Synchronous pause — the swap retry has to run inline, before anything async. */
function sleepSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) { /* spin briefly */ }
}

/**
 * Move the staged build into dist/.
 *
 * Retried on purpose: on Windows an antivirus / search-indexer scan of the files Vite
 * just wrote holds a handle for a moment, which fails the move with EPERM even when the
 * destination is gone. That is the same transient race the old start.bat papered over
 * with its dist/ retry loop. If the move stays impossible, fall back to a copy so a
 * usable dist/ still exists (any stale hashed assets left behind are harmless, since the
 * emitted HTML references the new hashes).
 *
 * Returns the error to report, or null on success.
 */
function swapIntoPlace() {
  let lastError = null;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      rmrf(DIST);
      renameSync(STAGING, DIST);
      return null;
    } catch (error) {
      lastError = error;
      sleepSync(250);
    }
  }
  try {
    cpSync(STAGING, DIST, { recursive: true });
    rmrf(STAGING);
    return null;
  } catch (error) {
    return error ?? lastError;
  }
}

/** Newest FILE (dirs excluded — a dir's mtime is not a content change) under a path. */
function newestUnder(path) {
  let newest = 0;
  let newestPath = null;
  let stat;
  try { stat = statSync(path); } catch { return { newest, newestPath }; }
  if (stat.isFile()) return { newest: stat.mtimeMs, newestPath: path };

  const stack = [path];
  while (stack.length > 0) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else {
        const time = mtime(full);
        if (time > newest) { newest = time; newestPath = full; }
      }
    }
  }
  return { newest, newestPath };
}

/** Why dependencies must be (re)installed, or null when they are current. */
function installReason() {
  if (!existsSync(NODE_MODULES)) return "node_modules is missing";
  if (!existsSync(INSTALL_MARKER)) return "node_modules has no install marker";
  const marker = mtime(INSTALL_MARKER);
  if (existsSync(LOCKFILE) && mtime(LOCKFILE) > marker) {
    return "package-lock.json is newer than the last install";
  }
  if (existsSync(PKG) && mtime(PKG) > marker) {
    return "package.json is newer than the last install";
  }
  return null;
}

/** Why the client bundle must be rebuilt, or null when it is current. */
function buildReason() {
  if (!existsSync(DIST_INDEX)) return "dist/index.html is missing";
  const built = mtime(DIST_INDEX);
  let newest = 0;
  let newestPath = null;
  for (const input of BUILD_INPUTS) {
    const found = newestUnder(join(ROOT, input));
    if (found.newest > newest) { newest = found.newest; newestPath = found.newestPath; }
  }
  if (newest > built) {
    return `${relative(ROOT, newestPath) || newestPath} is newer than the build`;
  }
  return null;
}

/** Run an npm command, streaming its output. Returns true on success. */
function npm(args) {
  // shell:true so Windows resolves npm.cmd / PATHEXT without a special case.
  const result = spawnSync("npm", args, { cwd: ROOT, stdio: "inherit", shell: true });
  if (result.error) {
    console.error(`[FAIL] Could not run npm: ${result.error.message}`);
    return false;
  }
  return result.status === 0;
}

/**
 * Run git, capturing its output. Never throws: a missing git is a reason to report, not to crash, because
 * the local tree can still be installed and built.
 */
function git(args) {
  const result = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  const error = result.error ? result.error.message : null;
  return {
    ok: !error && result.status === 0,
    out: (result.stdout ?? "").trim(),
    err: (result.stderr ?? "").trim() || error || ""
  };
}

/**
 * How the branch stands against its remote-tracking ref, WITHOUT touching the network: every number here
 * comes from the last fetch. That is what makes `--check` a dry run that still says something useful, and
 * the only reason this is separate from pullFromOrigin.
 */
function syncState() {
  if (!git(["--version"]).ok) return { known: false, detail: "git not found in PATH" };
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]);
  if (!branch.ok) return { known: false, detail: "not a git checkout" };
  if (branch.out === "HEAD") return { known: false, detail: "detached HEAD — no branch to update" };
  const upstream = git(["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]);
  if (!upstream.ok) return { known: false, detail: `${branch.out} has no upstream to pull from` };
  const counts = git(["rev-list", "--left-right", "--count", "HEAD...@{u}"]);
  if (!counts.ok) return { known: false, detail: `cannot compare ${branch.out} with ${upstream.out}` };
  const [ahead, behind] = counts.out.split(/\s+/).map((value) => Number(value));
  return { known: true, branch: branch.out, upstream: upstream.out, ahead, behind };
}

function localPullReport() {
  const state = syncState();
  if (!state.known) return `not checked — ${state.detail}`;
  if (state.behind === 0) {
    return `level with ${state.upstream} as of the last fetch${state.ahead > 0 ? ` (${state.ahead} local commit(s) not pushed)` : ""}`;
  }
  return `behind ${state.upstream} by ${state.behind} commit(s) — would fetch and fast-forward`;
}

/**
 * Bring the working tree up to date from origin, FAST-FORWARD ONLY.
 *
 * The launcher is the one place a network call belongs: `update.*` is the explicit "bring me current"
 * action, while `start.*` stays offline and instant. Fast-forward only, because choosing between a merge
 * and a rebase when the branch has diverged is the reader's call and never the launcher's — and this
 * repository's convention is that commits land straight on main, so divergence means two devices, which is
 * exactly when a human should look.
 *
 * A refusal is NOT a failed update: the caller carries on and installs/builds what is on disk. What the
 * refusal must never become is silence, so the caller reports it loudly and exits non-zero.
 */
function pullFromOrigin() {
  const start = syncState();
  if (!start.known) return { ok: false, detail: start.detail };

  const remote = start.upstream.split("/")[0];
  const fetched = git(["fetch", "--quiet", remote]);
  if (!fetched.ok) {
    return { ok: false, detail: `git fetch ${remote} failed — offline?${fetched.err ? ` (${fetched.err})` : ""}` };
  }

  // Re-read: the fetch moved the remote-tracking ref, so this is the real distance now.
  const state = syncState();
  if (!state.known) return { ok: false, detail: state.detail };
  if (state.behind === 0) {
    return {
      ok: true,
      detail: `already up to date with ${state.upstream}${state.ahead > 0 ? ` (${state.ahead} local commit(s) not pushed)` : ""}`
    };
  }
  if (state.ahead > 0) {
    return {
      ok: false,
      detail: `${state.upstream} has ${state.behind} commit(s) this branch does not, and this branch has ${state.ahead} it does not — merge or rebase it yourself`
    };
  }

  const pulled = git(["pull", "--ff-only", "--quiet"]);
  if (!pulled.ok) {
    // Git's own message is the useful one: it names the file it refused to overwrite.
    return { ok: false, detail: pulled.err || "git pull --ff-only failed" };
  }
  return { ok: true, detail: `fast-forwarded ${state.behind} commit(s) from ${state.upstream}` };
}

function main() {
  const flags = parseArgs(process.argv.slice(2));

  const nodeMajor = Number(process.versions.node.split(".")[0]);
  if (Number.isFinite(nodeMajor) && nodeMajor < 18) {
    console.warn(`[WARN] Node ${process.versions.node} detected — BobbinLoom requires Node 18+.`);
  }

  const install = flags.install ? (flags.reinstall ? "forced" : installReason()) : null;
  const build = flags.build ? (flags.rebuild ? "forced" : buildReason()) : null;

  if (flags.check) {
    if (flags.pull) console.log(`[check] pull: ${localPullReport()}`);
    console.log(`[check] install: ${install ?? "up to date"}${flags.install ? "" : "  (disabled)"}`);
    console.log(`[check] rebuild: ${build ?? "up to date"}${flags.build ? "" : "  (disabled)"}`);
    return 0;
  }

  // Update BEFORE deciding anything: a pull can bring a new package.json (so the install must happen after
  // it) and new client source (so must the rebuild). A refused pull is reported and stepped over — this
  // device still gets installed and built, and the exit code below is what says "not fully updated".
  let pullProblem = null;
  if (flags.pull) {
    const result = pullFromOrigin();
    if (result.ok) {
      console.log(`[ensure] Repository: ${result.detail}`);
    } else {
      pullProblem = result.detail;
      console.error("");
      console.error(`[WARN] Could not update from origin — ${result.detail}`);
      console.error("[WARN] Carrying on with the tree already on disk, so this device's install and build");
      console.error("[WARN] still happen. It is BEHIND origin, and this exits non-zero so that is not");
      console.error("[WARN] mistaken for a clean update.");
      console.error("");
    }
  }

  /** The pull's complaint outranks a clean install/build: both succeeding still means "not fully updated". */
  const finish = (code) => (code !== 0 ? code : pullProblem ? 1 : 0);

  if (install === null && build === null) {
    console.log("[ensure] Dependencies and client build are up to date.");
    return finish(0);
  }

  if (install !== null) {
    console.log(`[ensure] Installing dependencies — ${install}...`);
    if (!npm(["install", "--no-audit", "--no-fund", "--no-progress"])) {
      console.error("");
      console.error("[FAIL] npm install failed, so the project is NOT ready.");
      console.error("       If you are offline, reconnect and re-run — the server was not started.");
      console.error("       The previous node_modules is still on disk; nothing was deleted.");
      return 1;
    }
    // Fresh dependencies mean a stale bundle.
    if (build === null && flags.build) {
      console.log("[ensure] Dependencies changed, so the client bundle must be rebuilt.");
      return finish(runBuild(true));
    }
  }

  if (build !== null) return finish(runBuild(false));
  return finish(0);
}

function runBuild(afterInstall) {
  const reason = afterInstall ? "new dependencies" : "sources changed";
  console.log(`[ensure] Building the client bundle (${reason})...`);

  // Build into a staging dir and swap only on success. Vite empties its OWN outDir at
  // build start, so building straight into dist/ still leaves the served UI gutted when
  // a build fails half-way. Staging means a failed build cannot touch what is served.
  rmrf(STAGING);
  if (!npm(["run", "build", "--", "--outDir", "dist.staging", "--emptyOutDir"])) {
    rmrf(STAGING);
    console.error("");
    console.error("[FAIL] The client build failed — see the Vite output above.");
    console.error("       The server was not started, and the previous dist/ is untouched.");
    return 1;
  }

  if (!existsSync(join(STAGING, "index.html"))) {
    rmrf(STAGING);
    console.error("");
    console.error("[FAIL] The build reported success but dist.staging/index.html is missing.");
    console.error("       An antivirus scan, a full/read-only disk, or an Explorer window");
    console.error("       holding the output. Clear the cause and re-run.");
    return 1;
  }

  const swapError = swapIntoPlace();
  if (swapError) {
    console.error("");
    console.error(`[FAIL] Could not replace dist/ — ${swapError.message}`);
    console.error("       A running server or an open handle is holding it; stop the server");
    console.error("       and re-run. The previous build is still in place, so the UI is fine.");
    return 1;
  }

  if (!existsSync(DIST_INDEX)) {
    console.error("[FAIL] dist/index.html is missing after the swap.");
    return 1;
  }
  return 0;
}

process.exit(main());
