import { useState, useEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

// ─── SUPABASE CLIENT ──────────────────────────────────────────────────────────
const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// ─── SUPABASE DATA HELPERS ────────────────────────────────────────────────────
const db = {
  // Load all user data in one shot
  loadAll: async (userId) => {
    const [incomes, bills, goals, streak, profile] = await Promise.all([
      supabase.from("income_sources").select("*").eq("user_id", userId).eq("is_active", true),
      supabase.from("bills").select("*").eq("user_id", userId).eq("is_active", true).order("due_day"),
      supabase.from("goals").select("*").eq("user_id", userId).order("created_at"),
      supabase.from("user_streaks").select("*").eq("user_id", userId).single(),
      supabase.from("profiles").select("name, created_at").eq("id", userId).single(),
    ]);

    // Log any errors
    if (incomes.error) console.error("incomes error:", incomes.error);
    if (bills.error)   console.error("bills error:", bills.error);
    if (goals.error)   console.error("goals error:", goals.error);
    if (streak.error)  console.error("streak error:", streak.error);
    if (profile.error) console.error("profile error:", profile.error);

    return {
      data: {
        incomes: incomes.data || [],
        bills: bills.data || [],
        goals: goals.data || [],
        streak: streak.data?.savings_streak || 0,
        earnedBadges: streak.data?.earned_badges || [],
        user: { name: profile.data?.name || "" },
      },
      // User is onboarded if their profile row exists (created on signup)
      hasProfile: !!profile.data,
    };
  },

  // Save a single income
  saveIncome: async (income, userId) => {
    const payload = {
      id: income.id || crypto.randomUUID(),
      name: income.name,
      type: income.type || "salary",
      amount: parseFloat(income.amount),
      frequency: income.frequency,
      is_active: true,
      user_id: userId,
    };
    console.log("saveIncome payload:", payload);
    const { error } = await supabase.from("income_sources").upsert(payload, { onConflict: "id" });
    if (error) console.error("saveIncome error:", error);
  },
  deleteIncome: async (id) => {
    const { error } = await supabase.from("income_sources").delete().eq("id", id);
    if (error) console.error("deleteIncome error:", error);
  },

  // Save a single bill
  saveBill: async (bill, userId) => {
    const payload = {
      id: bill.id || crypto.randomUUID(),
      name: bill.name,
      category: bill.category || "other",
      amount: parseFloat(bill.amount),
      due_day: parseInt(bill.dueDay || bill.due_day) || 1,
      recurrence: bill.recurrence || "monthly",
      is_autopay: bill.isAutopay || false,
      is_active: true,
      user_id: userId,
    };
    console.log("saveBill payload:", payload);
    const { error } = await supabase.from("bills").upsert(payload, { onConflict: "id" });
    if (error) console.error("saveBill error:", error);
  },
  deleteBill: async (id) => {
    const { error } = await supabase.from("bills").delete().eq("id", id);
    if (error) console.error("deleteBill error:", error);
  },

  // Save a single goal
  saveGoal: async (goal, userId) => {
    const payload = {
      id: goal.id || crypto.randomUUID(),
      name: goal.name,
      emoji: goal.emoji || "🎯",
      target_amount: parseFloat(goal.targetAmount),
      current_amount: parseFloat(goal.currentAmount) || 0,
      per_paycheck: parseFloat(goal.perPaycheck) || 0,
      is_completed: goal.completed || false,
      user_id: userId,
    };
    console.log("saveGoal payload:", payload);
    const { error } = await supabase.from("goals").upsert(payload, { onConflict: "id" });
    if (error) console.error("saveGoal error:", error);
  },
  deleteGoal: async (id) => {
    const { error } = await supabase.from("goals").delete().eq("id", id);
    if (error) console.error("deleteGoal error:", error);
  },

  // Streak & badges — always upsert (single row per user)
  saveStreak: (userId, streak, badges) =>
    supabase.from("user_streaks").upsert({
      user_id: userId,
      savings_streak: streak,
      earned_badges: badges,
    }, { onConflict: "user_id" }),

  // Profile name
  saveName: (userId, name) =>
    supabase.from("profiles").upsert({ id: userId, name }, { onConflict: "id" }),
};

// ─── CONSTANTS & CONFIG ──────────────────────────────────────────────────────
// ── AI config — model is set in api/chat.js on the server

const BADGE_DEFS = [
  { id: "first_dollar", emoji: "💰", name: "First Dollar", desc: "Set up your income" },
  { id: "bill_tracker", emoji: "📋", name: "Bill Tracker", desc: "Added your first bill" },
  { id: "goal_setter", emoji: "🎯", name: "Goal Setter", desc: "Created your first goal" },
  { id: "streak_3", emoji: "🔥", name: "On Fire", desc: "3-month savings streak" },
  { id: "saved_500", emoji: "⭐", name: "Star Saver", desc: "Saved $500 total" },
  { id: "saved_1k", emoji: "🏆", name: "Grand Club", desc: "Saved $1,000 total" },
  { id: "goals_complete", emoji: "🎉", name: "Goal Crusher", desc: "Completed a goal" },
  { id: "ai_user", emoji: "🤖", name: "AI Partner", desc: "Used the AI assistant" },
];

const BILL_CATEGORIES = [
  { id: "housing", emoji: "🏠", label: "Housing" },
  { id: "transport", emoji: "🚗", label: "Transport" },
  { id: "utilities", emoji: "⚡", label: "Utilities" },
  { id: "subscriptions", emoji: "📱", label: "Subscriptions" },
  { id: "insurance", emoji: "🛡️", label: "Insurance" },
  { id: "food", emoji: "🍔", label: "Food" },
  { id: "health", emoji: "💊", label: "Health" },
  { id: "other", emoji: "📦", label: "Other" },
];

const GOAL_EMOJIS = ["🏖️","🚗","🏠","💍","💻","✈️","🎓","🏋️","🎸","🐕","🍕","💰","📱","🎮","🌿"];

const FREQ_OPTIONS = [
  { id: "weekly", label: "Weekly", multiplier: 52 },
  { id: "biweekly", label: "Every 2 Weeks", multiplier: 26 },
  { id: "monthly", label: "Monthly", multiplier: 12 },
  { id: "annual", label: "Annual", multiplier: 1 },
];

// ─── FINANCIAL CALCULATION ENGINE ─────────────────────────────────────────────
const calcAnnualIncome = (amount, frequency) => {
  const m = { weekly: 52, biweekly: 26, monthly: 12, annual: 1 };
  return amount * (m[frequency] || 12);
};

const calcMonthlyIncome = (amount, frequency) => calcAnnualIncome(amount, frequency) / 12;

const calcMonthlyBills = (bills) => {
  if (!bills.length) return 0;
  const billMultipliers = { weekly: 52/12, biweekly: 26/12, monthly: 1, annual: 1/12, "one-time": 0 };
  return bills.filter(b => b.active).reduce((sum, b) => {
    const mult = billMultipliers[b.recurrence || "monthly"] ?? 1;
    return sum + (parseFloat(b.amount) || 0) * mult;
  }, 0);
};

const calcNextDueDate = (dueDay, recurrence = "monthly") => {
  if (recurrence === "annual") return null;
  const today = new Date();
  const next = new Date(today.getFullYear(), today.getMonth(), dueDay);
  if (next <= today) next.setMonth(next.getMonth() + 1);
  return next;
};

const daysUntil = (date) => {
  if (!date) return null;
  const diff = new Date(date) - new Date();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
};

const calcHealthScore = (monthlyIncome, monthlyBills, savingsRate, streak) => {
  if (!monthlyIncome) return 0;
  const coverage = Math.min(20, Math.max(0, 20 - (monthlyBills / monthlyIncome) * 40));
  const savings = Math.min(20, savingsRate / 0.2 * 20);
  const streakScore = Math.min(10, streak * 2);
  const base = 50;
  return Math.round(Math.min(100, Math.max(0, base + coverage + savings + streakScore)));
};

const formatCurrency = (n, compact = false) => {
  const num = parseFloat(n) || 0;
  if (compact && Math.abs(num) >= 1000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(num);
  }
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(num);
};

const calcIncomeBreakdown = (annualIncome) => ({
  annual: annualIncome,
  monthly: annualIncome / 12,
  biweekly: annualIncome / 26,
  weekly: annualIncome / 52,
  daily: annualIncome / 260,
  hourly: annualIncome / (260 * 8),
});

const calcGoalForecast = (goal, monthlySavingsAvailable) => {
  const remaining = goal.targetAmount - goal.currentAmount;
  if (remaining <= 0) return { months: 0, date: new Date() };
  if (!goal.perPaycheck && !monthlySavingsAvailable) return { months: Infinity, date: null };
  const monthly = goal.perPaycheck ? goal.perPaycheck * 2 : monthlySavingsAvailable;
  if (monthly <= 0) return { months: Infinity, date: null };
  const months = Math.ceil(remaining / monthly);
  const date = new Date();
  date.setMonth(date.getMonth() + months);
  return { months, date };
};

const calcAffordability = (amount, monthlyIncome, monthlyBills, goals, incomeBreakdown) => {
  const available = Math.max(0, monthlyIncome - monthlyBills);
  const canAfford = amount <= available;
  const workHours = incomeBreakdown.hourly > 0 ? amount / incomeBreakdown.hourly : 0;
  const workDays = incomeBreakdown.daily > 0 ? amount / incomeBreakdown.daily : 0;
  const remainingAfter = available - amount;
  const savingsImpact = goals.length > 0 ? Math.round((amount / available) * 30) : 0;
  return { canAfford, stretch: !canAfford && amount <= available * 1.3, workHours, workDays, remainingAfter, savingsImpact };
};

// ─── STORAGE ─────────────────────────────────────────────────────────────────
// All data lives in Supabase — localStorage is cleared on load to prevent stale data
const STORAGE_KEY = "clearpath_v1";
const defaultState = {
  user: { name: "", theme: "dark" },
  incomes: [],
  bills: [],
  goals: [],
  expenses: [],
  streak: 0,
  earnedBadges: [],
  aiHistory: [],
  onboarded: false,
};

// ─── STYLES ──────────────────────────────────────────────────────────────────
const injectStyles = () => {
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=JetBrains+Mono:wght@400;500;600&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    
    :root {
      --bg: #0A0A0A;
      --surface: #141414;
      --surface2: #1E1E1E;
      --surface3: #282828;
      --border: #2A2A2A;
      --primary: #00D68F;
      --primary-dim: #00A36B;
      --accent: #F5A623;
      --danger: #FF4D4D;
      --warning: #FFB800;
      --text: #F0EDE8;
      --text2: #9CA3AF;
      --text3: #6B7280;
      --font-display: 'DM Serif Display', serif;
      --font-body: 'DM Sans', sans-serif;
      --font-mono: 'JetBrains Mono', monospace;
      --radius: 16px;
      --radius-sm: 10px;
      --radius-lg: 24px;
      --shadow: 0 4px 24px rgba(0,0,0,0.4);
      --shadow-lg: 0 8px 40px rgba(0,0,0,0.6);
    }

    .light-mode {
      --bg: #F5F2EE;
      --surface: #FFFFFF;
      --surface2: #F0EDE8;
      --surface3: #E8E4DF;
      --border: #E2DDD8;
      --text: #0A0A0A;
      --text2: #5A5A5A;
      --text3: #9CA3AF;
      --shadow: 0 4px 24px rgba(0,0,0,0.08);
      --shadow-lg: 0 8px 40px rgba(0,0,0,0.12);
    }

    html, body { height: 100%; }

    body {
      font-family: var(--font-body);
      background: var(--bg);
      color: var(--text);
      min-height: 100vh;
      -webkit-font-smoothing: antialiased;
    }

    #root {
      display: flex;
      justify-content: center;
      align-items: flex-start;
      min-height: 100vh;
      background: var(--bg);
    }

    .app-shell {
      width: 100%;
      max-width: 430px;
      min-height: 100vh;
      min-height: 100dvh;
      background: var(--bg);
      display: flex;
      flex-direction: column;
      position: relative;
      overflow-x: hidden;
      margin: 0 auto;
    }

    .screen {
      flex: 1;
      overflow-y: auto;
      padding-bottom: 80px;
      scrollbar-width: none;
      width: 100%;
    }
    .screen::-webkit-scrollbar { display: none; }

    /* HEADER */
    .header {
      padding: 54px 24px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      position: sticky;
      top: 0;
      z-index: 10;
      background: var(--bg);
    }
    .header-title {
      font-family: var(--font-display);
      font-size: 22px;
      color: var(--text);
    }
    .header-subtitle {
      font-size: 13px;
      color: var(--text2);
      margin-top: 2px;
    }

    /* NAVIGATION */
    .nav {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      width: 100%;
      max-width: 430px;
      margin: 0 auto;
      background: var(--surface);
      border-top: 1px solid var(--border);
      display: flex;
      padding: 8px 0 env(safe-area-inset-bottom, 16px);
      z-index: 100;
    }
    .nav-item {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
      padding: 8px 0;
      cursor: pointer;
      border: none;
      background: none;
      color: var(--text3);
      font-family: var(--font-body);
      font-size: 10px;
      font-weight: 500;
      transition: color 0.15s;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .nav-item:active { transform: scale(0.95); }
    .nav-item.active { color: var(--primary); }
    .nav-icon { font-size: 22px; line-height: 1; }

    /* CARDS */
    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 20px;
      margin: 0 16px 12px;
      width: calc(100% - 32px);
    }
    .card-sm {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px;
      width: 100%;
    }
    .card-label {
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 1px;
      text-transform: uppercase;
      color: var(--text3);
      margin-bottom: 6px;
    }

    /* HERO AMOUNT */
    .hero-amount {
      font-family: var(--font-mono);
      font-size: 52px;
      font-weight: 600;
      letter-spacing: -2px;
      line-height: 1;
      color: var(--text);
    }
    .hero-amount.positive { color: var(--primary); }
    .hero-amount.negative { color: var(--danger); }
    .hero-amount.warning { color: var(--warning); }

    /* HEALTH SCORE RING */
    .score-ring-wrap {
      display: flex;
      align-items: center;
      gap: 16px;
    }
    .score-ring {
      width: 72px;
      height: 72px;
      position: relative;
      flex-shrink: 0;
    }
    .score-ring svg { transform: rotate(-90deg); }
    .score-number {
      position: absolute;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: var(--font-mono);
      font-size: 20px;
      font-weight: 600;
    }
    .score-info { flex: 1; }
    .score-label {
      font-size: 18px;
      font-weight: 600;
      color: var(--text);
    }
    .score-sub {
      font-size: 13px;
      color: var(--text2);
      margin-top: 4px;
    }

    /* PILLS & TAGS */
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 500;
    }
    .pill-green { background: rgba(0,214,143,0.12); color: var(--primary); }
    .pill-red { background: rgba(255,77,77,0.12); color: var(--danger); }
    .pill-yellow { background: rgba(255,184,0,0.12); color: var(--warning); }
    .pill-orange { background: rgba(245,166,35,0.12); color: var(--accent); }
    .pill-neutral { background: var(--surface2); color: var(--text2); }

    /* BUTTONS */
    .btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 16px 24px;
      border-radius: var(--radius-sm);
      font-family: var(--font-body);
      font-size: 16px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      transition: all 0.15s;
      letter-spacing: 0.2px;
    }
    .btn:active { transform: scale(0.97); }
    .btn-primary { background: var(--primary); color: #0A0A0A; }
    .btn-primary:hover { background: #00F0A0; }
    .btn-secondary { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
    .btn-secondary:hover { background: var(--surface3); }
    .btn-danger { background: rgba(255,77,77,0.12); color: var(--danger); border: 1px solid rgba(255,77,77,0.2); }
    .btn-full { width: 100%; }
    .btn-sm { padding: 10px 16px; font-size: 14px; }

    /* FAB */
    .fab {
      position: fixed;
      bottom: 84px;
      right: calc(50% - 215px + 20px);
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: var(--primary);
      color: #0A0A0A;
      border: none;
      font-size: 26px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 20px rgba(0,214,143,0.4);
      transition: all 0.2s;
      z-index: 99;
    }
    .fab:active { transform: scale(0.92); }

    /* INPUTS */
    .input-group { margin-bottom: 16px; }
    .input-label {
      display: block;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.8px;
      text-transform: uppercase;
      color: var(--text2);
      margin-bottom: 8px;
    }
    .input {
      width: 100%;
      background: var(--surface2);
      border: 1.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 14px 16px;
      color: var(--text);
      font-family: var(--font-body);
      font-size: 16px;
      outline: none;
      transition: border-color 0.15s;
    }
    .input:focus { border-color: var(--primary); }
    .input::placeholder { color: var(--text3); }
    .input-prefix-wrap {
      position: relative;
    }
    .input-prefix {
      position: absolute;
      left: 16px;
      top: 50%;
      transform: translateY(-50%);
      color: var(--text2);
      font-size: 16px;
      pointer-events: none;
    }
    .input-with-prefix { padding-left: 30px; }
    .input-mono { font-family: var(--font-mono); }
    select.input {
      appearance: none;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%239CA3AF' d='M6 8L0 0h12z'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 14px center;
      padding-right: 40px;
      cursor: pointer;
    }

    /* BIG INPUT (Affordability) */
    .big-input {
      width: 100%;
      background: transparent;
      border: none;
      color: var(--text);
      font-family: var(--font-mono);
      font-size: 48px;
      font-weight: 600;
      text-align: center;
      outline: none;
      letter-spacing: -2px;
    }
    .big-input::placeholder { color: var(--text3); }

    /* PROGRESS BAR */
    .progress-track {
      height: 8px;
      background: var(--surface2);
      border-radius: 100px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      border-radius: 100px;
      transition: width 0.5s ease;
    }

    /* BILL ITEM */
    .bill-row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px 0;
      border-bottom: 1px solid var(--border);
      cursor: pointer;
    }
    .bill-row:last-child { border-bottom: none; }
    .bill-icon {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: var(--surface2);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      flex-shrink: 0;
    }
    .bill-info { flex: 1 }
    .bill-name { font-size: 15px; font-weight: 500; color: var(--text); }
    .bill-meta { font-size: 12px; color: var(--text2); margin-top: 2px; }
    .bill-amount {
      font-family: var(--font-mono);
      font-size: 15px;
      font-weight: 600;
      color: var(--text);
    }

    /* GOAL CARD */
    .goal-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 16px;
      margin: 0 16px 12px;
      width: calc(100% - 32px);
      cursor: pointer;
    }
    .goal-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 12px;
    }
    .goal-name-wrap { display: flex; align-items: center; gap: 10px; }
    .goal-emoji { font-size: 28px; }
    .goal-name { font-size: 16px; font-weight: 600; color: var(--text); }
    .goal-meta { font-size: 12px; color: var(--text2); margin-top: 2px; }

    /* AI CHAT */
    .ai-screen {
      display: flex;
      flex-direction: column;
      height: calc(100vh - 60px);
      overflow: hidden;
    }
    .ai-messages {
      display: flex;
      flex-direction: column;
      gap: 12px;
      padding: 16px 16px 24px;
      overflow-y: auto;
      flex: 1;
      scrollbar-width: none;
    }
    .ai-messages::-webkit-scrollbar { display: none; }
    .ai-message {
      max-width: 85%;
      padding: 12px 16px;
      border-radius: var(--radius);
      font-size: 14px;
      line-height: 1.5;
    }
    .ai-message.user {
      background: var(--primary);
      color: #0A0A0A;
      align-self: flex-end;
      border-bottom-right-radius: 4px;
      font-weight: 500;
    }
    .ai-message.assistant {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--text);
      align-self: flex-start;
      border-bottom-left-radius: 4px;
    }
    .ai-input-bar {
      position: fixed;
      bottom: calc(65px + env(safe-area-inset-bottom, 0px));
      left: 0;
      right: 0;
      width: 100%;
      max-width: 430px;
      margin: 0 auto;
      background: var(--bg);
      padding: 10px 16px 12px;
      display: flex;
      gap: 10px;
      border-top: 1px solid var(--border);
      z-index: 50;
    }
    .ai-input-bar .input { flex: 1; padding: 12px 14px; }

    /* GRID */
    .grid-2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
      margin: 0 16px 12px;
    }

    /* INCOME BREAKDOWN TABLE */
    .breakdown-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }
    .breakdown-row:last-child { border-bottom: none; }
    .breakdown-period { font-size: 14px; color: var(--text2); }
    .breakdown-amount {
      font-family: var(--font-mono);
      font-size: 16px;
      font-weight: 600;
      color: var(--text);
    }

    /* FORECAST */
    .forecast-item {
      display: flex;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid var(--border);
      gap: 12px;
    }
    .forecast-item:last-child { border-bottom: none; }
    .forecast-period { font-size: 13px; color: var(--text2); width: 80px; flex-shrink: 0; }
    .forecast-bar-wrap { flex: 1; }
    .forecast-amount {
      font-family: var(--font-mono);
      font-size: 14px;
      font-weight: 600;
      color: var(--primary);
      width: 90px;
      text-align: right;
      flex-shrink: 0;
    }

    /* MODAL */
    .modal-overlay {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.8);
      z-index: 200;
      display: flex;
      align-items: flex-end;
      backdrop-filter: blur(4px);
    }
    .modal {
      background: var(--surface);
      border-radius: var(--radius-lg) var(--radius-lg) 0 0;
      width: 100%;
      max-width: 430px;
      margin: 0 auto;
      padding: 24px;
      max-height: 92vh;
      overflow-y: auto;
      animation: slideUp 0.25s ease;
    }
    .modal::-webkit-scrollbar { display: none; }
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    .modal-handle {
      width: 40px;
      height: 4px;
      background: var(--border);
      border-radius: 100px;
      margin: 0 auto 20px;
    }
    .modal-title {
      font-family: var(--font-display);
      font-size: 22px;
      margin-bottom: 20px;
      color: var(--text);
    }

    /* BADGE */
    .badge-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 16px 8px;
      background: var(--surface2);
      border-radius: var(--radius-sm);
      text-align: center;
    }
    .badge-emoji { font-size: 32px; }
    .badge-name { font-size: 11px; font-weight: 600; color: var(--text2); }
    .badge-item.locked { opacity: 0.3; filter: grayscale(1); }

    /* CHIP ROW */
    .chip-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      margin-bottom: 12px;
    }
    .chip {
      padding: 8px 14px;
      border-radius: 100px;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      border: 1.5px solid var(--border);
      background: var(--surface2);
      color: var(--text2);
      transition: all 0.15s;
    }
    .chip.selected {
      background: rgba(0,214,143,0.12);
      border-color: var(--primary);
      color: var(--primary);
    }

    /* STREAK */
    .streak-bar {
      display: flex;
      gap: 6px;
      justify-content: center;
    }
    .streak-dot {
      width: 28px;
      height: 28px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
    }
    .streak-dot.filled { background: var(--primary); }
    .streak-dot.empty { background: var(--surface2); border: 1.5px solid var(--border); }

    /* AUTH SCREEN */
    .auth-screen {
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 24px;
      background: var(--bg);
    }
    .auth-card {
      width: 100%;
      max-width: 380px;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      padding: 32px 28px;
    }
    .auth-logo {
      font-family: var(--font-display);
      font-size: 28px;
      color: var(--primary);
      text-align: center;
      margin-bottom: 6px;
    }
    .auth-tagline {
      font-size: 13px;
      color: var(--text2);
      text-align: center;
      margin-bottom: 28px;
    }
    .auth-tabs {
      display: flex;
      background: var(--surface2);
      border-radius: var(--radius-sm);
      padding: 3px;
      margin-bottom: 24px;
    }
    .auth-tab {
      flex: 1;
      padding: 9px;
      border-radius: 8px;
      border: none;
      background: none;
      font-family: var(--font-body);
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      color: var(--text2);
      transition: all 0.15s;
    }
    .auth-tab.active {
      background: var(--surface);
      color: var(--text);
      box-shadow: 0 1px 4px rgba(0,0,0,0.2);
    }
    .auth-error {
      background: rgba(255,77,77,0.1);
      border: 1px solid rgba(255,77,77,0.3);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      font-size: 13px;
      color: var(--danger);
      margin-bottom: 14px;
    }
    .auth-success {
      background: rgba(0,214,143,0.1);
      border: 1px solid rgba(0,214,143,0.3);
      border-radius: var(--radius-sm);
      padding: 10px 14px;
      font-size: 13px;
      color: var(--primary);
      margin-bottom: 14px;
    }
    .auth-divider {
      display: flex;
      align-items: center;
      gap: 12px;
      margin: 20px 0;
    }
    .auth-divider-line { flex: 1; height: 1px; background: var(--border); }
    .auth-divider-text { font-size: 12px; color: var(--text3); }
    .auth-footer {
      text-align: center;
      font-size: 12px;
      color: var(--text3);
      margin-top: 20px;
      line-height: 1.6;
    }
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      padding: 60px 24px 40px;
    }
    .onboard-step { flex: 1; display: flex; flex-direction: column; }
    .onboard-emoji { font-size: 64px; margin-bottom: 24px; }
    .onboard-title {
      font-family: var(--font-display);
      font-size: 32px;
      line-height: 1.2;
      color: var(--text);
      margin-bottom: 12px;
    }
    .onboard-sub {
      font-size: 16px;
      line-height: 1.6;
      color: var(--text2);
      margin-bottom: 40px;
    }

    /* QUICK STATS */
    .stat-box {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 16px;
      text-align: center;
    }
    .stat-value {
      font-family: var(--font-mono);
      font-size: 22px;
      font-weight: 600;
      color: var(--text);
    }
    .stat-label { font-size: 11px; color: var(--text2); margin-top: 4px; text-transform: uppercase; letter-spacing: 0.5px; }

    /* DIVIDER */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 16px 0;
    }

    /* SECTION HEADER */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 24px 8px;
    }
    .section-title { font-size: 13px; font-weight: 600; letter-spacing: 0.8px; text-transform: uppercase; color: var(--text2); }
    .section-action { font-size: 13px; color: var(--primary); cursor: pointer; }

    /* AFFORDABILITY RESULT */
    .afford-result {
      padding: 24px;
      border-radius: var(--radius);
      text-align: center;
      margin: 16px;
      border: 1.5px solid;
    }
    .afford-result.yes { background: rgba(0,214,143,0.06); border-color: rgba(0,214,143,0.3); }
    .afford-result.stretch { background: rgba(255,184,0,0.06); border-color: rgba(255,184,0,0.3); }
    .afford-result.no { background: rgba(255,77,77,0.06); border-color: rgba(255,77,77,0.3); }
    .afford-verdict { font-size: 32px; margin-bottom: 8px; }
    .afford-text { font-size: 20px; font-weight: 700; margin-bottom: 4px; }
    .afford-sub { font-size: 14px; color: var(--text2); }

    /* EMPTY STATE */
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 48px 32px;
      text-align: center;
      gap: 12px;
    }
    .empty-emoji { font-size: 48px; }
    .empty-title { font-size: 18px; font-weight: 600; color: var(--text); }
    .empty-sub { font-size: 14px; color: var(--text2); line-height: 1.5; }

    /* LOADING */
    .loading-dot {
      display: inline-block;
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--primary);
      animation: pulse 1s ease-in-out infinite;
    }
    .loading-dot:nth-child(2) { animation-delay: 0.2s; }
    .loading-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes pulse {
      0%, 100% { opacity: 0.3; transform: scale(0.8); }
      50% { opacity: 1; transform: scale(1); }
    }

    /* CONFETTI */
    @keyframes confettiFall {
      0% { transform: translateY(-20px) rotate(0deg); opacity: 1; }
      100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
    }

    /* SETTINGS */
    .settings-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 0;
      border-bottom: 1px solid var(--border);
    }
    .settings-row:last-child { border-bottom: none; }
    .settings-row-info { flex: 1; }
    .settings-row-label { font-size: 15px; font-weight: 500; color: var(--text); }
    .settings-row-sub { font-size: 12px; color: var(--text2); margin-top: 2px; }

    /* TOGGLE */
    .toggle {
      width: 48px;
      height: 28px;
      border-radius: 100px;
      background: var(--surface3);
      border: none;
      cursor: pointer;
      position: relative;
      transition: background 0.2s;
      flex-shrink: 0;
    }
    .toggle.on { background: var(--primary); }
    .toggle::after {
      content: '';
      position: absolute;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: white;
      top: 3px;
      left: 3px;
      transition: transform 0.2s;
      box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    }
    .toggle.on::after { transform: translateX(20px); }

    /* MISC */
    .text-primary { color: var(--primary); }
    .text-danger { color: var(--danger); }
    .text-warning { color: var(--warning); }
    .text-muted { color: var(--text2); }
    .fw-600 { font-weight: 600; }
    .fw-500 { font-weight: 500; }
    .mt-8 { margin-top: 8px; }
    .mt-16 { margin-top: 16px; }
    .mt-24 { margin-top: 24px; }
    .flex { display: flex; }
    .flex-center { display: flex; align-items: center; }
    .flex-between { display: flex; align-items: center; justify-content: space-between; }
    .gap-8 { gap: 8px; }
    .gap-12 { gap: 12px; }
    .full { width: 100%; }

    @media (min-width: 431px) {
      #root { background: #050505; }
      .app-shell { box-shadow: 0 0 80px rgba(0,0,0,0.8); }
    }
  `;
  const style = document.createElement("style");
  style.textContent = css;
  document.head.appendChild(style);
};

// ─── SMALL COMPONENTS ─────────────────────────────────────────────────────────
const HealthRing = ({ score }) => {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const filled = circ * (score / 100);
  const color = score >= 80 ? "#00D68F" : score >= 60 ? "#3B82F6" : score >= 40 ? "#FFB800" : score >= 20 ? "#F5A623" : "#FF4D4D";
  const label = score >= 80 ? "Excellent" : score >= 60 ? "Good" : score >= 40 ? "Fair" : score >= 20 ? "Needs Work" : "At Risk";
  return (
    <div className="score-ring-wrap">
      <div className="score-ring">
        <svg width="72" height="72" viewBox="0 0 72 72">
          <circle cx="36" cy="36" r={r} fill="none" stroke="var(--surface2)" strokeWidth="6" />
          <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="6"
            strokeDasharray={`${filled} ${circ - filled}`} strokeLinecap="round" />
        </svg>
        <div className="score-number" style={{ color }}>{score}</div>
      </div>
      <div className="score-info">
        <div className="score-label">{label}</div>
        <div className="score-sub">Financial Health Score</div>
      </div>
    </div>
  );
};

const LoadingDots = () => (
  <div style={{ display: "flex", gap: 6, padding: "8px 0" }}>
    <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
  </div>
);

const Toggle = ({ on, onToggle }) => (
  <button className={`toggle ${on ? "on" : ""}`} onClick={onToggle} />
);

const ProgressBar = ({ pct, color = "var(--primary)", height = 8 }) => (
  <div className="progress-track" style={{ height }}>
    <div className="progress-fill" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
  </div>
);

const Modal = ({ show, onClose, title, children }) => {
  if (!show) return null;
  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ maxWidth: 430 }}>
        <div className="modal-handle" />
        {title && <div className="modal-title">{title}</div>}
        {children}
      </div>
    </div>
  );
};

// ─── AUTH SCREEN ──────────────────────────────────────────────────────────────
const AuthScreen = ({ onAuth }) => {
  const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleSubmit = async () => {
    setError(""); setSuccess("");
    if (!email || (!password && mode !== "forgot")) return setError("Please fill in all fields.");
    if (mode === "signup" && password.length < 6) return setError("Password must be at least 6 characters.");

    // Debug: check env vars are loaded
    const url = import.meta.env.VITE_SUPABASE_URL;
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
    console.log("Supabase URL:", url);
    console.log("Anon key starts with:", key?.slice(0, 20));
    if (!url || !key) {
      return setError("Config error: Supabase environment variables are missing. Check Vercel settings.");
    }

    setLoading(true);

    try {
      if (mode === "login") {
        const { data, error: e } = await supabase.auth.signInWithPassword({ email, password });
        console.log("Login result:", { data, error: e });
        if (e) throw e;
        onAuth(data.user);

      } else if (mode === "signup") {
        const { data, error: e } = await supabase.auth.signUp({ email, password });
        console.log("Signup result:", { data, error: e });
        if (e) throw e;
        // Save name to profile
        if (data.user && name) {
          await supabase.from("profiles").upsert({ id: data.user.id, name });
        }
        // If email confirm is off, user is logged in immediately
        if (data.session) {
          onAuth(data.user);
        } else {
          setSuccess("Account created! Check your email to confirm, then log in.");
          setMode("login");
        }

      } else if (mode === "forgot") {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin,
        });
        if (e) throw e;
        setSuccess("Password reset email sent! Check your inbox.");
        setMode("login");
      }
    } catch (e) {
      console.error("Auth error full:", e);
      setError(e.message || "Something went wrong. Please try again.");
    }
    setLoading(false);
  };

  const handleKey = (e) => { if (e.key === "Enter") handleSubmit(); };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-logo">ClearPath</div>
        <div className="auth-tagline">Your financial truth, in 10 seconds.</div>

        {mode !== "forgot" && (
          <div className="auth-tabs">
            <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => { setMode("login"); setError(""); setSuccess(""); }}>Log In</button>
            <button className={`auth-tab ${mode === "signup" ? "active" : ""}`} onClick={() => { setMode("signup"); setError(""); setSuccess(""); }}>Sign Up</button>
          </div>
        )}

        {error && <div className="auth-error">⚠️ {error}</div>}
        {success && <div className="auth-success">✅ {success}</div>}

        {mode === "forgot" ? (
          <>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 20, lineHeight: 1.6 }}>
              Enter your email and we'll send you a link to reset your password.
            </div>
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey} placeholder="you@example.com" autoFocus />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleSubmit} disabled={loading}
              style={{ opacity: loading ? 0.7 : 1, marginTop: 8 }}>
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
            <button onClick={() => { setMode("login"); setError(""); }}
              style={{ display: "block", width: "100%", textAlign: "center", marginTop: 14, background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 14 }}>
              ← Back to Log In
            </button>
          </>
        ) : (
          <>
            {mode === "signup" && (
              <div className="input-group">
                <label className="input-label">Your First Name</label>
                <input className="input" type="text" value={name} onChange={e => setName(e.target.value)}
                  onKeyDown={handleKey} placeholder="Alex" autoFocus />
              </div>
            )}
            <div className="input-group">
              <label className="input-label">Email Address</label>
              <input className="input" type="email" value={email} onChange={e => setEmail(e.target.value)}
                onKeyDown={handleKey} placeholder="you@example.com" autoFocus={mode === "login"} />
            </div>
            <div className="input-group">
              <label className="input-label">Password</label>
              <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
                onKeyDown={handleKey} placeholder={mode === "signup" ? "At least 6 characters" : "Your password"} />
            </div>
            <button className="btn btn-primary btn-full" onClick={handleSubmit} disabled={loading}
              style={{ opacity: loading ? 0.7 : 1, marginTop: 4 }}>
              {loading ? (mode === "login" ? "Logging in..." : "Creating account...") : (mode === "login" ? "Log In" : "Create Account")}
            </button>
            {mode === "login" && (
              <button onClick={() => { setMode("forgot"); setError(""); }}
                style={{ display: "block", width: "100%", textAlign: "center", marginTop: 14, background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 13 }}>
                Forgot your password?
              </button>
            )}
          </>
        )}

        <div className="auth-footer">
          By using ClearPath you agree to our Terms of Service.<br />
          Your data is encrypted and never sold.
        </div>
      </div>
    </div>
  );
};

// ─── ONBOARDING ───────────────────────────────────────────────────────────────
const Onboarding = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [incomeAmount, setIncomeAmount] = useState("");
  const [incomeFreq, setIncomeFreq] = useState("biweekly");
  const [bills, setBills] = useState([]);
  const [showBillForm, setShowBillForm] = useState(false);
  const [newBill, setNewBill] = useState({ name: "", amount: "", category: "housing", recurrence: "monthly", dueDay: "1" });

  const addBill = () => {
    if (!newBill.name || !newBill.amount) return;
    setBills(prev => [...prev, { ...newBill, id: Date.now().toString(), active: true }]);
    setNewBill({ name: "", amount: "", category: "housing", recurrence: "monthly", dueDay: "1" });
    setShowBillForm(false);
  };

  const finish = () => {
    const income = { id: "1", name: "Primary Income", amount: parseFloat(incomeAmount) || 0, frequency: incomeFreq, type: "salary" };
    onComplete({ name, incomes: [income], bills, earnedBadges: ["first_dollar"] });
  };

  const steps = [
    {
      emoji: "👋",
      title: `Financial clarity in seconds`,
      sub: "ClearPath answers your money questions instantly. No jargon, no complexity, just truth.",
      content: (
        <div>
          <div className="input-group">
            <label className="input-label">Your first name</label>
            <input className="input" value={name} onChange={e => setName(e.target.value)} placeholder="Alex" autoFocus />
          </div>
        </div>
      ),
      canNext: true,
    },
    {
      emoji: "💰",
      title: "How much do you earn?",
      sub: "Don't worry about exact numbers. You can update this anytime.",
      content: (
        <div>
          <div className="input-group">
            <label className="input-label">Income Amount</label>
            <div className="input-prefix-wrap">
              <span className="input-prefix">$</span>
              <input className="input input-with-prefix input-mono" type="number" value={incomeAmount}
                onChange={e => setIncomeAmount(e.target.value)} placeholder="2,500.00" inputMode="decimal" />
            </div>
          </div>
          <div className="input-group">
            <label className="input-label">How often?</label>
            <div className="chip-row">
              {FREQ_OPTIONS.map(f => (
                <div key={f.id} className={`chip ${incomeFreq === f.id ? "selected" : ""}`}
                  onClick={() => setIncomeFreq(f.id)}>{f.label}</div>
              ))}
            </div>
          </div>
          {incomeAmount && (
            <div className="card-sm" style={{ background: "rgba(0,214,143,0.06)", borderColor: "rgba(0,214,143,0.2)" }}>
              <div style={{ fontSize: 13, color: "var(--text2)" }}>Monthly equivalent</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 24, fontWeight: 600, color: "var(--primary)", marginTop: 4 }}>
                {formatCurrency(calcMonthlyIncome(parseFloat(incomeAmount) || 0, incomeFreq))}/mo
              </div>
            </div>
          )}
        </div>
      ),
      canNext: !!incomeAmount,
    },
    {
      emoji: "📋",
      title: "Add your bills",
      sub: "Add your recurring expenses so ClearPath knows what's already spoken for.",
      content: (
        <div>
          {bills.map(b => (
            <div key={b.id} className="bill-row">
              <div className="bill-icon">{BILL_CATEGORIES.find(c => c.id === b.category)?.emoji || "📦"}</div>
              <div className="bill-info">
                <div className="bill-name">{b.name}</div>
                <div className="bill-meta">{b.recurrence}</div>
              </div>
              <div className="bill-amount">{formatCurrency(b.amount)}</div>
              <button onClick={() => setBills(prev => prev.filter(x => x.id !== b.id))}
                style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 18, padding: "0 0 0 8px" }}>×</button>
            </div>
          ))}
          {showBillForm ? (
            <div style={{ marginTop: 12 }}>
              <div className="input-group">
                <label className="input-label">Bill Name</label>
                <input className="input" value={newBill.name} onChange={e => setNewBill(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Rent" />
              </div>
              <div className="input-group">
                <label className="input-label">Amount</label>
                <div className="input-prefix-wrap">
                  <span className="input-prefix">$</span>
                  <input className="input input-with-prefix input-mono" type="number" value={newBill.amount}
                    onChange={e => setNewBill(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" inputMode="decimal" />
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Category</label>
                <div className="chip-row">
                  {BILL_CATEGORIES.map(c => (
                    <div key={c.id} className={`chip ${newBill.category === c.id ? "selected" : ""}`}
                      onClick={() => setNewBill(p => ({ ...p, category: c.id }))}>{c.emoji} {c.label}</div>
                  ))}
                </div>
              </div>
              <div className="input-group">
                <label className="input-label">Due Day (of month)</label>
                <input className="input" type="number" min="1" max="31" value={newBill.dueDay}
                  onChange={e => setNewBill(p => ({ ...p, dueDay: e.target.value }))} placeholder="1" inputMode="numeric" />
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button className="btn btn-primary" style={{ flex: 1 }} onClick={addBill}>Add Bill</button>
                <button className="btn btn-secondary" onClick={() => setShowBillForm(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button className="btn btn-secondary btn-full" style={{ marginTop: 8 }} onClick={() => setShowBillForm(true)}>
              + Add a Bill
            </button>
          )}
        </div>
      ),
      canNext: true,
    },
  ];

  const current = steps[step];

  return (
    <div className="app-shell">
      <div className="onboard-screen">
        <div className="onboard-step">
          <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
            {steps.map((_, i) => (
              <div key={i} style={{ height: 3, flex: 1, borderRadius: 100, background: i <= step ? "var(--primary)" : "var(--border)", transition: "background 0.3s" }} />
            ))}
          </div>
          <div className="onboard-emoji">{current.emoji}</div>
          <div className="onboard-title">{current.title}</div>
          <div className="onboard-sub">{current.sub}</div>
          <div style={{ flex: 1 }}>{current.content}</div>
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 10 }}>
            {current.canNext && (
              <button className="btn btn-primary btn-full" style={{ fontSize: 17, padding: 18 }}
                onClick={() => step < steps.length - 1 ? setStep(s => s + 1) : finish()}>
                {step < steps.length - 1 ? "Continue →" : "Let's Go 🚀"}
              </button>
            )}
            {step > 0 && (
              <button className="btn btn-secondary btn-full" onClick={() => setStep(s => s - 1)}>← Back</button>
            )}
            {step === steps.length - 1 && (
              <button onClick={finish} style={{ background: "none", border: "none", color: "var(--text2)", cursor: "pointer", fontSize: 14, textAlign: "center", padding: 12 }}>
                Skip for now
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── SNAPSHOT SCREEN ──────────────────────────────────────────────────────────
const SnapshotScreen = ({ state, onNav }) => {
  const { incomes, bills, goals, streak, user } = state;
  const totalMonthlyIncome = incomes.reduce((s, i) => s + calcMonthlyIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const totalMonthlyBills = calcMonthlyBills(bills);
  const available = totalMonthlyIncome - totalMonthlyBills;
  const savingsRate = totalMonthlyIncome > 0 ? (available / totalMonthlyIncome) : 0;
  const healthScore = calcHealthScore(totalMonthlyIncome, totalMonthlyBills, savingsRate, streak);

  const sortedBills = [...bills].filter(b => b.active && b.dueDay).sort((a, b) => {
    const da = daysUntil(calcNextDueDate(parseInt(a.dueDay)));
    const db = daysUntil(calcNextDueDate(parseInt(b.dueDay)));
    return (da ?? 99) - (db ?? 99);
  });
  const nextBill = sortedBills[0];
  const nextBillDays = nextBill ? daysUntil(calcNextDueDate(parseInt(nextBill.dueDay))) : null;

  const firstName = user?.name?.split(" ")[0] || "there";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  const totalGoalProgress = goals.length > 0
    ? goals.reduce((s, g) => s + Math.min(1, g.currentAmount / g.targetAmount), 0) / goals.length
    : 0;

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="header-title">{greeting}, {firstName} 👋</div>
          <div className="header-subtitle">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <button onClick={() => onNav("settings")} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer" }}>⚙️</button>
      </div>

      {/* AVAILABLE MONEY */}
      <div className="card" style={{ background: available > 0 ? "rgba(0,214,143,0.04)" : "rgba(255,77,77,0.04)", borderColor: available > 0 ? "rgba(0,214,143,0.2)" : "rgba(255,77,77,0.2)" }}>
        <div className="card-label">Available This Month</div>
        <div className={`hero-amount ${available > 0 ? "positive" : "negative"}`}>
          {formatCurrency(available, true)}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          <div className="pill pill-neutral">
            <span>💼</span> {formatCurrency(totalMonthlyIncome, true)}/mo in
          </div>
          <div className="pill pill-red">
            <span>📋</span> {formatCurrency(totalMonthlyBills, true)}/mo bills
          </div>
        </div>
        <button className="btn btn-secondary btn-full" style={{ marginTop: 14 }} onClick={() => onNav("afford")}>
          🤔 Can I afford something?
        </button>
      </div>

      {/* HEALTH SCORE */}
      <div className="card">
        <HealthRing score={healthScore} />
        <div style={{ marginTop: 14 }}>
          <ProgressBar pct={healthScore} color={healthScore >= 80 ? "#00D68F" : healthScore >= 60 ? "#3B82F6" : healthScore >= 40 ? "#FFB800" : "#FF4D4D"} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
          <div className="pill pill-green">
            💚 {Math.round(savingsRate * 100)}% savings rate
          </div>
          {streak > 0 && (
            <div className="pill pill-orange">
              🔥 {streak} month streak
            </div>
          )}
        </div>
      </div>

      {/* QUICK STATS */}
      <div className="grid-2">
        <div className="stat-box">
          <div className="stat-value">{nextBillDays !== null ? `${nextBillDays}d` : "—"}</div>
          <div className="stat-label">{nextBill ? `${nextBill.name}` : "No bills"}</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{goals.length > 0 ? `${Math.round(totalGoalProgress * 100)}%` : "—"}</div>
          <div className="stat-label">Goals Progress</div>
        </div>
      </div>

      {/* UPCOMING BILLS */}
      {sortedBills.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Upcoming Bills</span>
            <span className="section-action" onClick={() => onNav("bills")}>See all</span>
          </div>
          <div className="card" style={{ padding: "8px 20px" }}>
            {sortedBills.slice(0, 3).map(b => {
              const days = daysUntil(calcNextDueDate(parseInt(b.dueDay)));
              const cat = BILL_CATEGORIES.find(c => c.id === b.category);
              return (
                <div key={b.id} className="bill-row">
                  <div className="bill-icon">{cat?.emoji || "📦"}</div>
                  <div className="bill-info">
                    <div className="bill-name">{b.name}</div>
                    <div className="bill-meta">
                      {days === 0 ? <span style={{ color: "var(--danger)" }}>Due today!</span>
                        : days === 1 ? <span style={{ color: "var(--warning)" }}>Due tomorrow</span>
                        : days <= 7 ? <span style={{ color: "var(--warning)" }}>Due in {days} days</span>
                        : `Due in ${days} days`}
                    </div>
                  </div>
                  <div className="bill-amount">{formatCurrency(b.amount)}</div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* GOALS */}
      {goals.length > 0 && (
        <>
          <div className="section-header">
            <span className="section-title">Goals</span>
            <span className="section-action" onClick={() => onNav("goals")}>See all</span>
          </div>
          {goals.slice(0, 2).map(g => {
            const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
            return (
              <div key={g.id} className="card" style={{ padding: 16, margin: "0 16px 10px" }}>
                <div className="goal-header">
                  <div className="goal-name-wrap">
                    <span className="goal-emoji">{g.emoji}</span>
                    <div>
                      <div className="goal-name">{g.name}</div>
                      <div className="goal-meta">{formatCurrency(g.currentAmount)} of {formatCurrency(g.targetAmount)}</div>
                    </div>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--primary)" }}>{Math.round(pct)}%</div>
                </div>
                <ProgressBar pct={pct} />
              </div>
            );
          })}
        </>
      )}

      {/* EMPTY STATE */}
      {!incomes.length && (
        <div className="empty-state">
          <div className="empty-emoji">💡</div>
          <div className="empty-title">Set up your income first</div>
          <div className="empty-sub">Add your income to see your financial snapshot</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => onNav("income")}>Add Income</button>
        </div>
      )}

      <div style={{ paddingBottom: 12 }} />
    </div>
  );
};

// ─── AFFORDABILITY SCREEN ─────────────────────────────────────────────────────
const AffordScreen = ({ state }) => {
  const [amount, setAmount] = useState("");
  const { incomes, bills, goals } = state;

  const totalMonthlyIncome = incomes.reduce((s, i) => s + calcMonthlyIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const totalMonthlyBills = calcMonthlyBills(bills);
  const annualIncome = incomes.reduce((s, i) => s + calcAnnualIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const breakdown = calcIncomeBreakdown(annualIncome);

  const result = amount && parseFloat(amount) > 0
    ? calcAffordability(parseFloat(amount), totalMonthlyIncome, totalMonthlyBills, goals, breakdown)
    : null;

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="header-title">Affordability</div>
          <div className="header-subtitle">Enter a purchase amount</div>
        </div>
      </div>

      <div className="card" style={{ textAlign: "center" }}>
        <div className="card-label" style={{ marginBottom: 12 }}>How much does it cost?</div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 32, color: "var(--text2)" }}>$</span>
          <input className="big-input" type="number" value={amount}
            onChange={e => setAmount(e.target.value)} placeholder="0" inputMode="decimal" style={{ maxWidth: 260 }} />
        </div>
        {/* Quick amounts */}
        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
          {[25, 50, 100, 250, 500, 1000].map(n => (
            <button key={n} onClick={() => setAmount(n.toString())}
              className={`chip ${parseFloat(amount) === n ? "selected" : ""}`}>${n}</button>
          ))}
        </div>
      </div>

      {result && (
        <>
          <div className={`afford-result ${result.canAfford ? "yes" : result.stretch ? "stretch" : "no"}`}>
            <div className="afford-verdict">{result.canAfford ? "✅" : result.stretch ? "⚠️" : "❌"}</div>
            <div className="afford-text" style={{ color: result.canAfford ? "var(--primary)" : result.stretch ? "var(--warning)" : "var(--danger)" }}>
              {result.canAfford ? "Yes, you can afford this" : result.stretch ? "It's a stretch" : "Not right now"}
            </div>
            <div className="afford-sub">
              {result.canAfford
                ? `You'll have ${formatCurrency(result.remainingAfter)} left after`
                : result.stretch
                ? `You'd be short by ${formatCurrency(Math.abs(result.remainingAfter))}`
                : `You'd be ${formatCurrency(Math.abs(result.remainingAfter))} short this month`}
            </div>
          </div>

          <div className="card">
            <div className="card-label" style={{ marginBottom: 12 }}>The Real Cost</div>
            <div className="breakdown-row">
              <span className="breakdown-period">⏰ Work hours</span>
              <span className="breakdown-amount" style={{ color: "var(--text)" }}>
                {breakdown.hourly > 0 ? `${result.workHours.toFixed(1)} hrs` : "—"}
              </span>
            </div>
            <div className="breakdown-row">
              <span className="breakdown-period">📅 Work days</span>
              <span className="breakdown-amount" style={{ color: "var(--text)" }}>
                {breakdown.daily > 0 ? `${result.workDays.toFixed(1)} days` : "—"}
              </span>
            </div>
            <div className="breakdown-row">
              <span className="breakdown-period">💰 After buying</span>
              <span className="breakdown-amount" style={{ color: result.remainingAfter >= 0 ? "var(--primary)" : "var(--danger)" }}>
                {formatCurrency(result.remainingAfter)}
              </span>
            </div>
            {result.savingsImpact > 0 && (
              <div className="breakdown-row">
                <span className="breakdown-period">🎯 Goal delay</span>
                <span className="breakdown-amount" style={{ color: "var(--warning)" }}>~{result.savingsImpact} days</span>
              </div>
            )}
          </div>

          {!breakdown.hourly && (
            <div style={{ padding: "0 16px 8px", fontSize: 13, color: "var(--text2)", textAlign: "center" }}>
              Add income to see work-time cost ↑
            </div>
          )}
        </>
      )}

      {!result && totalMonthlyIncome > 0 && (
        <div className="card" style={{ textAlign: "center", color: "var(--text2)" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🤔</div>
          <div style={{ fontSize: 15 }}>Enter an amount above to see if you can afford it</div>
          <div style={{ marginTop: 8, fontSize: 13 }}>
            You have <strong style={{ color: "var(--primary)" }}>{formatCurrency(Math.max(0, totalMonthlyIncome - totalMonthlyBills))}</strong> available this month
          </div>
        </div>
      )}
    </div>
  );
};

// ─── INCOME SCREEN ────────────────────────────────────────────────────────────
const IncomeScreen = ({ state, onUpdate }) => {
  const { incomes } = state;
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "Primary Income", amount: "", frequency: "biweekly", type: "salary" });
  const [editId, setEditId] = useState(null);

  const totalAnnual = incomes.reduce((s, i) => s + calcAnnualIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const bd = calcIncomeBreakdown(totalAnnual);

  const save = () => {
    if (!form.amount) return;
    const income = { ...form, id: editId || crypto.randomUUID(), amount: parseFloat(form.amount) };
    if (editId) {
      onUpdate({ incomes: incomes.map(i => i.id === editId ? income : i), _syncAction: "saveIncome", _syncItem: income });
    } else {
      onUpdate({ incomes: [...incomes, income], _syncAction: "saveIncome", _syncItem: income });
    }
    setForm({ name: "Primary Income", amount: "", frequency: "biweekly", type: "salary" });
    setShowAdd(false);
    setEditId(null);
  };

  const del = (id) => onUpdate({ incomes: incomes.filter(i => i.id !== id), _syncAction: "deleteIncome", _syncItem: { id } });

  const startEdit = (income) => {
    setForm({ name: income.name, amount: income.amount.toString(), frequency: income.frequency, type: income.type });
    setEditId(income.id);
    setShowAdd(true);
  };

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="header-title">Income</div>
          <div className="header-subtitle">Your earnings breakdown</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditId(null); }}>+ Add</button>
      </div>

      {/* BREAKDOWN */}
      {totalAnnual > 0 && (
        <div className="card">
          <div className="card-label">Income Breakdown</div>
          {[
            { label: "Hourly", value: bd.hourly },
            { label: "Daily (8hrs)", value: bd.daily },
            { label: "Weekly", value: bd.weekly },
            { label: "Bi-Weekly", value: bd.biweekly },
            { label: "Monthly", value: bd.monthly },
            { label: "Annual", value: bd.annual },
          ].map(r => (
            <div key={r.label} className="breakdown-row">
              <span className="breakdown-period">{r.label}</span>
              <span className="breakdown-amount">{formatCurrency(r.value)}</span>
            </div>
          ))}
        </div>
      )}

      {/* INCOME SOURCES */}
      <div className="section-header">
        <span className="section-title">Income Sources</span>
      </div>

      {incomes.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">💰</div>
          <div className="empty-title">No income added yet</div>
          <div className="empty-sub">Add your income to unlock your financial snapshot</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add Income</button>
        </div>
      ) : (
        <div className="card" style={{ padding: "8px 20px" }}>
          {incomes.map(i => (
            <div key={i.id} className="bill-row" onClick={() => startEdit(i)}>
              <div className="bill-icon">💼</div>
              <div className="bill-info">
                <div className="bill-name">{i.name}</div>
                <div className="bill-meta">{FREQ_OPTIONS.find(f => f.id === i.frequency)?.label}</div>
              </div>
              <div>
                <div className="bill-amount">{formatCurrency(i.amount)}</div>
                <button onClick={e => { e.stopPropagation(); del(i.id); }}
                  style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: 12, display: "block", textAlign: "right" }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal show={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? "Edit Income" : "Add Income"}>
        <div className="input-group">
          <label className="input-label">Income Name</label>
          <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Primary Job" />
        </div>
        <div className="input-group">
          <label className="input-label">Amount</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input className="input input-with-prefix input-mono" type="number" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Frequency</label>
          <div className="chip-row">
            {FREQ_OPTIONS.map(f => (
              <div key={f.id} className={`chip ${form.frequency === f.id ? "selected" : ""}`}
                onClick={() => setForm(p => ({ ...p, frequency: f.id }))}>{f.label}</div>
            ))}
          </div>
        </div>
        <button className="btn btn-primary btn-full" style={{ marginTop: 8 }} onClick={save}>
          {editId ? "Save Changes" : "Add Income"}
        </button>
      </Modal>
    </div>
  );
};

// ─── BILLS SCREEN ─────────────────────────────────────────────────────────────
const BillsScreen = ({ state, onUpdate }) => {
  const { bills } = state;
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", amount: "", category: "housing", recurrence: "monthly", dueDay: "1", isAutopay: false, active: true });

  const totalMonthly = calcMonthlyBills(bills);

  const sorted = [...bills].filter(b => b.active).sort((a, b) => {
    const da = daysUntil(calcNextDueDate(parseInt(a.dueDay)));
    const db = daysUntil(calcNextDueDate(parseInt(b.dueDay)));
    return (da ?? 99) - (db ?? 99);
  });

  const save = () => {
    if (!form.name || !form.amount) return;
    const bill = { ...form, id: editId || crypto.randomUUID(), amount: parseFloat(form.amount) };
    if (editId) {
      onUpdate({ bills: bills.map(b => b.id === editId ? bill : b), _syncAction: "saveBill", _syncItem: bill });
    } else {
      onUpdate({ bills: [...bills, bill], earnedBadges: [...(state.earnedBadges || []), "bill_tracker"].filter((v, i, a) => a.indexOf(v) === i), _syncAction: "saveBill", _syncItem: bill });
    }
    setForm({ name: "", amount: "", category: "housing", recurrence: "monthly", dueDay: "1", isAutopay: false, active: true });
    setShowAdd(false);
    setEditId(null);
  };

  const del = (id) => onUpdate({ bills: bills.filter(b => b.id !== id), _syncAction: "deleteBill", _syncItem: { id } });

  const startEdit = (bill) => {
    setForm({ name: bill.name, amount: bill.amount.toString(), category: bill.category, recurrence: bill.recurrence, dueDay: bill.dueDay?.toString() || "1", isAutopay: bill.isAutopay || false, active: bill.active !== false });
    setEditId(bill.id);
    setShowAdd(true);
  };

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="header-title">Bills</div>
          <div className="header-subtitle">{formatCurrency(totalMonthly)}/month total</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditId(null); }}>+ Add</button>
      </div>

      {bills.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">📋</div>
          <div className="empty-title">No bills tracked</div>
          <div className="empty-sub">Track your bills to know exactly what's committed each month</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Add First Bill</button>
        </div>
      ) : (
        <>
          {/* Bills due this week */}
          {sorted.filter(b => (daysUntil(calcNextDueDate(parseInt(b.dueDay))) ?? 99) <= 7).length > 0 && (
            <>
              <div className="section-header"><span className="section-title">Due This Week</span></div>
              <div className="card" style={{ padding: "4px 20px" }}>
                {sorted.filter(b => (daysUntil(calcNextDueDate(parseInt(b.dueDay))) ?? 99) <= 7).map(b => {
                  const days = daysUntil(calcNextDueDate(parseInt(b.dueDay)));
                  const cat = BILL_CATEGORIES.find(c => c.id === b.category);
                  return (
                    <div key={b.id} className="bill-row" onClick={() => startEdit(b)}>
                      <div className="bill-icon">{cat?.emoji || "📦"}</div>
                      <div className="bill-info">
                        <div className="bill-name">{b.name}</div>
                        <div className="bill-meta" style={{ color: days === 0 ? "var(--danger)" : "var(--warning)" }}>
                          {days === 0 ? "Due today!" : days === 1 ? "Due tomorrow" : `${days} days`}
                          {b.isAutopay && " · Autopay ✓"}
                        </div>
                      </div>
                      <div className="bill-amount">{formatCurrency(b.amount)}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {/* All bills */}
          <div className="section-header"><span className="section-title">All Bills</span></div>
          <div className="card" style={{ padding: "4px 20px" }}>
            {sorted.map(b => {
              const days = daysUntil(calcNextDueDate(parseInt(b.dueDay)));
              const cat = BILL_CATEGORIES.find(c => c.id === b.category);
              return (
                <div key={b.id} className="bill-row" onClick={() => startEdit(b)}>
                  <div className="bill-icon">{cat?.emoji || "📦"}</div>
                  <div className="bill-info">
                    <div className="bill-name">{b.name}</div>
                    <div className="bill-meta">
                      Due the {b.dueDay}{["st","nd","rd"][parseInt(b.dueDay)-1] || "th"} · {b.recurrence}
                      {b.isAutopay && " · ✓ Autopay"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div className="bill-amount">{formatCurrency(b.amount)}</div>
                    <div style={{ fontSize: 11, color: (days ?? 99) <= 7 ? "var(--warning)" : "var(--text3)", marginTop: 2 }}>
                      {days !== null ? `${days}d` : ""}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>Monthly bill total</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 32, fontWeight: 600, color: "var(--danger)", marginTop: 4 }}>
              {formatCurrency(totalMonthly)}
            </div>
          </div>
        </>
      )}

      <Modal show={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? "Edit Bill" : "Add Bill"}>
        <div className="input-group">
          <label className="input-label">Bill Name</label>
          <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Netflix, Rent..." />
        </div>
        <div className="input-group">
          <label className="input-label">Amount</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input className="input input-with-prefix input-mono" type="number" value={form.amount}
              onChange={e => setForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Category</label>
          <div className="chip-row">
            {BILL_CATEGORIES.map(c => (
              <div key={c.id} className={`chip ${form.category === c.id ? "selected" : ""}`}
                onClick={() => setForm(p => ({ ...p, category: c.id }))}>{c.emoji} {c.label}</div>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Due Day of Month</label>
          <input className="input" type="number" min="1" max="31" value={form.dueDay}
            onChange={e => setForm(p => ({ ...p, dueDay: e.target.value }))} inputMode="numeric" />
        </div>
        <div className="input-group">
          <label className="input-label">Frequency</label>
          <div className="chip-row">
            {["monthly", "weekly", "annual", "one-time"].map(r => (
              <div key={r} className={`chip ${form.recurrence === r ? "selected" : ""}`}
                onClick={() => setForm(p => ({ ...p, recurrence: r }))}>{r}</div>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 0 16px" }}>
          <div>
            <div style={{ fontWeight: 500, fontSize: 15 }}>Autopay</div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>Auto-deducted from account</div>
          </div>
          <Toggle on={form.isAutopay} onToggle={() => setForm(p => ({ ...p, isAutopay: !p.isAutopay }))} />
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={save}>{editId ? "Save" : "Add Bill"}</button>
          {editId && <button className="btn btn-danger" onClick={() => { del(editId); setShowAdd(false); setEditId(null); }}>Delete</button>}
        </div>
      </Modal>
    </div>
  );
};

// ─── GOALS SCREEN ─────────────────────────────────────────────────────────────
const GoalsScreen = ({ state, onUpdate }) => {
  const { goals, incomes, bills } = state;
  const [showAdd, setShowAdd] = useState(false);
  const [showContrib, setShowContrib] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: "", emoji: "🎯", targetAmount: "", perPaycheck: "" });
  const [contribAmount, setContribAmount] = useState("");
  const [selectedEmoji, setSelectedEmoji] = useState("🎯");
  const [showCelebration, setShowCelebration] = useState(false);

  const totalMonthlyIncome = incomes.reduce((s, i) => s + calcMonthlyIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const totalMonthlyBills = calcMonthlyBills(bills);
  const monthlySavings = Math.max(0, totalMonthlyIncome - totalMonthlyBills);

  const saveGoal = () => {
    if (!form.name || !form.targetAmount) return;
    const goal = { ...form, id: editId || crypto.randomUUID(), emoji: selectedEmoji, targetAmount: parseFloat(form.targetAmount), currentAmount: editId ? goals.find(g => g.id === editId)?.currentAmount || 0 : 0, perPaycheck: parseFloat(form.perPaycheck) || 0 };
    if (editId) {
      onUpdate({ goals: goals.map(g => g.id === editId ? goal : g), _syncAction: "saveGoal", _syncItem: goal });
    } else {
      onUpdate({ goals: [...goals, goal], earnedBadges: [...(state.earnedBadges || []), "goal_setter"].filter((v, i, a) => a.indexOf(v) === i), _syncAction: "saveGoal", _syncItem: goal });
    }
    setForm({ name: "", emoji: "🎯", targetAmount: "", perPaycheck: "" });
    setSelectedEmoji("🎯");
    setShowAdd(false);
    setEditId(null);
  };

  const addContrib = (goalId) => {
    const amt = parseFloat(contribAmount);
    if (!amt) return;
    const updatedGoals = goals.map(g => {
      if (g.id !== goalId) return g;
      const newAmount = Math.min(g.targetAmount, g.currentAmount + amt);
      const completed = newAmount >= g.targetAmount;
      if (completed) setShowCelebration(true);
      return { ...g, currentAmount: newAmount, completed };
    });
    const updatedGoal = updatedGoals.find(g => g.id === goalId);
    const newBadges = updatedGoals.some(g => g.completed) ? [...(state.earnedBadges || []), "goals_complete"].filter((v, i, a) => a.indexOf(v) === i) : state.earnedBadges;
    onUpdate({ goals: updatedGoals, earnedBadges: newBadges, _syncAction: "saveGoal", _syncItem: updatedGoal });
    setContribAmount("");
    setShowContrib(null);
  };

  const del = (id) => onUpdate({ goals: goals.filter(g => g.id !== id), _syncAction: "deleteGoal", _syncItem: { id } });

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="header-title">Goals</div>
          <div className="header-subtitle">{goals.length} goal{goals.length !== 1 ? "s" : ""} tracked</div>
        </div>
        <button className="btn btn-primary btn-sm" onClick={() => { setShowAdd(true); setEditId(null); }}>+ New</button>
      </div>

      {/* Savings available */}
      {totalMonthlyIncome > 0 && (
        <div className="card" style={{ background: "rgba(0,214,143,0.04)", borderColor: "rgba(0,214,143,0.2)" }}>
          <div className="card-label">Available for Goals</div>
          <div className="hero-amount positive" style={{ fontSize: 36 }}>{formatCurrency(monthlySavings)}<span style={{ fontSize: 16, fontWeight: 400, color: "var(--text2)" }}>/mo</span></div>
          <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8 }}>After all bills are covered</div>
        </div>
      )}

      {goals.length === 0 ? (
        <div className="empty-state">
          <div className="empty-emoji">🎯</div>
          <div className="empty-title">No goals yet</div>
          <div className="empty-sub">Set a goal and ClearPath will show you exactly when you'll reach it</div>
          <button className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setShowAdd(true)}>Create First Goal</button>
        </div>
      ) : (
        goals.map(g => {
          const pct = Math.min(100, (g.currentAmount / g.targetAmount) * 100);
          const forecast = calcGoalForecast(g, monthlySavings / goals.length);
          return (
            <div key={g.id} className="goal-card" onClick={() => { setForm({ name: g.name, emoji: g.emoji, targetAmount: g.targetAmount.toString(), perPaycheck: g.perPaycheck?.toString() || "" }); setSelectedEmoji(g.emoji); setEditId(g.id); setShowAdd(true); }}>
              <div className="goal-header">
                <div className="goal-name-wrap">
                  <span className="goal-emoji">{g.emoji}</span>
                  <div>
                    <div className="goal-name">{g.name} {g.completed && "✅"}</div>
                    <div className="goal-meta">{formatCurrency(g.currentAmount)} of {formatCurrency(g.targetAmount)}</div>
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--primary)", fontSize: 20 }}>{Math.round(pct)}%</div>
                </div>
              </div>
              <ProgressBar pct={pct} color={pct >= 100 ? "#00D68F" : "var(--primary)"} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
                <div style={{ fontSize: 12, color: "var(--text2)" }}>
                  {g.completed ? "🎉 Goal complete!" : forecast.months === Infinity ? "Set a monthly amount to forecast" : forecast.months <= 0 ? "Almost there!" : `~${forecast.months} months to go`}
                </div>
                {!g.completed && (
                  <button className="btn btn-primary btn-sm" onClick={e => { e.stopPropagation(); setShowContrib(g.id); }}
                    style={{ padding: "6px 14px", fontSize: 13 }}>+ Add</button>
                )}
              </div>
              {/* Savings forecast */}
              {!g.completed && forecast.months < Infinity && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Savings Forecast</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[1, 3, 6, 12].map(mo => {
                      const projected = Math.min(g.targetAmount, g.currentAmount + (monthlySavings / goals.length) * mo);
                      const projPct = Math.min(100, (projected / g.targetAmount) * 100);
                      return (
                        <div key={mo} style={{ flex: 1, textAlign: "center" }}>
                          <div style={{ fontSize: 10, color: "var(--text3)", marginBottom: 4 }}>{mo}mo</div>
                          <div style={{ height: 48, background: "var(--surface2)", borderRadius: 6, position: "relative", overflow: "hidden" }}>
                            <div style={{ position: "absolute", bottom: 0, width: "100%", height: `${projPct}%`, background: "rgba(0,214,143,0.3)", borderRadius: 6 }} />
                          </div>
                          <div style={{ fontSize: 10, color: "var(--primary)", marginTop: 4, fontFamily: "var(--font-mono)" }}>
                            {formatCurrency(projected, true)}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })
      )}

      {/* Add contribution modal */}
      <Modal show={!!showContrib} onClose={() => setShowContrib(null)} title="Add to Goal">
        {showContrib && (
          <>
            <div style={{ textAlign: "center", marginBottom: 20 }}>
              <div style={{ fontSize: 48 }}>{goals.find(g => g.id === showContrib)?.emoji}</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginTop: 8 }}>{goals.find(g => g.id === showContrib)?.name}</div>
            </div>
            <div className="input-group">
              <label className="input-label">Amount to add</label>
              <div className="input-prefix-wrap">
                <span className="input-prefix">$</span>
                <input className="input input-with-prefix input-mono" type="number" value={contribAmount}
                  onChange={e => setContribAmount(e.target.value)} placeholder="0.00" inputMode="decimal" autoFocus />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {[25, 50, 100, 250].map(n => (
                <div key={n} className={`chip ${parseFloat(contribAmount) === n ? "selected" : ""}`} onClick={() => setContribAmount(n.toString())}>${n}</div>
              ))}
            </div>
            <button className="btn btn-primary btn-full" onClick={() => addContrib(showContrib)}>Add Contribution 🎯</button>
          </>
        )}
      </Modal>

      {/* Add/edit goal modal */}
      <Modal show={showAdd} onClose={() => { setShowAdd(false); setEditId(null); }} title={editId ? "Edit Goal" : "New Goal"}>
        <div className="input-group">
          <label className="input-label">Goal Name</label>
          <input className="input" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Vacation, Emergency Fund..." />
        </div>
        <div className="input-group">
          <label className="input-label">Pick an Emoji</label>
          <div className="chip-row" style={{ gap: 6 }}>
            {GOAL_EMOJIS.map(e => (
              <div key={e} onClick={() => setSelectedEmoji(e)}
                style={{ fontSize: 24, padding: "6px 8px", borderRadius: 10, background: selectedEmoji === e ? "rgba(0,214,143,0.2)" : "var(--surface2)", cursor: "pointer", border: `1.5px solid ${selectedEmoji === e ? "var(--primary)" : "transparent"}` }}>
                {e}
              </div>
            ))}
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Target Amount</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input className="input input-with-prefix input-mono" type="number" value={form.targetAmount}
              onChange={e => setForm(p => ({ ...p, targetAmount: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </div>
        </div>
        <div className="input-group">
          <label className="input-label">Monthly Contribution (optional)</label>
          <div className="input-prefix-wrap">
            <span className="input-prefix">$</span>
            <input className="input input-with-prefix input-mono" type="number" value={form.perPaycheck}
              onChange={e => setForm(p => ({ ...p, perPaycheck: e.target.value }))} placeholder="0.00" inputMode="decimal" />
          </div>
        </div>
        {form.targetAmount && form.perPaycheck && (
          <div className="card-sm" style={{ background: "rgba(0,214,143,0.06)", borderColor: "rgba(0,214,143,0.2)", marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>Estimated completion</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 600, color: "var(--primary)", marginTop: 4 }}>
              {Math.ceil(parseFloat(form.targetAmount) / parseFloat(form.perPaycheck))} months
            </div>
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={saveGoal}>{editId ? "Save" : "Create Goal"}</button>
          {editId && <button className="btn btn-danger" onClick={() => { del(editId); setShowAdd(false); setEditId(null); }}>Delete</button>}
        </div>
      </Modal>

      {/* CELEBRATION */}
      {showCelebration && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.85)" }}
          onClick={() => setShowCelebration(false)}>
          <div style={{ textAlign: "center", padding: 40 }}>
            <div style={{ fontSize: 80 }}>🎉</div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 32, color: "var(--primary)", marginTop: 16 }}>Goal Complete!</div>
            <div style={{ color: "var(--text2)", marginTop: 8, fontSize: 16 }}>You crushed it! Time to set the next one.</div>
            <button className="btn btn-primary" style={{ marginTop: 24 }} onClick={() => setShowCelebration(false)}>🚀 Let's Go!</button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── FORECAST SCREEN ──────────────────────────────────────────────────────────
const ForecastScreen = ({ state }) => {
  const { incomes, bills } = state;
  const [savingsInput, setSavingsInput] = useState("");

  const totalMonthlyIncome = incomes.reduce((s, i) => s + calcMonthlyIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const totalMonthlyBills = calcMonthlyBills(bills);
  const autoSavings = Math.max(0, totalMonthlyIncome - totalMonthlyBills);
  const monthlySavings = parseFloat(savingsInput) || autoSavings;

  const forecastPoints = [
    { label: "1 Month", months: 1 },
    { label: "3 Months", months: 3 },
    { label: "6 Months", months: 6 },
    { label: "1 Year", months: 12 },
    { label: "2 Years", months: 24 },
    { label: "5 Years", months: 60 },
  ];

  const maxForecast = monthlySavings * 60;

  return (
    <div className="screen">
      <div className="header">
        <div>
          <div className="header-title">Savings Forecast</div>
          <div className="header-subtitle">Project your future savings</div>
        </div>
      </div>

      <div className="card">
        <div className="card-label">Monthly Savings Amount</div>
        <div className="input-prefix-wrap" style={{ marginTop: 8 }}>
          <span className="input-prefix">$</span>
          <input className="input input-with-prefix input-mono" type="number" value={savingsInput}
            onChange={e => setSavingsInput(e.target.value)}
            placeholder={autoSavings > 0 ? autoSavings.toFixed(2) : "0.00"} inputMode="decimal" />
        </div>
        {autoSavings > 0 && !savingsInput && (
          <div style={{ fontSize: 12, color: "var(--text2)", marginTop: 6 }}>
            Based on your income – bills = {formatCurrency(autoSavings)}/mo
          </div>
        )}
      </div>

      <div className="card">
        <div className="card-label" style={{ marginBottom: 16 }}>Projected Savings</div>
        {forecastPoints.map(fp => {
          const projected = monthlySavings * fp.months;
          const pct = maxForecast > 0 ? (projected / maxForecast) * 100 : 0;
          return (
            <div key={fp.label} className="forecast-item">
              <div className="forecast-period">{fp.label}</div>
              <div className="forecast-bar-wrap">
                <ProgressBar pct={pct} height={6} />
              </div>
              <div className="forecast-amount">{formatCurrency(projected, true)}</div>
            </div>
          );
        })}
      </div>

      {monthlySavings > 0 && (
        <>
          <div className="card">
            <div className="card-label" style={{ marginBottom: 12 }}>Milestone Timeline</div>
            {[1000, 5000, 10000, 25000, 50000].map(milestone => {
              const months = monthlySavings > 0 ? Math.ceil(milestone / monthlySavings) : Infinity;
              return (
                <div key={milestone} className="breakdown-row">
                  <div>
                    <span className="breakdown-period">{formatCurrency(milestone, true)}</span>
                  </div>
                  <span className="breakdown-amount" style={{ color: months <= 12 ? "var(--primary)" : "var(--text)" }}>
                    {months === Infinity ? "—" : months <= 1 ? "< 1 month" : months < 12 ? `${months} months` : `${(months / 12).toFixed(1)} years`}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="card" style={{ background: "rgba(0,214,143,0.04)", borderColor: "rgba(0,214,143,0.2)" }}>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>What if you save $50 more/month?</div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 12 }}>
              {[12, 24, 60].map(mo => (
                <div key={mo} style={{ textAlign: "center" }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 600, color: "var(--primary)" }}>
                    {formatCurrency((monthlySavings + 50) * mo, true)}
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text2)", marginTop: 4 }}>
                    {mo === 12 ? "1 Year" : mo === 24 ? "2 Years" : "5 Years"}
                  </div>
                  <div style={{ fontSize: 10, color: "var(--primary)", marginTop: 2 }}>
                    +{formatCurrency(50 * mo, true)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!totalMonthlyIncome && (
        <div className="empty-state">
          <div className="empty-emoji">📈</div>
          <div className="empty-title">Add income to forecast</div>
          <div className="empty-sub">Set up your income and bills to see your savings potential</div>
        </div>
      )}
    </div>
  );
};

// ─── AI ASSISTANT SCREEN ──────────────────────────────────────────────────────
const AIScreen = ({ state, onUpdate }) => {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState(state.aiHistory || []);
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const { incomes, bills, goals } = state;
  const totalMonthlyIncome = incomes.reduce((s, i) => s + calcMonthlyIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const totalMonthlyBills = calcMonthlyBills(bills);
  const available = Math.max(0, totalMonthlyIncome - totalMonthlyBills);
  const annualIncome = incomes.reduce((s, i) => s + calcAnnualIncome(parseFloat(i.amount) || 0, i.frequency), 0);
  const bd = calcIncomeBreakdown(annualIncome);

  const contextSnapshot = `
USER FINANCIAL SNAPSHOT:
- Monthly Income: ${formatCurrency(totalMonthlyIncome)}
- Monthly Bills: ${formatCurrency(totalMonthlyBills)}
- Available Money: ${formatCurrency(available)}
- Hourly Rate: ${bd.hourly > 0 ? formatCurrency(bd.hourly) : "Not set"}
- Bills: ${bills.map(b => `${b.name}: ${formatCurrency(b.amount)}/mo`).join(", ") || "None"}
- Goals: ${goals.map(g => `${g.name}: ${formatCurrency(g.currentAmount)}/${formatCurrency(g.targetAmount)}`).join(", ") || "None"}
`;

  const SUGGESTED_QUESTIONS = [
    "Can I afford a $500 purchase?",
    "How should I prioritize my bills?",
    "What if I save $100 more per month?",
    "How much is my daily coffee habit costing me per year?",
    "Am I saving enough?",
    "How long until I have a $1,000 emergency fund?",
  ];

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg || loading) return;
    setInput("");

    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt: `You are ClearPath, a friendly financial companion app. You help users make fast, clear financial decisions.\n\n${contextSnapshot}\n\nRules:\n- Be conversational, warm, and encouraging (never preachy)\n- Keep answers SHORT (2-4 sentences max)\n- Use dollar amounts from the user's data when relevant\n- Always end with a clear, actionable takeaway\n- Use emojis sparingly (1-2 max per response)\n- No financial jargon\n- Never say "I cannot provide financial advice" -- you CAN provide practical guidance`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
        }),
      });

      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const reply = data.reply || "I couldn't process that. Try rephrasing your question.";
      const updatedMessages = [...newMessages, { role: "assistant", content: reply }];
      setMessages(updatedMessages);
      onUpdate({ aiHistory: updatedMessages.slice(-20), earnedBadges: [...(state.earnedBadges || []), "ai_user"].filter((v, i, a) => a.indexOf(v) === i) });
    } catch (e) {
      const errMsg = [...newMessages, { role: "assistant", content: `Connection issue: ${e.message || "Check your API key and try again."}` }];
      setMessages(errMsg);
    }
    setLoading(false);
  };

  const handleKey = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } };

  return (
    <div className="screen" style={{ paddingBottom: 0, display: "flex", flexDirection: "column", height: "100%" }}>
      <div className="header">
        <div>
          <div className="header-title">AI Assistant 🤖</div>
          <div className="header-subtitle">Ask anything about your finances</div>
        </div>
      </div>

      <div className="ai-messages" style={{ paddingBottom: "140px" }}>
        {messages.length === 0 ? (
          <div>
            <div style={{ padding: "16px 0 0", textAlign: "center" }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>🤖</div>
              <div style={{ fontSize: 16, fontWeight: 600, color: "var(--text)" }}>Ask me anything about your money</div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 8, lineHeight: 1.5 }}>
                I know your income, bills, and goals. Just ask!
              </div>
            </div>
            <div style={{ paddingTop: 16 }}>
              <div className="card-label" style={{ marginBottom: 10 }}>Try asking:</div>
              {SUGGESTED_QUESTIONS.map(q => (
                <button key={q} onClick={() => sendMessage(q)}
                  style={{ display: "block", width: "100%", textAlign: "left", padding: "12px 16px", marginBottom: 8, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", cursor: "pointer", fontSize: 14, fontFamily: "var(--font-body)" }}>
                  💬 {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((m, i) => (
              <div key={i} className={`ai-message ${m.role}`}>{m.content}</div>
            ))}
            {loading && (
              <div className="ai-message assistant">
                <LoadingDots />
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      <div className="ai-input-bar">
        <input ref={inputRef} className="input" value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={handleKey} placeholder="Ask about your finances..." style={{ flex: 1 }} />
        <button className="btn btn-primary btn-sm" onClick={() => sendMessage()} disabled={!input.trim() || loading}
          style={{ opacity: !input.trim() || loading ? 0.5 : 1 }}>
          →
        </button>
        {messages.length > 0 && (
          <button className="btn btn-secondary btn-sm" onClick={() => { setMessages([]); onUpdate({ aiHistory: [] }); }}>
            Clear
          </button>
        )}
      </div>
    </div>
  );
};

// ─── SETTINGS & BADGES SCREEN ─────────────────────────────────────────────────
const SettingsScreen = ({ state, onUpdate, onThemeToggle, onFullReset, onSignOut }) => {
  const { user, earnedBadges = [], streak = 0, incomes = [], bills = [], goals = [] } = state;
  const isLight = document.body.classList.contains("light-mode");
  const [confirmReset, setConfirmReset] = useState(null); // null | 'income' | 'bills' | 'goals' | 'all'
  const [toast, setToast] = useState("");

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2500);
  };

  const RESET_OPTIONS = [
    {
      id: "income",
      emoji: "💼",
      label: "Clear Income",
      sub: `${incomes.length} source${incomes.length !== 1 ? "s" : ""}`,
      action: () => { onUpdate({ incomes: [] }); showToast("Income cleared"); },
    },
    {
      id: "bills",
      emoji: "📋",
      label: "Clear Bills",
      sub: `${bills.length} bill${bills.length !== 1 ? "s" : ""}`,
      action: () => { onUpdate({ bills: [] }); showToast("Bills cleared"); },
    },
    {
      id: "goals",
      emoji: "🎯",
      label: "Clear Goals",
      sub: `${goals.length} goal${goals.length !== 1 ? "s" : ""}`,
      action: () => { onUpdate({ goals: [] }); showToast("Goals cleared"); },
    },
    {
      id: "ai",
      emoji: "🤖",
      label: "Clear AI History",
      sub: `${(state.aiHistory || []).length} messages`,
      action: () => { onUpdate({ aiHistory: [] }); showToast("AI history cleared"); },
    },
  ];

  return (
    <div className="screen">
      {/* Toast */}
      {toast && (
        <div style={{
          position: "fixed", top: 60, left: "50%", transform: "translateX(-50%)",
          background: "var(--primary)", color: "#0A0A0A", padding: "10px 20px",
          borderRadius: 100, fontSize: 14, fontWeight: 600, zIndex: 9999,
          boxShadow: "0 4px 20px rgba(0,214,143,0.4)", whiteSpace: "nowrap",
        }}>
          ✓ {toast}
        </div>
      )}

      <div className="header">
        <div>
          <div className="header-title">Profile & Settings</div>
        </div>
      </div>

      {/* Profile */}
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28 }}>
            {user.name ? user.name[0].toUpperCase() : "👤"}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)" }}>{user.name || "Your Profile"}</div>
            <div style={{ fontSize: 13, color: "var(--text2)" }}>ClearPath Member</div>
          </div>
        </div>
        <div className="divider" />
        <div className="input-group" style={{ marginBottom: 0 }}>
          <label className="input-label">Your Name</label>
          <input className="input" value={user.name || ""} onChange={e => onUpdate({ user: { ...user, name: e.target.value } })} placeholder="Your name" />
        </div>
      </div>

      {/* Achievements */}
      <div className="section-header"><span className="section-title">Achievements</span></div>
      <div className="card">
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 36, fontWeight: 700, color: "var(--primary)" }}>🔥 {streak}</div>
          <div>
            <div style={{ fontWeight: 600, fontSize: 16 }}>Month Streak</div>
            <div style={{ fontSize: 12, color: "var(--text2)" }}>Consecutive months saving</div>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          {BADGE_DEFS.map(b => (
            <div key={b.id} className={`badge-item ${earnedBadges.includes(b.id) ? "" : "locked"}`}>
              <div className="badge-emoji">{b.emoji}</div>
              <div className="badge-name">{b.name}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 11, color: "var(--text3)", textAlign: "center", marginTop: 12 }}>
          {earnedBadges.length} of {BADGE_DEFS.length} badges earned
        </div>
      </div>

      {/* Settings */}
      <div className="section-header"><span className="section-title">Preferences</span></div>
      <div className="card">
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">{isLight ? "☀️" : "🌙"} {isLight ? "Light Mode" : "Dark Mode"}</div>
            <div className="settings-row-sub">Toggle app appearance</div>
          </div>
          <Toggle on={isLight} onToggle={onThemeToggle} />
        </div>
        <div className="settings-row">
          <div className="settings-row-info">
            <div className="settings-row-label">💱 Currency</div>
            <div className="settings-row-sub">USD (United States Dollar)</div>
          </div>
          <div style={{ color: "var(--text2)", fontSize: 13 }}>USD</div>
        </div>
        <div className="settings-row" style={{ borderBottom: "none" }}>
          <div className="settings-row-info">
            <div className="settings-row-label">🔔 Bill Reminders</div>
            <div className="settings-row-sub">3 days before due date</div>
          </div>
          <Toggle on={true} onToggle={() => {}} />
        </div>
      </div>

      {/* ── DATA MANAGEMENT ── */}
      <div className="section-header"><span className="section-title">Manage Data</span></div>
      <div className="card" style={{ padding: "8px 20px" }}>
        {RESET_OPTIONS.map(opt => (
          <div key={opt.id} className="settings-row">
            <div className="settings-row-info">
              <div className="settings-row-label">{opt.emoji} {opt.label}</div>
              <div className="settings-row-sub">{opt.sub}</div>
            </div>
            <button
              className="btn btn-danger btn-sm"
              style={{ padding: "7px 14px", fontSize: 13 }}
              onClick={() => setConfirmReset(opt.id)}
            >
              Clear
            </button>
          </div>
        ))}
      </div>

      {/* DANGER ZONE */}
      <div className="section-header"><span className="section-title" style={{ color: "var(--danger)" }}>Danger Zone</span></div>
      <div className="card" style={{ borderColor: "rgba(255,77,77,0.25)", background: "rgba(255,77,77,0.04)" }}>
        <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 14, lineHeight: 1.5 }}>
          This will permanently delete <strong style={{ color: "var(--text)" }}>everything</strong> — income, bills, goals, history, badges — and restart the app from scratch.
        </div>
        <button className="btn btn-danger btn-full" onClick={() => setConfirmReset("all")}>
          🗑️ Reset Everything &amp; Start Over
        </button>
      </div>

      {/* About */}
      <div className="section-header"><span className="section-title">About</span></div>
      <div className="card">
        <div className="settings-row">
          <div className="settings-row-info"><div className="settings-row-label">Version</div></div>
          <div style={{ color: "var(--text2)", fontSize: 13, fontFamily: "var(--font-mono)" }}>1.0.0</div>
        </div>
        <div className="settings-row" style={{ borderBottom: "none" }}>
          <div className="settings-row-info"><div className="settings-row-label">🔒 Your data</div>
            <div className="settings-row-sub">Encrypted and stored securely in the cloud</div>
          </div>
        </div>
      </div>

      {/* Sign Out */}
      <div className="section-header"><span className="section-title">Account</span></div>
      <div className="card">
        <button className="btn btn-secondary btn-full" onClick={onSignOut} style={{ marginBottom: 0 }}>
          🚪 Sign Out
        </button>
      </div>

      <div style={{ textAlign: "center", padding: "16px 24px 24px", color: "var(--text3)", fontSize: 12 }}>
        ClearPath — Your Financial Companion
      </div>

      {/* ── CONFIRM MODAL ── */}
      <Modal show={!!confirmReset} onClose={() => setConfirmReset(null)} title="">
        {confirmReset && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>
              {confirmReset === "all" ? "⚠️" : RESET_OPTIONS.find(o => o.id === confirmReset)?.emoji}
            </div>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 22, color: "var(--text)", marginBottom: 10 }}>
              {confirmReset === "all" ? "Reset Everything?" : `Clear ${RESET_OPTIONS.find(o => o.id === confirmReset)?.label}?`}
            </div>
            <div style={{ fontSize: 14, color: "var(--text2)", marginBottom: 28, lineHeight: 1.6 }}>
              {confirmReset === "all"
                ? "All your data will be permanently deleted and you'll go through setup again. This cannot be undone."
                : `All ${RESET_OPTIONS.find(o => o.id === confirmReset)?.label.toLowerCase()} data will be deleted. This cannot be undone.`}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                className="btn btn-danger btn-full"
                onClick={() => {
                  if (confirmReset === "all") {
                    onFullReset();
                  } else {
                    RESET_OPTIONS.find(o => o.id === confirmReset)?.action();
                  }
                  setConfirmReset(null);
                }}
              >
                Yes, Delete It
              </button>
              <button className="btn btn-secondary btn-full" onClick={() => setConfirmReset(null)}>
                Cancel
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function ClearPath() {
  const [authUser, setAuthUser] = useState(null);       // Supabase user object
  const [authLoading, setAuthLoading] = useState(true); // checking session on load
  const [state, setState] = useState(defaultState);
  const [tab, setTab] = useState("home");
  const [isLight, setIsLight] = useState(false);

  useEffect(() => { injectStyles(); }, []);

  // ── Check for existing session on mount ──────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        setAuthUser(session.user);
      }
      setAuthLoading(false);
    });

    // Listen for login/logout events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUser(session?.user ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  // ── Load user data — Supabase only ───────────────────────────────────────
  useEffect(() => {
    if (!authUser) return;

    // Wipe any stale localStorage
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(`clearpath_${authUser.id}`);

    db.loadAll(authUser.id).then(({ data, hasProfile }) => {
      console.log("Supabase loadAll result:", JSON.stringify(data));
      setState(prev => ({
        ...prev,
        ...data,
        user: { ...prev.user, name: data.user?.name || authUser.user_metadata?.name || prev.user.name },
        onboarded: hasProfile,
      }));
    }).catch(err => {
      console.error("Supabase loadAll FAILED:", err);
    });
  }, [authUser]);

  const updateState = useCallback((partial) => {
    setState(prev => ({ ...prev, ...partial }));
  }, []);

  // ── Wrap updateState to also sync to Supabase ────────────────────────────
  const updateAndSync = useCallback(async (partial) => {
    setState(prev => ({ ...prev, ...partial }));
    if (!authUser) return;
    try {
      const { _syncAction, _syncItem } = partial;
      if (_syncAction === "saveIncome")   await db.saveIncome(_syncItem, authUser.id);
      if (_syncAction === "deleteIncome") await db.deleteIncome(_syncItem.id);
      if (_syncAction === "saveBill")     await db.saveBill(_syncItem, authUser.id);
      if (_syncAction === "deleteBill")   await db.deleteBill(_syncItem.id);
      if (_syncAction === "saveGoal")     await db.saveGoal(_syncItem, authUser.id);
      if (_syncAction === "deleteGoal")   await db.deleteGoal(_syncItem.id);
      if (_syncAction === "saveName")     await db.saveName(authUser.id, _syncItem);
      if (partial.earnedBadges || partial.streak !== undefined) {
        await db.saveStreak(
          authUser.id,
          partial.streak ?? state.streak,
          partial.earnedBadges ?? state.earnedBadges
        );
      }
    } catch (e) {
      console.error("Sync error:", e);
    }
  }, [authUser, state]);

  const toggleTheme = useCallback(() => {
    setIsLight(prev => {
      const next = !prev;
      document.body.classList.toggle("light-mode", next);
      return next;
    });
  }, []);

  const completeOnboarding = useCallback(async ({ name, incomes, bills, earnedBadges }) => {
    // Set onboarded immediately so we don't flash back to onboarding
    setState(prev => ({ ...prev, user: { ...prev.user, name }, incomes, bills, earnedBadges, onboarded: true }));
    if (authUser) {
      try {
        // Save name to profile — upsert in case trigger already created the row
        const { error: nameErr } = await supabase.from("profiles").upsert({ id: authUser.id, name }, { onConflict: "id" });
        if (nameErr) console.error("saveName error:", nameErr);
        for (const inc of incomes) await db.saveIncome(inc, authUser.id);
        for (const bill of bills) await db.saveBill(bill, authUser.id);
        await db.saveStreak(authUser.id, 0, earnedBadges);
      } catch (e) {
        console.error("completeOnboarding error:", e);
      }
    }
  }, [authUser]);

  const handleSignOut = useCallback(async () => {
    localStorage.clear();
    await supabase.auth.signOut();
    setState({ ...defaultState });
    setTab("home");
    setAuthUser(null);
  }, []);

  const fullReset = useCallback(async () => {
    localStorage.clear();
    if (authUser) {
      await Promise.all([
        supabase.from("income_sources").delete().eq("user_id", authUser.id),
        supabase.from("bills").delete().eq("user_id", authUser.id),
        supabase.from("goals").delete().eq("user_id", authUser.id),
        supabase.from("user_streaks").delete().eq("user_id", authUser.id),
      ]);
    }
    setState({ ...defaultState });
    setTab("home");
    document.body.classList.remove("light-mode");
    setIsLight(false);
  }, [authUser]);

  // ── Loading splash while checking auth ────────────────────────────────────
  if (authLoading) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 16 }}>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 28, color: "var(--primary)" }}>ClearPath</div>
        <div style={{ display: "flex", gap: 6 }}>
          <span className="loading-dot" /><span className="loading-dot" /><span className="loading-dot" />
        </div>
      </div>
    );
  }

  // ── Not logged in — show auth screen ─────────────────────────────────────
  if (!authUser) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <AuthScreen onAuth={setAuthUser} />
      </div>
    );
  }

  // ── Logged in but not onboarded yet ───────────────────────────────────────
  if (!state.onboarded) {
    return (
      <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
        <Onboarding onComplete={completeOnboarding} />
      </div>
    );
  }

  const NAV = [
    { id: "home", icon: "🏠", label: "Home" },
    { id: "afford", icon: "🤔", label: "Afford?" },
    { id: "bills", icon: "📋", label: "Bills" },
    { id: "goals", icon: "🎯", label: "Goals" },
    { id: "ai", icon: "🤖", label: "Ask AI" },
  ];

  const renderScreen = () => {
    switch (tab) {
      case "home":     return <SnapshotScreen state={state} onNav={setTab} />;
      case "afford":   return <AffordScreen state={state} />;
      case "income":   return <IncomeScreen state={state} onUpdate={updateAndSync} />;
      case "bills":    return <BillsScreen state={state} onUpdate={updateAndSync} />;
      case "goals":    return <GoalsScreen state={state} onUpdate={updateAndSync} />;
      case "forecast": return <ForecastScreen state={state} />;
      case "ai":       return <AIScreen state={state} onUpdate={updateAndSync} />;
      case "settings": return <SettingsScreen state={state} onUpdate={updateAndSync} onThemeToggle={toggleTheme} onFullReset={fullReset} onSignOut={handleSignOut} />;
      default:         return <SnapshotScreen state={state} onNav={setTab} />;
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)" }}>
      <div className="app-shell">
        {renderScreen()}

        {tab === "settings" && (
          <div style={{ position: "fixed", bottom: 82, left: "50%", transform: "translateX(-50%)", maxWidth: 430, width: "100%", background: "var(--bg)", padding: "8px 16px", borderTop: "1px solid var(--border)", display: "flex", gap: 8, zIndex: 99 }}>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setTab("income")}>💼 Income</button>
            <button className="btn btn-secondary btn-sm" style={{ flex: 1 }} onClick={() => setTab("forecast")}>📈 Forecast</button>
          </div>
        )}

        <nav className="nav">
          {NAV.map(n => (
            <button key={n.id} className={`nav-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
              <span className="nav-icon">{n.icon}</span>
              {n.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}
