import { createFileRoute } from "@tanstack/react-router";
import { analyzeDiff } from "@/server/branch-debug.functions";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export const Route = createFileRoute("/api/public/branch-debug")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),
      POST: async ({ request }) => {
        try {
          const body = await request.json().catch(() => ({}));
          const diff = typeof body.diff === "string" ? body.diff : "";
          const failureDescription = typeof body.failureDescription === "string" ? body.failureDescription : "";
          const repoRoot = typeof body.repoRoot === "string" ? body.repoRoot : null;
          const editor = body.editor === "cursor" ? "cursor" : "vscode";

          if (!diff || !failureDescription) {
            return Response.json({ error: "diff and failureDescription are required" }, { status: 400, headers: CORS });
          }

          const result = await analyzeDiff(diff, failureDescription);

          // Build IDE deep links if we know the absolute repo root
          const prefix = editor === "cursor" ? "cursor://file/" : "vscode://file/";
          const suspects = result.suspects.map((s) => ({
            ...s,
            jumpUrl: repoRoot
              ? `${prefix}${repoRoot.replace(/\/+$/, "")}/${s.filePath}:${s.lineStart}`
              : null,
          }));

          return Response.json({ ...result, suspects }, { headers: CORS });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Unknown error";
          return Response.json({ error: message }, { status: 500, headers: CORS });
        }
      },
    },
  },
});
