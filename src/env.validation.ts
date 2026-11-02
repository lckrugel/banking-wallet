import { plainToInstance, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

enum LogLevel {
  Trace = 'trace',
  Debug = 'debug',
  Info = 'info',
  Warn = 'warn',
  Error = 'error',
  Fatal = 'fatal',
}

enum NodeEnvironment {
  Development = 'development',
  Testing = 'test',
  Production = 'production',
}

export class EnvironmentVariables {
  // Application
  @Type(() => Number)
  @IsInt()
  @Min(1024)
  @Max(65535)
  PORT: number;
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment;
  @IsEnum(LogLevel)
  LOG_LEVEL: LogLevel;
  @IsOptional()
  @IsString()
  TZ?: string;

  // Database
  @IsString()
  PG_HOST: string;
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  PG_PORT: number;
  @IsString()
  PG_USER: string;
  @IsString()
  PG_PASSWORD: string;
  @IsString()
  PG_DB: string;
}

export function validate(config: Record<string, unknown>) {
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });
  const errors = validateSync(validatedConfig, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(messages.join('\n'));
  }
  return validatedConfig;
}
