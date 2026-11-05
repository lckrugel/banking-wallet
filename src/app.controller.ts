import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { ApiOkResponse, ApiServiceUnavailableResponse, ApiTags } from '@nestjs/swagger';
import { InjectDrizzle } from '@nestjs/drizzle';
import { sql } from 'drizzle-orm';
import type { Database } from './database/database.types.js';

@Controller('health')
@ApiTags('Saúde')
export class AppController {
  constructor(@InjectDrizzle() private readonly db: Database) {}

  @Get('live')
  @ApiOkResponse({ description: 'Aplicação em execução', schema: { example: { status: 'ok' } } })
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOkResponse({ description: 'Banco de dados acessível', schema: { example: { status: 'ok' } } })
  @ApiServiceUnavailableResponse({ description: 'Banco de dados indisponível', schema: { example: { status: 'error' } } })
  async ready(): Promise<{ status: 'ok' }> {
    try {
      await this.db.execute(sql`select 1`);
      return { status: 'ok' };
    } catch (error) {
      throw new ServiceUnavailableException({ status: 'error' }, { cause: error });
    }
  }
}
