import { useState, useMemo, useCallback } from 'react';
import {
  Share2,
  Calendar,
  Clock,
  Heart,
  MessageCircle,
  Eye,
  TrendingUp,
  Instagram,
  Hash,
  Plus,
  X,
  Sparkles,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import { TableSkeleton, CardSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import type { KPIData } from '../types';

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

interface SocialPost {
  id: string;
  platform: 'instagram' | 'tiktok' | 'twitter' | 'linkedin';
  content: string;
  scheduledTime: string;
  scheduledDay: string;
  country: string;
  language: string;
  status: 'scheduled' | 'draft' | 'published' | 'review';
  likes?: number;
  comments?: number;
  shares?: number;
  reach?: number;
}

interface SocialContentResponse {
  posts: SocialPost[];
  kpis: KPIData[];
  engagementTrend: { day: string; likes: number; comments: number; shares: number }[];
  topPosts: SocialPost[];
  hashtagStrategy: { platform: string; hashtags: string[] }[];
  toneSettings: {
    country: string;
    flag: string;
    tone: string;
    formality: 'Formal' | 'Semi-Formal' | 'Casual';
    emojiUsage: 'Heavy' | 'Moderate' | 'Minimal';
    humor: 'High' | 'Medium' | 'Low';
    keyNotes: string;
  }[];
}

interface AgentExecuteResponse {
  message: string;
  optimizedSchedule?: SocialPost[];
}

// ---------------------------------------------------------------------------
// Fallback data (shown when API returns empty arrays)
// ---------------------------------------------------------------------------

const fallbackKpis: KPIData[] = [
  { label: 'Total Posts', value: 0, change: 0, trend: 'stable' },
  { label: 'Engagement Rate', value: '0%', change: 0, trend: 'stable' },
  { label: 'Total Reach', value: '0', change: 0, trend: 'stable' },
  { label: 'Followers Growth', value: '+0', change: 0, trend: 'stable' },
];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const calendarDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const calendarSlots = ['8:00 AM', '10:00 AM', '12:00 PM', '2:00 PM', '4:00 PM', '6:00 PM'];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const platformColors: Record<string, string> = {
  instagram: 'bg-pink-100 text-pink-700',
  tiktok: 'bg-gray-900 text-white',
  twitter: 'bg-sky-100 text-sky-700',
  linkedin: 'bg-blue-100 text-blue-700',
};

const platformLabels: Record<string, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  twitter: 'Twitter',
  linkedin: 'LinkedIn',
};

function PlatformIcon({ platform }: { platform: string }) {
  switch (platform.toLowerCase()) {
    case 'instagram':
      return <Instagram className="w-4 h-4" />;
    case 'tiktok':
      return <Clock className="w-4 h-4" />;
    case 'twitter':
      return <Share2 className="w-4 h-4" />;
    case 'linkedin':
      return <TrendingUp className="w-4 h-4" />;
    default:
      return <Share2 className="w-4 h-4" />;
  }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function OrganicSocial() {
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingPost, setEditingPost] = useState<SocialPost | null>(null);

  // ---- API queries ---------------------------------------------------------
  const {
    data: socialData,
    loading: socialLoading,
    error: socialError,
    refetch: refetchSocial,
  } = useApiQuery<SocialContentResponse>('/v1/content?type=social');

  // ---- Mutations -----------------------------------------------------------
  const { mutate: createPost, loading: createLoading } =
    useApiMutation<SocialPost>('/v1/content', { method: 'POST' });

  const { mutate: runAgent, loading: agentLoading } =
    useApiMutation<AgentExecuteResponse>('/v1/agents/organic-social/run', { method: 'POST' });

  // ---- Derived data --------------------------------------------------------
  const posts = useMemo(() => socialData?.posts ?? [], [socialData?.posts]);
  const kpis = socialData?.kpis ?? fallbackKpis;
  const engagementTrendData = socialData?.engagementTrend ?? [];
  const topPosts = socialData?.topPosts ?? [];
  const hashtagStrategy = socialData?.hashtagStrategy ?? [];
  const toneSettings = socialData?.toneSettings ?? [];

  const filteredPosts = useMemo(
    () => (selectedDay ? posts.filter((p) => p.scheduledDay === selectedDay) : posts),
    [posts, selectedDay],
  );

  // Map posts onto the calendar grid
  const getCalendarCell = useCallback(
    (day: string, slot: string): SocialPost | undefined => {
      const slotHour = parseInt(slot);
      return posts.find((p) => {
        if (p.scheduledDay !== day) return false;
        const postHour = parseInt(p.scheduledTime);
        const postPeriod = p.scheduledTime.slice(-2);
        let h24 = postHour;
        if (postPeriod === 'PM' && postHour !== 12) h24 += 12;
        if (postPeriod === 'AM' && postHour === 12) h24 = 0;

        const slotPeriod = slot.slice(-2);
        let s24 = slotHour;
        if (slotPeriod === 'PM' && slotHour !== 12) s24 += 12;
        if (slotPeriod === 'AM' && slotHour === 12) s24 = 0;

        return Math.abs(h24 - s24) < 2;
      });
    },
    [posts],
  );

  // ---- Handlers ------------------------------------------------------------
  const handleCreatePost = async (formData: Partial<SocialPost>) => {
    const result = await createPost({ ...formData, type: 'social' });
    if (result) {
      setShowCreateModal(false);
      refetchSocial();
    }
  };

  const handleUpdatePost = async (formData: Partial<SocialPost>) => {
    if (!editingPost) return;
    // Dynamic endpoint for update
    const updateMutation = async () => {
      const { default: apiService } = await import('../services/api');
      const response = await apiService.put<{ success: boolean; data: SocialPost }>(
        `/v1/content/${editingPost.id}`,
        { ...formData, type: 'social' },
      );
      return response.data;
    };
    const result = await updateMutation();
    if (result) {
      setEditingPost(null);
      refetchSocial();
    }
  };

  const handleRunAgent = async () => {
    await runAgent({});
    refetchSocial();
  };

  // ---- Loading state -------------------------------------------------------
  if (socialLoading) {
    return (
      <div>
        <PageHeader
          title="Organic Social Automation"
          subtitle="Daily Content Scheduling & Engagement Optimization"
          icon={<Share2 className="w-5 h-5" />}
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={i} lines={2} />
          ))}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
          <div className="xl:col-span-2">
            <TableSkeleton rows={6} cols={8} />
          </div>
          <CardSkeleton lines={8} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
          <CardSkeleton lines={6} />
          <CardSkeleton lines={6} />
        </div>
      </div>
    );
  }

  // ---- Error state ---------------------------------------------------------
  if (socialError) {
    return (
      <div>
        <PageHeader
          title="Organic Social Automation"
          subtitle="Daily Content Scheduling & Engagement Optimization"
          icon={<Share2 className="w-5 h-5" />}
        />
        <ApiErrorDisplay error={socialError} onRetry={refetchSocial} />
      </div>
    );
  }

  // ---- Render --------------------------------------------------------------
  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Organic Social Automation"
        subtitle="Daily Content Scheduling & Engagement Optimization"
        icon={<Share2 className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunAgent}
              disabled={agentLoading}
              className="px-4 py-2 bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200 rounded-lg text-sm font-medium hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              <Sparkles className="w-4 h-4" />
              {agentLoading ? 'Optimizing...' : 'AI Optimize'}
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Schedule Post
            </button>
          </div>
        }
      />

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi) => (
          <KPICard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Content Calendar + Upcoming Posts */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6">
        {/* Calendar */}
        <Card
          title="Content Calendar"
          subtitle="This week's scheduled posts"
          className="xl:col-span-2"
          actions={
            <div className="flex gap-1">
              {calendarDays.map((d) => (
                <button
                  key={d}
                  onClick={() => setSelectedDay(selectedDay === d ? null : d)}
                  className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                    selectedDay === d
                      ? 'bg-primary-600 text-white'
                      : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300 hover:bg-surface-200 dark:hover:bg-surface-600'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          }
        >
          {posts.length === 0 ? (
            <EmptyState
              icon={<Calendar className="w-6 h-6" />}
              title="No posts scheduled"
              description="Create your first social post to populate the calendar."
              action={
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors"
                >
                  Create Post
                </button>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left text-surface-500 dark:text-surface-400 font-medium py-2 pr-2 w-20">Time</th>
                    {calendarDays.map((d) => (
                      <th
                        key={d}
                        className={`text-center font-medium py-2 px-1 ${
                          selectedDay === d ? 'text-primary-600' : 'text-surface-500 dark:text-surface-400'
                        }`}
                      >
                        {d}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {calendarSlots.map((slot) => (
                    <tr key={slot} className="border-t border-surface-100 dark:border-surface-700">
                      <td className="py-3 pr-2 text-surface-400 dark:text-surface-500 font-mono">{slot}</td>
                      {calendarDays.map((day) => {
                        const post = getCalendarCell(day, slot);
                        return (
                          <td key={day} className="py-3 px-1 text-center">
                            {post ? (
                              <div
                                className={`rounded-md px-1.5 py-1 ${platformColors[post.platform]} cursor-pointer hover:opacity-80 transition-opacity`}
                                title={post.content}
                                onClick={() => setEditingPost(post)}
                              >
                                <div className="flex items-center justify-center gap-1">
                                  <PlatformIcon platform={post.platform} />
                                </div>
                                <span className="block truncate mt-0.5 max-w-[60px] mx-auto">
                                  {post.country.slice(0, 2).toUpperCase()}
                                </span>
                              </div>
                            ) : (
                              <span className="text-surface-200 dark:text-surface-600">--</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Upcoming Posts */}
        <Card title="Upcoming Posts" subtitle={`${filteredPosts.length} posts${selectedDay ? ` on ${selectedDay}` : ''}`}>
          {filteredPosts.length === 0 ? (
            <EmptyState
              icon={<Clock className="w-6 h-6" />}
              title="No upcoming posts"
              description={selectedDay ? `No posts scheduled for ${selectedDay}.` : 'No posts found.'}
            />
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {filteredPosts.map((post) => (
                <div
                  key={post.id}
                  className="border border-surface-100 dark:border-surface-700 rounded-lg p-3 hover:border-surface-300 dark:hover:border-surface-500 transition-colors cursor-pointer"
                  onClick={() => setEditingPost(post)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${platformColors[post.platform]}`}
                      >
                        <PlatformIcon platform={post.platform} />
                        {platformLabels[post.platform]}
                      </span>
                      <StatusBadge status={post.status} size="sm" />
                    </div>
                  </div>
                  <p className="text-sm text-surface-700 dark:text-surface-200 line-clamp-2 mb-2">{post.content}</p>
                  <div className="flex items-center justify-between text-xs text-surface-500 dark:text-surface-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {post.scheduledDay} {post.scheduledTime}
                    </span>
                    <span>
                      {post.country} / {post.language}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Engagement Trends Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card title="Engagement Trends" subtitle="Last 30 days -- likes, comments, shares">
          {engagementTrendData.length === 0 ? (
            <EmptyState
              icon={<TrendingUp className="w-6 h-6" />}
              title="No engagement data"
              description="Engagement data will appear once posts are published."
            />
          ) : (
            <>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={engagementTrendData} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="gradLikes" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e11d48" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#e11d48" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradComments" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradShares" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0ea5e9" stopOpacity={0.15} />
                        <stop offset="95%" stopColor="#0ea5e9" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                    <Tooltip
                      contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb', backgroundColor: 'var(--color-surface-50, #fff)', color: 'var(--color-surface-900, #111)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="likes"
                      stroke="#e11d48"
                      strokeWidth={2}
                      fill="url(#gradLikes)"
                      name="Likes"
                    />
                    <Area
                      type="monotone"
                      dataKey="comments"
                      stroke="#6366f1"
                      strokeWidth={2}
                      fill="url(#gradComments)"
                      name="Comments"
                    />
                    <Area
                      type="monotone"
                      dataKey="shares"
                      stroke="#0ea5e9"
                      strokeWidth={2}
                      fill="url(#gradShares)"
                      name="Shares"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center justify-center gap-6 mt-3 text-xs text-surface-600 dark:text-surface-300">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-rose-500" /> Likes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-indigo-500" /> Comments
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-sky-500" /> Shares
                </span>
              </div>
            </>
          )}
        </Card>

        {/* Best Performing Posts */}
        <Card title="Best Performing Posts" subtitle="Top 3 by total engagement">
          {topPosts.length === 0 ? (
            <EmptyState
              icon={<Heart className="w-6 h-6" />}
              title="No top posts yet"
              description="Top performing posts will appear after content is published."
            />
          ) : (
            <div className="space-y-4">
              {topPosts.map((post, idx) => (
                <div
                  key={post.id}
                  className="border border-surface-100 dark:border-surface-700 rounded-lg p-4 hover:shadow-sm transition-shadow"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                      #{idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs font-medium text-surface-500 dark:text-surface-400">
                          {platformLabels[post.platform] || post.platform}
                        </span>
                        <span className="text-xs text-surface-400 dark:text-surface-500">-- {post.country}</span>
                      </div>
                      <p className="text-sm text-surface-800 dark:text-surface-200 mb-3">{post.content}</p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="text-center">
                          <Heart className="w-3.5 h-3.5 mx-auto text-rose-500 mb-0.5" />
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-200">{formatNumber(post.likes ?? 0)}</p>
                          <p className="text-[10px] text-surface-400 dark:text-surface-500">Likes</p>
                        </div>
                        <div className="text-center">
                          <MessageCircle className="w-3.5 h-3.5 mx-auto text-indigo-500 mb-0.5" />
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-200">{formatNumber(post.comments ?? 0)}</p>
                          <p className="text-[10px] text-surface-400 dark:text-surface-500">Comments</p>
                        </div>
                        <div className="text-center">
                          <Share2 className="w-3.5 h-3.5 mx-auto text-sky-500 mb-0.5" />
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-200">{formatNumber(post.shares ?? 0)}</p>
                          <p className="text-[10px] text-surface-400 dark:text-surface-500">Shares</p>
                        </div>
                        <div className="text-center">
                          <Eye className="w-3.5 h-3.5 mx-auto text-amber-500 mb-0.5" />
                          <p className="text-xs font-semibold text-surface-800 dark:text-surface-200">{formatNumber(post.reach ?? 0)}</p>
                          <p className="text-[10px] text-surface-400 dark:text-surface-500">Reach</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Hashtag Strategy + AI Tone Adaptation */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Hashtag Strategy */}
        <Card
          title="Hashtag Strategy"
          subtitle="AI-recommended hashtags by platform"
          actions={
            <span className="flex items-center gap-1 text-xs text-primary-600 font-medium">
              <Hash className="w-3.5 h-3.5" />
              Auto-optimized
            </span>
          }
        >
          {hashtagStrategy.length === 0 ? (
            <EmptyState
              icon={<Hash className="w-6 h-6" />}
              title="No hashtag data"
              description="Hashtag recommendations will appear once the AI agent runs."
            />
          ) : (
            <div className="space-y-5">
              {hashtagStrategy.map((group) => (
                <div key={group.platform}>
                  <div className="flex items-center gap-2 mb-2">
                    <PlatformIcon platform={group.platform} />
                    <h4 className="text-sm font-semibold text-surface-800 dark:text-surface-200">{group.platform}</h4>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {group.hashtags.map((tag) => (
                      <span
                        key={tag}
                        className="inline-block bg-surface-100 dark:bg-surface-700 text-surface-700 dark:text-surface-200 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary-50 dark:hover:bg-primary-500/10 hover:text-primary-700 dark:hover:text-primary-400 transition-colors cursor-pointer"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* AI Tone Adaptation */}
        <Card
          title="AI Tone Adaptation"
          subtitle="Localized voice settings per country"
          actions={
            <span className="flex items-center gap-1 text-xs text-primary-600 font-medium">
              <TrendingUp className="w-3.5 h-3.5" />
              AI-calibrated
            </span>
          }
        >
          {toneSettings.length === 0 ? (
            <EmptyState
              icon={<Sparkles className="w-6 h-6" />}
              title="No tone settings"
              description="Tone adaptation settings will appear once country data is available."
            />
          ) : (
            <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
              {toneSettings.map((cfg) => (
                <div
                  key={cfg.country}
                  className="border border-surface-100 dark:border-surface-700 rounded-lg p-3 hover:border-surface-300 dark:hover:border-surface-500 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{cfg.flag}</span>
                      <span className="text-sm font-semibold text-surface-800 dark:text-surface-200">{cfg.country}</span>
                    </div>
                    <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                      {cfg.tone}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mb-2">
                    <div>
                      <p className="text-[10px] text-surface-400 dark:text-surface-500 uppercase tracking-wide">Formality</p>
                      <p className="text-xs font-medium text-surface-700 dark:text-surface-200">{cfg.formality}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-surface-400 dark:text-surface-500 uppercase tracking-wide">Emoji Use</p>
                      <p className="text-xs font-medium text-surface-700 dark:text-surface-200">{cfg.emojiUsage}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-surface-400 dark:text-surface-500 uppercase tracking-wide">Humor</p>
                      <p className="text-xs font-medium text-surface-700 dark:text-surface-200">{cfg.humor}</p>
                    </div>
                  </div>
                  <p className="text-xs text-surface-500 dark:text-surface-400 italic">{cfg.keyNotes}</p>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* Create / Edit Modal */}
      {(showCreateModal || editingPost) && (
        <PostFormModal
          post={editingPost}
          loading={createLoading}
          onClose={() => {
            setShowCreateModal(false);
            setEditingPost(null);
          }}
          onSubmit={editingPost ? handleUpdatePost : handleCreatePost}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Post Form Modal
// ---------------------------------------------------------------------------

interface PostFormModalProps {
  post: SocialPost | null;
  loading: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<SocialPost>) => void;
}

function PostFormModal({ post, loading, onClose, onSubmit }: PostFormModalProps) {
  const [platform, setPlatform] = useState<SocialPost['platform']>(post?.platform ?? 'instagram');
  const [content, setContent] = useState(post?.content ?? '');
  const [scheduledDay, setScheduledDay] = useState(post?.scheduledDay ?? 'Mon');
  const [scheduledTime, setScheduledTime] = useState(post?.scheduledTime ?? '09:00 AM');
  const [country, setCountry] = useState(post?.country ?? '');
  const [language, setLanguage] = useState(post?.language ?? 'English');
  const [status, setStatus] = useState<SocialPost['status']>(post?.status ?? 'draft');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ platform, content, scheduledDay, scheduledTime, country, language, status });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white dark:bg-surface-800 rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-surface-100 dark:border-surface-700">
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200">
            {post ? 'Edit Post' : 'Schedule New Post'}
          </h2>
          <button onClick={onClose} className="text-surface-400 dark:text-surface-500 hover:text-surface-600 dark:hover:text-surface-300 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Platform */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Platform</label>
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as SocialPost['platform'])}
              className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-surface-800 dark:text-surface-100"
            >
              <option value="instagram">Instagram</option>
              <option value="tiktok">TikTok</option>
              <option value="twitter">Twitter</option>
              <option value="linkedin">LinkedIn</option>
            </select>
          </div>

          {/* Content */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Content</label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={4}
              className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none resize-none bg-white dark:bg-surface-800 dark:text-surface-100"
              placeholder="Write your post content..."
              required
            />
          </div>

          {/* Schedule */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Day</label>
              <select
                value={scheduledDay}
                onChange={(e) => setScheduledDay(e.target.value)}
                className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-surface-800 dark:text-surface-100"
              >
                {calendarDays.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Time</label>
              <select
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-surface-800 dark:text-surface-100"
              >
                {calendarSlots.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Country / Language */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Country</label>
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-surface-800 dark:text-surface-100"
                placeholder="e.g. Japan"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Language</label>
              <input
                type="text"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-surface-800 dark:text-surface-100"
                placeholder="e.g. English"
                required
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-surface-700 dark:text-surface-200 mb-1">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as SocialPost['status'])}
              className="w-full border border-surface-200 dark:border-surface-700 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 outline-none bg-white dark:bg-surface-800 dark:text-surface-100"
            >
              <option value="draft">Draft</option>
              <option value="scheduled">Scheduled</option>
              <option value="review">Review</option>
            </select>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-surface-600 dark:text-surface-300 bg-surface-100 dark:bg-surface-700 rounded-lg hover:bg-surface-200 dark:hover:bg-surface-600 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !content.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4" />
                  {post ? 'Update Post' : 'Schedule Post'}
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
