import { plainToInstance, Type } from "class-transformer"
import { IsEnum, IsInt, Max, Min, validateSync } from "class-validator"

enum LogLevel {
    Trace = 'trace',
    Debug = 'debug',
    Info = 'info',
    Warn = 'warn',
    Error = 'error',
    Fatal = 'fatal'
}

enum NodeEnvironment {
    Development = 'development',
    Testing = 'test',
    Production = 'production'
}


class EnvironmentVariables {
    @Type(() => Number)
    @IsInt()
    @Min(1024)
    @Max(65535)
    PORT: number

    @IsEnum(NodeEnvironment)
    NODE_ENV: NodeEnvironment

    @IsEnum(LogLevel)
    LOG_LEVEL: LogLevel
}

export function validate(config: Record<string, unknown>) {
    const validatedConfig = plainToInstance(EnvironmentVariables, config, {
        enableImplicitConversion: true
    })
    const errors = validateSync(validatedConfig, { skipMissingProperties: false })
    if (errors.length > 0) {
        const messages = errors.flatMap(error =>
            Object.values(error.constraints ?? {}),
        );
        throw new Error(messages.join('\n'));
    }
    return validatedConfig;
}