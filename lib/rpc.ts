// lib/rpc.ts
import { supabase } from "./supabaseClient";

export async function rpcCreatePatientWithInvite(input: {
  name: string;
  concern: string;
  initialMemo?: string;
  nextSessionDate?: string | null; // YYYY-MM-DD
  reminderTime?: string | null; // "23:00"
}) {
  const { data, error } = await supabase.rpc("create_patient_with_invite", {
    p_name: input.name,
    p_concern: input.concern,
    p_initial_memo: input.initialMemo ?? "",
    p_next_session_date: input.nextSessionDate ?? null,
    p_reminder_time: input.reminderTime ?? null,
  });
  if (error) throw error;
  // RPC returns table: [{ patient_id, invite_code }]
  return (data?.[0] ?? null) as { patient_id: string; invite_code: string } | null;
}

export async function rpcCompleteSessionAndCreateNext(input: {
  patientId: string;
  nextSessionDate: string; // YYYY-MM-DD (다음 예약일)
  reminderTime?: string | null;
}) {
  const { data, error } = await supabase.rpc("complete_session_and_create_next", {
    p_patient_id: input.patientId,
    p_next_session_date: input.nextSessionDate,
    p_reminder_time: input.reminderTime ?? null,
  });
  if (error) throw error;
  // returns table: [{ new_session_id, session_no, session_date }]
  return (data?.[0] ?? null) as
    | { new_session_id: string; session_no: number; session_date: string }
    | null;
}
