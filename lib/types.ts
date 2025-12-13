export type Role = "counselor" | "patient";

// ⬇️ [수정됨] invite_codes 속성 추가
export type Patient = {
  id: string;
  counselor_id: string;
  name: string;
  concern: string;
  initial_memo: string;
  next_session_date: string | null;
  reminder_time: string | null;
  start_date: string;
  created_at: string;
  // Join으로 가져오는 데이터는 있을 수도, 없을 수도 있으므로 optional(?) 처리
  invite_codes?: { code: string }[]; 
};

export type SessionRow = {
  id: string;
  patient_id: string;
  counselor_id: string;
  session_no: number;
  session_date: string;
  created_at: string;
};

export type PatientLog = {
  id: string;
  patient_id: string;
  counselor_id: string;
  log_date: string;
  emotion: string;
  trigger: string;
  intensity: number;
  sleep_hours: number | null;
  took_meds: boolean | null;
  memo: string | null;
  created_at: string;
};

export type Homework = {
  id: string;
  patient_id: string;
  counselor_id: string;
  title: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type RangeSummary = {
  patient_id: string;
  counselor_id: string;
  start_no: number;
  end_no: number;
  start_date: string;
  end_date: string;
  log_count: number;
  peak_intensity: number | null;
  peak_date: string | null;
  avg_sleep: number | null;
  meds_yes: number;
  top_emotions: string;
  top_triggers: string;
};