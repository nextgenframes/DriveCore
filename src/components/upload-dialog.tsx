import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Upload, FileText, FileType, Video, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { analyzeIncident } from "@/server/incidents.functions";

export function UploadDialog({ onCreated }: { onCreated?: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tab, setTab] = useState<"text" | "file">("text");
  const analyze = useServerFn(analyzeIncident);

  const reset = () => { setTitle(""); setText(""); setFile(null); setTab("text"); };

  const submit = async () => {
    if (!title.trim()) return toast.error("Title is required");
    setBusy(true);
    try {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) throw new Error("Not authenticated");

      let raw_text: string | null = null;
      let file_url: string | null = null;
      let file_name: string | null = null;
      let source_type: "text" | "file" | "pdf" | "video" = "text";

      if (tab === "text") {
        if (!text.trim()) throw new Error("Paste an incident report or transcript");
        raw_text = text;
      } else {
        if (!file) throw new Error("Select a file");
        file_name = file.name;
        const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
        source_type = ext === "pdf" ? "pdf" : ["mp4","mov","webm","avi","mkv"].includes(ext) ? "video" : "file";

        // Upload to storage
        const path = `${u.user.id}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage.from("incident-files").upload(path, file);
        if (upErr) throw upErr;
        file_url = path;

        // Extract text for plain text-ish files
        if (["txt","csv","json","log","md","xml","yaml","yml"].includes(ext)) {
          raw_text = await file.text();
          source_type = "file";
        } else if (ext === "pdf") {
          // Best-effort: client cannot parse PDFs without lib; we send a note
          raw_text = `[PDF file: ${file.name}, ${(file.size/1024).toFixed(1)} KB. Extract incident details from the document referenced by file_name.]`;
        } else if (source_type === "video") {
          raw_text = `[Video file: ${file.name}, ${(file.size/1024/1024).toFixed(2)} MB. Treat as recorded incident footage; analyze based on title + any supplied notes. Recommend transcription if not yet performed.]`;
        }
      }

      const { data: inc, error: insErr } = await supabase
        .from("incidents")
        .insert({ user_id: u.user.id, title, raw_text, file_url, file_name, source_type, status: "pending" })
        .select()
        .single();
      if (insErr) throw insErr;

      toast.success("Incident logged. Running multi-agent analysis…");
      setOpen(false); reset(); onCreated?.(inc.id);

      try {
        await analyze({ data: { incidentId: inc.id } });
        toast.success("Analysis complete");
      } catch (e: any) {
        toast.error(`Analysis failed: ${e.message}`);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-primary text-primary-foreground hover:bg-primary/90 font-semibold gap-2">
          <Upload className="h-4 w-4" /> New Incident
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl bg-card border-border">
        <DialogHeader>
          <DialogTitle>Submit incident for analysis</DialogTitle>
          <DialogDescription>
            Paste a report/transcript or upload sensor logs, PDF reports, or video evidence. AVISYS will route it through Event, Safety, Risk, and Documentation agents.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Incident title</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Sudden braking event — I-280 NB" />
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
            <TabsList className="grid grid-cols-2 w-full bg-surface">
              <TabsTrigger value="text" className="gap-2"><FileText className="h-3.5 w-3.5"/>Paste text</TabsTrigger>
              <TabsTrigger value="file" className="gap-2"><FileType className="h-3.5 w-3.5"/>Upload file</TabsTrigger>
            </TabsList>
            <TabsContent value="text" className="mt-3">
              <Textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Paste incident report, video transcript, or sensor log summary…"
                className="min-h-[200px] font-mono text-xs"
              />
            </TabsContent>
            <TabsContent value="file" className="mt-3 space-y-3">
              <Input type="file" accept=".txt,.csv,.json,.log,.md,.pdf,.mp4,.mov,.webm,.xml,.yaml,.yml" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              {file && (
                <div className="text-xs text-muted-foreground flex items-center gap-2 font-mono">
                  {file.name.endsWith(".pdf") ? <FileType className="h-3.5 w-3.5"/> : file.name.match(/\.(mp4|mov|webm)$/i) ? <Video className="h-3.5 w-3.5"/> : <FileText className="h-3.5 w-3.5"/>}
                  {file.name} · {(file.size/1024).toFixed(1)} KB
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">Supported: text logs (.txt/.csv/.json/.log), PDF reports, video files. Files are stored privately to your account.</p>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin mr-2"/>Analyzing…</> : "Submit & analyze"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
