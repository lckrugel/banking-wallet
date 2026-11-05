import { ServiceUnavailableException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { getDrizzleToken } from '@nestjs/drizzle';

describe('AppController', () => {
  let appController: AppController;
  const execute = vi.fn().mockResolvedValue([{ '?column?': 1 }]);

  beforeEach(async () => {
    execute.mockReset().mockResolvedValue([{ '?column?': 1 }]);
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: getDrizzleToken(), useValue: { execute } }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('health', () => {
    it('reports the application as live', () => {
      expect(appController.live()).toEqual({ status: 'ok' });
    });

    it('checks database readiness', async () => {
      await expect(appController.ready()).resolves.toEqual({ status: 'ok' });
    });

    it('returns a generic 503 while retaining the database error as its cause', async () => {
      const failure = new Error('Connection refused');
      execute.mockRejectedValueOnce(failure);

      try {
        await appController.ready();
        throw new Error('Expected a readiness failure');
      } catch (error) {
        expect(error).toBeInstanceOf(ServiceUnavailableException);
        const exception = error as ServiceUnavailableException;
        expect(exception.getStatus()).toBe(503);
        expect(exception.getResponse()).toEqual({ status: 'error' });
        expect(exception.cause).toBe(failure);
      }
    });
  });
});
