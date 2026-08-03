import {
  spawn,
} from "node:child_process";
import {
  readFile,
} from "node:fs/promises";
import path from "node:path";

import {
  resolveBlenderExecutable,
} from "../assets/paths.server";

export const FOUNDRY_BLENDER_RUNTIME_SCHEMA_VERSION =
  "myway_blender_runtime_v1" as const;
export const FOUNDRY_COMPILE_SMOKE_SCHEMA_VERSION =
  "myway_blender_compile_smoke_v1" as const;

export type FoundryBlenderRuntimeInfo = {
  schema_version:
    typeof FOUNDRY_BLENDER_RUNTIME_SCHEMA_VERSION;
  blender_version: string;
  blender_version_tuple: number[];
  python_version: string;
  executable_name: string;
  execution_mode: "background_factory_startup";
};

export type FoundryCompileSmokeResult = {
  schema_version:
    typeof FOUNDRY_COMPILE_SMOKE_SCHEMA_VERSION;
  valid: boolean;
  stage:
    | "model_source"
    | "assembled_script"
    | "runtime_probe";
  message: string;
  line: number | null;
  offset: number | null;
  text: string | null;
  runtime:
    FoundryBlenderRuntimeInfo;
  stdout: string;
  stderr: string;
  elapsed_ms: number;
};

const RUNTIME_MARKER =
  "MYWAY_BLENDER_RUNTIME:";
const SMOKE_MARKER =
  "MYWAY_COMPILE_SMOKE:";
const RUNTIME_TIMEOUT_MS =
  25_000;
const SMOKE_TIMEOUT_MS =
  35_000;

function terminateProcessTree(
  child:
    ReturnType<typeof spawn>,
) {
  return new Promise<void>(
    (resolve) => {
      if (!child.pid) {
        resolve();
        return;
      }
      if (
        process.platform !==
        "win32"
      ) {
        child.kill("SIGKILL");
        resolve();
        return;
      }
      const killer = spawn(
        "taskkill",
        [
          "/PID",
          String(child.pid),
          "/T",
          "/F",
        ],
        {
          windowsHide: true,
          stdio: "ignore",
        },
      );
      killer.on(
        "error",
        () => {
          child.kill();
          resolve();
        },
      );
      killer.on(
        "close",
        () => resolve(),
      );
    },
  );
}

function runBlenderCommand(
  executable: string,
  args: string[],
  timeoutMs: number,
  env:
    NodeJS.ProcessEnv =
      process.env,
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number;
    elapsedMs: number;
  }>(
    (resolve, reject) => {
      const started =
        Date.now();
      const child = spawn(
        executable,
        args,
        {
          cwd:
            process.cwd(),
          windowsHide: true,
          env,
          stdio: [
            "ignore",
            "pipe",
            "pipe",
          ],
        },
      );
      let stdout = "";
      let stderr = "";
      let settled = false;

      child.stdout.on(
        "data",
        (chunk) => {
          stdout +=
            chunk.toString();
        },
      );
      child.stderr.on(
        "data",
        (chunk) => {
          stderr +=
            chunk.toString();
        },
      );

      const timeout =
        setTimeout(
          () => {
            if (settled) return;
            settled = true;
            void terminateProcessTree(
              child,
            ).finally(() => {
              reject(
                new Error(
                  `Blender command exceeded ${Math.round(timeoutMs / 1000)} seconds.`,
                ),
              );
            });
          },
          timeoutMs,
        );

      child.on(
        "error",
        (error) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(error);
        },
      );
      child.on(
        "close",
        (exitCode) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          resolve({
            stdout,
            stderr,
            exitCode:
              exitCode ?? -1,
            elapsedMs:
              Date.now() -
              started,
          });
        },
      );
    },
  );
}

function markerPayload(
  text: string,
  marker: string,
) {
  const line =
    text
      .split(/\r?\n/)
      .find((item) =>
        item.startsWith(marker),
      );
  if (!line) return null;
  try {
    return JSON.parse(
      line.slice(
        marker.length,
      ),
    ) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
}

const runtimeCache =
  new Map<
    string,
    Promise<FoundryBlenderRuntimeInfo>
  >();

export async function resolveFoundryBlenderRuntime() {
  const executable =
    await resolveBlenderExecutable();
  const cached =
    runtimeCache.get(
      executable,
    );
  if (cached) return cached;

  const pending =
    (async () => {
      const expression =
        `import bpy,sys,json;print(${JSON.stringify(RUNTIME_MARKER)} + json.dumps({"blender_version": bpy.app.version_string, "blender_version_tuple": list(bpy.app.version), "python_version": sys.version.split()[0]}))`;
      const result =
        await runBlenderCommand(
          executable,
          [
            "--background",
            "--factory-startup",
            "--python-exit-code",
            "1",
            "--python-expr",
            expression,
          ],
          RUNTIME_TIMEOUT_MS,
        );
      const payload =
        markerPayload(
          `${result.stdout}\n${result.stderr}`,
          RUNTIME_MARKER,
        );
      if (
        result.exitCode !== 0 ||
        !payload
      ) {
        throw new Error(
          [
            "Blender runtime detection failed.",
            result.stderr.trim(),
            result.stdout
              .trim()
              .slice(-3000),
          ]
            .filter(Boolean)
            .join("\n"),
        );
      }
      return {
        schema_version:
          FOUNDRY_BLENDER_RUNTIME_SCHEMA_VERSION,
        blender_version:
          String(
            payload.blender_version ??
              "unknown",
          ),
        blender_version_tuple:
          Array.isArray(
            payload.blender_version_tuple,
          )
            ? payload.blender_version_tuple
                .map(Number)
                .filter(Number.isFinite)
            : [],
        python_version:
          String(
            payload.python_version ??
              "unknown",
          ),
        executable_name:
          path.basename(executable),
        execution_mode:
          "background_factory_startup" as const,
      };
    })();
  runtimeCache.set(
    executable,
    pending,
  );
  try {
    return await pending;
  } catch (error) {
    runtimeCache.delete(
      executable,
    );
    throw error;
  }
}

export function buildCompileSmokeScript(
  sourcePath: string,
  assembledPath: string,
) {
  return `import bpy\nimport json\nimport pathlib\nimport sys\n\nMARKER = ${JSON.stringify(SMOKE_MARKER)}\n\ndef check(stage, target):\n    try:\n        source = pathlib.Path(target).read_text(encoding="utf-8")\n        compile(source, target, "exec")\n    except SyntaxError as error:\n        payload = {\n            "valid": False,\n            "stage": stage,\n            "message": str(error),\n            "line": error.lineno,\n            "offset": error.offset,\n            "text": error.text.strip() if error.text else None,\n        }\n        print(MARKER + json.dumps(payload))\n        raise\n\ncheck("model_source", ${JSON.stringify(sourcePath)})\ncheck("assembled_script", ${JSON.stringify(assembledPath)})\nprint(MARKER + json.dumps({\n    "valid": True,\n    "stage": "assembled_script",\n    "message": "Model source and assembled Foundry script compile in the configured Blender runtime.",\n    "line": None,\n    "offset": None,\n    "text": None,\n}))\n`;
}

export async function runFoundryCompileSmoke(
  input: {
    executable: string;
    smokeScriptPath: string;
    runtime:
      FoundryBlenderRuntimeInfo;
  },
): Promise<FoundryCompileSmokeResult> {
  const result =
    await runBlenderCommand(
      input.executable,
      [
        "--background",
        "--factory-startup",
        "--python-exit-code",
        "1",
        "--python",
        input.smokeScriptPath,
      ],
      SMOKE_TIMEOUT_MS,
    );
  const payload =
    markerPayload(
      `${result.stdout}\n${result.stderr}`,
      SMOKE_MARKER,
    );
  const valid =
    result.exitCode === 0 &&
    payload?.valid === true;
  return {
    schema_version:
      FOUNDRY_COMPILE_SMOKE_SCHEMA_VERSION,
    valid,
    stage:
      payload?.stage ===
        "model_source" ||
      payload?.stage ===
        "assembled_script"
        ? payload.stage
        : "runtime_probe",
    message:
      String(
        payload?.message ??
          (
            valid
              ? "Compile smoke passed."
              : "Blender compile smoke failed before full asset execution."
          ),
      ),
    line:
      typeof payload?.line ===
        "number"
        ? payload.line
        : null,
    offset:
      typeof payload?.offset ===
        "number"
        ? payload.offset
        : null,
    text:
      typeof payload?.text ===
        "string"
        ? payload.text
        : null,
    runtime:
      input.runtime,
    stdout:
      result.stdout,
    stderr:
      result.stderr,
    elapsed_ms:
      result.elapsedMs,
  };
}

export async function readSourceExcerpt(
  filePath: string,
  line: number,
  radius = 2,
) {
  const source =
    await readFile(
      filePath,
      "utf8",
    );
  const lines =
    source.split(/\r?\n/);
  const start =
    Math.max(
      0,
      line -
        radius -
        1,
    );
  const end =
    Math.min(
      lines.length,
      line + radius,
    );
  return lines
    .slice(start, end)
    .map(
      (value, index) =>
        `${start + index + 1}: ${value}`,
    )
    .join("\n");
}
