import { supabase } from "./supabase";
import type { User } from "@supabase/supabase-js";

const LEGACY_DOMAIN = "@players.cedar-chess.app";

const requireAccount = async (): Promise<User> => {
  if (!supabase) {
    throw new Error("Account settings are unavailable right now.");
  }

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Your session has expired. Please sign in again.");
  }

  return data.user;
};

const verifyCurrentPassword = async (currentPassword: string): Promise<User> => {
  if (!supabase || !currentPassword) {
    throw new Error("Enter your current password.");
  }

  const user = await requireAccount();
  if (!user.email) {
    throw new Error("This account does not have a password-based email identity.");
  }

  // An authenticated session alone is not enough to authorize a sensitive change.
  const { data, error } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: currentPassword
  });

  if (error || !data.user || data.user.id !== user.id) {
    throw new Error("Your current password is incorrect.");
  }

  return data.user;
};

export const getAccountDetails = async () => {
  const user = await requireAccount();
  const email = user.email ?? "";
  return { email, hasPersonalEmail: Boolean(email) && !email.toLowerCase().endsWith(LEGACY_DOMAIN) };
};

export const changeAccountEmail = async (newEmail: string, currentPassword: string) => {
  if (!supabase) {
    throw new Error("Account settings are unavailable right now.");
  }

  const email = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.endsWith(LEGACY_DOMAIN)) {
    throw new Error("Enter a valid personal email address.");
  }

  const user = await verifyCurrentPassword(currentPassword);
  if (user.email?.toLowerCase() === email) {
    throw new Error("That is already your account email.");
  }

  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: window.location.origin }
  );
  if (error) {
    throw new Error(error.message);
  }
  // Supabase can require confirmation at both the old and new addresses.
  // Do not imply the change took effect before confirmation is finished.
};

export const changeAccountPassword = async (currentPassword: string, newPassword: string) => {
  if (!supabase) {
    throw new Error("Account settings are unavailable right now.");
  }
  if (newPassword.length < 8) {
    throw new Error("Choose a new password with at least 8 characters.");
  }
  if (newPassword === currentPassword) {
    throw new Error("Your new password must be different from the current password.");
  }

  await verifyCurrentPassword(currentPassword);
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) {
    throw new Error(error.message);
  }
};
