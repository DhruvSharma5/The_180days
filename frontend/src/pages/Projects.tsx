import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, FolderKanban, Github, Globe, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PageHeader, ProgressRing } from "@/components/bits";
import { useProjects, useSaveProject } from "@/hooks/useData";
import type { Milestone, ProjectOut, ProjectUpdateBody } from "@/types";
import { cn } from "@/lib/utils";

const STATUS_LABELS: Record<string, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  completed: "Completed",
};

function ProjectCard({ project }: { project: ProjectOut }) {
  const [milestones, setMilestones] = useState<Milestone[]>(project.milestones);
  const [githubUrl, setGithubUrl] = useState(project.github_url);
  const [liveUrl, setLiveUrl] = useState(project.live_url);
  const [status, setStatus] = useState(project.status);
  const [notes, setNotes] = useState(project.notes);
  const { mutate: save, isPending } = useSaveProject();

  useEffect(() => {
    setMilestones(project.milestones);
    setGithubUrl(project.github_url);
    setLiveUrl(project.live_url);
    setStatus(project.status);
    setNotes(project.notes);
  }, [project]);

  const done = milestones.filter((m) => m.done).length;

  const persist = (next: { milestones?: Milestone[]; status?: string; github_url?: string; live_url?: string; notes?: string }) => {
    save({ key: project.key, body: {
      milestones: next.milestones ?? milestones,
      status: (next.status ?? status) as ProjectUpdateBody["status"],
      github_url: next.github_url ?? githubUrl,
      live_url: next.live_url ?? liveUrl,
      notes: next.notes ?? notes,
    } }, {
      onSuccess: () => toast("Project saved"),
    });
  };

  return (
    <section className="rounded-2xl border border-border bg-card p-6 shadow-sm" data-testid={`project-card-${project.key}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-heading text-lg font-bold">
            <FolderKanban className="size-4 text-primary" aria-hidden /> {project.title}
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{project.description}</p>
          <p className="mt-2 text-xs text-muted-foreground">Target: Day {project.due_day} · {done}/{milestones.length} milestones</p>
        </div>
        <ProgressRing pct={project.pct} size={80} stroke={8} sub="done" testId={`project-ring-${project.key}`} />
      </div>

      <ul className="mt-4 space-y-2" data-testid={`project-milestones-${project.key}`}>
        {milestones.map((m, idx) => (
          <li key={m.id} className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2.5"
              data-testid={`milestone-${project.key}-${m.id}`}>
            <button type="button" role="checkbox" aria-checked={m.done}
                    onClick={() => {
                      const next = milestones.map((x, i) => i === idx ? { ...x, done: !x.done } : x);
                      setMilestones(next);
                      persist({ milestones: next });
                    }}
                    className={cn("grid size-5 shrink-0 place-items-center rounded-full border-2 transition-all",
                      m.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary")}
                    aria-label={`Milestone: ${m.title}`}
                    data-testid={`milestone-checkbox-${project.key}-${m.id}`}>
                    <svg viewBox="0 0 10 10" className={cn("size-2.5", m.done ? "opacity-100" : "opacity-0")} aria-hidden>
                      <path d="M1 5 L4 8 L9 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                    </svg>
            </button>
            <span className={cn("flex-1 text-sm", m.done && "text-muted-foreground line-through")}>{m.title}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Github className="size-3.5" aria-hidden /> GitHub repository</Label>
          <Input value={githubUrl} onChange={(e) => setGithubUrl(e.target.value)}
                 placeholder="https://github.com/you/repo" data-testid={`project-github-${project.key}`} />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5"><Globe className="size-3.5" aria-hidden /> Live deployment</Label>
          <Input value={liveUrl} onChange={(e) => setLiveUrl(e.target.value)}
                 placeholder="https://your-app.vercel.app" data-testid={`project-live-${project.key}`} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-[200px_1fr]">
        <div className="space-y-1.5">
          <Label>Status</Label>
          <Select value={status} onValueChange={(v) => { setStatus(v); persist({ status: v }); }}>
            <SelectTrigger data-testid={`project-status-${project.key}`}>
              <SelectValue>{(v: string) => STATUS_LABELS[v] ?? v}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not_started">Not started</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`project-notes-${project.key}`}>Personal notes</Label>
          <Textarea id={`project-notes-${project.key}`} rows={2} value={notes}
                    onChange={(e) => setNotes(e.target.value)} placeholder="Architecture decisions, blockers…" 
                    data-testid={`project-notes-${project.key}`} />
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button size="sm" onClick={() => persist({})} disabled={isPending} data-testid={`project-save-${project.key}`}>
          {isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null} Save project
        </Button>
        {project.completion_date ? (
          <span className="text-xs text-muted-foreground">Completed {project.completion_date}</span>
        ) : null}
        {githubUrl ? <a href={githubUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-testid={`project-github-link-${project.key}`}>repo <ExternalLink className="size-3" aria-hidden /></a> : null}
        {liveUrl ? <a href={liveUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline" data-testid={`project-live-link-${project.key}`}>live <ExternalLink className="size-3" aria-hidden /></a> : null}
      </div>
    </section>
  );
}

export default function Projects() {
  const { data: projects, isLoading } = useProjects();

  if (isLoading) {
    return <div className="grid h-64 place-items-center text-sm text-muted-foreground" data-testid="projects-loading"><Loader2 className="mr-2 size-4 animate-spin inline" />Loading projects…</div>;
  }

  return (
    <div className="space-y-6" data-testid="projects-page">
      <PageHeader title="Projects" sub="The three portfolio builds from the roadmap — milestones, links and notes tracked independently" testId="projects-header" />
      {!projects || projects.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground" data-testid="projects-empty">
          Start your journey first — your three project trackers are created with it.
        </p>
      ) : (
        <div className="space-y-6">
          {projects.map((p) => <ProjectCard key={p.key} project={p} />)}
        </div>
      )}
    </div>
  );
}
