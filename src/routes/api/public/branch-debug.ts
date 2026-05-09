import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "node:crypto";
import { analyzeDiff } from "@/lib/branch-debug.functions";

// This endpoint exists for the VS Code / CLI helper. It is no longer open to
// the world: every request must carry a shared bearer token that matches the
// server-side BRANCH_DEBUG_TOKEN secret. CORS is also restricted.

const ALLOWED_ORIGINS = new Set<string>([
  // Add additional trusted origins (e.g. your VS Code extension origin) here.
]);

const MAX_BODY_BYTES = 256 * 1024; // 256KB hard cap

function corsHeaders(origin: string | null): Record<string, string> {
  const allow = origin && ALLOWED_ORIGINS.has(origin) ? origin : "null";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function timingSafeEqualStr(a: string, b: string): boolean {
  // Hash both sides to a fixed-length digest so the comparison runs in
  // constant time regardless of input length (no length-leak side channel).
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const Route = createFileRoute("/api/public/branch-debug")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) =>
        new Response(null, { status: 204, headers: corsHeaders(request.headers.get("origin")) }),
      POST: async ({ request }) => {
        const headers = corsHeaders(request.headers.get("origin"));

        // 1) Auth — require a server-configured shared secret
        const expected = process.env.BRANCH_DEBUG_TOKEN;
        if (!expected) {
          return Response.json({ error: "Endpoint disabled" }, { status: 503, headers });
        }
        const auth = request.headers.get("authorization") ?? "";
        const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
        if (!provided || !timingSafeEqualStr(provided, expected)) {
          return Response.json({ error: "Unauthorized" }, { status: 401, headers });
        }

        // 2) Body size cap — enforce on the actual bytes received, not on
        // the (spoofable / omittable) Content-Length header.
        const advertised = Number(request.headers.get("content-length") ?? "0");
        if (advertised > MAX_BODY_BYTES) {
          return Response.json({ error: "Payload too large" }, { status: 413, headers });
        }

        try {
          const buf = await request.arrayBuffer();
          if (buf.byteLength > MAX_BODY_BYTES) {
            return Response.json({ error: "Payload too large" }, { status: 413, headers });
          }
          let body: any = {};
          try {
            body = JSON.parse(new TextDecoder().decode(buf));
          } catch {
            return Response.json({ error: "Invalid JSON" }, { status: 400, headers });
          }
          const diff = typeof body.diff === "string" ? body.diff : "";
          const failureDescription = typeof body.failureDescription === "string" ? body.failureDescription : "";
          const repoRoot = typeof body.repoRoot === "string" ? body.repoRoot : null;
          const editor = body.editor === "cursor" ? "cursor" : "vscode";

          if (!diff || !failureDescription) {
            return Response.json({ error: "diff and failureDescription are required" }, { status: 400, headers });
          }
          if (diff.length > 200_000 || failureDescription.length > 5_000) {
            return Response.json({ error: "Input too large" }, { status: 413, headers });
          }

          const result = await analyzeDiff(diff, failureDescription);

          const prefix = editor === "cursor" ? "cursor://file/" : "vscode://file/";
          const suspects = result.suspects.map((s) => ({
            ...s,
            jumpUrl: repoRoot
              ? `${prefix}${repoRoot.replace(/\/+$/, "")}/${s.filePath}:${s.lineStart}`
              : null,
          }));

          return Response.json({ ...result, suspects }, { headers });
        } catch {
          // Never reflect internal error details to the caller
          return Response.json({ error: "Internal error" }, { status: 500, headers });
        }
      },
    },
  },
});
