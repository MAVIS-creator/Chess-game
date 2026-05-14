import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export interface PlayerIdentity {
  id: string;
  username: string;
  displayName: string;
}

const PLAYER_EMAIL_DOMAIN = "players.cedar-chess.app";

const normalizeUsername = (username: string) =>
  username
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);

const buildSyntheticEmail = (username: string) => `${normalizeUsername(username)}@${PLAYER_EMAIL_DOMAIN}`;

const userToIdentity = (user: User): PlayerIdentity => ({
  id: user.id,
  username:
    typeof user.user_metadata.username === "string" && user.user_metadata.username.length > 0
      ? user.user_metadata.username
      : user.email?.split("@")[0] ?? "player",
  displayName:
    typeof user.user_metadata.display_name === "string" && user.user_metadata.display_name.length > 0
      ? user.user_metadata.display_name
      : typeof user.user_metadata.username === "string" && user.user_metadata.username.length > 0
        ? user.user_metadata.username
        : "Player"
});

export const getCurrentPlayer = async () => {
  if (!supabase) {
    return null;
  }

  const {
    data: { session }
  } = await supabase.auth.getSession();

  return session?.user ? userToIdentity(session.user) : null;
};

export const signInPlayer = async (username: string, password: string) => {
  if (!supabase) {
    throw new Error("Login is unavailable right now.");
  }

  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw new Error("Enter a valid player name.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: buildSyntheticEmail(normalized),
    password
  });

  if (error) {
    throw new Error("Wrong name or password.");
  }

  if (!data.user) {
    throw new Error("Login could not be completed.");
  }

  return userToIdentity(data.user);
};

export const signUpPlayer = async (username: string, password: string) => {
  if (!supabase) {
    throw new Error("Sign up is unavailable right now.");
  }

  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw new Error("Enter a valid player name.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: buildSyntheticEmail(normalized),
    password,
    options: {
      data: {
        username: normalized,
        display_name: username.trim() || normalized
      }
    }
  });

  if (error) {
    throw new Error("That name is unavailable or the account could not be created.");
  }

  if (!data.user) {
    throw new Error("Account could not be created.");
  }

  if (!data.session) {
    throw new Error("Account created. Log in to continue.");
  }

  return userToIdentity(data.user);
};

export const signOutPlayer = async () => {
  if (!supabase) {
    return;
  }

  await supabase.auth.signOut({ scope: "local" });
};

export const onPlayerSessionChange = (
  callback: (event: AuthChangeEvent, session: Session | null) => void
) => {
  if (!supabase) {
    return () => {};
  }

  const {
    data: { subscription }
  } = supabase.auth.onAuthStateChange(callback);

  return () => subscription.unsubscribe();
};
