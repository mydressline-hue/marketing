// ============================================================
// AI International Growth Engine - Agent Registry (Singleton)
// Central registry that manages all 20 agent instances
// ============================================================

import type { AgentType } from '../../types';
import { logger } from '../../utils/logger';
import type { BaseAgent } from './BaseAgent';

/**
 * Singleton registry that holds references to every registered agent instance.
 *
 * The registry is the single point of access for looking up agents by type.
 * During application bootstrap each agent module registers itself here so
 * that the orchestrator and cross-challenge protocol can locate peers
 * without tight coupling.
 *
 * @example
 * ```ts
 * const registry = AgentRegistry.getInstance();
 * registry.register(myAgent);
 * const agent = registry.get('paid_ads');
 * ```
 */
export class AgentRegistry {
  /** The singleton instance */
  private static instance: AgentRegistry | null = null;

  /** Internal map of agent type to agent instance */
  private readonly agents: Map<AgentType, BaseAgent> = new Map();

  /** Private constructor enforces singleton access via getInstance() */
  private constructor() {
    logger.info('AgentRegistry initialised');
  }

  /**
   * Returns the singleton AgentRegistry instance.
   * Creates the instance on first call (lazy initialisation).
   *
   * @returns The global AgentRegistry instance.
   */
  public static getInstance(): AgentRegistry {
    if (!AgentRegistry.instance) {
      AgentRegistry.instance = new AgentRegistry();
    }
    return AgentRegistry.instance;
  }

  /**
   * Registers an agent instance in the registry.
   * If an agent of the same type is already registered it will be replaced
   * and a warning will be logged.
   *
   * @param agent - The agent instance to register. Its type is read from {@link BaseAgent.getAgentType}.
   */
  public register(agent: BaseAgent): void {
    const agentType = agent.getAgentType();

    if (this.agents.has(agentType)) {
      logger.warn('Replacing existing agent registration', {
        agentType,
        previousInstanceId: this.agents.get(agentType)!.getInstanceId(),
        newInstanceId: agent.getInstanceId(),
      });
    }

    this.agents.set(agentType, agent);
    logger.info('Agent registered', {
      agentType,
      instanceId: agent.getInstanceId(),
      totalRegistered: this.agents.size,
    });
  }

  /**
   * Retrieves a registered agent by its type.
   *
   * @param agentType - The type of agent to look up.
   * @returns The agent instance, or `undefined` if not registered.
   */
  public get(agentType: AgentType): BaseAgent | undefined {
    return this.agents.get(agentType);
  }

  /**
   * Returns an array of all currently registered agent instances.
   *
   * @returns All registered agents in insertion order.
   */
  public getAll(): BaseAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Checks whether an agent of the given type is currently registered.
   *
   * @param agentType - The agent type to check.
   * @returns `true` if the agent is registered, `false` otherwise.
   */
  public has(agentType: AgentType): boolean {
    return this.agents.has(agentType);
  }

  /**
   * Returns the type identifiers of all currently registered agents.
   *
   * @returns An array of {@link AgentType} values.
   */
  public getAllTypes(): AgentType[] {
    return Array.from(this.agents.keys());
  }

  /**
   * Returns the number of agents currently registered.
   *
   * @returns The count of registered agents.
   */
  public get size(): number {
    return this.agents.size;
  }

  /**
   * Removes an agent from the registry.
   *
   * @param agentType - The type of agent to unregister.
   * @returns `true` if the agent was found and removed, `false` if it was not registered.
   */
  public unregister(agentType: AgentType): boolean {
    const existed = this.agents.delete(agentType);
    if (existed) {
      logger.info('Agent unregistered', {
        agentType,
        totalRegistered: this.agents.size,
      });
    }
    return existed;
  }

  /**
   * Removes all agents from the registry.
   * Primarily useful for testing or full application shutdown.
   */
  public clear(): void {
    const count = this.agents.size;
    this.agents.clear();
    logger.info('AgentRegistry cleared', { previousCount: count });
  }

  /**
   * Resets the singleton instance.
   * Intended for test isolation — should not be called in production code.
   */
  public static resetInstance(): void {
    if (AgentRegistry.instance) {
      AgentRegistry.instance.clear();
      AgentRegistry.instance = null;
      logger.info('AgentRegistry singleton reset');
    }
  }
}
