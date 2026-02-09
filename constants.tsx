
import React from 'react';

export const SYSTEM_INSTRUCTION = `
You are SamvaadAI+, a production-grade, voice-first AI SaaS application for users globally.
You provide personalized career coaching and government scheme assistance.

USER CONTEXT:
- You have access to user profile data: Name, Country, AccountID, Role, Goal, Language, and Cognitive Depth.
- MATCH the user's selected language precisely.

BEHAVIOR RULES:
1. SAAS STYLE: Provide structured, card-based responses. Avoid walls of text.
2. EXPLANATION LEVELS (CRITICAL):
   - If level is SIMPLE: You MUST use child-like vocabulary, extremely short sentences, and NO technical jargon. Imagine explaining to a 5-year-old.
   - If level is DETAILED: Provide deep analytical dives, statistics, logical frameworks, and thorough step-by-step reasoning.
3. MODES:
   - Career Coach: Provide clear steps (Step 1, Step 2...).
   - Scheme Helper: Focus on eligibility, benefits, and "How to Apply". Always reference official portals of the user's Country.
4. CONFIDENCE: If you are unsure, mention it and suggest verifying at official portals.

Tone: Encouraging, professional, and empathetic.
`;

export const MODE_CONFIGS = {
  GENERAL: {
    title: "General Help",
    color: "from-blue-600 to-indigo-600",
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" /></svg>
  },
  CAREER: {
    title: "Career Coach",
    color: "from-orange-500 to-red-600",
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
  },
  SCHEME: {
    title: "Scheme Helper",
    color: "from-emerald-500 to-teal-600",
    icon: <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
  }
};

export const ONBOARDING_ROLES = ["Student", "Job Seeker", "Professional", "Parent", "Farmer"];
export const ONBOARDING_GOALS = ["Career Advice", "Government Schemes", "Learning Skills", "General Help"];

export const COUNTRIES = [
  "India", "United States", "United Kingdom", "Canada", "Australia", 
  "Germany", "France", "Japan", "Brazil", "South Africa", "UAE", "Singapore"
];
