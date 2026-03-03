export { ObservabilityService } from './ObservabilityService';
export { ApmClient, apm } from './apm';
export type { SeverityLevel, ApmContext, Transaction } from './apm';
export {
  recordHttpRequest,
  recordHttpDuration,
  incrementActiveConnections,
  decrementActiveConnections,
  getActiveConnections,
  recordError,
  renderMetrics,
  resetMetrics,
  normalisePath,
} from './metrics';
