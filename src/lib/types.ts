export type DataType = "trial" | "frequency" | "duration" | "task_analysis";
export type Role = "owner" | "bcba" | "bcaba" | "rbt" | "biller";
export type NoteStatus = "draft" | "signed" | "cosigned" | "returned";

export type Profile = {
  id: string;
  org_id: string;
  role: Role;
  full_name: string;
  credential: string | null;
  npi: string | null;
};

export type Client = {
  id: string;
  org_id: string;
  first_name: string;
  last_name: string;
  dob: string;
  diagnosis_code: string | null;
  lead_bcba_id: string | null;
  payer_id: string | null;
  status: string;
};

export type Program = {
  id: string;
  client_id: string;
  name: string;
  domain: string | null;
  goal_text: string | null;
  source: string | null;
  status: string;
};

export type Target = {
  id: string;
  program_id: string;
  name: string;
  data_type: DataType;
  sd: string | null;
  prompt_levels: string[];
  steps: string[] | null;
  mastery: { pct: number; sessions: number; min_trials: number };
  phase: string;
  phase_changes: { at: string; from: string; to: string; note?: string }[];
  sort_order: number;
};

export type EventKind =
  | "trial_independent"
  | "trial_prompted"
  | "trial_incorrect"
  | "count"
  | "episode_start"
  | "episode_end"
  | "ta_step"
  | "note";

export type SessionEvent = {
  id: string;
  org_id: string;
  session_id: string;
  target_id: string | null;
  kind: EventKind;
  payload: Record<string, unknown>;
  recorded_at: string;
  device_seq: number;
};

export type Session = {
  id: string;
  org_id: string;
  appointment_id: string | null;
  client_id: string;
  staff_id: string;
  cpt_code: string;
  started_at: string;
  ended_at: string | null;
  place_of_service: string;
  caregiver_present: boolean | null;
  status: string;
};

export const POS_LABEL: Record<string, string> = {
  "11": "Office / clinic",
  "12": "Home",
  "02": "Telehealth (other)",
  "10": "Telehealth (home)",
  "03": "School",
};

export const CPT_LABEL: Record<string, string> = {
  "97151": "Behavior identification assessment",
  "97152": "Supporting assessment",
  "97153": "Adaptive behavior treatment by protocol",
  "97154": "Group treatment by protocol",
  "97155": "Treatment with protocol modification",
  "97156": "Family / caregiver training",
  "97157": "Group caregiver training",
  "97158": "Group treatment with protocol modification",
};
