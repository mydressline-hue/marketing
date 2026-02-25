import { useState } from 'react';
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
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import StatusBadge from '../components/shared/StatusBadge';
import type { KPIData } from '../types';

// ---------------------------------------------------------------------------
// Mock Data
// ---------------------------------------------------------------------------

const kpis: KPIData[] = [
  { label: 'Total Posts', value: 342, change: 8.2, trend: 'up' },
  { label: 'Engagement Rate', value: '4.8%', change: 1.3, trend: 'up' },
  { label: 'Total Reach', value: '2.1M', change: 15.7, trend: 'up' },
  { label: 'Followers Growth', value: '+12.4K', change: 6.1, trend: 'up' },
];

interface ScheduledPost {
  id: string;
  platform: 'instagram' | 'tiktok' | 'twitter' | 'linkedin';
  content: string;
  scheduledTime: string;
  scheduledDay: string;
  country: string;
  language: string;
  status: 'scheduled' | 'draft' | 'published' | 'review';
}

const scheduledPosts: ScheduledPost[] = [
  {
    id: 'p1',
    platform: 'instagram',
    content: 'Behind-the-scenes look at our new product launch event in Tokyo. Authentic moments, real connections.',
    scheduledTime: '09:00 AM',
    scheduledDay: 'Mon',
    country: 'Japan',
    language: 'Japanese',
    status: 'scheduled',
  },
  {
    id: 'p2',
    platform: 'tiktok',
    content: 'Quick tutorial: 3 ways to style our best-selling item this spring season. Which is your fave?',
    scheduledTime: '12:30 PM',
    scheduledDay: 'Mon',
    country: 'United States',
    language: 'English',
    status: 'scheduled',
  },
  {
    id: 'p3',
    platform: 'twitter',
    content: 'We just hit 50K followers in LATAM! Celebrating with a flash giveaway. RT + follow to enter.',
    scheduledTime: '02:00 PM',
    scheduledDay: 'Tue',
    country: 'Mexico',
    language: 'Spanish',
    status: 'review',
  },
  {
    id: 'p4',
    platform: 'linkedin',
    content: 'Our VP of Growth shares key insights on expanding into Southeast Asian markets. Read the full article.',
    scheduledTime: '08:00 AM',
    scheduledDay: 'Tue',
    country: 'Singapore',
    language: 'English',
    status: 'scheduled',
  },
  {
    id: 'p5',
    platform: 'instagram',
    content: 'Carousel post: 5 Gründe, warum unsere Community in Deutschland so schnell wächst.',
    scheduledTime: '11:00 AM',
    scheduledDay: 'Wed',
    country: 'Germany',
    language: 'German',
    status: 'draft',
  },
  {
    id: 'p6',
    platform: 'tiktok',
    content: 'Unboxing vidéo de notre collection limitée pour le marché français. Restez jusqu\'à la fin!',
    scheduledTime: '06:00 PM',
    scheduledDay: 'Wed',
    country: 'France',
    language: 'French',
    status: 'scheduled',
  },
  {
    id: 'p7',
    platform: 'twitter',
    content: 'Poll: What feature do you want next? A) Faster shipping B) More colors C) Collab drops D) Loyalty perks',
    scheduledTime: '10:00 AM',
    scheduledDay: 'Thu',
    country: 'United Kingdom',
    language: 'English',
    status: 'scheduled',
  },
  {
    id: 'p8',
    platform: 'linkedin',
    content: 'Case study: How we grew organic reach by 320% in Brazil using localized storytelling and micro-influencers.',
    scheduledTime: '09:30 AM',
    scheduledDay: 'Fri',
    country: 'Brazil',
    language: 'Portuguese',
    status: 'scheduled',
  },
];

const engagementTrendData = [
  { day: 'Jan 26', likes: 1200, comments: 340, shares: 180 },
  { day: 'Jan 28', likes: 1450, comments: 390, shares: 210 },
  { day: 'Jan 30', likes: 1100, comments: 280, shares: 150 },
  { day: 'Feb 1', likes: 1800, comments: 480, shares: 290 },
  { day: 'Feb 3', likes: 2100, comments: 520, shares: 340 },
  { day: 'Feb 5', likes: 1750, comments: 440, shares: 260 },
  { day: 'Feb 7', likes: 2300, comments: 610, shares: 380 },
  { day: 'Feb 9', likes: 1900, comments: 490, shares: 310 },
  { day: 'Feb 11', likes: 2450, comments: 640, shares: 420 },
  { day: 'Feb 13', likes: 2700, comments: 710, shares: 460 },
  { day: 'Feb 15', likes: 2200, comments: 580, shares: 350 },
  { day: 'Feb 17', likes: 2900, comments: 760, shares: 510 },
  { day: 'Feb 19', likes: 3100, comments: 820, shares: 540 },
  { day: 'Feb 21', likes: 2800, comments: 730, shares: 480 },
  { day: 'Feb 23', likes: 3400, comments: 890, shares: 600 },
];

interface TopPost {
  id: string;
  platform: string;
  content: string;
  likes: number;
  comments: number;
  shares: number;
  reach: number;
  country: string;
}

const topPosts: TopPost[] = [
  {
    id: 't1',
    platform: 'Instagram',
    content: 'Our Tokyo pop-up event recap -- a day of connection, culture, and community.',
    likes: 12400,
    comments: 1830,
    shares: 940,
    reach: 284000,
    country: 'Japan',
  },
  {
    id: 't2',
    platform: 'TikTok',
    content: 'POV: You discover we ship to 40+ countries now. The reaction at the end!',
    likes: 34200,
    comments: 4120,
    shares: 8700,
    reach: 1200000,
    country: 'United States',
  },
  {
    id: 't3',
    platform: 'LinkedIn',
    content: 'How we localized our brand story for 12 markets without losing authenticity.',
    likes: 3800,
    comments: 620,
    shares: 1540,
    reach: 186000,
    country: 'Global',
  },
];

interface HashtagGroup {
  platform: string;
  hashtags: string[];
}

const hashtagStrategy: HashtagGroup[] = [
  {
    platform: 'Instagram',
    hashtags: ['#GlobalBrand', '#StyleWorldwide', '#ShopInternational', '#FashionTokyo', '#BerlinStyle', '#ParisMode', '#MadeForyou'],
  },
  {
    platform: 'TikTok',
    hashtags: ['#FYP', '#GlobalFinds', '#UnboxingTime', '#TrendingNow', '#ShopWithMe', '#InternationalStyle'],
  },
  {
    platform: 'Twitter',
    hashtags: ['#GrowthHacking', '#Ecommerce', '#GlobalExpansion', '#DTCBrand', '#MarketingTips'],
  },
  {
    platform: 'LinkedIn',
    hashtags: ['#InternationalGrowth', '#Ecommerce', '#MarketExpansion', '#DigitalMarketing', '#GlobalStrategy', '#Leadership'],
  },
];

interface ToneConfig {
  country: string;
  flag: string;
  tone: string;
  formality: 'Formal' | 'Semi-Formal' | 'Casual';
  emojiUsage: 'Heavy' | 'Moderate' | 'Minimal';
  humor: 'High' | 'Medium' | 'Low';
  keyNotes: string;
}

const toneSettings: ToneConfig[] = [
  { country: 'United States', flag: '🇺🇸', tone: 'Bold & Aspirational', formality: 'Casual', emojiUsage: 'Heavy', humor: 'High', keyNotes: 'Direct CTA, inclusive language, pop-culture refs' },
  { country: 'Japan', flag: '🇯🇵', tone: 'Respectful & Refined', formality: 'Formal', emojiUsage: 'Moderate', humor: 'Low', keyNotes: 'Honorifics, seasonal references, aesthetic focus' },
  { country: 'Germany', flag: '🇩🇪', tone: 'Precise & Trustworthy', formality: 'Semi-Formal', emojiUsage: 'Minimal', humor: 'Medium', keyNotes: 'Data-driven claims, quality emphasis, privacy-aware' },
  { country: 'Brazil', flag: '🇧🇷', tone: 'Warm & Energetic', formality: 'Casual', emojiUsage: 'Heavy', humor: 'High', keyNotes: 'Celebratory, community-first, local slang OK' },
  { country: 'France', flag: '🇫🇷', tone: 'Elegant & Witty', formality: 'Semi-Formal', emojiUsage: 'Moderate', humor: 'Medium', keyNotes: 'Understated luxury, cultural sophistication, wordplay' },
  { country: 'United Kingdom', flag: '🇬🇧', tone: 'Clever & Understated', formality: 'Semi-Formal', emojiUsage: 'Minimal', humor: 'High', keyNotes: 'Dry humor, self-deprecating, avoid Americanisms' },
];

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

  const filteredPosts = selectedDay
    ? scheduledPosts.filter((p) => p.scheduledDay === selectedDay)
    : scheduledPosts;

  // Map posts onto the calendar grid
  function getCalendarCell(day: string, slot: string): ScheduledPost | undefined {
    const slotHour = parseInt(slot);
    return scheduledPosts.find((p) => {
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
  }

  return (
    <div>
      {/* Header */}
      <PageHeader
        title="Organic Social Automation"
        subtitle="Daily Content Scheduling & Engagement Optimization"
        icon={<Share2 className="w-5 h-5" />}
        actions={
          <button className="px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            Schedule Post
          </button>
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
                      : 'bg-surface-100 text-surface-600 hover:bg-surface-200'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left text-surface-500 font-medium py-2 pr-2 w-20">Time</th>
                  {calendarDays.map((d) => (
                    <th
                      key={d}
                      className={`text-center font-medium py-2 px-1 ${
                        selectedDay === d ? 'text-primary-600' : 'text-surface-500'
                      }`}
                    >
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {calendarSlots.map((slot) => (
                  <tr key={slot} className="border-t border-surface-100">
                    <td className="py-3 pr-2 text-surface-400 font-mono">{slot}</td>
                    {calendarDays.map((day) => {
                      const post = getCalendarCell(day, slot);
                      return (
                        <td key={day} className="py-3 px-1 text-center">
                          {post ? (
                            <div
                              className={`rounded-md px-1.5 py-1 ${platformColors[post.platform]} cursor-pointer hover:opacity-80 transition-opacity`}
                              title={post.content}
                            >
                              <div className="flex items-center justify-center gap-1">
                                <PlatformIcon platform={post.platform} />
                              </div>
                              <span className="block truncate mt-0.5 max-w-[60px] mx-auto">
                                {post.country.slice(0, 2).toUpperCase()}
                              </span>
                            </div>
                          ) : (
                            <span className="text-surface-200">--</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* Upcoming Posts */}
        <Card title="Upcoming Posts" subtitle={`${filteredPosts.length} posts${selectedDay ? ` on ${selectedDay}` : ''}`}>
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {filteredPosts.map((post) => (
              <div
                key={post.id}
                className="border border-surface-100 rounded-lg p-3 hover:border-surface-300 transition-colors"
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
                <p className="text-sm text-surface-700 line-clamp-2 mb-2">{post.content}</p>
                <div className="flex items-center justify-between text-xs text-surface-500">
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
        </Card>
      </div>

      {/* Engagement Trends Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-6">
        <Card title="Engagement Trends" subtitle="Last 30 days -- likes, comments, shares">
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
                  contentStyle={{ borderRadius: '8px', fontSize: '12px', border: '1px solid #e5e7eb' }}
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
          <div className="flex items-center justify-center gap-6 mt-3 text-xs text-surface-600">
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
        </Card>

        {/* Best Performing Posts */}
        <Card title="Best Performing Posts" subtitle="Top 3 by total engagement">
          <div className="space-y-4">
            {topPosts.map((post, idx) => (
              <div
                key={post.id}
                className="border border-surface-100 rounded-lg p-4 hover:shadow-sm transition-shadow"
              >
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-bold text-sm">
                    #{idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-surface-500">{post.platform}</span>
                      <span className="text-xs text-surface-400">-- {post.country}</span>
                    </div>
                    <p className="text-sm text-surface-800 mb-3">{post.content}</p>
                    <div className="grid grid-cols-4 gap-2">
                      <div className="text-center">
                        <Heart className="w-3.5 h-3.5 mx-auto text-rose-500 mb-0.5" />
                        <p className="text-xs font-semibold text-surface-800">{formatNumber(post.likes)}</p>
                        <p className="text-[10px] text-surface-400">Likes</p>
                      </div>
                      <div className="text-center">
                        <MessageCircle className="w-3.5 h-3.5 mx-auto text-indigo-500 mb-0.5" />
                        <p className="text-xs font-semibold text-surface-800">{formatNumber(post.comments)}</p>
                        <p className="text-[10px] text-surface-400">Comments</p>
                      </div>
                      <div className="text-center">
                        <Share2 className="w-3.5 h-3.5 mx-auto text-sky-500 mb-0.5" />
                        <p className="text-xs font-semibold text-surface-800">{formatNumber(post.shares)}</p>
                        <p className="text-[10px] text-surface-400">Shares</p>
                      </div>
                      <div className="text-center">
                        <Eye className="w-3.5 h-3.5 mx-auto text-amber-500 mb-0.5" />
                        <p className="text-xs font-semibold text-surface-800">{formatNumber(post.reach)}</p>
                        <p className="text-[10px] text-surface-400">Reach</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
          <div className="space-y-5">
            {hashtagStrategy.map((group) => (
              <div key={group.platform}>
                <div className="flex items-center gap-2 mb-2">
                  <PlatformIcon platform={group.platform} />
                  <h4 className="text-sm font-semibold text-surface-800">{group.platform}</h4>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {group.hashtags.map((tag) => (
                    <span
                      key={tag}
                      className="inline-block bg-surface-100 text-surface-700 text-xs font-medium px-2.5 py-1 rounded-full hover:bg-primary-50 hover:text-primary-700 transition-colors cursor-pointer"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
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
          <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
            {toneSettings.map((cfg) => (
              <div
                key={cfg.country}
                className="border border-surface-100 rounded-lg p-3 hover:border-surface-300 transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">{cfg.flag}</span>
                    <span className="text-sm font-semibold text-surface-800">{cfg.country}</span>
                  </div>
                  <span className="text-xs font-medium text-primary-600 bg-primary-50 px-2 py-0.5 rounded-full">
                    {cfg.tone}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-2">
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wide">Formality</p>
                    <p className="text-xs font-medium text-surface-700">{cfg.formality}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wide">Emoji Use</p>
                    <p className="text-xs font-medium text-surface-700">{cfg.emojiUsage}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-surface-400 uppercase tracking-wide">Humor</p>
                    <p className="text-xs font-medium text-surface-700">{cfg.humor}</p>
                  </div>
                </div>
                <p className="text-xs text-surface-500 italic">{cfg.keyNotes}</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
