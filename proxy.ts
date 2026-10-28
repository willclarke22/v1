/** V3.7C.1 local-only request gate; explicitly denies all legacy write-capable APIs. */
import { NextRequest, NextResponse } from "next/server";
import { currentCloudShellStatus } from "./lib/sandbox/v37d2c3/cloud-gate";
import { cloudRouteDecision } from "./lib/sandbox/v37d2c3/cloud-policy";

export function proxy(request: NextRequest) {
  const path = request.nextUrl.pathname;
  if (process.env.VERCEL === "1") {
    const identity = currentCloudShellStatus();
    if (!identity.ok) return new NextResponse("Cloud sandbox identity rejected", {status:403});
    const decision = cloudRouteDecision(path, request.method);
    if (decision === "block") return new NextResponse("Cloud shell: APIs and unsupported routes disabled", {status:403});
    if (decision === "redirect") return NextResponse.redirect(new URL("/sandbox/probe-lab/learning-space", request.url));
    return NextResponse.next();
  }
  const host = request.headers.get("host")?.toLowerCase() ?? "";
  // A loopback-only dev server is mandatory. No public preview deployment.
  if (host !== "127.0.0.1:3001" && host !== "localhost:3001") {
    return new NextResponse("Experimental MyWay is local-only", {status: 403});
  }
  // Next dev runtime and static resources (no API side effects).
  if (path.startsWith("/_next/") || path === "/favicon.ico" || path === "/robots.txt") return NextResponse.next();
  if (path === "/") return NextResponse.redirect(new URL("/sandbox/probe-lab/learning-space", request.url));
  if (path === "/sandbox/probe-lab/learning-space" ||
      path === "/sandbox/probe-lab/learning-space/workbench") {
    return request.method === "GET" || request.method === "HEAD"
      ? NextResponse.next() : new NextResponse("Read-only preview", {status:405});
  }
  if (path === "/api/sandbox/probe-lab/learning-space/readonly") {
    return request.method === "GET" ? NextResponse.next() : new NextResponse("Read-only API", {status:405});
  }
  // V3.7C.2 read-only model integration: POST is inference or search, NOT a state write.
  if (path === "/api/sandbox/probe-lab/learning-space/retrieve") {
    return request.method === "POST" ? NextResponse.next() : new NextResponse("Method blocked", {status:405});
  }
  if (path === "/api/sandbox/probe-lab/local-assessment/openai" ||
      path === "/api/sandbox/probe-lab/local-assessment/teaching") {
    return ["POST", "GET"].includes(request.method) ? NextResponse.next() : new NextResponse("Method blocked", {status:405});
  }
  // V3.7C.2.3: local-only Z.ai model API; no database access or persistence.
  if (path === "/api/sandbox/probe-lab/local-assessment/glm") {
    return ["POST", "GET"].includes(request.method) ? NextResponse.next() : new NextResponse("Method blocked", {status:405});
  }
  // Fail closed: original message/probe/semantic-enrichment routes, all other assets,
  // all old sandbox APIs and all POST/PUT/PATCH/DELETE endpoints are inaccessible.
  return new NextResponse("Route blocked in V3.7C.1 read-only sandbox", {status:403});
}

export const config = {matcher: "/:path*"};
