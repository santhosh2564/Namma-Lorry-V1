import { readFileSync } from 'node:fs';
import { join } from 'node:path';

jest.mock('expo-task-manager', () => ({ defineTask: jest.fn() }));
jest.mock('../runtime', () => ({ getTrackingDb: jest.fn() }));
jest.mock('../taskHandler', () => ({ handleLocationUpdate: jest.fn(async () => 1) }));

describe('background task registration (TRD §4.2)', () => {
  it('defines the task at module load, before any component renders', () => {
    const TaskManager = require('expo-task-manager');
    const { TRIP_LOCATION_TASK } = require('../config');
    require('../task');
    expect(TaskManager.defineTask).toHaveBeenCalledTimes(1);
    expect(TaskManager.defineTask.mock.calls[0][0]).toBe(TRIP_LOCATION_TASK);
  });

  it('the task callback hands locations to the handler and swallows task errors', async () => {
    const TaskManager = require('expo-task-manager');
    const { handleLocationUpdate } = require('../taskHandler');
    const cb = TaskManager.defineTask.mock.calls[0][1];
    const locations = [{ timestamp: 1, coords: { latitude: 1, longitude: 2 } }];
    await expect(cb({ data: { locations }, error: null })).resolves.toBeUndefined();
    expect(handleLocationUpdate).toHaveBeenCalledWith(
      expect.any(Function),
      locations,
      expect.any(Function),
      expect.any(Function),
    );
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    await expect(cb({ data: null, error: { message: 'location unavailable' } })).resolves.toBeUndefined();
    expect(handleLocationUpdate).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('app/_layout.tsx imports the task module first', () => {
    const src = readFileSync(join(__dirname, '../../../app/_layout.tsx'), 'utf8');
    const firstImport = src.split('\n').find((l) => l.startsWith('import '));
    expect(firstImport).toBe("import '@/tracking/task';");
  });
});
