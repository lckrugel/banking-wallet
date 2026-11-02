import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

const parseDbCredentials = () => {
    if (
        !process.env.PG_HOST ||
        !process.env.PG_PORT ||
        !Number.isSafeInteger(Number(process.env.PG_PORT)) ||
        !process.env.PG_USER ||
        !process.env.PG_PASSWORD ||
        !process.env.PG_DB
    ) {
        throw new Error('Missing DB connection variables')
    }
    return {
        host: process.env.PG_HOST,
        port: Number(process.env.PG_PORT),
        user: process.env.PG_USER,
        password: process.env.PG_PASSWORD,
        database: process.env.PG_DB
    }
}

export default defineConfig({
    dialect: 'postgresql',
    schema: './src/database/drizzle.schema.ts',
    out: './drizzle/schemas',
    dbCredentials: {
        ...parseDbCredentials(),
        ssl: false,
    }
})