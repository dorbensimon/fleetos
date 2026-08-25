/**
 * Barrel re-export — the admin/driver data-access layer lives in
 * lib/adminApi/*.ts split by domain (vehicles, assignments, drivers,
 * notifications, compliance, departments). Kept as a single import path
 * so every existing `from '../lib/adminApi'` call site keeps working.
 */
export * from './adminApi/types';
export * from './adminApi/vehicles';
export * from './adminApi/assignments';
export * from './adminApi/drivers';
export * from './adminApi/notifications';
export * from './adminApi/compliance';
export * from './adminApi/departments';
