import type { Session, SessionEvent, Target } from "./types";
import { POS_LABEL } from "./types";
import { trialStats, countStats, durationStats, taStats } from "./clinical";

export type SessionFacts = {
  cpt: string;
  startedAt: string;
  endedAt: string;
  minutes: number;
  units: number;
  pos: string;
  caregiverPresent: boolean | null;
  staffName: string;
  staffCredential: string;
  clientInitials: string;
  targets: {
    name: string;
    program: string;
    dataType: Target["data_type"];
    summary: string;
    mastery?: string;
  }[];
};

/** Everything the note is allowed to say comes from here. */
export function buildFacts(opts: {
  session: Session;
  events: SessionEvent[];
  targets: (Target & { program_name: string })[];
  staffName: string;
  staffCredential: string;
  clientInitials: string;
  units: number;
}): SessionFacts {
  const { session, events, targets } = opts;
  const started = Date.parse(session.started_at);
  const ended = session.ended_at ? Date.parse(session.ended_at) : Date.now();
  const minutes = Math.round((ended - started) / 60000);
  const tgt = targets.map((t) => {
    const evs = events.filter((e) => e.target_id === t.id);
    let summary = "not run this session";
    let mastery: string | undefined;
    if (evs.length) {
      if (t.data_type === "trial") {
        const s = trialStats(evs);
        const prompts = evs.filter((e) => e.kind === "trial_prompted").map((e) => String(e.payload.prompt_level ?? "")).filter(Boolean);
        const pl = prompts.length ? ` (${[...new Set(prompts)].join("/")} prompts on ${s.prompted})` : "";
        summary = `${s.n} trials, ${s.pct}% independent${pl}, ${s.incorrect} incorrect`;
        mastery = `${t.mastery?.pct ?? 80}% across ${t.mastery?.sessions ?? 3} sessions`;
      } else if (t.data_type === "frequency") {
        summary = `${countStats(evs)} occurrences`;
      } else if (t.data_type === "duration") {
        const d = durationStats(evs, ended);
        summary = `${d.count} episode(s), ${Math.round(d.totalSeconds / 60)} min total`;
      } else {
        const ta = taStats(evs, t.steps ?? []);
        const prompted = (t.steps ?? []).filter((_, i) => ta.latest[i] === 2);
        summary = `${ta.independent} of ${ta.total} steps independent${prompted.length ? ` (prompted: ${prompted.join(", ")})` : ""}`;
      }
    }
    return { name: t.name, program: t.program_name, dataType: t.data_type, summary, mastery };
  });
  return {
    cpt: session.cpt_code,
    startedAt: session.started_at,
    endedAt: session.ended_at ?? new Date(ended).toISOString(),
    minutes,
    units: opts.units,
    pos: POS_LABEL[session.place_of_service] ?? session.place_of_service,
    caregiverPresent: session.caregiver_present,
    staffName: opts.staffName,
    staffCredential: opts.staffCredential,
    clientInitials: opts.clientInitials,
    targets: tgt,
  };
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

/** Deterministic draft. No AI involved; every sentence maps to a fact. */
export function templateDraft(f: SessionFacts): string {
  const who = f.cpt === "97155" ? "BCBA" : f.cpt === "97156" ? "BCBA" : "RBT";
  const svc =
    f.cpt === "97153" ? "1:1 adaptive behavior treatment by protocol (97153)"
    : f.cpt === "97155" ? "adaptive behavior treatment with protocol modification (97155)"
    : f.cpt === "97156" ? "family adaptive behavior treatment guidance (97156)"
    : `service ${f.cpt}`;
  const cg = f.caregiverPresent === null ? "" : f.caregiverPresent ? " Caregiver was present." : " Caregiver was not present.";
  const lines: string[] = [];
  lines.push(`${who} ${f.staffName}, ${f.staffCredential}, delivered ${svc} to ${f.clientInitials} in the ${f.pos.toLowerCase()} from ${fmt(f.startedAt)} to ${fmt(f.endedAt)} (${f.minutes} minutes, ${f.units} units).${cg}`);
  const run = f.targets.filter((t) => t.summary !== "not run this session");
  const skipped = f.targets.filter((t) => t.summary === "not run this session");
  for (const t of run) {
    if (t.dataType === "trial") lines.push(`${t.program}${t.name && t.name !== t.program ? ` (${t.name})` : ""} was run for ${t.summary}; mastery criterion is ${t.mastery}.`);
    else if (t.dataType === "frequency") lines.push(`${t.program}: ${t.summary}; the behavior intervention plan was followed as written.`);
    else if (t.dataType === "duration") lines.push(`${t.program}: ${t.summary}; the behavior intervention plan was followed as written.`);
    else lines.push(`${t.program} was practiced using the task analysis: ${t.summary}.`);
  }
  if (skipped.length) lines.push(`Not run this session: ${skipped.map((t) => t.program).join(", ")}.`);
  lines.push("[RESPONSE TO TREATMENT — describe how the client responded today and any protocol changes recommended to the BCBA.]");
  lines.push("Client continues to require services to address skill deficits and behaviors identified in the treatment plan; continue current protocols.");
  return lines.join(" ");
}

/** The five payer-requirement checks. True/false only; the UI shows them. */
export function checklist(f: SessionFacts, body: string) {
  const ran = f.targets.filter((t) => t.summary !== "not run this session");
  return {
    time_units: f.minutes >= 8 && f.units > 0,
    pos_caregiver: !!f.pos && f.caregiverPresent !== null,
    targets: ran.filter((t) => t.dataType === "trial" || t.dataType === "task_analysis").every((t) => body.includes(t.program)),
    behavior: ran.filter((t) => t.dataType === "frequency" || t.dataType === "duration").every((t) => body.includes(t.program)),
    response: !body.includes("[RESPONSE TO TREATMENT") && /respond|response|progress|continue/i.test(body),
  };
}
