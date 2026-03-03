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

const campaignBaseSchema = z.object({
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

export const createCampaignSchema = campaignBaseSchema.refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const updateCampaignSchema = campaignBaseSchema.partial().extend({
  status: z.string().optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

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
}).refine(
  (data) => new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

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

// ---------------------------------------------------------------------------
// Infrastructure schemas
// ---------------------------------------------------------------------------

export const spendMonitoringQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  country: z.string().optional(),
  channel: z.string().optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const alertsQuerySchema = z.object({
  severity: z.string().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const resolveAlertBodySchema = z.object({
  resolution: z.string().min(1, 'Resolution is required'),
});

export const updateAlertConfigBodySchema = z.object({
  spendThreshold: z.number().nonnegative().optional(),
  anomalyThreshold: z.number().min(0).max(1).optional(),
  recipients: z.array(z.string().email()).optional(),
  enabled: z.boolean().optional(),
}).passthrough();

export const tableParamSchema = z.object({
  table: z.string().min(1, 'Table name is required'),
});

export const anonymizePiiBodySchema = z.object({
  table: z.string().min(1, 'Table name is required'),
  columns: z.array(z.string().min(1)).min(1, 'At least one column is required'),
});

export const userIdParamSchema = z.object({
  userId: uuidString,
});

export const manageConsentBodySchema = z.object({
  userId: uuidString,
  consentType: z.string().min(1, 'Consent type is required'),
  granted: z.boolean({ required_error: 'Granted flag is required' }),
  regulation: z.string().min(1, 'Regulation is required'),
});

export const rotateKeysBodySchema = z.object({
  services: z.array(z.string().min(1)).min(1, 'At least one service is required'),
  reason: z.string().min(1, 'Reason is required'),
});

export const addToIpWhitelistBodySchema = z.object({
  ip: z.string().min(1, 'IP address is required'),
  description: z.string().optional(),
});

export const runThreatScanBodySchema = z.object({
  scanType: z.string().min(1, 'Scan type is required'),
  targets: z.array(z.string().min(1)).optional(),
});

export const securityReportQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const traceIdParamSchema = z.object({
  traceId: z.string().min(1, 'Trace ID is required'),
});

export const errorDashboardQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  severity: z.string().optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const confidenceDriftQuerySchema = z.object({
  agentType: z.string().optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const updateLogRetentionBodySchema = z.object({
  logType: z.string().min(1, 'Log type is required'),
  retentionDays: z.number().int().positive('Retention days must be a positive integer'),
  archiveEnabled: z.boolean().optional(),
}).passthrough();

export const enterDegradedModeBodySchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
  services: z.array(z.string().min(1)).min(1, 'At least one service is required'),
});

export const attemptRecoveryBodySchema = z.object({
  services: z.array(z.string().min(1)).optional(),
});

export const initiateBackupBodySchema = z.object({
  type: z.string().min(1, 'Backup type is required'),
  tables: z.array(z.string().min(1)).optional(),
});

export const backupHistoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

// ---------------------------------------------------------------------------
// Product Features schemas
// ---------------------------------------------------------------------------

export const pickProductsBodySchema = z.object({
  collectionId: uuidString,
  strategy: z.string().min(1, 'Strategy is required'),
  count: z.number().int().positive('Count must be a positive integer'),
  filters: z.record(z.unknown()).optional(),
});

export const filterProductsQuerySchema = z.object({
  category: z.string().optional(),
  minPrice: z.coerce.number().nonnegative().optional(),
  maxPrice: z.coerce.number().nonnegative().optional(),
  tags: z.string().optional(),
  vendor: z.string().optional(),
  status: z.string().optional(),
  inventoryMin: z.coerce.number().int().nonnegative().optional(),
  inventoryMax: z.coerce.number().int().nonnegative().optional(),
  createdAfter: isoDateString.optional(),
  createdBefore: isoDateString.optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
}).refine(
  (data) => !data.minPrice || !data.maxPrice || data.minPrice <= data.maxPrice,
  {
    message: 'minPrice must be less than or equal to maxPrice',
    path: ['minPrice'],
  },
).refine(
  (data) => !data.inventoryMin || !data.inventoryMax || data.inventoryMin <= data.inventoryMax,
  {
    message: 'inventoryMin must be less than or equal to inventoryMax',
    path: ['inventoryMin'],
  },
).refine(
  (data) => !data.createdBefore || !data.createdAfter || new Date(data.createdBefore) > new Date(data.createdAfter),
  {
    message: 'createdBefore must be after createdAfter',
    path: ['createdBefore'],
  },
);

export const filterAggregationsQuerySchema = z.object({
  category: z.string().optional(),
  vendor: z.string().optional(),
  status: z.string().optional(),
});

export const searchProductsQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const similarProductsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const listCollectionsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const createCollectionBodySchema = z.object({
  title: z.string().min(1, 'Collection title is required'),
  description: z.string().optional(),
  rules: z.record(z.unknown()).optional(),
}).passthrough();

export const updateCollectionBodySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  rules: z.record(z.unknown()).optional(),
}).passthrough();

export const collectionProductsBodySchema = z.object({
  productIds: z.array(uuidString).min(1, 'At least one product ID is required'),
});

export const collectionProductsQuerySchema = z.object({
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const recordProductViewBodySchema = z.object({
  productId: uuidString,
  source: z.string().min(1, 'Source is required'),
  sessionId: z.string().min(1, 'Session ID is required'),
});

export const recordProductSaleBodySchema = z.object({
  productId: uuidString,
  quantity: z.number().int().positive('Quantity must be a positive integer'),
  revenue: z.number().nonnegative('Revenue must be non-negative'),
  orderId: z.string().min(1, 'Order ID is required'),
});

export const topProductsQuerySchema = z.object({
  metric: z.string().optional(),
  period: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const analyticsSummaryQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const analyticsTrendsQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
  granularity: z.string().optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const collectionAnalyticsQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const productAnalyticsQuerySchema = z.object({
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

// ---------------------------------------------------------------------------
// Campaign status schema
// ---------------------------------------------------------------------------

export const updateCampaignStatusSchema = z.object({
  status: z.string().min(1, 'Status is required'),
});

export type UpdateCampaignStatusInput = z.infer<typeof updateCampaignStatusSchema>;

// ---------------------------------------------------------------------------
// Creative update / performance schemas
// ---------------------------------------------------------------------------

export const updateCreativeSchema = createCreativeSchema.partial();

export const updateCreativePerformanceSchema = z.object({
  impressions: z.number().int().nonnegative('Impressions must be non-negative').optional(),
  clicks: z.number().int().nonnegative('Clicks must be non-negative').optional(),
  conversions: z.number().int().nonnegative('Conversions must be non-negative').optional(),
  spend: z.number().nonnegative('Spend must be non-negative').optional(),
  ctr: z.number().min(0).max(1, 'CTR must be between 0 and 1').optional(),
  score: z.number().nonnegative('Score must be non-negative').optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateCreativeInput = z.infer<typeof updateCreativeSchema>;
export type UpdateCreativePerformanceInput = z.infer<typeof updateCreativePerformanceSchema>;

// ---------------------------------------------------------------------------
// Content update schema
// ---------------------------------------------------------------------------

export const updateContentSchema = createContentSchema.partial();

export type UpdateContentInput = z.infer<typeof updateContentSchema>;

// ---------------------------------------------------------------------------
// Product update / inventory sync schemas
// ---------------------------------------------------------------------------

export const updateProductSchema = createProductSchema.partial();

export const syncInventorySchema = z.object({
  sku: z.string().min(1, 'SKU is required').optional(),
  stock: z.number().int().nonnegative('Stock must be a non-negative integer').optional(),
  variants: z.array(z.object({
    sku: z.string().min(1, 'SKU is required'),
    stock: z.number().int().nonnegative('Stock must be a non-negative integer'),
  })).optional(),
  metadata: z.record(z.unknown()).optional(),
});

export type UpdateProductInput = z.infer<typeof updateProductSchema>;
export type SyncInventoryInput = z.infer<typeof syncInventorySchema>;

// ---------------------------------------------------------------------------
// Settings notification / appearance schemas
// ---------------------------------------------------------------------------

export const updateNotificationsSettingsSchema = z.object({
  email: z.boolean().optional(),
  push: z.boolean().optional(),
  sms: z.boolean().optional(),
});

export const updateAppearanceSettingsSchema = z.object({
  theme: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
});

export type UpdateNotificationsSettingsInput = z.infer<typeof updateNotificationsSettingsSchema>;
export type UpdateAppearanceSettingsInput = z.infer<typeof updateAppearanceSettingsSchema>;

// ---------------------------------------------------------------------------
// Rate limit update schema
// ---------------------------------------------------------------------------

export const updateRateLimitsSchema = z.object({
  requestsPerMinute: z.number().int().positive('Requests per minute must be a positive integer').optional(),
  requestsPerHour: z.number().int().positive('Requests per hour must be a positive integer').optional(),
  requestsPerDay: z.number().int().positive('Requests per day must be a positive integer').optional(),
  burstLimit: z.number().int().positive('Burst limit must be a positive integer').optional(),
  enabled: z.boolean().optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

export type UpdateRateLimitsInput = z.infer<typeof updateRateLimitsSchema>;

// ---------------------------------------------------------------------------
// Video enhancement update / engagement schemas
// ---------------------------------------------------------------------------

export const updateEnhancementSchema = z.object({
  title: z.string().min(1, 'Title is required').optional(),
  description: z.string().optional(),
  hashtags: z.array(z.string()).optional(),
  callToAction: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

export const updateEngagementSchema = z.object({
  views: z.number().int().nonnegative('Views must be non-negative').optional(),
  likes: z.number().int().nonnegative('Likes must be non-negative').optional(),
  shares: z.number().int().nonnegative('Shares must be non-negative').optional(),
  comments: z.number().int().nonnegative('Comments must be non-negative').optional(),
  clicks: z.number().int().nonnegative('Clicks must be non-negative').optional(),
  metadata: z.record(z.unknown()).optional(),
}).passthrough();

export type UpdateEnhancementInput = z.infer<typeof updateEnhancementSchema>;
export type UpdateEngagementInput = z.infer<typeof updateEngagementSchema>;

// ---------------------------------------------------------------------------
// Alert action schemas
// ---------------------------------------------------------------------------

export const acknowledgeAlertSchema = z.object({
  note: z.string().optional(),
});

export const resolveAlertSchema = z.object({
  resolution: z.string().min(1, 'Resolution is required'),
  note: z.string().optional(),
});

export const dismissAlertSchema = z.object({
  reason: z.string().optional(),
});

export type AcknowledgeAlertInput = z.infer<typeof acknowledgeAlertSchema>;
export type ResolveAlertInput = z.infer<typeof resolveAlertSchema>;
export type DismissAlertInput = z.infer<typeof dismissAlertSchema>;

// ---------------------------------------------------------------------------
// Auth profile / password schemas
// ---------------------------------------------------------------------------

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').optional(),
  email: z.string().email('Must be a valid email address').optional(),
  avatar: z.string().url('Must be a valid URL').optional(),
  metadata: z.record(z.unknown()).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'New password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'New password must contain at least one number'),
});

export const forgotPasswordSchema = z.object({
  email: z.string().email('Must be a valid email address'),
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .regex(/[A-Z]/, 'New password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'New password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'New password must contain at least one number'),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;

// ---------------------------------------------------------------------------
// List/filter query schemas for routes missing them
// ---------------------------------------------------------------------------

export const listCreativesQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  type: z.string().optional(),
  campaignId: z.string().optional(),
});

export const listContentQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
  countryId: z.string().optional(),
  language: z.string().optional(),
  status: z.string().optional(),
});

export const searchContentQuerySchema = z.object({
  q: z.string().min(1, 'Search query is required'),
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
});

export const listProductsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const listBudgetAllocationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  countryId: z.string().optional(),
  period: z.string().optional(),
});

export const listAlertsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const listWebhookRegistrationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
});

export const listWebhookEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  platform: z.string().optional(),
  status: z.string().optional(),
});

export const listJobsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  type: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const auditLogsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  action: z.string().optional(),
  resourceType: z.string().optional(),
  userId: z.string().optional(),
  startDate: isoDateString.optional(),
  endDate: isoDateString.optional(),
}).refine(
  (data) => !data.endDate || !data.startDate || new Date(data.endDate) > new Date(data.startDate),
  {
    message: 'endDate must be after startDate',
    path: ['endDate'],
  },
);

export const listNotificationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  type: z.string().optional(),
  read: z.coerce.boolean().optional(),
});

export const listVideoTasksQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export const listPublishRecordsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  platform: z.string().optional(),
  status: z.string().optional(),
});

export const listPipelineRunsQuerySchema = z.object({
  page: z.coerce.number().int().min(1, 'Page must be at least 1').default(1),
  limit: z.coerce.number().int().min(1).max(100, 'Limit must not exceed 100').default(20),
  status: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Integration schemas
// ---------------------------------------------------------------------------

export const connectPlatformSchema = z.object({
  platformType: z.string().min(1, 'Platform type is required'),
  credentials: z.record(z.unknown()),
  config: z.record(z.unknown()).optional(),
});

export type ConnectPlatformInput = z.infer<typeof connectPlatformSchema>;

// ---------------------------------------------------------------------------
// Product features: minPrice/maxPrice and inventory min/max refinements
// ---------------------------------------------------------------------------

export const filterProductsRefinedQuerySchema = filterProductsQuerySchema.refine(
  (data) => {
    if (data.minPrice !== undefined && data.maxPrice !== undefined) {
      return data.minPrice <= data.maxPrice;
    }
    return true;
  },
  {
    message: 'minPrice must be less than or equal to maxPrice',
    path: ['minPrice'],
  },
).refine(
  (data) => {
    if (data.inventoryMin !== undefined && data.inventoryMax !== undefined) {
      return data.inventoryMin <= data.inventoryMax;
    }
    return true;
  },
  {
    message: 'inventoryMin must be less than or equal to inventoryMax',
    path: ['inventoryMin'],
  },
).refine(
  (data) => {
    if (data.createdAfter && data.createdBefore) {
      return new Date(data.createdBefore) > new Date(data.createdAfter);
    }
    return true;
  },
  {
    message: 'createdBefore must be after createdAfter',
    path: ['createdBefore'],
  },
);

// ---------------------------------------------------------------------------
// Collection reorder body schema
// ---------------------------------------------------------------------------

export const reorderCollectionProductsBodySchema = z.object({
  productIds: z.array(uuidString).min(1, 'At least one product ID is required'),
});

export type ReorderCollectionProductsInput = z.infer<typeof reorderCollectionProductsBodySchema>;
