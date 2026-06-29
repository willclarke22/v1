import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BlenderRenderRequest = {
  director_contract?: unknown;
  request_context?: unknown;
  frames?: number;
  fps?: number;
  width?: number;
  height?: number;
};

type ProcessResult = {
  code: number | null;
  stdout: string;
  stderr: string;
};

const DEFAULT_FRAMES = 48;
const DEFAULT_FPS = 12;
const DEFAULT_WIDTH = 960;
const DEFAULT_HEIGHT = 540;
const MAX_FRAMES = 96;
const MAX_RENDER_MS = 180_000;

function asNumber(value: unknown, fallback: number, min: number, max: number) {
  const numberValue = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numberValue)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numberValue)));
}

function sanitizeRenderId(value: string) {
  return value.replace(/[^a-z0-9_-]/gi, "_").replace(/_+/g, "_").slice(0, 80);
}

function findBlenderExecutable() {
  const envValue = process.env.MYWAY_BLENDER_EXE?.trim();
  if (envValue && existsSync(envValue)) return envValue;

  const candidates = [
    "C:\\Program Files\\Blender Foundation\\Blender 5.1\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 5.0\\blender.exe",
    "C:\\Program Files\\Blender Foundation\\Blender 4.5\\blender.exe",
    path.join(process.env.LOCALAPPDATA ?? "", "Microsoft", "WindowsApps", "blender.exe"),
  ];

  return candidates.find((candidate) => candidate && existsSync(candidate)) ?? null;
}

function runProcess(command: string, args: string[], cwd: string, timeoutMs: number): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      shell: false,
    });

    let stdout = "";
    let stderr = "";
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill("SIGTERM");
      reject(new Error(`Blender render timed out after ${Math.round(timeoutMs / 1000)}s.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
      if (stdout.length > 24_000) stdout = stdout.slice(-24_000);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
      if (stderr.length > 24_000) stderr = stderr.slice(-24_000);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function GET() {
  const blenderExe = findBlenderExecutable();
  const scriptPath = path.join(process.cwd(), "scripts", "blender", "render-myway-director.py");

  return NextResponse.json({
    ok: true,
    route: "blender-render",
    blender: {
      configured_env: process.env.MYWAY_BLENDER_EXE ?? null,
      resolved_exe: blenderExe,
      available: Boolean(blenderExe),
    },
    script: {
      path: scriptPath,
      exists: existsSync(scriptPath),
    },
    output_root: "/generated-video-renders",
    mode: "png_frame_sequence",
  });
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const body = (await request.json().catch(() => ({}))) as BlenderRenderRequest;
  const blenderExe = findBlenderExecutable();

  if (!blenderExe) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "Blender executable was not found. Set MYWAY_BLENDER_EXE in .env.local to your blender.exe path and restart pnpm dev.",
      },
      { status: 400 },
    );
  }

  const scriptPath = path.join(process.cwd(), "scripts", "blender", "render-myway-director.py");
  if (!existsSync(scriptPath)) {
    return NextResponse.json(
      {
        ok: false,
        error: `Missing Blender script at ${scriptPath}`,
      },
      { status: 500 },
    );
  }

  const frames = asNumber(body.frames, DEFAULT_FRAMES, 12, MAX_FRAMES);
  const fps = asNumber(body.fps, DEFAULT_FPS, 6, 24);
  const width = asNumber(body.width, DEFAULT_WIDTH, 640, 1280);
  const height = asNumber(body.height, DEFAULT_HEIGHT, 360, 720);

  const renderId = sanitizeRenderId(`myway_blender_${Date.now()}_${randomUUID().slice(0, 8)}`);
  const publicRoot = path.join(process.cwd(), "public", "generated-video-renders");
  const renderDir = path.join(publicRoot, renderId);
  const inputPath = path.join(renderDir, "director-input.json");

  await rm(renderDir, { recursive: true, force: true });
  await mkdir(renderDir, { recursive: true });

  await writeFile(
    inputPath,
    JSON.stringify(
      {
        director_contract: body.director_contract ?? null,
        request_context: body.request_context ?? null,
        render: {
          render_id: renderId,
          frames,
          fps,
          width,
          height,
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  const args = [
    "--background",
    "--python",
    scriptPath,
    "--",
    inputPath,
    renderDir,
    String(frames),
    String(fps),
    String(width),
    String(height),
  ];

  const result = await runProcess(blenderExe, args, process.cwd(), MAX_RENDER_MS);

  if (result.code !== 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Blender exited with code ${result.code}.`,
        stdout: result.stdout.slice(-6000),
        stderr: result.stderr.slice(-6000),
        render_id: renderId,
      },
      { status: 500 },
    );
  }

  const files = (await readdir(renderDir))
    .filter((file) => /^frame_\d+\.png$/i.test(file))
    .sort();

  if (!files.length) {
    return NextResponse.json(
      {
        ok: false,
        error: "Blender finished but did not create any PNG frames.",
        stdout: result.stdout.slice(-6000),
        stderr: result.stderr.slice(-6000),
        render_id: renderId,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    render_id: renderId,
    frame_urls: files.map((file) => `/generated-video-renders/${renderId}/${file}`),
    frame_count: files.length,
    fps,
    duration_seconds: files.length / fps,
    elapsed_ms: Date.now() - startedAt,
    mode: "png_frame_sequence",
    blender: {
      exe: blenderExe,
    },
    stdout: result.stdout.slice(-5000),
    stderr: result.stderr.slice(-5000),
  });
}
