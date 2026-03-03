/**
 * Repository barrel file.
 *
 * Re-exports all repository classes and their entity types so consumers can
 * import from a single path:
 *
 *   import { CampaignRepository, Campaign } from '../repositories';
 */

// Base
export { BaseRepository } from './BaseRepository';
export type { FindAllOptions } from './BaseRepository';

// Entities
export { CampaignRepository } from './CampaignRepository';
export type { Campaign } from './CampaignRepository';

export { UserRepository } from './UserRepository';
export type { User, UserWithPassword } from './UserRepository';

export { CountryRepository } from './CountryRepository';
export type { Country } from './CountryRepository';

export { ContentRepository } from './ContentRepository';
export type { Content } from './ContentRepository';

export { CreativeRepository } from './CreativeRepository';
export type { Creative } from './CreativeRepository';

export { BudgetRepository } from './BudgetRepository';
export type { BudgetAllocation } from './BudgetRepository';

export { AlertRepository } from './AlertRepository';
export type { FraudAlert } from './AlertRepository';

export { SessionRepository } from './SessionRepository';
export type { Session } from './SessionRepository';

export { AuditLogRepository } from './AuditLogRepository';
export type { AuditLog } from './AuditLogRepository';

export { ProductRepository } from './ProductRepository';
export type { Product } from './ProductRepository';
