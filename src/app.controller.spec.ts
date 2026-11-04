import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { getDrizzleToken } from '@nestjs/drizzle';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [{ provide: getDrizzleToken(), useValue: { execute: vi.fn().mockResolvedValue([{ '?column?': 1 }]) } }],
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
  });
});
