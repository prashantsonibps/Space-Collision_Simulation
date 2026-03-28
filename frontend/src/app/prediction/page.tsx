"use client";

import Link from "next/link";
import { useEffect } from "react";
import { TopBar } from "@/components/Dashboard/TopBar";
import { useTheme } from "@/lib/ThemeContext";

const archiveCards = [
  {
    eyebrow: "RUNBOOK",
    title: "Globe to branch review",
    body:
      "Use the live globe to select a conjunction, open Scenario Lab, compare Observe Only versus intervention branches, then generate the future state view for the branch you want to brief.",
  },
  {
    eyebrow: "CACHE STRATEGY",
    title: "Saved futures load instantly",
    body:
      "Generated worlds are cached so the strongest branch can be reopened quickly during a demo, stakeholder review, or operator handoff without waiting on a fresh world build.",
  },
  {
    eyebrow: "DECISION FRAME",
    title: "Safety over market language",
    body:
      "SpaceGuard is tuned for collision response and launch decision support. Every screen should help answer what to monitor, what to simulate, and what action is safest next.",
  },
];

const workflow = [
  "Open the globe and inspect the highest-risk event in the risk monitor.",
  "Launch Scenario Lab and compare Observe Only, Avoidance Burn, and Mission Replan.",
  "Generate or reload the future visual for the selected branch.",
  "Open the result full-screen or in Marble 3D for the mission brief.",
];

export default function PredictionPage() {
  const { theme } = useTheme();
  const isDark = theme === "dark";

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className={`min-h-screen ${isDark ? "bg-black text-white" : "bg-zinc-50 text-zinc-950"}`}>
      <TopBar variant="inline" />

      <main className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <section className="overflow-hidden rounded-[2rem] border border-black/10 bg-white/85 p-6 shadow-[0_30px_100px_-45px_rgba(14,165,233,0.45)] dark:border-white/10 dark:bg-white/5">
          <div className="font-orbitron text-[11px] tracking-[0.32em] text-sky-500 dark:text-sky-300">
            SIMULATION ARCHIVE
          </div>
          <div className="mt-4 grid gap-6 lg:grid-cols-[1.3fr_0.7fr]">
            <div>
              <h1 className="max-w-3xl text-3xl font-semibold leading-tight sm:text-4xl">
                Keep the secondary surface aligned with mission simulation, not prediction trading.
              </h1>
              <p className={`mt-4 max-w-2xl text-sm leading-7 ${isDark ? "text-white/72" : "text-zinc-700"}`}>
                This page now acts as a briefing and archive surface for saved futures, branch reviews,
                and demo-ready operator context. The primary live workflow still starts on the globe.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href="/"
                  className="rounded-xl border border-sky-400/30 bg-sky-400/10 px-4 py-2 font-mono text-xs tracking-[0.18em] text-sky-600 transition-colors hover:bg-sky-400/20 dark:text-sky-300"
                >
                  RETURN TO GLOBE
                </Link>
                <div className={`rounded-xl border px-4 py-2 font-mono text-xs tracking-[0.18em] ${isDark ? "border-white/10 text-white/60" : "border-black/10 text-zinc-600"}`}>
                  WORLD CACHE READY
                </div>
              </div>
            </div>

            <div className={`rounded-[1.5rem] border p-5 ${isDark ? "border-white/10 bg-white/[0.04]" : "border-black/10 bg-zinc-950/[0.03]"}`}>
              <div className={`font-mono text-[11px] tracking-[0.24em] ${isDark ? "text-white/45" : "text-zinc-500"}`}>
                QUICK FLOW
              </div>
              <div className="mt-4 space-y-3">
                {workflow.map((step, index) => (
                  <div key={step} className="flex gap-3">
                    <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-400/15 font-mono text-[11px] text-sky-500 dark:text-sky-300">
                      {index + 1}
                    </div>
                    <p className={`text-sm leading-6 ${isDark ? "text-white/72" : "text-zinc-700"}`}>{step}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {archiveCards.map((card) => (
            <article
              key={card.title}
              className={`rounded-[1.5rem] border p-5 ${isDark ? "border-white/10 bg-white/[0.04]" : "border-black/10 bg-white/80"}`}
            >
              <div className="font-orbitron text-[11px] tracking-[0.28em] text-sky-500 dark:text-sky-300">
                {card.eyebrow}
              </div>
              <h2 className="mt-3 text-lg font-semibold">{card.title}</h2>
              <p className={`mt-3 text-sm leading-7 ${isDark ? "text-white/68" : "text-zinc-700"}`}>{card.body}</p>
            </article>
          ))}
        </section>
      </main>
    </div>
  );
}
