import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://jsmdxlrduukvshrppiit.supabase.co",
  "sb_publishable_qT3mB9hlNyFIF_X-fExnoQ_B8fAtpA9"
);

/* ─── Sync helpers ─── */

export async function cloudSaveData(data) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_data").upsert({
    user_id: user.id,
    payload: data,
    updated_at: new Date().toISOString(),
  });
}

export async function cloudLoadData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_data").select("payload").eq("user_id", user.id).single();
  return data?.payload || null;
}

export async function cloudSaveLogs(logs) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const rows = logs.map(l => ({ id: l.id, user_id: user.id, payload: l }));
  if (rows.length === 0) return;
  await supabase.from("user_logs").upsert(rows, { onConflict: "id,user_id" });
}

export async function cloudLoadLogs() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_logs").select("payload").eq("user_id", user.id);
  return data?.map(r => r.payload) || [];
}
