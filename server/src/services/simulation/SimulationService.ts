/**
 * Simulation Service -- Facade for the controller layer (Phase 7A).
 *
 * Delegates to SimulationEngineService but exposes the method signatures
 * that the advanced-ai controller expects.
 */

import { SimulationEngineService } from './SimulationEngineService';

export class SimulationService {
  static async runCampaignSimulation(
    params: { campaign: any; parameters: any; scenarios?: any },
    userId: string,
  ) {
    return SimulationEngineService.simulateCampaign(userId, {
      campaignId: params.campaign?.id || params.campaign,
      budget: params.parameters?.budget || params.parameters?.dailyBudget * (params.parameters?.durationDays || 30),
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
    strategy: any;
    market: string;
    competitors?: any[];
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
    competitorActivity?: any;
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
    audience: any;
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
    params: { name: string; description?: string; parameters: any; constraints?: any },
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
    params: { scenarios?: any; riskFactors?: any },
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
