import { supabase } from './supabase';

export const signUp = async ({ email, password, name, phone, role }) => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name, phone, role } },
  });
  if (error) throw error;
  return data;
};

export const signIn = async ({ email, password }) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

export const getSession = async () => {
  const { data } = await supabase.auth.getSession();
  return data.session;
};
