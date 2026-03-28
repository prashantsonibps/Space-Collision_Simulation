'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ConjunctionEvent } from '@/components/Dashboard/EventsPanel'
import { buildSimulationBundle } from '@/lib/scenario'
import { accent, border, fontSize, green, riskClasses, textOpacity } from '@/lib/theme'
import { useTheme } from '@/lib/ThemeContext'
import { api, type CachedWorldSimulationResponse, type WorldSimulationStatusResponse } from '@/lib/api'

const branchTone = {
  monitor: 'Monitor',
  maneuver: 'Intervene',
  reroute: 'Replan',
} as const

function formatProbability(probability: number) {
  return `${(probability * 100).toFixed(probability < 0.01 ? 2 : 1)}%`
}

export function SimulationLab({
  selectedEventId,
}: {
  selectedEventId?: string | null
}) {
  const { theme } = useTheme()
  const rc = riskClasses[theme]
  const [events, setEvents] = useState<ConjunctionEvent[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [worldResult, setWorldResult] = useState<WorldSimulationStatusResponse | null>(null)
  const [worldPrompt, setWorldPrompt] = useState<string | null>(null)
  const [worldOperationId, setWorldOperationId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [worldError, setWorldError] = useState<string | null>(null)
  const [cachedWorld, setCachedWorld] = useState<CachedWorldSimulationResponse | null>(null)

  useEffect(() => {
    const collectionsToWatch = [
      'conjunction_events',
      'neo_events',
      'space_weather_events',
      'launches',
    ]

    const unsubscribers = collectionsToWatch.map((collectionName) =>
      onSnapshot(query(collection(db, collectionName)), (snapshot) => {
        setEvents((current) => {
          const others = current.filter((item) => item.id.startsWith(`${collectionName}:`) === false)
          const incoming = snapshot.docs.map((doc) => {
            const data = doc.data()
            if (collectionName === 'launches') {
              return {
                id: `${collectionName}:${doc.id}`,
                name: data.name,
                provider: data.provider,
                secondary_name: data.location || 'Launch corridor',
                risk_level: data.delay_risk || 'LOW',
                window_start: data.window_start,
                weather: data.weather,
                time_of_closest_approach: data.window_start,
                agent_assessment: data.agent_assessment,
                collision_probability: 0,
                closest_approach_km: 0,
                asset_name: data.name,
                asset_id: doc.id,
                secondary_id: 'launch-site',
              } as ConjunctionEvent
            }

            if (collectionName === 'neo_events') {
              return {
                id: `${collectionName}:${doc.id}`,
                asset_id: String(data.id),
                asset_name: data.name,
                secondary_id: 'EARTH',
                secondary_name: 'Earth',
                closest_approach_km: data.miss_distance_km || 0,
                miss_distance_km: data.miss_distance_km,
                collision_probability: 0,
                time_of_closest_approach: data.close_approach_date,
                estimated_diameter_max_km: data.estimated_diameter_max_km,
                risk_level: data.risk_level,
                agent_assessment: data.agent_assessment,
              } as ConjunctionEvent
            }

            if (collectionName === 'space_weather_events') {
              return {
                id: `${collectionName}:${doc.id}`,
                asset_id: data.type || doc.id,
                asset_name: data.type === 'CME' ? 'Coronal Mass Ejection' : data.type || 'Solar Event',
                secondary_id: 'EARTH-ORBIT',
                secondary_name: 'Near-Earth orbit',
                closest_approach_km: 0,
                collision_probability: 0,
                time_of_closest_approach: data.start_time,
                risk_level: data.risk_level,
                class_type: data.class_type,
                agent_assessment: data.note,
              } as ConjunctionEvent
            }

            return {
              id: `${collectionName}:${doc.id}`,
              ...data,
            } as ConjunctionEvent
          })

          return [...others, ...incoming]
        })
      }),
    )

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe())
    }
  }, [])

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null
    return events.find((event) => event.id === selectedEventId || event.id.endsWith(`:${selectedEventId}`)) || null
  }, [events, selectedEventId])

  const simulation = useMemo(() => buildSimulationBundle(selectedEvent), [selectedEvent])

  useEffect(() => {
    setActiveBranchId(simulation.recommendedBranchId)
  }, [simulation.recommendedBranchId, simulation.title])

  useEffect(() => {
    const branchId = activeBranchId || simulation.recommendedBranchId
    const eventId = selectedEvent?.id
    if (!eventId || !branchId) {
      setCachedWorld(null)
      return
    }

    let cancelled = false
    api.getCachedWorldSimulation(eventId, branchId)
      .then((data) => {
        if (cancelled) return
        setCachedWorld(data)
        if (data.done) {
          setWorldResult({
            done: data.done,
            operation_id: data.operation_id,
            world_id: data.world_id,
            thumbnail_url: data.thumbnail_url,
            pano_url: data.pano_url,
            splat_urls: data.splat_urls,
            raw_operation: {},
          })
          setWorldPrompt(data.prompt)
          setWorldOperationId(data.operation_id)
        }
      })
      .catch(() => {
        if (cancelled) return
        setCachedWorld(null)
      })

    return () => {
      cancelled = true
    }
  }, [activeBranchId, selectedEvent?.id, simulation.recommendedBranchId])

  useEffect(() => {
    if (selectedEventId) {
      setIsExpanded(true)
    }
  }, [selectedEventId])

  useEffect(() => {
    if (!worldOperationId) return

    let cancelled = false
    const intervalId = window.setInterval(async () => {
      try {
        const status = await api.getWorldSimulationStatus(worldOperationId)
        if (cancelled) return
        if (status.done) {
          setWorldResult(status)
          setIsGenerating(false)
          window.clearInterval(intervalId)
        }
      } catch (error) {
        if (cancelled) return
        setWorldError(error instanceof Error ? error.message : 'World generation polling failed.')
        setIsGenerating(false)
        window.clearInterval(intervalId)
      }
    }, 3000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
    }
  }, [worldOperationId])

  const activeBranch =
    simulation.branches.find((branch) => branch.id === activeBranchId) || simulation.branches[0]

  async function handleGenerateWorld(rerun = false) {
    if (!selectedEvent) {
      setWorldError('Select a live event before generating a future world.')
      return
    }

    setWorldError(null)
    setWorldResult(null)
    setIsGenerating(true)

    try {
      const started = await api.startWorldSimulation({
        event: selectedEvent as unknown as Record<string, unknown>,
        branch: activeBranch as unknown as Record<string, unknown>,
        rerun,
      })
      setWorldPrompt(started.prompt)
      setWorldOperationId(started.operation_id)
      if (started.cached) {
        setIsGenerating(false)
        setWorldResult({
          done: true,
          operation_id: started.operation_id,
          world_id: started.world_id,
          thumbnail_url: started.thumbnail_url,
          pano_url: started.pano_url,
          splat_urls: started.splat_urls,
          raw_operation: {},
        })
      }
    } catch (error) {
      setWorldError(error instanceof Error ? error.message : 'Failed to start world generation.')
      setIsGenerating(false)
    }
  }

  return (
    <motion.div
      className={`absolute z-40 rounded-2xl overflow-hidden backdrop-blur-md border ${border[theme]} bg-white/85 dark:bg-neutral-900/55`}
      style={{ bottom: '1rem', left: '1rem', right: isExpanded ? '20rem' : 'auto' }}
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <div className={`px-4 py-3 ${isExpanded ? `border-b ${border[theme]}` : ''} flex items-start justify-between gap-4`}>
        {!isExpanded ? (
          <>
            <div>
              <div className={`font-orbitron text-[11px] tracking-[0.28em] ${accent[theme].text}`}>
                SCENARIO LAB
              </div>
              <p className={`mt-1 ${fontSize.small} ${textOpacity[theme].secondary}`}>
                {selectedEventId ? 'Event selected and ready to simulate.' : 'Open when you want to compare future branches.'}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => setIsExpanded(true)}
                className={`rounded-xl px-3 py-2 border ${accent[theme].borderDim} ${accent[theme].bgDim} ${accent[theme].text} font-mono ${fontSize.small} tracking-[0.16em]`}
              >
                {selectedEventId ? 'OPEN EVENT' : 'OPEN LAB'}
              </button>
            </div>
          </>
        ) : (
          <>
        <div>
          <div className={`font-orbitron text-[11px] tracking-[0.28em] ${accent[theme].text}`}>
            SCENARIO LAB
          </div>
          <h2 className={`mt-1 ${fontSize.large} font-semibold ${textOpacity[theme].primary}`}>
            {simulation.title}
          </h2>
          <p className={`mt-1 max-w-2xl ${fontSize.base} ${textOpacity[theme].secondary}`}>
            {simulation.mission}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {isExpanded && (
            <div className={`rounded-xl px-3 py-2 border ${accent[theme].borderDim} ${accent[theme].bgDim}`}>
              <div className={`${fontSize.small} font-mono tracking-[0.18em] ${textOpacity[theme].faint}`}>
                ROLLOUT WINDOW
              </div>
              <div className={`mt-1 ${fontSize.medium} font-medium ${textOpacity[theme].primary}`}>
                {simulation.horizonLabel}
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={() => setIsExpanded((value) => !value)}
            className={`rounded-xl px-3 py-2 border ${accent[theme].borderDim} ${accent[theme].bgDim} ${accent[theme].text} font-mono ${fontSize.small} tracking-[0.16em]`}
          >
            MINIMIZE
          </button>
        </div>
        </>
        )}
      </div>

      {isExpanded && (
      <div className="grid gap-4 p-4 lg:grid-cols-[1.15fr_1.85fr]">
        <div className="space-y-3">
          {simulation.branches.map((branch) => {
            const isActive = branch.id === activeBranch.id
            const isRecommended = branch.id === simulation.recommendedBranchId
            const tone = branch.stance === 'maneuver'
              ? rc.HIGH
              : branch.stance === 'reroute'
                ? rc.MEDIUM
                : rc.LOW

            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => setActiveBranchId(branch.id)}
                className={`w-full rounded-2xl border p-3 text-left transition-colors ${isActive ? `${tone.border} ${tone.bg}` : `${border[theme]} bg-black/[0.03] dark:bg-white/[0.03] hover:bg-black/[0.05] dark:hover:bg-white/[0.05]`}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className={`font-mono ${fontSize.small} tracking-[0.18em] ${textOpacity[theme].faint}`}>
                      {branchTone[branch.stance]}
                    </div>
                    <div className={`mt-1 ${fontSize.medium} font-semibold ${textOpacity[theme].primary}`}>
                      {branch.label}
                    </div>
                  </div>
                  {isRecommended && (
                    <span className={`rounded-full px-2 py-1 font-mono ${fontSize.small} ${green[theme].text} ${green[theme].bgMuted}`}>
                      RECOMMENDED
                    </span>
                  )}
                </div>
                <p className={`mt-2 ${fontSize.base} ${textOpacity[theme].secondary}`}>
                  {branch.summary}
                </p>
                <div className={`mt-3 grid grid-cols-2 gap-2 font-mono ${fontSize.small}`}>
                  <div>
                    <div className={textOpacity[theme].faint}>MISS DIST</div>
                    <div className={textOpacity[theme].primary}>{branch.metrics.missDistanceKm} km</div>
                  </div>
                  <div>
                    <div className={textOpacity[theme].faint}>PROB</div>
                    <div className={textOpacity[theme].primary}>{formatProbability(branch.metrics.collisionProbability)}</div>
                  </div>
                  <div>
                    <div className={textOpacity[theme].faint}>FUEL</div>
                    <div className={textOpacity[theme].primary}>{branch.metrics.fuelCostKg} kg</div>
                  </div>
                  <div>
                    <div className={textOpacity[theme].faint}>DELAY</div>
                    <div className={textOpacity[theme].primary}>{branch.metrics.scheduleDelayMin} min</div>
                  </div>
                </div>
              </button>
            )
          })}
        </div>

        <div className="grid gap-4">
          <div className={`rounded-2xl border ${border[theme]} bg-black/[0.03] dark:bg-white/[0.03] p-4`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className={`font-orbitron text-[11px] tracking-[0.28em] ${textOpacity[theme].faint}`}>
                  ACTIVE BRANCH
                </div>
                <div className={`mt-1 ${fontSize.xlarge} font-semibold ${textOpacity[theme].primary}`}>
                  {activeBranch.label}
                </div>
              </div>
              <div className={`rounded-xl px-3 py-2 ${accent[theme].bgDim}`}>
                <div className={`font-mono ${fontSize.small} ${textOpacity[theme].faint}`}>CONFIDENCE</div>
                <div className={`mt-1 ${fontSize.large} ${accent[theme].text}`}>
                  {(activeBranch.metrics.operatorConfidence * 100).toFixed(0)}%
                </div>
              </div>
            </div>

            <p className={`mt-3 ${fontSize.medium} ${textOpacity[theme].secondary}`}>
              {activeBranch.recommendation}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => handleGenerateWorld(false)}
                disabled={isGenerating || !selectedEvent}
                className={`rounded-xl px-4 py-2 border ${accent[theme].borderDim} ${accent[theme].bgDim} ${accent[theme].text} font-mono ${fontSize.small} tracking-[0.16em] disabled:opacity-50`}
              >
                {isGenerating ? 'GENERATING FUTURE...' : cachedWorld?.done ? 'LOAD SAVED FUTURE' : 'GENERATE FUTURE VIEW'}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateWorld(true)}
                disabled={isGenerating || !selectedEvent}
                className={`rounded-xl px-4 py-2 border ${border[theme]} ${textOpacity[theme].secondary} font-mono ${fontSize.small} tracking-[0.16em] disabled:opacity-50`}
              >
                RUN AGAIN
              </button>
              {worldOperationId && (
                <div className={`${fontSize.small} font-mono ${textOpacity[theme].faint}`}>
                  Operation: {worldOperationId}
                </div>
              )}
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MetricCard label="Miss Distance" value={`${activeBranch.metrics.missDistanceKm} km`} tone={textOpacity[theme].primary} faint={textOpacity[theme].faint} />
              <MetricCard label="Collision Risk" value={formatProbability(activeBranch.metrics.collisionProbability)} tone={(activeBranch.metrics.collisionProbability < 0.01 ? green[theme].text : rc.HIGH.text)} faint={textOpacity[theme].faint} />
              <MetricCard label="Fuel Cost" value={`${activeBranch.metrics.fuelCostKg} kg`} tone={textOpacity[theme].primary} faint={textOpacity[theme].faint} />
              <MetricCard label="Mission Delay" value={`${activeBranch.metrics.scheduleDelayMin} min`} tone={textOpacity[theme].primary} faint={textOpacity[theme].faint} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
            <div className={`rounded-2xl border ${border[theme]} bg-black/[0.03] dark:bg-white/[0.03] p-4`}>
              <div className={`font-orbitron text-[11px] tracking-[0.28em] ${textOpacity[theme].faint}`}>
                FUTURE TIMELINE
              </div>
              <div className="mt-3 space-y-3">
                {activeBranch.timeline.map((step) => (
                  <div key={step} className="flex gap-3">
                    <div className={`mt-1 h-2 w-2 shrink-0 rounded-full ${accent[theme].dot}`} />
                    <div className={`${fontSize.base} ${textOpacity[theme].secondary}`}>{step}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className={`rounded-2xl border ${border[theme]} bg-black/[0.03] dark:bg-white/[0.03] p-4`}>
              <div className={`font-orbitron text-[11px] tracking-[0.28em] ${textOpacity[theme].faint}`}>
                WORLD MODEL OUTPUT
              </div>
              {worldResult?.thumbnail_url ? (
                <div className="mt-3">
                  <img
                    src={worldResult.thumbnail_url}
                    alt="Generated future world"
                    className="w-full rounded-xl border border-black/10 dark:border-white/10"
                  />
                  <div className={`mt-3 ${fontSize.small} ${textOpacity[theme].secondary}`}>
                    {worldResult.pano_url ? 'Panorama asset returned and ready for richer rendering.' : 'Thumbnail returned from World Labs.'}
                    {cachedWorld?.done ? ' Cached in Firebase for instant demo reloads.' : ''}
                  </div>
                </div>
              ) : (
                <p className={`mt-3 ${fontSize.base} ${textOpacity[theme].secondary}`}>
                  {worldError || simulation.confidenceNote}
                </p>
              )}
              {worldPrompt && (
                <div className={`mt-4 rounded-xl border ${accent[theme].borderDim} ${accent[theme].bgDim} px-3 py-2`}>
                  <div className={`font-mono ${fontSize.small} ${textOpacity[theme].faint}`}>WORLD PROMPT</div>
                  <div className={`mt-1 ${fontSize.base} ${textOpacity[theme].primary}`}>
                    {worldPrompt}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      )}
    </motion.div>
  )
}

function MetricCard({
  label,
  value,
  tone,
  faint,
}: {
  label: string
  value: string
  tone: string
  faint: string
}) {
  return (
    <div className="rounded-xl border border-black/10 dark:border-white/10 px-3 py-2">
      <div className={`font-mono ${faint} text-[11px] tracking-[0.14em]`}>{label}</div>
      <div className={`mt-1 text-sm font-semibold ${tone}`}>{value}</div>
    </div>
  )
}
