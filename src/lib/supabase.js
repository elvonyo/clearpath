// src/lib/supabase.js
// Drop this file in src/lib/ and import it wherever you need DB access

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Supabase env vars not set. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.'
  )
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// ─── AUTH HELPERS ────────────────────────────────────────────────────────────

export const signUp = (email, password) =>
  supabase.auth.signUp({ email, password })

export const signIn = (email, password) =>
  supabase.auth.signInWithPassword({ email, password })

export const signOut = () => supabase.auth.signOut()

export const getUser = () => supabase.auth.getUser()

// ─── DATA HELPERS ─────────────────────────────────────────────────────────────

export const db = {
  // Income
  getIncome: (userId) =>
    supabase.from('income_sources').select('*').eq('user_id', userId).eq('is_active', true),

  upsertIncome: (income) =>
    supabase.from('income_sources').upsert(income),

  deleteIncome: (id) =>
    supabase.from('income_sources').delete().eq('id', id),

  // Bills
  getBills: (userId) =>
    supabase.from('bills').select('*').eq('user_id', userId).eq('is_active', true).order('due_day'),

  upsertBill: (bill) =>
    supabase.from('bills').upsert(bill),

  deleteBill: (id) =>
    supabase.from('bills').delete().eq('id', id),

  // Goals
  getGoals: (userId) =>
    supabase.from('goals').select('*').eq('user_id', userId).order('created_at'),

  upsertGoal: (goal) =>
    supabase.from('goals').upsert(goal),

  deleteGoal: (id) =>
    supabase.from('goals').delete().eq('id', id),

  // Profile
  getProfile: (userId) =>
    supabase.from('profiles').select('*').eq('id', userId).single(),

  updateProfile: (userId, updates) =>
    supabase.from('profiles').update(updates).eq('id', userId),

  // Streaks & Badges
  getStreak: (userId) =>
    supabase.from('user_streaks').select('*').eq('user_id', userId).single(),

  updateStreak: (userId, updates) =>
    supabase.from('user_streaks').upsert({ user_id: userId, ...updates }),
}
