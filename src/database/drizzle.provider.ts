import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../env.validation.js';
import { drizzle } from 'drizzle-orm/node-postgres';

export const drizzleFactory = async (
  config: ConfigService<EnvironmentVariables>,
) => {
  const db = drizzle({
    connection: {
      host: config.getOrThrow('PG_HOST'),
      port: config.getOrThrow('PG_PORT'),
      user: config.getOrThrow('PG_USER'),
      password: config.getOrThrow('PG_PASSWORD'),
      database: config.getOrThrow('PG_DB'),
    },
  });
  return { db };
};
