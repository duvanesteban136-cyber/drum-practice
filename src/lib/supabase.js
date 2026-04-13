import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  "https://jsmdxlrduukvshrppiit.supabase.co",
  "sb_publishable_qT3mB9hlNyFIF_X-fExnoQ_B8fAtpA9"
);

/* ─── Sync helpers ─── */

export async function cloudSaveData(data) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: null };

  // Strip large base64 images from exercises before saving to cloud —
  // images are stored separately in Storage via uploadExerciseImage.
  // We keep the imageUrl (public URL) but drop the local base64 blob.
  const cleanedData = {
    ...data,
    exercises: (data.exercises || []).map(ex => {
      const { image, ...rest } = ex;
      // If image is a base64 blob (starts with "data:"), strip it.
      // If it's already a https URL (from Storage), keep it.
      if (image && image.startsWith("data:")) {
        return rest; // drop it — should have been uploaded to Storage already
      }
      return ex;
    }),
  };

  const { error } = await supabase.from("user_data").upsert({
    user_id: user.id,
    payload: cleanedData,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[cloudSaveData] error:", error.message);
  return { error };
}

export async function cloudLoadData() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_data").select("payload").eq("user_id", user.id).single();
  if (error && error.code !== "PGRST116") console.error("[cloudLoadData] error:", error.message);
  return data?.payload || null;
}

export async function cloudSaveLogs(logs) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const rows = logs.map(l => ({ id: l.id, user_id: user.id, payload: l }));
  if (rows.length === 0) return;
  const { error } = await supabase.from("user_logs").upsert(rows, { onConflict: "id,user_id" });
  if (error) console.error("[cloudSaveLogs] error:", error.message);
}

export async function cloudLoadLogs() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data, error } = await supabase
    .from("user_logs").select("payload").eq("user_id", user.id);
  if (error) console.error("[cloudLoadLogs] error:", error.message);
  return data?.map(r => r.payload) || [];
}

/* ─── Image Storage helpers ─── */

/**
 * Upload a base64 image for an exercise to Supabase Storage.
 * Returns the public URL, or null on failure.
 */
export async function uploadExerciseImage(exerciseId, base64DataUrl) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Convert base64 to Blob
  const [meta, b64] = base64DataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] || "image/jpeg";
  const ext  = mime.split("/")[1] || "jpg";
  const byteStr = atob(b64);
  const buf = new Uint8Array(byteStr.length);
  for (let i = 0; i < byteStr.length; i++) buf[i] = byteStr.charCodeAt(i);
  const blob = new Blob([buf], { type: mime });

  const path = `${user.id}/${exerciseId}.${ext}`;

  const { error } = await supabase.storage
    .from("exercise-images")
    .upload(path, blob, { upsert: true, contentType: mime });

  if (error) {
    console.error("[uploadExerciseImage] error:", error.message);
    return null;
  }

  const { data: urlData } = supabase.storage
    .from("exercise-images")
    .getPublicUrl(path);

  return urlData?.publicUrl || null;
}
