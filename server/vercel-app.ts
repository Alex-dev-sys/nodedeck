import 'dotenv/config'
import { createApp } from './app.js'
import { loadConfig } from './config.js'
import { createPool } from './db/pool.js'

export const vercelConfig = loadConfig()
export const vercelPool = createPool(vercelConfig)
export const vercelApp = createApp(vercelConfig, vercelPool)

