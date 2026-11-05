import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Database } from './database/database.types.js';

@Controller('health')
@ApiTags('Saúde')
export class AppController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Get('live')
  @ApiOperation({ summary: 'Verificar se a aplicação está em execução' })
  @ApiOkResponse({ description: 'Aplicação em execução', schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } } })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Verificar se o banco de dados está acessível' })
  @ApiOkResponse({ description: 'Banco de dados acessível', schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['ok'] } } } })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados indisponível', schema: { type: 'object', required: ['statusCode', 'status'], properties: { statusCode: { type: 'integer', enum: [503] }, status: { type: 'string', enum: ['error'] } } } })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch (error) {
      throw new ServiceUnavailableException({ status: 'error' }, { cause: error });
    }
  }
}
