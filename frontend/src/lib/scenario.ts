import type { ConjunctionEvent } from '@/components/Dashboard/EventsPanel'

export interface ScenarioMetrics {
  missDistanceKm: number
  collisionProbability: number
  fuelCostKg: number
  scheduleDelayMin: number
  operatorConfidence: number
}

export interface ScenarioBranch {
  id: string
  label: string
  stance: 'monitor' | 'maneuver' | 'reroute'
  summary: string
  recommendation: string
  timeline: string[]
  metrics: ScenarioMetrics
}

export interface SimulationBundle {
  title: string
  mission: string
  horizonLabel: string
  confidenceNote: string
  recommendedBranchId: string
  branches: ScenarioBranch[]
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))

export function buildSimulationBundle(event: ConjunctionEvent | null): SimulationBundle {
  if (!event) {
    return {
      title: 'Scenario Lab',
      mission: 'Select a live event from the risk monitor to compare future branches.',
      horizonLabel: '6h / 24h / 72h rollout',
      confidenceNote: 'Current mode uses deterministic heuristics so we can wire the world model API in cleanly next.',
      recommendedBranchId: 'maneuver',
      branches: [
        {
          id: 'monitor',
          label: 'Observe Only',
          stance: 'monitor',
          summary: 'Keep tracking live telemetry and wait for a cleaner decision window.',
          recommendation: 'Best when the event is low urgency and maneuver budgets are tight.',
          timeline: [
            'T+0m: ingest orbital state and recent alerts',
            'T+90m: recompute closest approach window',
            'T+6h: hold unless risk acceleration exceeds threshold',
          ],
          metrics: {
            missDistanceKm: 3.2,
            collisionProbability: 0.038,
            fuelCostKg: 0,
            scheduleDelayMin: 0,
            operatorConfidence: 0.54,
          },
        },
        {
          id: 'maneuver',
          label: 'Avoidance Burn',
          stance: 'maneuver',
          summary: 'Execute a small burn before time of closest approach to widen separation.',
          recommendation: 'Strongest default for conjunction-heavy events with an actionable decision window.',
          timeline: [
            'T+0m: prepare maneuver packet',
            'T+45m: commit burn and update propagated orbit',
            'T+6h: verify widened miss distance and safe return-to-plan window',
          ],
          metrics: {
            missDistanceKm: 8.6,
            collisionProbability: 0.006,
            fuelCostKg: 14,
            scheduleDelayMin: 18,
            operatorConfidence: 0.81,
          },
        },
        {
          id: 'reroute',
          label: 'Mission Replan',
          stance: 'reroute',
          summary: 'Change mission timing and local operating plan without an immediate burn.',
          recommendation: 'Useful for launch and weather events where schedule flexibility is cheaper than fuel.',
          timeline: [
            'T+0m: recalculate mission constraints',
            'T+3h: shift operating window and hold nonessential tasks',
            'T+24h: resume nominal profile after risk band clears',
          ],
          metrics: {
            missDistanceKm: 5.1,
            collisionProbability: 0.014,
            fuelCostKg: 4,
            scheduleDelayMin: 62,
            operatorConfidence: 0.69,
          },
        },
      ],
    }
  }

  const baseDistance = clamp(
    event.closest_approach_km || event.miss_distance_km || 5,
    0.3,
    500000,
  )
  const baseProb = clamp(
    event.collision_probability || (event.risk_level === 'CRITICAL'
      ? 0.08
      : event.risk_level === 'HIGH'
        ? 0.035
        : event.risk_level === 'MEDIUM'
          ? 0.015
          : 0.005),
    0.0001,
    0.25,
  )

  const isLaunch = Boolean(event.name && event.provider)
  const eventName = event.name || event.asset_name || 'Tracked event'
  const counterpart = event.secondary_name || 'Orbital environment'

  const observeDistance = clamp(baseDistance * (isLaunch ? 1.05 : 1.0), 0.2, 1000000)
  const observeProbability = clamp(baseProb * (isLaunch ? 0.9 : 1.15), 0.0001, 0.35)
  const maneuverDistance = clamp(baseDistance * (isLaunch ? 1.4 : 4.8), 0.2, 1000000)
  const maneuverProbability = clamp(baseProb * (isLaunch ? 0.55 : 0.22), 0.0001, 0.35)
  const rerouteDistance = clamp(baseDistance * (isLaunch ? 1.9 : 2.6), 0.2, 1000000)
  const rerouteProbability = clamp(baseProb * (isLaunch ? 0.28 : 0.42), 0.0001, 0.35)

  const monitorSummary = isLaunch
    ? `Hold the current launch window for ${eventName} and keep monitoring pad weather plus upstream constraints.`
    : `Continue monitoring ${eventName} against ${counterpart} without changing the current orbital plan.`
  const burnSummary = isLaunch
    ? `Trigger a mission re-sequence for ${eventName} with a tighter weather and readiness gate before release.`
    : `Commit a small avoidance burn for ${eventName} before closest approach and repropagate the new state.`
  const rerouteSummary = isLaunch
    ? `Delay ${eventName} into a cleaner window and reallocate crew, pad, and payload operations.`
    : `Shift the mission profile for ${eventName} and temporarily replan noncritical operations around the risk window.`

  return {
    title: eventName,
    mission: isLaunch
      ? `World-model-style decision support for launch timing and environmental constraints.`
      : `Counterfactual rollout for ${eventName} versus ${counterpart}.`,
    horizonLabel: isLaunch ? 'launch window / 24h / mission recovery' : 'TCA / 6h / 24h',
    confidenceNote: event.agent_assessment || 'Heuristic simulation bundle ready for a world model API rollout.',
    recommendedBranchId: isLaunch ? 'reroute' : 'maneuver',
    branches: [
      {
        id: 'monitor',
        label: 'Observe Only',
        stance: 'monitor',
        summary: monitorSummary,
        recommendation: 'Lowest operational cost, but it preserves most of the current risk surface.',
        timeline: isLaunch
          ? [
              'T+0m: hold current pad status and monitor weather drift',
              'T+60m: recompute scrub likelihood from updated conditions',
              'T+6h: commit only if launch risk falls below threshold',
            ]
          : [
              'T+0m: keep current orbit and ingest fresh TLE state',
              'T+90m: re-evaluate closest approach geometry',
              'T+6h: escalate only if separation degrades further',
            ],
        metrics: {
          missDistanceKm: Number(observeDistance.toFixed(isLaunch ? 0 : 2)),
          collisionProbability: Number(observeProbability.toFixed(4)),
          fuelCostKg: 0,
          scheduleDelayMin: isLaunch ? 24 : 0,
          operatorConfidence: isLaunch ? 0.58 : 0.52,
        },
      },
      {
        id: 'maneuver',
        label: isLaunch ? 'Tighten Go/No-Go' : 'Avoidance Burn',
        stance: 'maneuver',
        summary: burnSummary,
        recommendation: isLaunch
          ? 'Best when you still want same-day execution but need a better safety margin.'
          : 'Best tradeoff for severe conjunctions when fuel is available.',
        timeline: isLaunch
          ? [
              'T+0m: refresh pad weather and vehicle readiness inputs',
              'T+45m: switch to a stricter launch commit envelope',
              'T+3h: release only if the simulated failure band stays below threshold',
            ]
          : [
              'T+0m: prepare burn packet and validate maneuver corridor',
              'T+45m: execute delta-v and repropagate the orbit',
              'T+6h: confirm widened miss distance and lower probability',
            ],
        metrics: {
          missDistanceKm: Number(maneuverDistance.toFixed(isLaunch ? 0 : 2)),
          collisionProbability: Number(maneuverProbability.toFixed(4)),
          fuelCostKg: isLaunch ? 2 : 12 + Math.round(baseProb * 80),
          scheduleDelayMin: isLaunch ? 38 : 12 + Math.round(baseProb * 200),
          operatorConfidence: isLaunch ? 0.74 : 0.84,
        },
      },
      {
        id: 'reroute',
        label: isLaunch ? 'Delay Window' : 'Mission Replan',
        stance: 'reroute',
        summary: rerouteSummary,
        recommendation: 'Most conservative branch when continuity matters less than safety margin.',
        timeline: isLaunch
          ? [
              'T+0m: scrub current window and preserve vehicle state',
              'T+8h: shift crew and payload operations to the next viable slot',
              'T+24h: relaunch with improved environmental margin',
            ]
          : [
              'T+0m: change mission timeline and freeze noncritical operations',
              'T+3h: route around the highest-risk window',
              'T+24h: restore nominal plan after conjunction clears',
            ],
        metrics: {
          missDistanceKm: Number(rerouteDistance.toFixed(isLaunch ? 0 : 2)),
          collisionProbability: Number(rerouteProbability.toFixed(4)),
          fuelCostKg: isLaunch ? 0 : 4 + Math.round(baseProb * 35),
          scheduleDelayMin: isLaunch ? 145 : 54 + Math.round(baseProb * 320),
          operatorConfidence: isLaunch ? 0.86 : 0.71,
        },
      },
    ],
  }
}
