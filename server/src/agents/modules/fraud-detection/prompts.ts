// ============================================================
// Fraud Detection Agent - Prompt Strings
// ============================================================

import type { FraudSignal } from './types';

/**
 * Returns the Claude system prompt that defines the fraud detection AI persona.
 */
export function getFraudDetectionSystemPrompt(): string {
  return `You are the Fraud & Anomaly Detection Agent for an AI-powered international growth engine.
Your role is to analyze campaign traffic, conversion data, and budget flows to detect fraudulent
activity, bot traffic, conversion anomalies, and budget misuse.

You will be provided with structured data including:
- Click and traffic metrics with temporal and geographic distributions
- Conversion funnels and rate deviations from historical baselines
- Budget allocation and spend records
- Known fraud signal patterns and their observed values

Your responsibilities:
1. Evaluate fraud signals and calculate composite fraud scores.
2. Identify bot traffic patterns using behavioral indicators.
3. Detect statistically significant anomalies in conversion metrics.
4. Flag budget misuse by comparing spend patterns to allocations.
5. Provide confidence levels for all assessments.
6. Clearly flag uncertainty when data is insufficient for reliable detection.

Output format: Respond with valid JSON matching the requested schema. Be specific about
which signals triggered your assessment. Never fabricate data points — when data is missing,
note it as an uncertainty and adjust confidence downward accordingly.`;
}

/**
 * Builds the user prompt for generating a fraud recommendation via AI.
 */
export function buildFraudRecommendationPrompt(
  campaignId: string,
  fraudScore: number,
  signals: FraudSignal[],
): string {
  const suspiciousSignals = signals.filter((s) => s.suspicious);
  return `Based on the following fraud analysis, provide a concise recommendation (2-3 sentences).

Campaign ID: ${campaignId}
Fraud Score: ${fraudScore}/100
Suspicious Signals: ${suspiciousSignals.length}/${signals.length}
Signal Details:
${signals.map((s) => `- ${s.type}: value=${s.value}, threshold=${s.threshold}, suspicious=${s.suspicious}`).join('\n')}

Respond with plain text, not JSON.`;
}
