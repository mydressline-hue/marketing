import { z } from 'zod';

// ---------------------------------------------------------------------------
// Shared refinements / helpers
// ---------------------------------------------------------------------------

const isoDateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}/, 'Must be a valid ISO date string (YYYY-MM-DD)');

const uuidString = z.string().uuid('Must be a valid UUID');

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const createUserSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  name: z.string().min(1, 'Name is required'),
  role: z.string().min(1, 'Role is required'),
});

export const loginSchema = z.object({
  email: z.string().email('Must be a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

// ---------------------------------------------------------------------------
// Country schemas
// ---------------------------------------------------------------------------

export const createCountrySchema = z.object({
  name: z.string().min(1, 'Country name is required'),
  code: z
    .string()
    .length(2, 'Code must be an ISO 3166-1 alpha-2 code (2 characters)')
    .toUpperCase(),
  region: z.string().min(1, 'Region is required'),
  language: z.string().min(1, 'Language is required'),
  currency: z.string().min(1, 'Currency is required'),
  timezone: z.string().min(1, 'Timezone is required'),
});

export const updateCountrySchema = createCountrySchema.partial();

// ---------------------------------------------------------------------------
// Campaign schemas
// ---------------------------------------------------------------------------

export const createCampaignSchema = z.object({
  name: z.string().min(1, 'Campaign name is required'),
  countryId: uuidString,
  platform: z.enum(['google', 'bing', 'meta', 'tiktok', 'snapchat'], {
    errorMap: () => ({
      message: 'Platform must be one of: google, bing, meta, tiktok, snapchat',
    }),
  }),
  type: z.string().min(1, 'Campaign type is required'),
  budget: z.number().positive('Budget must be a positive number'),
  startDate: isoDateString,
  endDate: isoDateString,
});

export const updateCampaignSchema = createCampaignSchema.partial().extend({
  status: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Creative schemas
// ---------------------------------------------------------------------------

export const createCreativeSchema = z.object({
  name: z.string().min(1, 'Creative name is required'),
  type: z.enum(['ad_copy', 'video_script', 'ugc_script', 'image', 'thumbnail'], {
    errorMap: () => ({
      message:
        'Type must be one of: ad_copy, video_script, ugc_script, image, thumbnail',
    }),
  }),
  campaignId: uuidString,
  content: z.string().min(1, 'Content is required'),
});

// ---------------------------------------------------------------------------
// Content schemas
// ---------------------------------------------------------------------------

export const createContentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  seoKeywords: z.array(z.string().min(1)).min(1, 'At least one SEO keyword is required'),
  countryId: uuidString,
  language: z.string().min(1, 'Language is required'),
});

// ---------------------------------------------------------------------------
// Product schemas
// ---------------------------------------------------------------------------

const productVariantSchema = z.object({
  price: z.number().nonnegative('Price must be zero or positive'),
  sku: z.string().min(1, 'SKU is required'),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer'),
});

export const createProductSchema = z.object({
  title: z.string().min(1, 'Product title is required'),
  description: z.string().min(1, 'Description is required'),
  variants: z.array(productVariantSchema).min(1, 'At least one variant is required'),
  images: z.array(z.string().url('Each image must be a valid URL')),
});

// ---------------------------------------------------------------------------
// Budget allocation schemas
// ---------------------------------------------------------------------------

export const createBudgetAllocationSchema = z.object({
  countryId: uuidString,
  channelAllocations: z.record(
    z.enum(['google', 'bing', 'meta', 'tiktok', 'snapchat']),
    z.number().nonnegative('Allocation amount must be non-negative'),
  ),
  period: z.string().min(1, 'Period is required'),
});

// ---------------------------------------------------------------------------
// A/B test schemas
// ---------------------------------------------------------------------------

const abTestVariantSchema = z.object({
  name: z.string().min(1, 'Variant name is required'),
  config: z.record(z.unknown()),
});

export const createABTestSchema = z.object({
  name: z.string().min(1, 'Test name is required'),
  type: z.string().min(1, 'Test type is required'),
  variants: z.array(abTestVariantSchema).min(2, 'At least two variants are required'),
  campaignId: uuidString,
});

// ---------------------------------------------------------------------------
// Alert schemas
// ---------------------------------------------------------------------------

export const createAlertSchema = z.object({
  type: z.string().min(1, 'Alert type is required'),
  severity: z.enum(['low', 'medium', 'high', 'critical'], {
    errorMap: () => ({
      message: 'Severity must be one of: low, medium, high, critical',
    }),
  }),
  message: z.string().min(1, 'Message is required'),
  metadata: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Settings schemas
// ---------------------------------------------------------------------------

export const updateSettingsSchema = z.object({
  notifications: z
    .object({
      email: z.boolean().optional(),
      push: z.boolean().optional(),
      sms: z.boolean().optional(),
    })
    .optional(),
  appearance: z
    .object({
      theme: z.string().optional(),
      language: z.string().optional(),
      timezone: z.string().optional(),
    })
    .optional(),
  apiKeys: z
    .object({
      google: z.string().optional(),
      meta: z.string().optional(),
      tiktok: z.string().optional(),
      snapchat: z.string().optional(),
      bing: z.string().optional(),
    })
    .optional(),
});

// ---------------------------------------------------------------------------
// Kill Switch schemas
// ---------------------------------------------------------------------------

export const activateKillSwitchSchema = z.object({
  level: z.number().int().min(0).max(4, 'Level must be between 0 and 4'),
  reason: z.string().min(1, 'Reason is required'),
});

// ---------------------------------------------------------------------------
// Governance schemas
// ---------------------------------------------------------------------------

export const gateConfidenceSchema = z.object({
  decisionId: uuidString.optional(),
  confidenceScore: z.number().min(0).max(1, 'Confidence score must be between 0 and 1'),
  agentType: z.string().min(1, 'Agent type is required'),
  threshold: z.number().min(0).max(1).optional(),
});

export const resolveApprovalSchema = z.object({
  approved: z.boolean({ required_error: 'Approved flag is required' }),
  reason: z.string().min(1, 'Reason is required'),
});

export const manualOverrideSchema = z.object({
  overrideAction: z.string().min(1, 'Override action is required'),
  reason: z.string().min(1, 'Reason is required'),
  newValue: z.unknown().optional(),
});

export const updateGovernancePolicySchema = z.object({
  confidenceThreshold: z.number().min(0).max(1).optional(),
  requireHumanApproval: z.boolean().optional(),
  maxAutonomousBudget: z.number().nonnegative().optional(),
  riskTolerance: z.enum(['low', 'medium', 'high']).optional(),
});

// ---------------------------------------------------------------------------
// Notification schemas
// ---------------------------------------------------------------------------

export const sendNotificationSchema = z.object({
  userId: uuidString.optional(),
  type: z.string().min(1, 'Notification type is required'),
  title: z.string().min(1, 'Title is required'),
  message: z.string().min(1, 'Message is required'),
  channel: z.enum(['email', 'push', 'sms', 'in_app']).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const updateNotificationPreferencesSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
  inApp: z.boolean().optional(),
  frequency: z.enum(['realtime', 'hourly', 'daily', 'weekly']).optional(),
});

// ---------------------------------------------------------------------------
// Webhook schemas
// ---------------------------------------------------------------------------

export const registerWebhookSchema = z.object({
  url: z.string().url('Must be a valid URL'),
  platform: z.string().min(1, 'Platform is required'),
  events: z.array(z.string().min(1)).min(1, 'At least one event is required'),
  secret: z.string().min(8, 'Secret must be at least 8 characters').optional(),
});

// ---------------------------------------------------------------------------
// Queue schemas
// ---------------------------------------------------------------------------

export const enqueueJobSchema = z.object({
  type: z.string().min(1, 'Job type is required'),
  payload: z.record(z.unknown()),
  priority: z.number().int().min(0).max(10).optional(),
  scheduledAt: isoDateString.optional(),
});

// ---------------------------------------------------------------------------
// API Key schemas
// ---------------------------------------------------------------------------

export const createApiKeySchema = z.object({
  name: z.string().min(1, 'Key name is required'),
  platform: z.string().min(1, 'Platform is required'),
  scopes: z.array(z.string().min(1)).min(1, 'At least one scope is required'),
  expiresAt: isoDateString.optional(),
});

export const updateApiKeySchema = z.object({
  name: z.string().min(1).optional(),
  scopes: z.array(z.string().min(1)).min(1).optional(),
  expiresAt: isoDateString.optional(),
});

// ---------------------------------------------------------------------------
// Budget record spend schema
// ---------------------------------------------------------------------------

export const recordSpendSchema = z.object({
  amount: z.number().positive('Amount must be a positive number'),
  channel: z.string().min(1, 'Channel is required'),
  date: isoDateString.optional(),
  metadata: z.record(z.unknown()).optional(),
});

// ---------------------------------------------------------------------------
// Common / utility schemas
// ---------------------------------------------------------------------------

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce
    .number()
    .int()
    .min(1, 'Limit must be at least 1')
    .max(100, 'Limit must not exceed 100')
    .default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc').optional(),
});

export const dateRangeSchema = z.object({
  startDate: isoDateString,
  endDate: isoDateString,
});

export const idParamSchema = z.object({
  id: uuidString,
});

// ---------------------------------------------------------------------------
// Inferred types (convenience re-exports)
// ---------------------------------------------------------------------------

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateCountryInput = z.infer<typeof createCountrySchema>;
export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type CreateCreativeInput = z.infer<typeof createCreativeSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateBudgetAllocationInput = z.infer<typeof createBudgetAllocationSchema>;
export type CreateABTestInput = z.infer<typeof createABTestSchema>;
export type CreateAlertInput = z.infer<typeof createAlertSchema>;
export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
export type DateRangeInput = z.infer<typeof dateRangeSchema>;
export type IdParamInput = z.infer<typeof idParamSchema>;
export type ActivateKillSwitchInput = z.infer<typeof activateKillSwitchSchema>;
export type GateConfidenceInput = z.infer<typeof gateConfidenceSchema>;
export type ResolveApprovalInput = z.infer<typeof resolveApprovalSchema>;
export type ManualOverrideInput = z.infer<typeof manualOverrideSchema>;
export type UpdateGovernancePolicyInput = z.infer<typeof updateGovernancePolicySchema>;
export type SendNotificationInput = z.infer<typeof sendNotificationSchema>;
export type UpdateNotificationPreferencesInput = z.infer<typeof updateNotificationPreferencesSchema>;
export type RegisterWebhookInput = z.infer<typeof registerWebhookSchema>;
export type EnqueueJobInput = z.infer<typeof enqueueJobSchema>;
export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof updateApiKeySchema>;
export type RecordSpendInput = z.infer<typeof recordSpendSchema>;

// ---------------------------------------------------------------------------
// Video pipeline schemas
// ---------------------------------------------------------------------------

const socialPlatformEnum = z.enum(
  ['instagram', 'tiktok', 'facebook', 'youtube', 'twitter', 'linkedin'],
  {
    errorMap: () => ({
      message:
        'Platform must be one of: instagram, tiktok, facebook, youtube, twitter, linkedin',
    }),
  },
);

export const generateVideoSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  mode: z.enum(['image_to_video', 'text_to_video'], {
    errorMap: () => ({
      message: 'Mode must be image_to_video or text_to_video',
    }),
  }),
  duration: z.union([z.literal(5), z.literal(10)], {
    errorMap: () => ({ message: 'Duration must be 5 or 10 seconds' }),
  }),
  aspectRatio: z
    .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
    .default('9:16'),
  prompt: z.string().min(1, 'Prompt is required'),
  negativePrompt: z.string().optional(),
  sourceImageUrl: z.string().url('Must be a valid URL').optional(),
  productId: uuidString.optional(),
  model: z.string().optional(),
});

export const runPipelineSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  mode: z.enum(['image_to_video', 'text_to_video'], {
    errorMap: () => ({
      message: 'Mode must be image_to_video or text_to_video',
    }),
  }),
  duration: z.union([z.literal(5), z.literal(10)], {
    errorMap: () => ({ message: 'Duration must be 5 or 10 seconds' }),
  }),
  aspectRatio: z
    .enum(['1:1', '16:9', '9:16', '4:3', '3:4'])
    .default('9:16'),
  prompt: z.string().min(1, 'Prompt is required'),
  negativePrompt: z.string().optional(),
  sourceImageUrl: z.string().url('Must be a valid URL').optional(),
  productId: uuidString.optional(),
  model: z.string().optional(),
  targetPlatforms: z
    .array(socialPlatformEnum)
    .min(1, 'At least one target platform is required'),
  tone: z.string().optional(),
  language: z.string().optional(),
  targetAudience: z.string().optional(),
  brandVoice: z.string().optional(),
  scheduledAt: isoDateString.optional(),
});

export const generateEnhancementsSchema = z.object({
  platforms: z
    .array(socialPlatformEnum)
    .min(1, 'At least one platform is required'),
  productTitle: z.string().min(1, 'Product title is required'),
  productDescription: z.string().min(1, 'Product description is required'),
  tone: z.string().optional(),
  language: z.string().optional(),
  targetAudience: z.string().optional(),
  brandVoice: z.string().optional(),
});

export const publishVideoSchema = z.object({
  platforms: z
    .array(socialPlatformEnum)
    .min(1, 'At least one platform is required'),
  scheduledAt: isoDateString.optional(),
});

export type GenerateVideoInput = z.infer<typeof generateVideoSchema>;
export type RunPipelineInput = z.infer<typeof runPipelineSchema>;
export type GenerateEnhancementsInput = z.infer<typeof generateEnhancementsSchema>;
export type PublishVideoInput = z.infer<typeof publishVideoSchema>;
