/**
 * Simulation Service -- Facade for the controller layer (Phase 7A).
 *
 * Delegates to SimulationEngineService but exposes the method signatures
 * that the advanced-ai controller expects.
 */

import { SimulationEngineService } from './SimulationEngineService';

export class SimulationService {
  static async runCampaignSimulation(
    params: {
      campaign: string | { id: string };
      parameters: { budget?: number; dailyBudget?: number; durationDays?: number };
      scenarios?: Record<string, unknown>;
    },
    userId: string,
  ) {
    const campaignId = typeof params.campaign === 'string'
      ? params.campaign
      : params.campaign?.id;
    return SimulationEngineService.simulateCampaign(userId, {
      campaignId,
      budget: params.parameters?.budget || (params.parameters?.dailyBudget ?? 0) * (params.parameters?.durationDays || 30),
      durationDays: params.parameters?.durationDays || 30,
    });
  }

  static async runScalingPrediction(params: {
    campaignId: string;
    channel?: string;
    country?: string;
    targetBudget: number;
    timeframe?: string;
  }) {
    return SimulationEngineService.predictScalingOutcome(params.campaignId, {
      targetBudget: params.targetBudget,
    });
  }

  static async modelCompetitorReaction(params: {
    strategy: { campaignId?: string; budgetIncrease?: number };
    market: string;
    competitors?: Record<string, unknown>[];
    timeframe?: string;
  }) {
    const campaignId = params.strategy?.campaignId || params.market;
    return SimulationEngineService.modelCompetitorReaction(campaignId, {
      budgetIncrease: params.strategy?.budgetIncrease || 0,
    });
  }

  static async modelCpcInflation(params: {
    channel: string;
    country: string;
    timeframe?: string;
    competitorActivity?: Record<string, unknown>;
  }) {
    const { rows } = await (await import('../../config/database')).pool.query(
      `SELECT id FROM campaigns WHERE platform = $1 AND country_code = $2 LIMIT 1`,
      [params.channel, params.country],
    );
    const campaignId = rows[0]?.id || params.channel;
    return SimulationEngineService.modelCPCInflation(campaignId, {
      includeSeasonality: true,
      includeCompetition: !!params.competitorActivity,
    });
  }

  static async modelAudienceSaturation(params: {
    audience: Record<string, unknown>;
    channel: string;
    country: string;
    currentReach?: number;
    budget?: number;
  }) {
    const { rows } = await (await import('../../config/database')).pool.query(
      `SELECT id FROM campaigns WHERE platform = $1 AND country_code = $2 LIMIT 1`,
      [params.channel, params.country],
    );
    const campaignId = rows[0]?.id || params.channel;
    return SimulationEngineService.modelAudienceSaturation(campaignId);
  }

  static async runSandboxSimulation(
    params: {
      name: string;
      description?: string;
      parameters: Record<string, unknown> & { historicalPeriod?: { start: string; end: string } };
      constraints?: Record<string, unknown>;
    },
    userId: string,
  ) {
    return SimulationEngineService.runSandboxSimulation(userId, {
      strategy: { ...params.parameters, name: params.name },
      historicalPeriod: params.parameters?.historicalPeriod || {
        start: new Date(Date.now() - 90 * 86400000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
      },
    });
  }

  static async preLaunchRiskAssessment(
    campaignId: string,
    _params: { scenarios?: Record<string, unknown>; riskFactors?: Record<string, unknown> },
  ) {
    return SimulationEngineService.assessPreLaunchRisk(campaignId);
  }

  static async getSimulationHistory(filters: {
    type?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    return SimulationEngineService.getSimulationHistory(filters);
  }

  static async getSimulationById(id: string) {
    return SimulationEngineService.getSimulationById(id);
  }

  static async compareSimulations(simulationIds: string[], metrics?: string[]) {
    return SimulationEngineService.compareSimulations(simulationIds, metrics);
  }
}
