import type { Service } from '@/types'
import { clamp, seeded } from '@/lib/utils'

// ── Kind-specific deep-panel detail ─────────────────────────
// The core Service model is uniform; deep panels need domain data. These
// builders synthesise it deterministically from the live service (metrics
// drive the volatile bits so the panel reacts to load / crashes) plus a stable
// per-entity seed. Pure + side-effect-free.
//
// TODO(backend): replace each builder with a real detail endpoint
// (GET /services/:id/detail) returning these same shapes.

const NAMES = [
  'Steve', 'Alex', 'danil', 'Notch', 'Herobrine', 'xX_Miner_Xx',
  'CreeperKing', 'PixelPaladin', 'RedstoneRik', 'EnderJane', 'DiamondDan', 'VoidWalker',
]
const DIMS = ['Overworld', 'Nether', 'The End'] as const
const MODES = ['Survival', 'Creative', 'Adventure'] as const

export interface McPlayer {
  name: string
  ping: number
  gamemode: (typeof MODES)[number]
  dimension: (typeof DIMS)[number]
  playtimeMin: number
  health: number
}

export interface MinecraftDetail {
  tps: number
  mspt: number
  playersOnline: number
  playersMax: number
  players: McPlayer[]
  entities: number
  loadedChunks: number
  worldSizeGb: number
  seed: string
  difficulty: string
  chat: { name: string; text: string }[]
}

export function minecraftDetail(s: Service): MinecraftDetail {
  const load = (s.metrics.cpu + s.metrics.ram) / 2
  const down = s.status === 'offline' || s.status === 'restarting'
  // TPS degrades as load climbs past ~70%.
  const tps = down ? 0 : clamp(20 - Math.max(0, load - 68) * 0.28, 4, 20)
  const mspt = down ? 0 : clamp(1000 / tps - 50 + Math.max(0, load - 68) * 0.9, 8, 220)

  const online = down ? 0 : 3 + Math.floor(seeded(s.restartCount + 2) * 9)
  const players: McPlayer[] = Array.from({ length: online }, (_, i) => {
    const r = seeded(i * 7.3 + 1)
    return {
      name: NAMES[i % NAMES.length],
      ping: Math.round(18 + seeded(i * 3.1) * 90 + s.metrics.ping * 0.4),
      gamemode: MODES[Math.floor(seeded(i * 5.5) * MODES.length)],
      dimension: DIMS[Math.floor(seeded(i * 2.2) * DIMS.length)],
      playtimeMin: Math.round(12 + r * 640),
      health: Math.round(4 + seeded(i * 9.9) * 16),
    }
  })

  return {
    tps: Math.round(tps * 10) / 10,
    mspt: Math.round(mspt),
    playersOnline: online,
    playersMax: 20,
    players,
    entities: down ? 0 : 340 + Math.floor(seeded(s.restartCount + 5) * 900),
    loadedChunks: down ? 0 : 1200 + Math.floor(seeded(s.restartCount + 7) * 2600),
    worldSizeGb: Math.round((3.4 + seeded(9) * 2) * 10) / 10,
    seed: '-4172144997902289642',
    difficulty: 'Hard',
    chat: [
      { name: 'danil', text: 'building the new spawn' },
      { name: 'Alex', text: 'anyone got spare diamonds?' },
      { name: 'Server', text: 'PixelPaladin fell from a high place' },
      { name: 'CreeperKing', text: 'raid at the village!' },
    ],
  }
}

// ── Generic per-kind highlights (website / api / db / docker) ─
// A small stat set + optional table that the generic ServicePage renders for
// the remaining service kinds. Volatile numbers ride on the live metrics.

export interface HiStat {
  label: string
  value: string
  accent?: string
  sub?: string
}
export interface HiTable {
  title: string
  cols: string[]
  rows: (string | number)[][]
}
export interface ServiceHighlights {
  headline: string
  stats: HiStat[]
  table?: HiTable
}

const pctColor = (v: number, warn = 88) => (v >= warn ? '#fbbf24' : undefined)

export function serviceHighlights(s: Service): ServiceHighlights {
  const down = s.status === 'offline' || s.status === 'restarting'
  const load = s.metrics.cpu
  const n = (seed: number, a: number, b: number) => a + Math.floor(seeded(seed) * (b - a))

  switch (s.kind) {
    case 'api': {
      const rps = down ? 0 : Math.round(120 + load * 22)
      const p95 = down ? 0 : Math.round(40 + s.metrics.ping * 2 + load * 1.2)
      const err = down ? 0 : Math.round((0.4 + Math.max(0, load - 70) * 0.09) * 100) / 100
      const paths = ['/v1/status', '/v1/events', '/v1/deploy', '/v1/metrics', '/v1/orders']
      return {
        headline: 'Request throughput & endpoint latency',
        stats: [
          { label: 'Req/s', value: `${rps}` },
          { label: 'p95', value: `${p95}ms` },
          { label: 'p99', value: `${Math.round(p95 * 1.7)}ms` },
          { label: 'Error rate', value: `${err}%`, accent: err > 1.5 ? '#ff4d4f' : undefined },
          { label: 'Pool', value: `${n(1, 6, 19)}/20` },
        ],
        table: {
          title: 'Top endpoints',
          cols: ['Endpoint', 'Req/s', 'p95', 'Err%'],
          rows: paths.map((p, i) => [
            p,
            Math.round(rps * (0.35 - i * 0.05) + n(i + 2, 2, 20)),
            `${Math.round(p95 * (0.7 + seeded(i * 3.2) * 0.8))}ms`,
            `${Math.round(seeded(i * 4.4) * 120) / 100}`,
          ]),
        },
      }
    }
    case 'postgres': {
      const conns = down ? 0 : n(1, 12, 78)
      return {
        headline: 'Connections, cache & query health',
        stats: [
          { label: 'Connections', value: `${conns}/100`, accent: conns > 85 ? '#fbbf24' : undefined },
          { label: 'Cache hit', value: `${(98 + seeded(3) * 1.8).toFixed(1)}%` },
          { label: 'TPS', value: `${down ? 0 : n(2, 200, 1400)}` },
          { label: 'Slow queries', value: `${down ? 0 : n(3, 0, 6)}`, accent: pctColor(0) },
          { label: 'DB size', value: `${(18 + seeded(4) * 6).toFixed(1)} GB` },
        ],
        table: {
          title: 'Slowest queries (last 5m)',
          cols: ['Query', 'Calls', 'Mean'],
          rows: [
            ['SELECT * FROM events WHERE …', n(5, 40, 900), `${n(6, 40, 380)}ms`],
            ['UPDATE orders SET status …', n(7, 10, 200), `${n(8, 30, 260)}ms`],
            ['SELECT count(*) FROM users …', n(9, 5, 120), `${n(10, 20, 200)}ms`],
          ],
        },
      }
    }
    case 'redis': {
      return {
        headline: 'Cache ops & memory',
        stats: [
          { label: 'Ops/s', value: `${down ? 0 : n(1, 8000, 42000).toLocaleString()}` },
          { label: 'Hit rate', value: `${(92 + seeded(2) * 7).toFixed(1)}%` },
          { label: 'Keys', value: `${n(3, 40, 320)}k` },
          { label: 'Evictions', value: `${down ? 0 : n(4, 0, 40)}` },
          { label: 'Memory', value: `${Math.round(s.ramMb)} MB` },
        ],
      }
    }
    case 'docker': {
      const running = down ? 0 : 8
      return {
        headline: 'Containers, images & volumes',
        stats: [
          { label: 'Running', value: `${running}/10`, accent: running < 10 ? '#fbbf24' : undefined },
          { label: 'Images', value: `${n(1, 18, 40)}` },
          { label: 'Volumes', value: `${n(2, 6, 20)}` },
          { label: 'Restarts (24h)', value: `${n(3, 0, 5)}` },
          { label: 'Disk', value: `${(20 + seeded(5) * 30).toFixed(0)} GB` },
        ],
        table: {
          title: 'Containers',
          cols: ['Name', 'Image', 'CPU', 'State'],
          rows: [
            ['api-node', 'api:2.8.0', `${n(6, 4, 40)}%`, 'running'],
            ['web-next', 'web:4.1.2', `${n(7, 2, 20)}%`, 'running'],
            ['pg-main', 'postgres:17.2', `${n(8, 6, 30)}%`, 'running'],
            ['redis-cache', 'redis:7.4.1', `${n(9, 1, 12)}%`, 'running'],
          ],
        },
      }
    }
    case 'website': {
      const rps = down ? 0 : Math.round(30 + load * 8)
      return {
        headline: 'Traffic, caching & web vitals',
        stats: [
          { label: 'Req/s', value: `${rps}` },
          { label: 'Visitors (now)', value: `${down ? 0 : n(1, 20, 240)}` },
          { label: 'Cache hit', value: `${(88 + seeded(2) * 10).toFixed(0)}%` },
          { label: 'LCP', value: `${(1.4 + seeded(3) * 1.2).toFixed(1)}s`, accent: '#6ee7b7' },
          { label: 'Error rate', value: `${(seeded(4) * 0.8).toFixed(2)}%` },
        ],
        table: {
          title: 'Top routes',
          cols: ['Route', 'Views', 'Avg'],
          rows: [
            ['/', n(5, 200, 900), `${n(6, 120, 500)}ms`],
            ['/shop', n(7, 80, 400), `${n(8, 200, 700)}ms`],
            ['/news', n(9, 40, 220), `${n(10, 150, 600)}ms`],
            ['/leaderboard', n(11, 20, 160), `${n(12, 180, 650)}ms`],
          ],
        },
      }
    }
    case 'vpn': {
      const peers = down ? 0 : n(1, 11, 19)
      const handshakeAge = down ? '—' : `${n(2, 6, 42)}s ago`
      return {
        headline: 'WireGuard peers, transfer and gateway health',
        stats: [
          { label: 'Active peers', value: `${peers}/24` },
          { label: 'Last handshake', value: handshakeAge, accent: down ? '#ff4d4f' : '#6ee7b7' },
          { label: 'Ingress', value: `${down ? 0 : n(3, 24, 96)} Mbps` },
          { label: 'Egress', value: `${down ? 0 : n(4, 80, 260)} Mbps` },
          { label: 'Endpoint', value: down ? 'unreachable' : 'vpn.natux.world:51820', accent: down ? '#ff4d4f' : undefined },
        ],
        table: {
          title: 'Recent peers',
          cols: ['Peer', 'Address', 'Handshake', 'Transfer'],
          rows: [
            ['danil-mbp', '10.8.0.2', down ? '—' : `${n(5, 8, 35)}s ago`, `${n(6, 1, 12)}.4 GB`],
            ['ops-laptop', '10.8.0.4', down ? '—' : `${n(7, 9, 48)}s ago`, `${n(8, 400, 980)} MB`],
            ['backup-node', '10.8.0.9', down ? '—' : `${n(9, 12, 60)}s ago`, `${n(10, 2, 18)}.1 GB`],
          ],
        },
      }
    }
    case 'storage': {
      const used = down ? 0 : Math.round(58 + seeded(s.restartCount + 2) * 20)
      return {
        headline: 'S3 buckets, lifecycle and storage health',
        stats: [
          { label: 'Used capacity', value: `${used}%`, accent: used > 85 ? '#fbbf24' : undefined },
          { label: 'Objects', value: `${(42 + n(1, 1, 58)).toLocaleString()}k` },
          { label: 'Buckets', value: `${down ? 0 : n(2, 8, 18)}` },
          { label: 'Write rate', value: `${down ? 0 : n(3, 8, 86)} MB/s` },
          { label: 'Erasure health', value: down ? 'degraded' : 'healthy', accent: down ? '#ff4d4f' : '#6ee7b7' },
        ],
        table: {
          title: 'Largest buckets',
          cols: ['Bucket', 'Objects', 'Size', 'Lifecycle'],
          rows: [
            ['backups', `${n(4, 18, 42)}k`, `${n(5, 140, 480)} GB`, '30 days'],
            ['minecraft-worlds', `${n(6, 8, 22)}k`, `${n(7, 42, 120)} GB`, 'versioned'],
            ['build-artifacts', `${n(8, 12, 36)}k`, `${n(9, 18, 90)} GB`, '14 days'],
          ],
        },
      }
    }
    case 'queue': {
      const depth = down ? 0 : n(1, 14, 94)
      return {
        headline: 'Durable job streams and consumer throughput',
        stats: [
          { label: 'Pending jobs', value: `${depth}`, accent: depth > 70 ? '#fbbf24' : undefined },
          { label: 'Consumers', value: `${down ? 0 : n(2, 4, 12)}` },
          { label: 'Throughput', value: `${down ? 0 : n(3, 120, 980)}/s` },
          { label: 'Ack latency', value: `${down ? '—' : n(4, 2, 18)}ms` },
          { label: 'Dead letters', value: `${down ? 0 : n(5, 0, 8)}`, accent: n(5, 0, 8) > 5 ? '#fbbf24' : undefined },
        ],
        table: {
          title: 'Active streams',
          cols: ['Stream', 'Pending', 'Consumers', 'Age'],
          rows: [
            ['jobs', `${depth}`, `${n(6, 3, 8)}`, `${n(7, 1, 24)}s`],
            ['notifications', `${n(8, 0, 14)}`, `${n(9, 1, 4)}`, `${n(10, 1, 12)}s`],
            ['analytics', `${n(11, 2, 28)}`, `${n(12, 1, 5)}`, `${n(13, 4, 48)}s`],
          ],
        },
      }
    }
    case 'ci': {
      const running = down ? 0 : n(1, 1, 4)
      return {
        headline: 'Build execution, artifacts and deployment gates',
        stats: [
          { label: 'Running jobs', value: `${running}/4`, accent: running >= 4 ? '#fbbf24' : undefined },
          { label: 'Queued jobs', value: `${down ? 0 : n(2, 0, 12)}` },
          { label: 'Cache hit', value: `${down ? 0 : n(3, 72, 98)}%` },
          { label: 'Avg build', value: `${down ? '—' : n(4, 42, 168)}s` },
          { label: 'Artifacts', value: `${down ? 0 : n(5, 12, 86)} GB` },
        ],
        table: {
          title: 'Recent jobs',
          cols: ['Pipeline', 'Branch', 'Status', 'Duration'],
          rows: [
            ['deploy-api', 'main', 'passed', `${n(6, 40, 96)}s`],
            ['build-web', 'feat/dashboard', 'running', `${n(7, 12, 44)}s`],
            ['backup-verify', 'main', 'passed', `${n(8, 28, 80)}s`],
          ],
        },
      }
    }
    default:
      return {
        headline: 'Service overview',
        stats: [
          { label: 'Health', value: `${s.healthScore}%` },
          { label: 'Uptime', value: `${Math.round(s.uptimeSec / 86400)}d` },
          { label: 'Restarts', value: `${s.restartCount}` },
        ],
      }
  }
}

// ── OpenClaw — the autonomous AI agent runtime ──────────────
// The breakout agent of 2025. The panel treats it as an agent orchestrator:
// live sessions, token economy, tool-call mix, and safety guardrails.

const MODELS = ['claude-opus-4', 'claude-sonnet-5', 'claude-haiku-4.5'] as const
const TASKS = [
  'Refactor auth middleware',
  'Triage incident #4821',
  'Summarize weekly logs',
  'Generate migration plan',
  'Review PR #219',
  'Scrape pricing changes',
  'Draft release notes',
  'Optimize SQL query',
  'Answer support ticket',
  'Backfill analytics job',
]
const TOOLS = ['bash', 'read', 'edit', 'web_search', 'fetch', 'grep'] as const

export interface AgentSession {
  id: string
  task: string
  model: (typeof MODELS)[number]
  status: 'running' | 'queued' | 'done' | 'failed'
  tokens: number
  toolCalls: number
  durSec: number
}

export interface OpenClawDetail {
  activeSessions: number
  queued: number
  runsToday: number
  runsTotal: number
  tokensInToday: number
  tokensOutToday: number
  avgLatencyMs: number
  toolCallsPerMin: number
  successRate: number
  model: (typeof MODELS)[number]
  sessions: AgentSession[]
  toolBreakdown: { name: (typeof TOOLS)[number]; count: number }[]
  guardrails: {
    killSwitchArmed: boolean
    blockedActions: number
    sandboxed: boolean
    approvalsPending: number
  }
}

export function openclawDetail(s: Service): OpenClawDetail {
  const down = s.status === 'offline' || s.status === 'restarting'
  const load = s.metrics.cpu
  const active = down ? 0 : 2 + Math.floor(seeded(s.restartCount + 1) * 6)
  const queued = down ? 0 : Math.floor(seeded(s.restartCount + 4) * 5)

  const statuses: AgentSession['status'][] = []
  for (let i = 0; i < active; i++) statuses.push('running')
  for (let i = 0; i < queued; i++) statuses.push('queued')
  statuses.push('done', 'done', 'failed', 'done')

  const sessions: AgentSession[] = statuses.map((status, i) => {
    const r = seeded(i * 4.7 + 3)
    return {
      id: `run_${(9042 + i * 137).toString(36)}`,
      task: TASKS[i % TASKS.length],
      model: MODELS[Math.floor(seeded(i * 6.1) * MODELS.length)],
      status,
      tokens: Math.round((2 + r * 48) * 1000),
      toolCalls: Math.round(1 + seeded(i * 8.2) * 40),
      durSec: Math.round(4 + seeded(i * 3.9) * 900),
    }
  })

  const toolBreakdown = TOOLS.map((name, i) => ({
    name,
    count: Math.round(20 + seeded(i * 11.3 + 2) * 480),
  })).sort((a, b) => b.count - a.count)

  return {
    activeSessions: active,
    queued,
    runsToday: 1240 + Math.floor(seeded(12) * 900),
    runsTotal: 128_412 + Math.floor(seeded(21) * 4000),
    tokensInToday: 8_600_000 + Math.floor(seeded(31) * 3_000_000),
    tokensOutToday: 2_100_000 + Math.floor(seeded(33) * 900_000),
    avgLatencyMs: down ? 0 : Math.round(420 + s.metrics.ping * 6 + load * 4),
    toolCallsPerMin: down ? 0 : Math.round(12 + load * 0.9),
    successRate: Math.round((96.5 - (s.status === 'degraded' ? 8 : 0)) * 10) / 10,
    model: 'claude-opus-4',
    sessions,
    toolBreakdown,
    guardrails: {
      killSwitchArmed: true,
      blockedActions: 3 + Math.floor(seeded(41) * 9),
      sandboxed: true,
      approvalsPending: down ? 0 : Math.floor(seeded(s.restartCount + 6) * 3),
    },
  }
}
