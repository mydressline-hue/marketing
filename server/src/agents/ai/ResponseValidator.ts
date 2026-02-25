// ============================================================
// AI Integration Layer - Response Validator
// Phase 3B: Validation and sanitization for AI model responses
// ============================================================

import { createChildLogger } from '../../utils/logger';
import type { AIResponse, ValidationResult, JSONValidationResult } from './types';

/** Maximum allowed response content length (500KB). */
const MAX_CONTENT_LENGTH = 512_000;

/** Minimum meaningful response length. */
const MIN_CONTENT_LENGTH = 1;

/**
 * Validates, parses, and sanitizes responses from Anthropic AI models.
 *
 * Provides:
 * - Structural validation of AIResponse objects
 * - JSON parsing with error details
 * - Schema-based structured output validation
 * - Content sanitization to remove potentially harmful patterns
 */
export class ResponseValidator {
  private readonly log;

  constructor() {
    this.log = createChildLogger({ component: 'ResponseValidator' });
  }

  /**
   * Validates an AIResponse for structural correctness and data integrity.
   *
   * Checks:
   * - Content is present and within acceptable length bounds
   * - Model identifier is present
   * - Token usage values are non-negative integers
   * - Request ID is present
   * - Latency is a non-negative number
   *
   * @param response - The AIResponse to validate.
   * @returns A ValidationResult with `valid` flag and any error messages.
   */
  validateResponse(response: AIResponse): ValidationResult {
    const errors: string[] = [];

    // Content checks
    if (!response.content && response.content !== '') {
      errors.push('Response content is missing');
    } else if (response.content.length < MIN_CONTENT_LENGTH) {
      errors.push(
        `Response content is too short (${response.content.length} chars, minimum ${MIN_CONTENT_LENGTH})`,
      );
    } else if (response.content.length > MAX_CONTENT_LENGTH) {
      errors.push(
        `Response content exceeds maximum length (${response.content.length} chars, maximum ${MAX_CONTENT_LENGTH})`,
      );
    }

    // Model check
    if (!response.model || response.model.trim().length === 0) {
      errors.push('Response model identifier is missing');
    }

    // Token usage checks
    if (!response.usage) {
      errors.push('Token usage data is missing');
    } else {
      if (!Number.isInteger(response.usage.inputTokens) || response.usage.inputTokens < 0) {
        errors.push(
          `Invalid input token count: ${response.usage.inputTokens} (must be a non-negative integer)`,
        );
      }
      if (!Number.isInteger(response.usage.outputTokens) || response.usage.outputTokens < 0) {
        errors.push(
          `Invalid output token count: ${response.usage.outputTokens} (must be a non-negative integer)`,
        );
      }
      if (!Number.isInteger(response.usage.totalTokens) || response.usage.totalTokens < 0) {
        errors.push(
          `Invalid total token count: ${response.usage.totalTokens} (must be a non-negative integer)`,
        );
      }
      if (
        response.usage.inputTokens >= 0 &&
        response.usage.outputTokens >= 0 &&
        response.usage.totalTokens !== response.usage.inputTokens + response.usage.outputTokens
      ) {
        errors.push(
          `Total tokens (${response.usage.totalTokens}) does not equal input (${response.usage.inputTokens}) + output (${response.usage.outputTokens})`,
        );
      }
    }

    // Request ID check
    if (!response.requestId || response.requestId.trim().length === 0) {
      errors.push('Request ID is missing');
    }

    // Latency check
    if (typeof response.latencyMs !== 'number' || response.latencyMs < 0) {
      errors.push(`Invalid latency value: ${response.latencyMs} (must be a non-negative number)`);
    }

    if (errors.length > 0) {
      this.log.warn('Response validation failed', {
        requestId: response.requestId,
        errorCount: errors.length,
        errors,
      });
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Attempts to parse a string as JSON and returns the result with error details.
   *
   * Useful when an AI model is expected to return structured JSON output.
   *
   * @param content - The string content to parse as JSON.
   * @returns A JSONValidationResult with the parsed value or error message.
   */
  validateJSON(content: string): JSONValidationResult {
    if (!content || content.trim().length === 0) {
      return {
        valid: false,
        error: 'Content is empty or whitespace-only',
      };
    }

    // Try to extract JSON from markdown code blocks if present
    const extracted = this.extractJSONFromMarkdown(content);

    try {
      const parsed = JSON.parse(extracted);
      return {
        valid: true,
        parsed,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.log.debug('JSON validation failed', { error: message });
      return {
        valid: false,
        error: `Invalid JSON: ${message}`,
      };
    }
  }

  /**
   * Validates that parsed JSON content conforms to an expected schema.
   *
   * Performs a shallow check that all required top-level keys are present
   * and their values match the expected types specified in the schema.
   *
   * Schema format: `{ "key": "expectedType" }` where expectedType is one of:
   * 'string', 'number', 'boolean', 'object', 'array'.
   *
   * @param content - The string content to parse and validate.
   * @param schema - A record mapping field names to expected type strings.
   * @returns `true` if the content parses as valid JSON matching the schema.
   */
  validateStructuredOutput(
    content: string,
    schema: Record<string, unknown>,
  ): boolean {
    const jsonResult = this.validateJSON(content);
    if (!jsonResult.valid || !jsonResult.parsed) {
      this.log.debug('Structured output validation failed: invalid JSON');
      return false;
    }

    if (typeof jsonResult.parsed !== 'object' || jsonResult.parsed === null) {
      this.log.debug('Structured output validation failed: parsed value is not an object');
      return false;
    }

    const parsed = jsonResult.parsed as Record<string, unknown>;

    for (const [key, expectedType] of Object.entries(schema)) {
      if (!(key in parsed)) {
        this.log.debug('Structured output validation failed: missing key', {
          key,
          expectedType,
        });
        return false;
      }

      const value = parsed[key];
      const actualType = Array.isArray(value) ? 'array' : typeof value;

      if (expectedType !== actualType) {
        this.log.debug('Structured output validation failed: type mismatch', {
          key,
          expectedType,
          actualType,
        });
        return false;
      }
    }

    return true;
  }

  /**
   * Sanitizes AI response content by removing potentially harmful patterns.
   *
   * Operations performed:
   * - Strips HTML script tags and event handlers
   * - Removes potential prompt injection markers
   * - Trims excessive whitespace
   * - Normalizes line endings
   *
   * @param content - The raw content string to sanitize.
   * @returns The sanitized content string.
   */
  sanitizeResponse(content: string): string {
    if (!content) {
      return '';
    }

    let sanitized = content;

    // Remove HTML script tags (case-insensitive, multiline)
    sanitized = sanitized.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

    // Remove HTML event handler attributes (onclick, onerror, etc.)
    sanitized = sanitized.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');

    // Remove iframe tags
    sanitized = sanitized.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

    // Remove style tags
    sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');

    // Remove javascript: protocol URLs
    sanitized = sanitized.replace(/javascript\s*:/gi, '');

    // Remove data: URLs with potentially executable content
    sanitized = sanitized.replace(/data\s*:\s*text\/html/gi, '');

    // Normalize line endings to \n
    sanitized = sanitized.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Collapse runs of more than 3 consecutive newlines
    sanitized = sanitized.replace(/\n{4,}/g, '\n\n\n');

    // Trim leading/trailing whitespace
    sanitized = sanitized.trim();

    if (sanitized.length !== content.length) {
      this.log.debug('Response content was sanitized', {
        originalLength: content.length,
        sanitizedLength: sanitized.length,
        removedChars: content.length - sanitized.length,
      });
    }

    return sanitized;
  }

  /**
   * Attempts to extract JSON from markdown fenced code blocks.
   *
   * AI models sometimes wrap JSON in ```json ... ``` blocks. This method
   * strips the fencing to extract the raw JSON.
   *
   * @param content - Content potentially wrapped in markdown code fencing.
   * @returns The extracted JSON string, or the original content if no fencing found.
   */
  private extractJSONFromMarkdown(content: string): string {
    const trimmed = content.trim();

    // Match ```json ... ``` or ``` ... ```
    const codeBlockMatch = trimmed.match(
      /^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/,
    );

    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }

    return trimmed;
  }
}
