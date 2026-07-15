import 'dotenv/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db/pool.js'
import { startMaintenance } from './maintenance.js'

const config = loadConfig()
const pool = createPool(config)
const app = createApp(config, pool)
const stopMaintenance = startMaintenance(pool, config)

const server = app.listen(config.PORT, config.HOST, () => {
  console.info(`Infra API listening on http://${config.HOST}:${config.PORT}`)
})

async function shutdown() {
  stopMaintenance()
  server.close()
  await pool.end()
}

process.on('SIGINT', () => void shutdown())
process.on('SIGTERM', () => void shutdown())
