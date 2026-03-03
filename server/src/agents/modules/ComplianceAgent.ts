// ============================================================
// AI International Growth Engine - Agent 13: Compliance & Regulatory
// GDPR/CCPA/local ad law rule engine, advertising restriction
// enforcement, data protection validation, high-risk campaign flagging
// ============================================================

import { BaseAgent } from '../base/BaseAgent';
import type {
  AgentInput,
  AgentOutput,
  AgentConfig,
} from '../base/types';
import type {
  AgentType,
  ComplianceRule,
  RegulationType,
  ComplianceStatus,
  RiskFlag,
  DateRange,
} from '../../types';
import { pool } from '../../config/database';
import { cacheGet, cacheSet } from '../../config/redis';
import { generateId } from '../../utils/helpers';
import { NotFoundError, ValidationError } from '../../utils/errors';

// ---- Local Types ----

export interface Violation {
  ruleId: string;
  regulation: RegulationType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  remediation: string;
}

export interface ComplianceEvaluation {
  campaignId: string;
  status: ComplianceStatus;
  violations: Violation[];
  warnings: string[];
  requiredActions: string[];
  score: number;
}

export interface CountryComplianceReport {
  countryId: string;
  regulations: RegulationType[];
  complianceStatus: Record<RegulationType, ComplianceStatus>;
  riskLevel: string;
  actionItems: string[];
}

export interface RegulationCheck {
  regulation: RegulationType;
  compliant: boolean;
  findings: string[];
  requiredChanges: string[];
}

export interface RestrictionEnforcement {
  campaignId: string;
  restrictionsApplied: string[];
  blockedContent: string[];
  allowedContent: string[];
}

export interface DataFlowDescription {
  dataTypes: string[];
  source: string;
  destination: string;
  processingPurpose: string;
  retentionPeriod: string;
}

export interface DataProtectionValidation {
  valid: boolean;
  issues: string[];
  requiredConsents: string[];
  recommendedChanges: string[];
}

export interface ComplianceReport {
  period: string;
  totalCampaigns: number;
  compliant: number;
  nonCompliant: number;
  violations: Violation[];
  riskScore: number;
}

export interface GDPRCheck {
  compliant: boolean;
  consentObtained: boolean;
  dataMinimization: boolean;
  rightToErasure: boolean;
  issues: string[];
}

export interface CCPACheck {
  compliant: boolean;
  optOutProvided: boolean;
  privacyNotice: boolean;
  dataInventory: boolean;
  issues: string[];
}

export interface ConsentRequirement {
  dataType: string;
  required: boolean;
  basis: string;
  regulation: RegulationType;
}

// ---- Cache Keys ----

const CACHE_PREFIX = 'compliance';
const CACHE_TTL_RULES = 300; // 5 minutes for regulation rules
const CACHE_TTL_EVALUATION = 180; // 3 minutes for campaign evaluations
const CACHE_TTL_COUNTRY_REPORT = 600; // 10 minutes for country reports

// ---- Agent Implementation ----

export class ComplianceAgent extends BaseAgent {
  constructor(config?: Partial<AgentConfig>) {
    super({
      agentType: 'compliance' as AgentType,
      model: 'opus',
      maxRetries: 3,
      timeoutMs: 90000,
      confidenceThreshold: 75,
      ...config,
    });
  }

  /**
   * Returns the peer agent types whose decisions this compliance agent
   * is qualified to challenge. The compliance agent reviews localization
   * for regulatory adherence, paid ads for advertising law compliance,
   * and enterprise security for data protection alignment.
   */
  getChallengeTargets(): AgentType[] {
    return ['localization', 'paid_ads', 'enterprise_security'];
  }

  /**
   * Returns the Claude system prompt that establishes the compliance
   * agent's legal reasoning persona and domain expertise.
   */
  getSystemPrompt(): string {
    return [
      'You are a Compliance & Regulatory AI agent specializing in international advertising law,',
      'data protection regulations, and digital marketing compliance.',
      'Your core responsibilities include:',
      '- Evaluating campaigns against GDPR, CCPA, LGPD, PIPA, APPI, and other data protection frameworks',
      '- Enforcing country-specific advertising restrictions and content regulations',
      '- Validating data flows for lawful processing, consent requirements, and data minimization',
      '- Flagging high-risk campaigns that may violate local or international regulations',
      '- Assessing consent requirements for different data types across jurisdictions',
      '',
      'When analyzing compliance, you must:',
      '1. Cite specific regulation articles or sections when identifying violations',
      '2. Provide severity ratings based on potential penalties and enforcement risk',
      '3. Suggest concrete remediation steps for every violation found',
      '4. Flag uncertainty when regulations are ambiguous or recently changed',
      '5. Consider cross-border data transfer implications',
      '6. Account for industry-specific restrictions (alcohol, pharmaceuticals, finance, etc.)',
      '',
      'Always err on the side of caution for regulatory matters.',
      'Clearly distinguish between hard legal requirements and best-practice recommendations.',
      'Output structured JSON matching the requested schema.',
    ].join('\n');
  }

  /**
   * Main processing entry point. Evaluates compliance across campaigns
   * and countries, flags violations, and enforces rules.
   */
  async process(input: AgentInput): Promise<AgentOutput> {
    this.log.info('Processing compliance evaluation request', {
      requestId: input.requestId,
    });

    const uncertainties: string[] = [];
    const warnings: string[] = [];
    const recommendations: string[] = [];

    const campaignId = input.parameters.campaignId as string | undefined;
    const countryId = input.parameters.countryId as string | undefined;
    const action = (input.parameters.action as string) || 'evaluate';

    let evaluationData: Record<string, unknown> = {};
    let decision = 'compliance_evaluation_complete';

    try {
      if (action === 'evaluate' && campaignId) {
        const evaluation = await this.evaluateCampaignCompliance(campaignId);
        evaluationData = { evaluation };
        decision = evaluation.status === 'compliant'
          ? 'campaign_compliant'
          : 'campaign_non_compliant';

        if (evaluation.violations.length > 0) {
          warnings.push(
            `Found ${evaluation.violations.length} violation(s) in campaign ${campaignId}`,
          );
          for (const v of evaluation.violations) {
            recommendations.push(v.remediation);
          }
        }

        if (evaluation.warnings.length > 0) {
          warnings.push(...evaluation.warnings);
        }
      } else if (action === 'country_report' && countryId) {
        const report = await this.evaluateCountryCompliance(countryId);
        evaluationData = { countryReport: report };
        decision = 'country_compliance_report_generated';

        if (report.actionItems.length > 0) {
          recommendations.push(...report.actionItems);
        }
      } else if (action === 'flag_risk' && campaignId) {
        const riskFlags = await this.flagHighRiskCampaign(campaignId);
        evaluationData = { riskFlags };
        decision = riskFlags.length > 0 ? 'high_risk_detected' : 'no_risk_detected';

        if (riskFlags.length > 0) {
          warnings.push(
            `Campaign ${campaignId} flagged with ${riskFlags.length} risk indicator(s)`,
          );
        }
      } else if (action === 'gdpr_check' && campaignId) {
        const gdprResult = await this.checkGDPRCompliance(campaignId);
        evaluationData = { gdprCheck: gdprResult };
        decision = gdprResult.compliant ? 'gdpr_compliant' : 'gdpr_non_compliant';
      } else if (action === 'ccpa_check' && campaignId) {
        const ccpaResult = await this.checkCCPACompliance(campaignId);
        evaluationData = { ccpaCheck: ccpaResult };
        decision = ccpaResult.compliant ? 'ccpa_compliant' : 'ccpa_non_compliant';
      } else {
        uncertainties.push(
          this.flagUncertainty(
            'parameters',
            `Unknown or incomplete action: "${action}". Provide a valid action and required IDs.`,
          ),
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.error('Compliance processing error', { error: message, requestId: input.requestId });
      uncertainties.push(
        this.flagUncertainty('processing', `Error during compliance evaluation: ${message}`),
      );
    }

    // Build confidence based on data availability and completeness
    const confidence = this.calculateConfidence({
      rule_coverage: evaluationData.evaluation || evaluationData.countryReport ? 75 : 30,
      data_completeness: campaignId || countryId ? 80 : 20,
      regulation_currency: 65, // regulations change; flag inherent uncertainty
      analysis_depth: Object.keys(evaluationData).length > 0 ? 70 : 15,
    });

    if (confidence.level === 'low' || confidence.level === 'medium') {
      uncertainties.push(
        this.flagUncertainty(
          'confidence',
          'Confidence is below high threshold; recommend manual legal review before acting on results.',
        ),
      );
    }

    const reasoning = this.buildReasoning(action, evaluationData, warnings, uncertainties);

    const output = this.buildOutput(
      decision,
      evaluationData,
      confidence,
      reasoning,
      recommendations,
      warnings,
      uncertainties,
    );

    await this.logDecision(input, output);
    return output;
  }

  // ------------------------------------------------------------------
  // Public Domain Methods
  // ------------------------------------------------------------------

  /**
   * Evaluates a campaign's overall compliance status by fetching applicable
   * rules from the database, checking each rule against campaign data, and
   * aggregating violations into a single evaluation result.
   */
  async evaluateCampaignCompliance(campaignId: string): Promise<ComplianceEvaluation> {
    this.log.info('Evaluating campaign compliance', { campaignId });

    const cacheKey = `${CACHE_PREFIX}:evaluation:${campaignId}`;
    const cached = await cacheGet<ComplianceEvaluation>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached campaign compliance evaluation', { campaignId });
      return cached;
    }

    // Fetch campaign with its country
    const campaignResult = await pool.query(
      `SELECT c.*, co.code as country_code, co.region as country_region
       FROM campaigns c
       JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign not found: ${campaignId}`);
    }

    const campaign = campaignResult.rows[0];
    const countryId = campaign.country_id as string;

    // Fetch active compliance rules for this country
    const rules = await this.getComplianceRules(countryId);

    const violations: Violation[] = [];
    const warnings: string[] = [];
    const requiredActions: string[] = [];

    // Evaluate each rule against campaign data
    for (const rule of rules) {
      const ruleResult = await this.evaluateRule(rule, campaign);

      if (ruleResult.violated) {
        violations.push({
          ruleId: rule.id,
          regulation: rule.regulation,
          severity: ruleResult.severity,
          description: ruleResult.description,
          remediation: ruleResult.remediation,
        });
        requiredActions.push(ruleResult.remediation);
      } else if (ruleResult.warning) {
        warnings.push(ruleResult.warning);
      }
    }

    // Calculate compliance score: 100 minus weighted penalty per violation
    const severityWeights: Record<string, number> = {
      critical: 30,
      high: 20,
      medium: 10,
      low: 5,
    };

    let penalty = 0;
    for (const v of violations) {
      penalty += severityWeights[v.severity] ?? 10;
    }

    const score = Math.max(0, 100 - penalty);
    const status: ComplianceStatus = violations.length === 0
      ? 'compliant'
      : violations.some((v) => v.severity === 'critical' || v.severity === 'high')
        ? 'non_compliant'
        : 'pending_review';

    const evaluation: ComplianceEvaluation = {
      campaignId,
      status,
      violations,
      warnings,
      requiredActions,
      score,
    };

    await cacheSet(cacheKey, evaluation, CACHE_TTL_EVALUATION);
    return evaluation;
  }

  /**
   * Generates a compliance report for a specific country, listing all
   * applicable regulations and the current compliance status for each.
   */
  async evaluateCountryCompliance(countryId: string): Promise<CountryComplianceReport> {
    this.log.info('Evaluating country compliance', { countryId });

    const cacheKey = `${CACHE_PREFIX}:country:${countryId}`;
    const cached = await cacheGet<CountryComplianceReport>(cacheKey);
    if (cached) {
      this.log.debug('Returning cached country compliance report', { countryId });
      return cached;
    }

    // Verify country exists
    const countryResult = await pool.query(
      `SELECT id, code, region FROM countries WHERE id = $1`,
      [countryId],
    );

    if (countryResult.rows.length === 0) {
      throw new NotFoundError(`Country not found: ${countryId}`);
    }

    // Fetch all rules for the country
    const rules = await this.getComplianceRules(countryId);

    // Derive the unique regulations from the rules
    const regulationSet = new Set<RegulationType>();
    for (const rule of rules) {
      regulationSet.add(rule.regulation);
    }
    const regulations = Array.from(regulationSet);

    // Fetch campaigns in this country and check their compliance
    const campaignsResult = await pool.query(
      `SELECT id FROM campaigns WHERE country_id = $1 AND status != 'archived'`,
      [countryId],
    );

    const complianceStatus: Record<RegulationType, ComplianceStatus> =
      {} as Record<RegulationType, ComplianceStatus>;
    const actionItems: string[] = [];

    // Initialize all regulations as compliant; downgrade if violations found
    for (const reg of regulations) {
      complianceStatus[reg] = 'compliant';
    }

    // Evaluate each active campaign
    for (const row of campaignsResult.rows) {
      const campaignId = row.id as string;
      try {
        const evaluation = await this.evaluateCampaignCompliance(campaignId);
        for (const violation of evaluation.violations) {
          const currentStatus = complianceStatus[violation.regulation];
          if (currentStatus === 'compliant' || currentStatus === 'pending_review') {
            complianceStatus[violation.regulation] =
              violation.severity === 'critical' || violation.severity === 'high'
                ? 'non_compliant'
                : 'pending_review';
          }
          actionItems.push(
            `Campaign ${campaignId}: ${violation.description} - ${violation.remediation}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.warn('Failed to evaluate campaign in country report', {
          campaignId,
          error: message,
        });
      }
    }

    // Determine overall risk level
    const statusValues = Object.values(complianceStatus);
    const hasNonCompliant = statusValues.includes('non_compliant');
    const hasPendingReview = statusValues.includes('pending_review');

    const riskLevel = hasNonCompliant
      ? 'high'
      : hasPendingReview
        ? 'medium'
        : 'low';

    const report: CountryComplianceReport = {
      countryId,
      regulations,
      complianceStatus,
      riskLevel,
      actionItems,
    };

    await cacheSet(cacheKey, report, CACHE_TTL_COUNTRY_REPORT);
    return report;
  }

  /**
   * Checks specific content against a single regulation type within a
   * given country's jurisdiction. Uses AI reasoning for nuanced legal
   * analysis when rule definitions alone are insufficient.
   */
  async checkRegulation(
    content: string,
    regulation: RegulationType,
    countryId: string,
  ): Promise<RegulationCheck> {
    this.log.info('Checking regulation', { regulation, countryId });

    if (!content || content.trim().length === 0) {
      throw new ValidationError('Content must not be empty for regulation check');
    }

    // Fetch rules specific to this regulation and country
    const rulesResult = await pool.query(
      `SELECT * FROM compliance_rules
       WHERE regulation = $1 AND country_id = $2 AND is_active = true`,
      [regulation, countryId],
    );

    const rules: ComplianceRule[] = rulesResult.rows;
    const findings: string[] = [];
    const requiredChanges: string[] = [];

    if (rules.length === 0) {
      findings.push(
        `No active rules found for regulation "${regulation}" in country ${countryId}. ` +
        `This may indicate incomplete rule coverage; manual review is recommended.`,
      );

      return {
        regulation,
        compliant: true,
        findings,
        requiredChanges,
      };
    }

    // Evaluate content against each rule
    let compliant = true;

    for (const rule of rules) {
      const definition = rule.rule_definition;

      // Check for prohibited keywords defined in the rule
      const prohibitedKeywords = definition.prohibited_keywords as string[] | undefined;
      if (prohibitedKeywords && Array.isArray(prohibitedKeywords)) {
        const contentLower = content.toLowerCase();
        for (const keyword of prohibitedKeywords) {
          if (contentLower.includes(keyword.toLowerCase())) {
            compliant = false;
            findings.push(
              `Content contains prohibited term "${keyword}" under rule ${rule.name} (${regulation})`,
            );
            requiredChanges.push(`Remove or replace prohibited term "${keyword}"`);
          }
        }
      }

      // Check required disclosures
      const requiredDisclosures = definition.required_disclosures as string[] | undefined;
      if (requiredDisclosures && Array.isArray(requiredDisclosures)) {
        const contentLower = content.toLowerCase();
        for (const disclosure of requiredDisclosures) {
          if (!contentLower.includes(disclosure.toLowerCase())) {
            compliant = false;
            findings.push(
              `Missing required disclosure: "${disclosure}" mandated by ${rule.name} (${regulation})`,
            );
            requiredChanges.push(`Add required disclosure: "${disclosure}"`);
          }
        }
      }

      // Check maximum character limits for claims
      const maxClaimLength = definition.max_claim_length as number | undefined;
      if (maxClaimLength !== undefined && content.length > maxClaimLength) {
        findings.push(
          `Content exceeds maximum claim length of ${maxClaimLength} characters under ${rule.name}`,
        );
        requiredChanges.push(`Reduce content length to ${maxClaimLength} characters or fewer`);
        compliant = false;
      }
    }

    return {
      regulation,
      compliant,
      findings,
      requiredChanges,
    };
  }

  /**
   * Enforces advertising restrictions for a campaign in a specific country.
   * Fetches restriction rules and categorizes campaign content into blocked
   * and allowed buckets.
   */
  async enforceAdRestrictions(
    campaignId: string,
    countryId: string,
  ): Promise<RestrictionEnforcement> {
    this.log.info('Enforcing ad restrictions', { campaignId, countryId });

    // Fetch campaign details
    const campaignResult = await pool.query(
      `SELECT * FROM campaigns WHERE id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign not found: ${campaignId}`);
    }

    // Fetch restriction rules for the country
    const rulesResult = await pool.query(
      `SELECT * FROM compliance_rules
       WHERE country_id = $1 AND is_active = true
       AND rule_definition->>'type' = 'ad_restriction'`,
      [countryId],
    );

    const rules: ComplianceRule[] = rulesResult.rows;
    const restrictionsApplied: string[] = [];
    const blockedContent: string[] = [];
    const allowedContent: string[] = [];

    // Fetch creatives linked to this campaign
    const creativesResult = await pool.query(
      `SELECT id, content, type FROM creatives WHERE campaign_id = $1 AND is_active = true`,
      [campaignId],
    );

    for (const creative of creativesResult.rows) {
      const creativeContent = creative.content as string;
      let blocked = false;

      for (const rule of rules) {
        const definition = rule.rule_definition;
        const restrictedCategories = definition.restricted_categories as string[] | undefined;
        const prohibitedKeywords = definition.prohibited_keywords as string[] | undefined;

        // Check prohibited keywords
        if (prohibitedKeywords && Array.isArray(prohibitedKeywords)) {
          const contentLower = creativeContent.toLowerCase();
          for (const keyword of prohibitedKeywords) {
            if (contentLower.includes(keyword.toLowerCase())) {
              blocked = true;
              blockedContent.push(
                `Creative ${creative.id}: contains restricted term "${keyword}" (${rule.name})`,
              );
              restrictionsApplied.push(
                `Blocked creative ${creative.id} due to ${rule.name}: prohibited keyword "${keyword}"`,
              );
            }
          }
        }

        // Check restricted categories
        if (restrictedCategories && Array.isArray(restrictedCategories)) {
          const campaignType = campaignResult.rows[0].type as string;
          if (restrictedCategories.includes(campaignType)) {
            blocked = true;
            blockedContent.push(
              `Creative ${creative.id}: campaign type "${campaignType}" is restricted (${rule.name})`,
            );
            restrictionsApplied.push(
              `Blocked creative ${creative.id} due to restricted category "${campaignType}"`,
            );
          }
        }
      }

      if (!blocked) {
        allowedContent.push(`Creative ${creative.id}: passed all restriction checks`);
      }
    }

    return {
      campaignId,
      restrictionsApplied,
      blockedContent,
      allowedContent,
    };
  }

  /**
   * Validates a described data flow against applicable data protection
   * regulations. Examines data types, source/destination, processing
   * purpose, and retention to identify issues and required consents.
   */
  async validateDataProtection(
    dataFlow: DataFlowDescription,
  ): Promise<DataProtectionValidation> {
    this.log.info('Validating data protection', {
      source: dataFlow.source,
      destination: dataFlow.destination,
      dataTypes: dataFlow.dataTypes,
    });

    const issues: string[] = [];
    const requiredConsents: string[] = [];
    const recommendedChanges: string[] = [];

    // Validate input completeness
    if (!dataFlow.dataTypes || dataFlow.dataTypes.length === 0) {
      issues.push('No data types specified in the data flow description');
    }

    if (!dataFlow.processingPurpose || dataFlow.processingPurpose.trim().length === 0) {
      issues.push('Processing purpose is not defined; this is required under most data protection frameworks');
    }

    if (!dataFlow.retentionPeriod || dataFlow.retentionPeriod.trim().length === 0) {
      issues.push('Retention period is not specified; data minimization requires explicit retention policies');
    }

    // Identify sensitive data types that always require explicit consent
    const sensitiveDataTypes = [
      'health',
      'biometric',
      'genetic',
      'political_opinion',
      'religious_belief',
      'sexual_orientation',
      'trade_union_membership',
      'criminal_record',
      'racial_ethnic_origin',
    ];

    const personalDataTypes = [
      'email',
      'name',
      'phone',
      'address',
      'ip_address',
      'device_id',
      'location',
      'cookie',
      'advertising_id',
    ];

    for (const dataType of dataFlow.dataTypes) {
      const normalized = dataType.toLowerCase().replace(/\s+/g, '_');

      if (sensitiveDataTypes.includes(normalized)) {
        requiredConsents.push(
          `Explicit consent required for processing sensitive data type: "${dataType}" (GDPR Art. 9)`,
        );
        issues.push(
          `Sensitive data type "${dataType}" detected; special category processing rules apply`,
        );
      }

      if (personalDataTypes.includes(normalized)) {
        requiredConsents.push(
          `Lawful basis required for processing personal data type: "${dataType}"`,
        );
      }
    }

    // Assess cross-border transfer risks
    if (dataFlow.source !== dataFlow.destination) {
      issues.push(
        `Cross-border data transfer detected: ${dataFlow.source} -> ${dataFlow.destination}. ` +
        `Ensure adequate safeguards (SCCs, BCRs, or adequacy decision) are in place.`,
      );
      recommendedChanges.push(
        'Implement Standard Contractual Clauses (SCCs) or verify adequacy decision for destination jurisdiction',
      );
    }

    // Check retention period reasonableness
    const retentionLower = dataFlow.retentionPeriod.toLowerCase();
    if (
      retentionLower.includes('indefinite') ||
      retentionLower.includes('unlimited') ||
      retentionLower.includes('forever')
    ) {
      issues.push(
        'Indefinite data retention violates data minimization principles under GDPR, CCPA, and most frameworks',
      );
      recommendedChanges.push(
        'Define a specific retention period aligned with the processing purpose',
      );
    }

    const valid = issues.length === 0;

    return {
      valid,
      issues,
      requiredConsents,
      recommendedChanges,
    };
  }

  /**
   * Identifies and returns risk flags for a campaign by checking its
   * compliance status, budget thresholds, targeting attributes, and
   * content against known high-risk indicators.
   */
  async flagHighRiskCampaign(campaignId: string): Promise<RiskFlag[]> {
    this.log.info('Flagging high-risk campaign', { campaignId });

    // Fetch campaign with country info
    const campaignResult = await pool.query(
      `SELECT c.*, co.code as country_code, co.region as country_region
       FROM campaigns c
       JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign not found: ${campaignId}`);
    }

    const campaign = campaignResult.rows[0];
    const riskFlags: RiskFlag[] = [];

    // Check for existing risk flags in the database
    const existingFlagsResult = await pool.query(
      `SELECT * FROM risk_flags WHERE resource_type = 'campaign' AND resource_id = $1`,
      [campaignId],
    );

    if (existingFlagsResult.rows.length > 0) {
      riskFlags.push(...(existingFlagsResult.rows as RiskFlag[]));
    }

    // Evaluate compliance and derive additional risk flags
    const rules = await this.getComplianceRules(campaign.country_id);

    for (const rule of rules) {
      const ruleResult = await this.evaluateRule(rule, campaign);
      if (ruleResult.violated) {
        const flag: RiskFlag = {
          id: generateId(),
          resource_type: 'campaign',
          resource_id: campaignId,
          rule_id: rule.id,
          severity: ruleResult.severity,
          description: ruleResult.description,
          status: 'non_compliant',
        };
        riskFlags.push(flag);
      }
    }

    // Check budget-based risk: high-budget campaigns in strictly regulated regions
    const budget = campaign.budget as number;
    const highBudgetThreshold = 50000;
    if (budget > highBudgetThreshold) {
      const hasStrictRules = rules.some(
        (r) => r.severity === 'critical' || r.severity === 'high',
      );
      if (hasStrictRules) {
        riskFlags.push({
          id: generateId(),
          resource_type: 'campaign',
          resource_id: campaignId,
          rule_id: 'budget_risk_check',
          severity: 'medium',
          description:
            `High-budget campaign ($${budget}) operating in a strictly regulated jurisdiction. ` +
            'Elevated financial exposure if compliance violations occur.',
          status: 'pending_review',
        });
      }
    }

    // Persist newly identified risk flags
    for (const flag of riskFlags) {
      if (!existingFlagsResult.rows.some((r: RiskFlag) => r.id === flag.id)) {
        try {
          await pool.query(
            `INSERT INTO risk_flags (id, resource_type, resource_id, rule_id, severity, description, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (id) DO NOTHING`,
            [flag.id, flag.resource_type, flag.resource_id, flag.rule_id, flag.severity, flag.description, flag.status],
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          this.log.warn('Failed to persist risk flag', { flagId: flag.id, error: message });
        }
      }
    }

    return riskFlags;
  }

  /**
   * Fetches all active compliance rules for a given country from the
   * database, with caching to reduce repeated lookups.
   */
  async getComplianceRules(countryId: string): Promise<ComplianceRule[]> {
    const cacheKey = `${CACHE_PREFIX}:rules:${countryId}`;
    const cached = await cacheGet<ComplianceRule[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const result = await pool.query(
      `SELECT * FROM compliance_rules WHERE country_id = $1 AND is_active = true ORDER BY severity DESC`,
      [countryId],
    );

    const rules: ComplianceRule[] = result.rows;
    await cacheSet(cacheKey, rules, CACHE_TTL_RULES);

    return rules;
  }

  /**
   * Generates an aggregate compliance report across all campaigns for a
   * given date range. Summarizes total campaigns evaluated, compliant
   * vs non-compliant counts, all violations, and an overall risk score.
   */
  async generateComplianceReport(dateRange?: DateRange): Promise<ComplianceReport> {
    this.log.info('Generating compliance report', { dateRange });

    let campaignQuery: string;
    let queryParams: unknown[];

    if (dateRange) {
      campaignQuery = `SELECT id FROM campaigns WHERE created_at >= $1 AND created_at <= $2 AND status != 'archived'`;
      queryParams = [dateRange.startDate, dateRange.endDate];
    } else {
      campaignQuery = `SELECT id FROM campaigns WHERE status != 'archived'`;
      queryParams = [];
    }

    const campaignsResult = await pool.query(campaignQuery, queryParams);
    const totalCampaigns = campaignsResult.rows.length;

    let compliant = 0;
    let nonCompliant = 0;
    const allViolations: Violation[] = [];

    for (const row of campaignsResult.rows) {
      try {
        const evaluation = await this.evaluateCampaignCompliance(row.id as string);
        if (evaluation.status === 'compliant') {
          compliant++;
        } else {
          nonCompliant++;
          allViolations.push(...evaluation.violations);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.log.warn('Skipping campaign in compliance report', {
          campaignId: row.id,
          error: message,
        });
        nonCompliant++;
      }
    }

    // Risk score: 0 = no risk, 100 = maximum risk
    const riskScore = totalCampaigns > 0
      ? Math.min(100, Math.round((nonCompliant / totalCampaigns) * 100))
      : 0;

    const period = dateRange
      ? `${dateRange.startDate} to ${dateRange.endDate}`
      : 'all time';

    return {
      period,
      totalCampaigns,
      compliant,
      nonCompliant,
      violations: allViolations,
      riskScore,
    };
  }

  /**
   * Performs a GDPR-specific compliance check for a campaign. Evaluates
   * consent, data minimization, and right-to-erasure mechanisms.
   */
  async checkGDPRCompliance(campaignId: string): Promise<GDPRCheck> {
    this.log.info('Checking GDPR compliance', { campaignId });

    // Fetch campaign with targeting data
    const campaignResult = await pool.query(
      `SELECT c.*, co.code as country_code, co.region as country_region
       FROM campaigns c
       JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign not found: ${campaignId}`);
    }

    const campaign = campaignResult.rows[0];
    const issues: string[] = [];
    const targeting = (campaign.targeting || {}) as Record<string, unknown>;

    // Check if consent mechanism is configured
    const consentObtained = targeting.consent_obtained === true ||
      targeting.consent_mechanism !== undefined;
    if (!consentObtained) {
      issues.push('No consent mechanism configured in campaign targeting; GDPR Art. 6 requires a lawful basis for processing');
    }

    // Check data minimization: does targeting use only necessary data?
    const targetingKeys = Object.keys(targeting);
    const excessiveDataIndicators = [
      'detailed_browsing_history',
      'health_interests',
      'political_affiliation',
      'religious_interests',
    ];

    let dataMinimization = true;
    for (const indicator of excessiveDataIndicators) {
      if (targetingKeys.includes(indicator)) {
        dataMinimization = false;
        issues.push(
          `Campaign targeting uses "${indicator}" which may violate data minimization (GDPR Art. 5(1)(c)) ` +
          'and special category data processing (GDPR Art. 9)',
        );
      }
    }

    // Check right to erasure: verify campaign supports data deletion requests
    const rightToErasure = targeting.supports_erasure === true ||
      targeting.data_deletion_endpoint !== undefined;
    if (!rightToErasure) {
      issues.push(
        'No data deletion/erasure support configured; GDPR Art. 17 requires the right to erasure',
      );
    }

    // Check GDPR-specific rules in the database
    const gdprRules = await pool.query(
      `SELECT * FROM compliance_rules
       WHERE regulation = 'gdpr' AND country_id = $1 AND is_active = true`,
      [campaign.country_id],
    );

    for (const rule of gdprRules.rows as ComplianceRule[]) {
      const ruleResult = await this.evaluateRule(rule, campaign);
      if (ruleResult.violated) {
        issues.push(`${rule.name}: ${ruleResult.description}`);
      }
    }

    const compliant = consentObtained && dataMinimization && rightToErasure && issues.length === 0;

    return {
      compliant,
      consentObtained,
      dataMinimization,
      rightToErasure,
      issues,
    };
  }

  /**
   * Performs a CCPA-specific compliance check for a campaign. Evaluates
   * opt-out mechanisms, privacy notice, and data inventory requirements.
   */
  async checkCCPACompliance(campaignId: string): Promise<CCPACheck> {
    this.log.info('Checking CCPA compliance', { campaignId });

    // Fetch campaign with targeting data
    const campaignResult = await pool.query(
      `SELECT c.*, co.code as country_code, co.region as country_region
       FROM campaigns c
       JOIN countries co ON co.id = c.country_id
       WHERE c.id = $1`,
      [campaignId],
    );

    if (campaignResult.rows.length === 0) {
      throw new NotFoundError(`Campaign not found: ${campaignId}`);
    }

    const campaign = campaignResult.rows[0];
    const issues: string[] = [];
    const targeting = (campaign.targeting || {}) as Record<string, unknown>;

    // Check opt-out mechanism ("Do Not Sell My Personal Information")
    const optOutProvided = targeting.opt_out_enabled === true ||
      targeting.do_not_sell_link !== undefined;
    if (!optOutProvided) {
      issues.push(
        'No opt-out mechanism provided; CCPA requires a "Do Not Sell My Personal Information" link',
      );
    }

    // Check privacy notice at point of collection
    const privacyNotice = targeting.privacy_notice_url !== undefined ||
      targeting.privacy_notice === true;
    if (!privacyNotice) {
      issues.push(
        'No privacy notice at point of data collection; CCPA Sec. 1798.100(b) requires disclosure',
      );
    }

    // Check data inventory: campaign should track what personal information is collected
    const dataInventory = targeting.data_categories !== undefined ||
      targeting.data_inventory === true;
    if (!dataInventory) {
      issues.push(
        'No data inventory or categories of personal information documented; ' +
        'CCPA requires businesses to disclose categories of PI collected',
      );
    }

    // Check CCPA-specific rules in the database
    const ccpaRules = await pool.query(
      `SELECT * FROM compliance_rules
       WHERE regulation = 'ccpa' AND country_id = $1 AND is_active = true`,
      [campaign.country_id],
    );

    for (const rule of ccpaRules.rows as ComplianceRule[]) {
      const ruleResult = await this.evaluateRule(rule, campaign);
      if (ruleResult.violated) {
        issues.push(`${rule.name}: ${ruleResult.description}`);
      }
    }

    const compliant = optOutProvided && privacyNotice && dataInventory && issues.length === 0;

    return {
      compliant,
      optOutProvided,
      privacyNotice,
      dataInventory,
      issues,
    };
  }

  /**
   * Assesses what consent is required for processing specific data types
   * within a given country's regulatory framework.
   */
  async assessConsentRequirements(
    countryId: string,
    dataTypes: string[],
  ): Promise<ConsentRequirement[]> {
    this.log.info('Assessing consent requirements', { countryId, dataTypes });

    if (!dataTypes || dataTypes.length === 0) {
      throw new ValidationError('At least one data type must be provided');
    }

    // Fetch applicable regulations for this country
    const rules = await this.getComplianceRules(countryId);
    const regulations = new Set<RegulationType>();
    for (const rule of rules) {
      regulations.add(rule.regulation);
    }

    const requirements: ConsentRequirement[] = [];

    // Sensitive personal data that universally requires explicit consent
    const sensitiveTypes = new Set([
      'health',
      'biometric',
      'genetic',
      'political_opinion',
      'religious_belief',
      'sexual_orientation',
      'trade_union_membership',
      'criminal_record',
      'racial_ethnic_origin',
    ]);

    // Personal data requiring lawful basis
    const personalTypes = new Set([
      'email',
      'name',
      'phone',
      'address',
      'ip_address',
      'device_id',
      'location',
      'cookie',
      'advertising_id',
    ]);

    for (const dataType of dataTypes) {
      const normalized = dataType.toLowerCase().replace(/\s+/g, '_');

      for (const regulation of regulations) {
        const isSensitive = sensitiveTypes.has(normalized);
        const isPersonal = personalTypes.has(normalized);

        if (isSensitive) {
          requirements.push({
            dataType,
            required: true,
            basis: 'explicit_consent',
            regulation,
          });
        } else if (isPersonal) {
          // Consent basis depends on regulation
          const basis = regulation === 'gdpr'
            ? 'consent_or_legitimate_interest'
            : regulation === 'ccpa'
              ? 'notice_and_opt_out'
              : 'consent';

          requirements.push({
            dataType,
            required: true,
            basis,
            regulation,
          });
        } else {
          // Non-personal data types may still need consent under some frameworks
          requirements.push({
            dataType,
            required: false,
            basis: 'none_required',
            regulation,
          });
        }
      }
    }

    return requirements;
  }

  // ------------------------------------------------------------------
  // Private Helpers
  // ------------------------------------------------------------------

  /**
   * Evaluates a single compliance rule against campaign data.
   * Returns violation details if the rule is breached, or a warning
   * for borderline cases.
   */
  private async evaluateRule(
    rule: ComplianceRule,
    campaign: Record<string, unknown>,
  ): Promise<{
    violated: boolean;
    severity: 'low' | 'medium' | 'high' | 'critical';
    description: string;
    remediation: string;
    warning?: string;
  }> {
    const definition = rule.rule_definition;
    const severity = (rule.severity as 'low' | 'medium' | 'high' | 'critical') || 'medium';

    // Check targeting restrictions
    const targeting = (campaign.targeting || {}) as Record<string, unknown>;
    const restrictedTargeting = definition.restricted_targeting as string[] | undefined;
    if (restrictedTargeting && Array.isArray(restrictedTargeting)) {
      for (const restricted of restrictedTargeting) {
        if (Object.keys(targeting).includes(restricted)) {
          return {
            violated: true,
            severity,
            description: `Campaign uses restricted targeting parameter "${restricted}" under ${rule.name} (${rule.regulation})`,
            remediation: `Remove targeting parameter "${restricted}" to comply with ${rule.regulation}`,
          };
        }
      }
    }

    // Check prohibited content types
    const prohibitedTypes = definition.prohibited_campaign_types as string[] | undefined;
    if (prohibitedTypes && Array.isArray(prohibitedTypes)) {
      const campaignType = campaign.type as string;
      if (prohibitedTypes.includes(campaignType)) {
        return {
          violated: true,
          severity,
          description: `Campaign type "${campaignType}" is prohibited under ${rule.name} (${rule.regulation})`,
          remediation: `Change campaign type from "${campaignType}" to a permitted type`,
        };
      }
    }

    // Check budget caps (some regulations impose spending limits on certain ad types)
    const maxBudget = definition.max_budget as number | undefined;
    if (maxBudget !== undefined) {
      const budget = campaign.budget as number;
      if (budget > maxBudget) {
        return {
          violated: true,
          severity,
          description: `Campaign budget ($${budget}) exceeds the maximum allowed ($${maxBudget}) under ${rule.name} (${rule.regulation})`,
          remediation: `Reduce campaign budget to $${maxBudget} or below`,
        };
      }

      // Warn if budget is close to the limit (within 10%)
      const warningThreshold = maxBudget * 0.9;
      if (budget > warningThreshold) {
        return {
          violated: false,
          severity,
          description: '',
          remediation: '',
          warning: `Campaign budget ($${budget}) is within 10% of the maximum ($${maxBudget}) under ${rule.name}`,
        };
      }
    }

    // Check required fields
    const requiredFields = definition.required_fields as string[] | undefined;
    if (requiredFields && Array.isArray(requiredFields)) {
      for (const field of requiredFields) {
        if (!(field in targeting) || targeting[field] === undefined || targeting[field] === null) {
          return {
            violated: true,
            severity: severity === 'critical' ? 'critical' : 'medium',
            description: `Required field "${field}" is missing from campaign targeting (${rule.name}, ${rule.regulation})`,
            remediation: `Add the required field "${field}" to campaign targeting configuration`,
          };
        }
      }
    }

    return {
      violated: false,
      severity,
      description: '',
      remediation: '',
    };
  }

  /**
   * Builds a human-readable reasoning string summarizing the compliance
   * evaluation performed, including the action taken, key findings, and
   * any flagged uncertainties.
   */
  private buildReasoning(
    action: string,
    evaluationData: Record<string, unknown>,
    warnings: string[],
    uncertainties: string[],
  ): string {
    const parts: string[] = [
      `Performed compliance evaluation with action: "${action}".`,
    ];

    if (evaluationData.evaluation) {
      const eval_ = evaluationData.evaluation as ComplianceEvaluation;
      parts.push(
        `Campaign ${eval_.campaignId} evaluated with status "${eval_.status}" ` +
        `and compliance score ${eval_.score}/100. ` +
        `Found ${eval_.violations.length} violation(s) and ${eval_.warnings.length} warning(s).`,
      );
    }

    if (evaluationData.countryReport) {
      const report = evaluationData.countryReport as CountryComplianceReport;
      parts.push(
        `Country ${report.countryId} compliance report generated. ` +
        `Risk level: ${report.riskLevel}. ` +
        `Regulations assessed: ${report.regulations.join(', ')}. ` +
        `${report.actionItems.length} action item(s) identified.`,
      );
    }

    if (evaluationData.riskFlags) {
      const flags = evaluationData.riskFlags as RiskFlag[];
      parts.push(`Identified ${flags.length} risk flag(s) for the campaign.`);
    }

    if (evaluationData.gdprCheck) {
      const check = evaluationData.gdprCheck as GDPRCheck;
      parts.push(
        `GDPR check completed. Compliant: ${check.compliant}. ` +
        `Issues found: ${check.issues.length}.`,
      );
    }

    if (evaluationData.ccpaCheck) {
      const check = evaluationData.ccpaCheck as CCPACheck;
      parts.push(
        `CCPA check completed. Compliant: ${check.compliant}. ` +
        `Issues found: ${check.issues.length}.`,
      );
    }

    if (warnings.length > 0) {
      parts.push(`Warnings: ${warnings.length} issue(s) requiring attention.`);
    }

    if (uncertainties.length > 0) {
      parts.push(
        `Uncertainties: ${uncertainties.length} area(s) with insufficient data or ambiguity. ` +
        'Manual legal review is recommended for these items.',
      );
    }

    return parts.join(' ');
  }
}
