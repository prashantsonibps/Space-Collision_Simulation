"use client";

import { TopBar } from "@/components/Dashboard/TopBar";
import { useTheme } from "@/lib/ThemeContext";

export default function PredictionPage() {
  const { theme } = useTheme();

  return (
    <div
      className={`w-screen h-screen flex flex-col overflow-hidden ${
        theme === "dark" ? "bg-black" : "bg-zinc-50"
      }`}
    >
      {/* Top bar */}
      <TopBar variant="inline" />

      <div className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto max-w-4xl rounded-3xl border border-black/10 bg-white/80 p-6 dark:border-white/10 dark:bg-white/5">
          <div className="font-orbitron text-xs tracking-[0.28em] text-sky-500 dark:text-sky-300">
            SCENARIO INDEX
          </div>
          <h1 className={`mt-3 text-3xl font-semibold ${theme === "dark" ? "text-white" : "text-zinc-900"}`}>
            Branches for the live orbital model
          </h1>
          <p className={`mt-3 max-w-2xl text-sm ${theme === "dark" ? "text-white/70" : "text-zinc-700"}`}>
            This view is reserved for saved simulations, intervention playbooks, and rollout comparisons.
            The market-facing language has been removed so the product stays focused on future-state modeling.
          </p>
        </div>
      </div>
    </div>
  );
}
