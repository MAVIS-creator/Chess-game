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

  const login = username.trim();
  const email = login.includes("@") ? login.toLowerCase() : buildSyntheticEmail(login);
  if (!login || (!login.includes("@") && !normalizeUsername(login))) {
    throw new Error("Enter a valid player name or email.");
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    throw new Error("Wrong name/email or password.");
  }

  if (!data.user) {
    throw new Error("Login could not be completed.");
  }

  return userToIdentity(data.user);
};

export const signUpPlayer = async (username: string, password: string, realEmail = "") => {
  if (!supabase) {
    throw new Error("Sign up is unavailable right now.");
  }

  const normalized = normalizeUsername(username);
  if (!normalized) {
    throw new Error("Enter a valid player name.");
  }

  const email = realEmail.trim().toLowerCase();
  if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith("@players.cedar-chess.app"))) {
    throw new Error("Enter a valid personal email address.");
  }

  const { data, error } = await supabase.auth.signUp({
    email: email || buildSyntheticEmail(normalized),
    password,
    options: {
      emailRedirectTo: window.location.origin,
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
    return null;
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

/**
 * Password recovery is available only for accounts linked to an inbox the
 * player controls. Legacy generated player-name emails cannot receive mail.
 */
export const requestPlayerPasswordReset = async (email: string) => {
  if (!supabase) {
    throw new Error("Password recovery is unavailable right now.");
  }
  const address = email.trim().toLowerCase();
  if (!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(address) || address.endsWith("@players.cedar-chess.app")) {
    throw new Error("Enter a valid personal email address linked to your Cedar Chess account.");
  }

  const { error } = await supabase.auth.resetPasswordForEmail(address, {
    redirectTo: `${window.location.origin}${window.location.pathname}?reset-password=1`
  });
  if (error) {
    throw new Error(error.message);
  }
};

export const completePlayerPasswordReset = async (newPassword: string) => {
  if (!supabase) {
    throw new Error("Password recovery is unavailable right now.");
  }
  if (newPassword.length < 8) {
    throw new Error("Choose a password with at least 8 characters.");
  }
  const { data, error: userError } = await supabase.auth.getUser();
  if (userError || !data.user) {
    throw new Error("This password reset link has expired. Request another link.");
  }
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message);
  }
};
