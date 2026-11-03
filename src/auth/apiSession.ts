import { supabase } from "./supabase";

export const getApiAuthHeaders = async (): Promise<Record<string, string>> => {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (!supabase) {
    return headers;
  }

  try {
    const {
      data: { session }
    } = await supabase.auth.getSession();

    if (session?.access_token) {
      headers.Authorization = `Bearer ${session.access_token}`;
    }
  } catch {
    // The caller can still fall back to local-only behavior.
  }

  return headers;
};
