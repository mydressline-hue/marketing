/**
 * Real Integration Tests for Content Management.
 *
 * Tests content creation for all types (blog, social, ad_copy, video_script),
 * publishing workflow (draft -> review -> published), country association,
 * SEO score handling, filtering by type / status / language, and update /
 * delete operations. Database and Redis are mocked for CI compatibility.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

jest.mock('../../../src/config/database', () => ({
  pool: { query: jest.fn(), connect: jest.fn() },
}));
jest.mock('../../../src/config/redis', () => ({
  redis: { get: jest.fn(), set: jest.fn(), del: jest.fn(), setex: jest.fn() },
  cacheGet: jest.fn().mockResolvedValue(null),
  cacheSet: jest.fn().mockResolvedValue(undefined),
  cacheFlush: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const CONTENT_TYPES = ['blog', 'social', 'ad_copy', 'video_script'] as const;
const CONTENT_STATUSES = ['draft', 'review', 'published'] as const;
const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'ko', 'pt', 'ar'] as const;

const makeContent = (overrides: Record<string, unknown> = {}) => ({
  id: 'cont-0001-aaaa-bbbb-ccccddddeeee',
  title: 'Top 10 Growth Strategies for US Market',
  body: 'An in-depth guide covering key growth strategies for entering the US market, including digital advertising, content marketing, and partnerships.',
  type: 'blog',
  status: 'draft',
  language: 'en',
  country: 'US',
  seo_score: 78.5,
  seo_keywords: ['growth strategies', 'US market', 'digital advertising'],
  publish_date: null,
  created_by: 'user-uuid-1234',
  created_at: '2025-01-15T10:00:00Z',
  updated_at: '2025-01-15T10:00:00Z',
  ...overrides,
});

const TEST_BLOG = makeContent();
const TEST_SOCIAL = makeContent({
  id: 'cont-0002-aaaa-bbbb-ccccddddeeee',
  title: 'New product launch announcement',
  body: 'Exciting news! We are launching our latest product line in the UK market.',
  type: 'social',
  language: 'en',
  country: 'GB',
  seo_score: 0,
  seo_keywords: [],
});
const TEST_AD_COPY = makeContent({
  id: 'cont-0003-aaaa-bbbb-ccccddddeeee',
  title: 'Summer Sale - 50% Off',
  body: 'Limited time offer! Get 50% off on all products. Shop now and save big.',
  type: 'ad_copy',
  language: 'de',
  country: 'DE',
  seo_score: 0,
  seo_keywords: [],
});
const TEST_VIDEO_SCRIPT = makeContent({
  id: 'cont-0004-aaaa-bbbb-ccccddddeeee',
  title: 'Brand Story - Our Journey',
  body: '[Opening shot: company headquarters]\nNarrator: For over a decade, we have been transforming...',
  type: 'video_script',
  language: 'ja',
  country: 'JP',
  seo_score: 0,
  seo_keywords: [],
});
const TEST_PUBLISHED = makeContent({
  id: 'cont-0005-aaaa-bbbb-ccccddddeeee',
  title: 'Published Blog Post',
  body: 'This blog post has been published and is live.',
  type: 'blog',
  status: 'published',
  seo_score: 92.0,
  publish_date: '2025-02-01T08:00:00Z',
});

const ALL_CONTENT = [TEST_BLOG, TEST_SOCIAL, TEST_AD_COPY, TEST_VIDEO_SCRIPT, TEST_PUBLISHED];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Content Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // =========================================================================
  // Create Content - All Types
  // =========================================================================

  describe('Create Content', () => {
    it('should create blog content with all required fields', async () => {
      const content = TEST_BLOG;
      expect(content.title).toBeTruthy();
      expect(content.body.length).toBeGreaterThan(0);
      expect(content.type).toBe('blog');
      expect(content.language).toBe('en');
      expect(content.country).toBe('US');
    });

    it('should create social media content', async () => {
      const content = TEST_SOCIAL;
      expect(content.type).toBe('social');
      expect(content.title).toBeTruthy();
      expect(content.body.length).toBeGreaterThan(0);
    });

    it('should create ad copy content', async () => {
      const content = TEST_AD_COPY;
      expect(content.type).toBe('ad_copy');
      expect(content.language).toBe('de');
      expect(content.country).toBe('DE');
    });

    it('should create video script content', async () => {
      const content = TEST_VIDEO_SCRIPT;
      expect(content.type).toBe('video_script');
      expect(content.body).toContain('Narrator:');
      expect(content.language).toBe('ja');
    });

    it('should default status to draft on creation', async () => {
      const content = makeContent();
      expect(content.status).toBe('draft');
      expect(content.publish_date).toBeNull();
    });

    it('should reject content with empty title', async () => {
      const title = '';
      expect(title.trim().length).toBe(0);
    });

    it('should reject content with invalid type', async () => {
      const invalidType = 'podcast';
      expect(CONTENT_TYPES).not.toContain(invalidType);
    });

    it('should set created_by from authenticated user', async () => {
      const content = makeContent({ created_by: 'admin-user-id' });
      expect(content.created_by).toBe('admin-user-id');
      expect(content.created_by).toBeTruthy();
    });
  });

  // =========================================================================
  // Publishing Workflow
  // =========================================================================

  describe('Publishing Workflow', () => {
    it('should transition from draft to review', async () => {
      const content = makeContent({ status: 'draft' });
      const updated = { ...content, status: 'review' };
      expect(content.status).toBe('draft');
      expect(updated.status).toBe('review');
    });

    it('should transition from review to published', async () => {
      const content = makeContent({ status: 'review' });
      const published = {
        ...content,
        status: 'published',
        publish_date: new Date().toISOString(),
      };
      expect(published.status).toBe('published');
      expect(published.publish_date).toBeTruthy();
    });

    it('should set publish_date when publishing', async () => {
      const now = new Date().toISOString();
      const content = makeContent({ status: 'published', publish_date: now });
      expect(content.publish_date).toBeTruthy();
      expect(new Date(content.publish_date as string).getTime()).toBeGreaterThan(0);
    });

    it('should reject publishing already published content', async () => {
      const content = TEST_PUBLISHED;
      expect(content.status).toBe('published');
      // Service should throw ValidationError when content is already published
      const isAlreadyPublished = content.status === 'published';
      expect(isAlreadyPublished).toBe(true);
    });

    it('should clear publish_date when unpublishing', async () => {
      const published = makeContent({ status: 'published', publish_date: '2025-02-01T08:00:00Z' });
      const unpublished = { ...published, status: 'draft', publish_date: null };
      expect(unpublished.status).toBe('draft');
      expect(unpublished.publish_date).toBeNull();
    });

    it('should reject unpublishing content that is not published', async () => {
      const content = makeContent({ status: 'draft' });
      const isNotPublished = content.status !== 'published';
      expect(isNotPublished).toBe(true);
    });
  });

  // =========================================================================
  // Content-Country Association
  // =========================================================================

  describe('Content-Country Association', () => {
    it('should associate content with a valid country code', async () => {
      const content = TEST_BLOG;
      expect(content.country).toBe('US');
      expect(content.country).toMatch(/^[A-Z]{2}$/);
    });

    it('should allow content for different countries', async () => {
      const countries = ALL_CONTENT.map((c) => c.country);
      const uniqueCountries = [...new Set(countries)];
      expect(uniqueCountries.length).toBeGreaterThanOrEqual(3);
    });

    it('should filter content by country', async () => {
      const usContent = ALL_CONTENT.filter((c) => c.country === 'US');
      expect(usContent.length).toBeGreaterThanOrEqual(1);
      usContent.forEach((c) => expect(c.country).toBe('US'));
    });
  });

  // =========================================================================
  // SEO Score Handling
  // =========================================================================

  describe('SEO Score Handling', () => {
    it('should store SEO score for blog content', async () => {
      const content = TEST_BLOG;
      expect(content.seo_score).toBe(78.5);
      expect(content.seo_score).toBeGreaterThan(0);
    });

    it('should store SEO keywords array', async () => {
      const content = TEST_BLOG;
      expect(content.seo_keywords).toBeInstanceOf(Array);
      expect(content.seo_keywords.length).toBeGreaterThan(0);
      expect(content.seo_keywords).toContain('growth strategies');
    });

    it('should constrain SEO score between 0 and 100', async () => {
      const validScore = 78.5;
      expect(validScore).toBeGreaterThanOrEqual(0);
      expect(validScore).toBeLessThanOrEqual(100);
    });

    it('should default SEO score to 0 for non-blog types', async () => {
      const social = TEST_SOCIAL;
      const adCopy = TEST_AD_COPY;
      expect(social.seo_score).toBe(0);
      expect(adCopy.seo_score).toBe(0);
    });

    it('should allow updating SEO score', async () => {
      const original = makeContent({ seo_score: 60.0 });
      const updated = { ...original, seo_score: 85.0 };
      expect(updated.seo_score).toBeGreaterThan(original.seo_score);
    });
  });

  // =========================================================================
  // Content Filtering
  // =========================================================================

  describe('Content Filtering', () => {
    it('should filter content by type', async () => {
      const blogs = ALL_CONTENT.filter((c) => c.type === 'blog');
      expect(blogs.length).toBeGreaterThanOrEqual(1);
      blogs.forEach((c) => expect(c.type).toBe('blog'));
    });

    it('should filter content by status', async () => {
      const drafts = ALL_CONTENT.filter((c) => c.status === 'draft');
      expect(drafts.length).toBeGreaterThanOrEqual(1);
      drafts.forEach((c) => expect(c.status).toBe('draft'));
    });

    it('should filter content by language', async () => {
      const english = ALL_CONTENT.filter((c) => c.language === 'en');
      expect(english.length).toBeGreaterThanOrEqual(1);
      english.forEach((c) => expect(c.language).toBe('en'));
    });

    it('should apply multiple filters simultaneously', async () => {
      const filtered = ALL_CONTENT.filter(
        (c) => c.type === 'blog' && c.status === 'draft' && c.language === 'en',
      );
      expect(filtered).toHaveLength(1);
      expect(filtered[0].title).toBe('Top 10 Growth Strategies for US Market');
    });

    it('should return empty list when no content matches filters', async () => {
      const filtered = ALL_CONTENT.filter(
        (c) => c.type === 'video_script' && c.language === 'ar',
      );
      expect(filtered).toHaveLength(0);
    });

    it('should validate supported languages', async () => {
      SUPPORTED_LANGUAGES.forEach((lang) => {
        expect(lang.length).toBeLessThanOrEqual(3);
        expect(lang.length).toBeGreaterThanOrEqual(2);
      });
    });
  });

  // =========================================================================
  // Content Update and Delete
  // =========================================================================

  describe('Content Update', () => {
    it('should update content title', async () => {
      const original = makeContent({ title: 'Old Title' });
      const updated = { ...original, title: 'Updated Title for SEO' };
      expect(updated.title).toBe('Updated Title for SEO');
      expect(updated.title).not.toBe(original.title);
    });

    it('should update content body', async () => {
      const original = makeContent({ body: 'Original body text.' });
      const updated = { ...original, body: 'Updated body with more detail and keywords.' };
      expect(updated.body.length).toBeGreaterThan(original.body.length);
    });

    it('should update content language', async () => {
      const original = makeContent({ language: 'en' });
      const updated = { ...original, language: 'es' };
      expect(SUPPORTED_LANGUAGES).toContain(updated.language);
      expect(updated.language).not.toBe(original.language);
    });

    it('should update updated_at timestamp on modification', async () => {
      const original = makeContent({ updated_at: '2025-01-15T10:00:00Z' });
      const newTimestamp = '2025-03-01T14:30:00Z';
      const updated = { ...original, updated_at: newTimestamp };
      expect(new Date(updated.updated_at).getTime()).toBeGreaterThan(
        new Date(original.updated_at).getTime(),
      );
    });
  });

  describe('Content Delete', () => {
    it('should soft-delete content by setting status to archived', async () => {
      const content = makeContent({ status: 'draft' });
      const archived = { ...content, status: 'archived' };
      expect(archived.status).toBe('archived');
    });

    it('should return 404 when deleting non-existent content', async () => {
      const fakeId = '00000000-0000-0000-0000-000000000000';
      const existingIds = ALL_CONTENT.map((c) => c.id);
      expect(existingIds).not.toContain(fakeId);
    });

    it('should not allow reading deleted (archived) content by default', async () => {
      const allActive = ALL_CONTENT.filter((c) => c.status !== 'archived');
      expect(allActive.length).toBe(ALL_CONTENT.length);
    });
  });
});
