/**
 * Centralized Category Color Configuration
 * Provides consistent, accessible colors throughout the entire application:
 * - Charts (Donut / Bar)
 * - Legends
 * - Badges
 * - Category cards
 * - AI Insights
 */

export const CATEGORY_COLORS = {
  Food: '#2563EB',          // Blue
  Shopping: '#16A34A',      // Green
  Transport: '#F97316',     // Orange
  Entertainment: '#9333EA', // Purple
  Groceries: '#EAB308',     // Yellow
  Bills: '#DC2626',         // Red
  Healthcare: '#EC4899',    // Pink
  Education: '#06B6D4',     // Cyan
  Travel: '#92400E',        // Brown
  Rent: '#6366F1',          // Indigo
  Salary: '#10B981',        // Emerald
  Freelance: '#14B8A6',     // Teal
  Investment: '#8B5CF6',    // Violet
  Business: '#0284C7',      // Sky
  Gifts: '#F59E0B',         // Amber
  Other: '#64748B'          // Gray
};

export const CATEGORY_BG_COLORS = {
  Food: 'rgba(37, 99, 235, 0.12)',
  Shopping: 'rgba(22, 163, 74, 0.12)',
  Transport: 'rgba(249, 115, 22, 0.12)',
  Entertainment: 'rgba(147, 51, 234, 0.12)',
  Groceries: 'rgba(234, 179, 8, 0.15)',
  Bills: 'rgba(220, 38, 38, 0.12)',
  Healthcare: 'rgba(236, 72, 153, 0.12)',
  Education: 'rgba(6, 182, 212, 0.12)',
  Travel: 'rgba(146, 64, 14, 0.12)',
  Rent: 'rgba(99, 102, 241, 0.12)',
  Salary: 'rgba(16, 185, 129, 0.12)',
  Freelance: 'rgba(20, 184, 166, 0.12)',
  Investment: 'rgba(139, 92, 246, 0.12)',
  Business: 'rgba(2, 132, 199, 0.12)',
  Gifts: 'rgba(245, 158, 11, 0.12)',
  Other: 'rgba(100, 116, 139, 0.12)'
};

export const getCategoryColor = (category) => {
  if (!category) return CATEGORY_COLORS.Other;
  // Normalize matching case
  const key = Object.keys(CATEGORY_COLORS).find(
    k => k.toLowerCase() === category.trim().toLowerCase()
  );
  return key ? CATEGORY_COLORS[key] : CATEGORY_COLORS.Other;
};

export const getCategoryBg = (category) => {
  if (!category) return CATEGORY_BG_COLORS.Other;
  const key = Object.keys(CATEGORY_BG_COLORS).find(
    k => k.toLowerCase() === category.trim().toLowerCase()
  );
  return key ? CATEGORY_BG_COLORS[key] : CATEGORY_BG_COLORS.Other;
};

export const EXPENSE_CATEGORIES = [
  'Food',
  'Groceries',
  'Shopping',
  'Transport',
  'Bills',
  'Entertainment',
  'Healthcare',
  'Education',
  'Travel',
  'Rent',
  'Other'
];

export const INCOME_CATEGORIES = [
  'Salary',
  'Freelance',
  'Business',
  'Investment',
  'Gifts',
  'Other'
];
