'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { collection, onSnapshot, query } from 'firebase/firestore'
import { db } from '@/lib/firebase'
import type { ConjunctionEvent } from '@/components/Dashboard/EventsPanel'
import { buildSimulationBundle } from '@/lib/scenario'
import { accent, border, fontSize, green, riskClasses, textOpacity } from '@/lib/theme'
import { useTheme } from '@/lib/ThemeContext'
import { api, type CachedWorldSimulationResponse, type WorldSimulationStatusResponse } from '@/lib/api'

const ImmersiveWorldViewer = dynamic(
  () => import('@/components/Dashboard/ImmersiveWorldViewer').then((mod) => mod.ImmersiveWorldViewer),
  { ssr: false },
)

const branchTone = {
  monitor: 'Monitor',
  maneuver: 'Intervene',
  reroute: 'Replan',
} as const

function formatProbability(probability: number) {
  return `${(probability * 100).toFixed(probability < 0.01 ? 2 : 1)}%`
}

function compactCaption(input?: string | null) {
  if (!input) return null
  const trimmed = input.replace(/\s+/g, ' ').trim()
  if (trimmed.length <= 180) return trimmed
  return `${trimmed.slice(0, 177)}...`
}

function formatRuntimeLabel(isoString?: string) {
  if (!isoString) return null
  const parsed = new Date(isoString)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function formatElapsed(startIso?: string, endIso?: string) {
  if (!startIso) return null
  const start = new Date(startIso).getTime()
  const end = endIso ? new Date(endIso).getTime() : Date.now()
  if (Number.isNaN(start) || Number.isNaN(end)) return null
  const totalSeconds = Math.max(0, Math.floor((end - start) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}m ${seconds.toString().padStart(2, '0')}s`
}

export function SimulationLab({
  selectedEventId,
  onClose,
}: {
  selectedEventId?: string | null
  onClose?: () => void
}) {
  const { theme } = useTheme()
  const rc = riskClasses[theme]
  const [events, setEvents] = useState<ConjunctionEvent[]>([])
  const [activeBranchId, setActiveBranchId] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [worldResult, setWorldResult] = useState<WorldSimulationStatusResponse | null>(null)
  const [worldOperationId, setWorldOperationId] = useState<string | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [worldError, setWorldError] = useState<string | null>(null)
  const [cachedWorld, setCachedWorld] = useState<CachedWorldSimulationResponse | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isImmersive3D, setIsImmersive3D] = useState(false)

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
        const usable = Boolean(
          data.done && (data.thumbnail_url || data.pano_url || (data.splat_urls && data.splat_urls.length > 0))
        )
        setCachedWorld(usable ? data : null)
        if (usable) {
          setWorldResult({
            done: data.done,
            operation_id: data.operation_id,
            created_at: data.created_at,
            updated_at: data.updated_at,
            expires_at: data.expires_at,
            progress_status: data.progress_status,
            progress_description: data.progress_description,
            world_id: data.world_id,
            thumbnail_url: data.thumbnail_url,
            pano_url: data.pano_url,
            splat_urls: data.splat_urls,
            world_marble_url: data.world_marble_url,
            caption: data.caption,
            raw_operation: {},
          })
          setWorldOperationId(data.operation_id)
          setWorldError(null)
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
    setWorldError(null)
    setWorldResult(null)
    setWorldOperationId(null)
  }, [selectedEvent?.id, activeBranchId])

  useEffect(() => {
    if (!worldOperationId) return

    let cancelled = false
    const intervalId = window.setInterval(async () => {
      try {
        const status = await api.getWorldSimulationStatus(worldOperationId)
        if (cancelled) return
        setWorldResult(status)
        if (status.done) {
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
  const shortCaption = compactCaption(worldResult?.caption)
  const generationStartedAt = worldResult?.created_at || undefined
  const generationUpdatedAt = worldResult?.updated_at || undefined
  const generationStartedLabel = formatRuntimeLabel(generationStartedAt)
  const generationElapsed = formatElapsed(generationStartedAt, worldResult?.done ? generationUpdatedAt : undefined)
  const generationStatusLabel = worldResult?.progress_status || (isGenerating ? 'IN_PROGRESS' : undefined)
  const generationDescription =
    worldResult?.progress_description ||
    (isGenerating ? 'World generation in progress' : undefined)

  const hasRenderableWorld = Boolean(
    worldResult?.thumbnail_url ||
    worldResult?.pano_url ||
    (worldResult?.splat_urls && worldResult.splat_urls.length > 0)
  )

  const renderImageUrl = worldResult?.thumbnail_url || worldResult?.pano_url || null
  const immersivePanoUrl = worldResult?.pano_url || null

  const hasUsableCachedWorld = Boolean(
    cachedWorld?.done &&
    (cachedWorld.thumbnail_url || cachedWorld.pano_url || (cachedWorld.splat_urls && cachedWorld.splat_urls.length > 0))
  )

  const worldStateLabel = isGenerating
    ? 'LIVE GENERATION'
    : hasUsableCachedWorld
      ? 'SAVED IN FIREBASE'
      : worldOperationId
        ? 'RUNNING'
        : 'NOT GENERATED'

  async function handleGenerateWorld(rerun = false) {
    if (!selectedEvent) {
      setWorldError('Select a live event before generating a future world.')
      return
    }

    setWorldError(null)
    setWorldResult(null)
    setCachedWorld(null)
    setIsGenerating(true)

    try {
      const started = await api.startWorldSimulation({
        event: selectedEvent as unknown as Record<string, unknown>,
        branch: activeBranch as unknown as Record<string, unknown>,
        rerun,
      })
      setWorldOperationId(started.operation_id)
      setWorldResult({
        done: false,
        operation_id: started.operation_id,
        created_at: started.created_at,
        updated_at: started.updated_at,
        expires_at: started.expires_at,
        progress_status: started.progress_status,
        progress_description: started.progress_description,
        raw_operation: {},
      })
      if (started.cached) {
        setIsGenerating(false)
        const usable = Boolean(
          started.thumbnail_url ||
          started.pano_url ||
          (started.splat_urls && started.splat_urls.length > 0)
        )
        if (usable) {
          setWorldResult({
            done: true,
            operation_id: started.operation_id,
            created_at: started.created_at,
            updated_at: started.updated_at,
            expires_at: started.expires_at,
            progress_status: started.progress_status,
            progress_description: started.progress_description,
            world_id: started.world_id,
            thumbnail_url: started.thumbnail_url,
            pano_url: started.pano_url,
            splat_urls: started.splat_urls,
            world_marble_url: started.world_marble_url,
            caption: started.caption,
            raw_operation: {},
          })
        } else {
          setWorldResult({
            done: false,
            operation_id: started.operation_id,
            created_at: started.created_at,
            updated_at: started.updated_at,
            expires_at: started.expires_at,
            progress_status: started.progress_status,
            progress_description: started.progress_description,
            raw_operation: {},
          })
        }
      }
    } catch (error) {
      setWorldError(error instanceof Error ? error.message : 'Failed to start world generation.')
      setIsGenerating(false)
    }
  }

  return (
    <>
      <motion.div
        className={`absolute z-40 flex flex-col rounded-2xl overflow-hidden backdrop-blur-md border ${border[theme]} bg-white/85 dark:bg-neutral-900/55`}
        style={{ bottom: '1rem', left: '1rem', right: isExpanded ? '20rem' : 'auto', maxHeight: 'calc(100vh - 2rem)' }}
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
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className={`rounded-xl px-3 py-2 border ${border[theme]} ${textOpacity[theme].secondary} font-mono ${fontSize.small} tracking-[0.16em]`}
            >
              EXIT SCENARIO
            </button>
          )}
        </div>
        </>
        )}
        </div>

        {isExpanded && (
        <div className="grid flex-1 gap-4 overflow-y-auto p-4 lg:grid-cols-[0.9fr_2.1fr]">
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
                {isGenerating ? 'GENERATING FUTURE...' : hasUsableCachedWorld ? 'LOAD SAVED FUTURE' : 'GENERATE FUTURE VIEW'}
              </button>
              <button
                type="button"
                onClick={() => handleGenerateWorld(true)}
                disabled={isGenerating || !selectedEvent}
                className={`rounded-xl px-4 py-2 border ${border[theme]} ${textOpacity[theme].secondary} font-mono ${fontSize.small} tracking-[0.16em] disabled:opacity-50`}
              >
                RUN AGAIN
              </button>
              <span className={`rounded-full px-2 py-1 font-mono ${fontSize.small} ${isGenerating ? rc.HIGH.text : hasUsableCachedWorld ? green[theme].text : textOpacity[theme].secondary} ${isGenerating ? rc.HIGH.bg : hasUsableCachedWorld ? green[theme].bgMuted : accent[theme].bgDim}`}>
                {worldStateLabel}
              </span>
            </div>

            {(isGenerating || generationStartedAt) && (
              <div className={`mt-3 rounded-xl border ${accent[theme].borderDim} ${accent[theme].bgDim} px-3 py-2`}>
                <div className={`font-mono ${fontSize.small} tracking-[0.16em] ${textOpacity[theme].faint}`}>
                  WORLD LABS TIMELINE
                </div>
                <div className="mt-2 grid gap-2 md:grid-cols-4">
                  <div>
                    <div className={`font-mono ${fontSize.small} ${textOpacity[theme].faint}`}>STATUS</div>
                    <div className={`${fontSize.base} ${textOpacity[theme].primary}`}>{generationStatusLabel || 'QUEUED'}</div>
                  </div>
                  <div>
                    <div className={`font-mono ${fontSize.small} ${textOpacity[theme].faint}`}>STARTED</div>
                    <div className={`${fontSize.base} ${textOpacity[theme].primary}`}>{generationStartedLabel || '--'}</div>
                  </div>
                  <div>
                    <div className={`font-mono ${fontSize.small} ${textOpacity[theme].faint}`}>ELAPSED</div>
                    <div className={`${fontSize.base} ${textOpacity[theme].primary}`}>{generationElapsed || '--'}</div>
                  </div>
                  <div>
                    <div className={`font-mono ${fontSize.small} ${textOpacity[theme].faint}`}>EXPECTED</div>
                    <div className={`${fontSize.base} ${textOpacity[theme].primary}`}>about 5 min</div>
                  </div>
                </div>
                {generationDescription && (
                  <div className={`mt-2 ${fontSize.base} ${textOpacity[theme].secondary}`}>
                    {generationDescription}
                  </div>
                )}
              </div>
            )}

            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <MetricCard label="Miss Distance" value={`${activeBranch.metrics.missDistanceKm} km`} tone={textOpacity[theme].primary} faint={textOpacity[theme].faint} />
              <MetricCard label="Collision Risk" value={formatProbability(activeBranch.metrics.collisionProbability)} tone={(activeBranch.metrics.collisionProbability < 0.01 ? green[theme].text : rc.HIGH.text)} faint={textOpacity[theme].faint} />
              <MetricCard label="Fuel Cost" value={`${activeBranch.metrics.fuelCostKg} kg`} tone={textOpacity[theme].primary} faint={textOpacity[theme].faint} />
              <MetricCard label="Mission Delay" value={`${activeBranch.metrics.scheduleDelayMin} min`} tone={textOpacity[theme].primary} faint={textOpacity[theme].faint} />
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.35fr_0.65fr]">
            <div className={`rounded-2xl border ${border[theme]} bg-black/[0.03] dark:bg-white/[0.03] p-4`}>
              <div className="flex items-center justify-between gap-3">
                <div className={`font-orbitron text-[11px] tracking-[0.28em] ${textOpacity[theme].faint}`}>
                  SIMULATED FUTURE
                </div>
                <div className={`${fontSize.small} font-mono ${textOpacity[theme].faint}`}>
                  {hasUsableCachedWorld ? 'INSTANT REPLAY READY' : isGenerating ? 'LIVE WORLD GENERATION' : 'READY TO GENERATE'}
                </div>
              </div>
              <div className="mt-3">
                {renderImageUrl ? (
                  <button
                    type="button"
                    onClick={() => setIsFullscreen(true)}
                    className="block w-full"
                  >
                    <img
                      src={renderImageUrl}
                      alt={`${activeBranch.label} simulation`}
                      className="h-[340px] w-full rounded-xl border border-black/10 object-cover dark:border-white/10"
                    />
                  </button>
                ) : (
                  <div className={`flex h-[340px] w-full items-center justify-center rounded-xl border border-dashed border-black/15 dark:border-white/15 ${accent[theme].bgDim} px-6 text-center`}>
                    <div>
                      <div className={`${fontSize.medium} font-semibold ${textOpacity[theme].primary}`}>
                        {isGenerating ? 'Generating orbital future...' : 'No simulation loaded yet'}
                      </div>
                      <div className={`mt-2 ${fontSize.base} ${textOpacity[theme].secondary}`}>
                        {worldError || (selectedEvent
                          ? 'Run this branch once and the generated world will be cached for instant demo playback.'
                          : 'Select the critical satellite event, then generate a future branch.')}
                      </div>
                    </div>
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {renderImageUrl && (
                    <button
                      type="button"
                      onClick={() => setIsFullscreen(true)}
                      className={`rounded-xl px-3 py-2 border ${accent[theme].borderDim} ${accent[theme].bgDim} ${accent[theme].text} font-mono ${fontSize.small} tracking-[0.16em]`}
                    >
                      OPEN FULL SCREEN
                    </button>
                  )}
                  {immersivePanoUrl && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsFullscreen(true)
                        setIsImmersive3D(true)
                      }}
                      className={`rounded-xl px-3 py-2 border ${border[theme]} ${textOpacity[theme].secondary} font-mono ${fontSize.small} tracking-[0.16em]`}
                    >
                      ENTER 3D VIEW
                    </button>
                  )}
                </div>
                {(renderImageUrl || isGenerating || worldResult?.caption) && (
                  <div className={`mt-3 ${fontSize.base} ${textOpacity[theme].secondary}`}>
                    {worldResult?.caption ||
                      (renderImageUrl
                        ? `${activeBranch.label} visualized as the predicted future state. ${hasUsableCachedWorld ? 'Loaded instantly from Firebase cache.' : 'Freshly generated from World Labs.'}`
                        : 'World Labs is still generating this branch. First run can take under a minute.')}
                  </div>
                )}
              </div>
            </div>

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
          </div>
        </div>
        </div>
        )}
      </motion.div>

      {isFullscreen && renderImageUrl && (
        <div className="fixed inset-0 z-[90] overflow-y-auto bg-black">
          {isImmersive3D && immersivePanoUrl ? (
            <div className="absolute inset-0">
              <ImmersiveWorldViewer panoUrl={immersivePanoUrl} />
            </div>
          ) : (
            <>
              <img
                src={renderImageUrl}
                alt={`${activeBranch.label} fullscreen simulation`}
                className="absolute inset-0 h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(125,211,252,0.18),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.72)_0%,rgba(2,6,23,0.38)_24%,rgba(2,6,23,0.72)_100%)]" />
              <div className="absolute inset-y-0 left-0 w-[42rem] bg-gradient-to-r from-slate-950/88 via-slate-950/70 to-transparent" />
            </>
          )}

          {isImmersive3D ? (
            <div className="absolute right-5 top-5 z-[95] flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsImmersive3D(false)}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-sky-200/35 bg-slate-950/48 text-sky-50 shadow-[0_12px_30px_rgba(2,6,23,0.35)] backdrop-blur-md"
                aria-label="Exit 3D view"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFullscreen(false)
                  setIsImmersive3D(false)
                }}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/22 bg-slate-950/52 text-white shadow-[0_12px_30px_rgba(2,6,23,0.35)] backdrop-blur-md"
                aria-label="Close fullscreen"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <div className="absolute left-0 right-0 top-0 flex items-center justify-between px-6 py-5">
                <div>
                  <div className="font-orbitron text-[11px] tracking-[0.28em] text-sky-100 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]">
                    FULL-SCREEN SIMULATION
                  </div>
                  <div className={`mt-2 ${fontSize.xlarge} font-semibold text-white drop-shadow-[0_2px_10px_rgba(0,0,0,0.75)]`}>
                    {selectedEvent?.asset_name || selectedEvent?.name || 'Satellite Risk Event'}
                  </div>
                  <div className={`mt-1 ${fontSize.medium} text-white/92 drop-shadow-[0_2px_8px_rgba(0,0,0,0.7)]`}>
                    {activeBranch.label} branch · {simulation.horizonLabel}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {immersivePanoUrl && (
                    <button
                      type="button"
                      onClick={() => setIsImmersive3D((current) => !current)}
                      className="rounded-xl border border-sky-100/45 bg-sky-200/18 px-4 py-2 font-mono text-[11px] tracking-[0.16em] text-sky-50 shadow-[0_10px_30px_rgba(2,6,23,0.25)] backdrop-blur-md"
                    >
                      ENTER 3D VIEW
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      setIsFullscreen(false)
                      setIsImmersive3D(false)
                    }}
                    className="rounded-xl border border-white/26 bg-slate-950/62 px-4 py-2 font-mono text-[11px] tracking-[0.16em] text-white shadow-[0_10px_30px_rgba(2,6,23,0.28)] backdrop-blur-md"
                  >
                    CLOSE
                  </button>
                </div>
              </div>

              <div className="absolute left-6 top-28 max-w-xl rounded-[1.75rem] border border-white/18 bg-slate-950/84 p-6 shadow-[0_24px_80px_rgba(0,0,0,0.52)] backdrop-blur-xl">
                <div className="font-orbitron text-[11px] tracking-[0.28em] text-sky-100">
                  RECOMMENDED ACTION
                </div>
                <div className="mt-2 text-4xl font-semibold leading-tight text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.42)]">
                  {activeBranch.label}
                </div>
                <p className="mt-4 max-w-lg text-base leading-8 text-white">
                  {activeBranch.recommendation}
                </p>
                {shortCaption && (
                  <p className="mt-4 max-w-lg text-sm leading-7 text-white/82">
                    {shortCaption}
                  </p>
                )}
              </div>

              <div className="absolute bottom-6 left-6 right-6 grid gap-3 md:grid-cols-4">
                <FullscreenMetric label="Miss Distance" value={`${activeBranch.metrics.missDistanceKm} km`} />
                <FullscreenMetric label="Collision Risk" value={formatProbability(activeBranch.metrics.collisionProbability)} />
                <FullscreenMetric label="Fuel Cost" value={`${activeBranch.metrics.fuelCostKg} kg`} />
                <FullscreenMetric label="Mission Delay" value={`${activeBranch.metrics.scheduleDelayMin} min`} />
              </div>
            </>
          )}
        </div>
      )}
    </>
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

function FullscreenMetric({
  label,
  value,
}: {
  label: string
  value: string
}) {
  return (
    <div className="rounded-2xl border border-white/12 bg-slate-950/42 p-4 shadow-[0_18px_60px_rgba(0,0,0,0.25)] backdrop-blur-xl">
      <div className="font-mono text-[11px] tracking-[0.18em] text-sky-100/45">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-white">{value}</div>
    </div>
  )
}
