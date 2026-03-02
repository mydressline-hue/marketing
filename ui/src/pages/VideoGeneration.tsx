import { useState } from 'react';
import {
  Video,
  Play,
  Upload,
  Sparkles,
  Send,
  Clock,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Eye,
  Loader2,
  Film,
  Type,
  Share2,
  ShoppingBag,
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import KPICard from '../components/shared/KPICard';
import { KPIRowSkeleton, ListSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import type { KPIData } from '../types';

// --- Types ---

type VideoMode = 'image_to_video' | 'text_to_video';
type VideoDuration = 5 | 10;
type AspectRatio = '1:1' | '16:9' | '9:16' | '4:3' | '3:4';
type SocialPlatform = 'instagram' | 'tiktok' | 'facebook' | 'youtube' | 'twitter' | 'linkedin';

interface VideoTask {
  id: string;
  title: string;
  status: string;
  mode: string;
  duration: number;
  aspectRatio: string;
  prompt: string;
  videoUrl: string | null;
  sourceImageUrl: string | null;
  errorMessage: string | null;
  createdAt: string;
}

interface PipelineRun {
  id: string;
  status: string;
  targetPlatforms: string[];
  results: Record<string, unknown>;
  createdAt: string;
}

interface VideoTasksResponse {
  data: VideoTask[];
  meta: { total: number; page: number; totalPages: number };
}

interface PipelineRunsResponse {
  data: PipelineRun[];
  meta: { total: number; page: number; totalPages: number };
}

// --- Constants ---

const platformLabels: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  tiktok: 'TikTok',
  facebook: 'Facebook',
  youtube: 'YouTube',
  twitter: 'Twitter/X',
  linkedin: 'LinkedIn',
};

const statusConfig: Record<string, { color: string; icon: typeof Clock }> = {
  pending: { color: 'text-surface-500', icon: Clock },
  submitted: { color: 'text-blue-500', icon: Upload },
  processing: { color: 'text-amber-500', icon: Loader2 },
  generating_video: { color: 'text-amber-500', icon: Film },
  enhancing_text: { color: 'text-purple-500', icon: Type },
  publishing: { color: 'text-indigo-500', icon: Share2 },
  completed: { color: 'text-green-500', icon: CheckCircle2 },
  partial: { color: 'text-yellow-500', icon: CheckCircle2 },
  failed: { color: 'text-red-500', icon: XCircle },
  cancelled: { color: 'text-surface-400', icon: XCircle },
};

const activeTab_options = [
  { key: 'generate', label: 'Generate Video' },
  { key: 'pipeline', label: 'Full Pipeline' },
  { key: 'tasks', label: 'Video Tasks' },
  { key: 'pipelines', label: 'Pipeline Runs' },
];

// --- Component ---

export default function VideoGeneration() {
  const [activeTab, setActiveTab] = useState('generate');

  // Generate form state
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<VideoMode>('image_to_video');
  const [duration, setDuration] = useState<VideoDuration>(5);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [prompt, setPrompt] = useState('');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [sourceImageUrl, setSourceImageUrl] = useState('');

  // Pipeline form state
  const [pipelineTitle, setPipelineTitle] = useState('');
  const [pipelineMode, setPipelineMode] = useState<VideoMode>('image_to_video');
  const [pipelineDuration, setPipelineDuration] = useState<VideoDuration>(5);
  const [pipelineAspectRatio, setPipelineAspectRatio] = useState<AspectRatio>('9:16');
  const [pipelinePrompt, setPipelinePrompt] = useState('');
  const [pipelineImageUrl, setPipelineImageUrl] = useState('');
  const [targetPlatforms, setTargetPlatforms] = useState<SocialPlatform[]>(['instagram', 'tiktok']);
  const [tone, setTone] = useState('engaging');
  const [targetAudience, setTargetAudience] = useState('');

  // API calls
  const {
    data: tasksData,
    loading: tasksLoading,
    error: tasksError,
    refetch: refetchTasks,
  } = useApiQuery<VideoTasksResponse>('/v1/video/tasks');

  const {
    data: pipelinesData,
    loading: pipelinesLoading,
    error: pipelinesError,
    refetch: refetchPipelines,
  } = useApiQuery<PipelineRunsResponse>('/v1/video/pipelines');

  const {
    mutate: generateVideo,
    loading: generating,
  } = useApiMutation<{ data: VideoTask }>('/v1/video/generate', {
    method: 'POST',
    onSuccess: () => refetchTasks(),
  });

  const {
    mutate: runPipeline,
    loading: runningPipeline,
  } = useApiMutation<{ data: PipelineRun }>('/v1/video/pipeline', {
    method: 'POST',
    onSuccess: () => {
      refetchPipelines();
      refetchTasks();
    },
  });

  // Derived data
  const tasks = tasksData?.data ?? [];
  const pipelines = pipelinesData?.data ?? [];

  const completedCount = tasks.filter((t) => t.status === 'completed').length;
  const processingCount = tasks.filter((t) => ['submitted', 'processing'].includes(t.status)).length;

  const kpis: KPIData[] = [
    { label: 'Total Videos', value: String(tasks.length), change: 0, trend: 'stable' },
    { label: 'Completed', value: String(completedCount), change: 0, trend: 'up' },
    { label: 'Processing', value: String(processingCount), change: 0, trend: 'stable' },
    { label: 'Pipeline Runs', value: String(pipelines.length), change: 0, trend: 'up' },
  ];

  // Handlers
  const handleGenerate = async () => {
    if (!title.trim() || !prompt.trim()) return;
    await generateVideo({
      title,
      mode,
      duration,
      aspectRatio,
      prompt,
      negativePrompt: negativePrompt || undefined,
      sourceImageUrl: sourceImageUrl || undefined,
    });
  };

  const handleRunPipeline = async () => {
    if (!pipelineTitle.trim() || !pipelinePrompt.trim() || targetPlatforms.length === 0) return;
    await runPipeline({
      title: pipelineTitle,
      mode: pipelineMode,
      duration: pipelineDuration,
      aspectRatio: pipelineAspectRatio,
      prompt: pipelinePrompt,
      sourceImageUrl: pipelineImageUrl || undefined,
      targetPlatforms,
      tone,
      targetAudience: targetAudience || undefined,
    });
  };

  const togglePlatform = (p: SocialPlatform) => {
    setTargetPlatforms((prev) =>
      prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p],
    );
  };

  const getStatusBadge = (status: string) => {
    const config = statusConfig[status] ?? statusConfig.pending;
    return (
      <span className={`inline-flex items-center gap-1 text-xs font-medium ${config.color}`}>
        <config.icon className={`w-3.5 h-3.5 ${status === 'processing' || status === 'generating_video' ? 'animate-spin' : ''}`} />
        {status.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div>
      <PageHeader
        title="Video Generation"
        subtitle="Kling AI video pipeline — generate product videos, enhance text, publish to social platforms"
        icon={<Video className="w-5 h-5" />}
      />

      {/* KPIs */}
      {tasksLoading ? (
        <KPIRowSkeleton />
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {kpis.map((kpi) => (
            <KPICard key={kpi.label} {...kpi} />
          ))}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-surface-100 dark:bg-surface-800 rounded-lg p-1 w-fit">
        {activeTab_options.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-white dark:bg-surface-700 text-surface-900 dark:text-surface-100 shadow-sm'
                : 'text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Generate Video Tab */}
      {activeTab === 'generate' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
              <Film className="w-5 h-5 text-primary-500" />
              Generate Video
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Title</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="My product video"
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Mode</label>
                  <select
                    value={mode}
                    onChange={(e) => setMode(e.target.value as VideoMode)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
                  >
                    <option value="image_to_video">Image to Video</option>
                    <option value="text_to_video">Text to Video</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Duration</label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value) as VideoDuration)}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
                  >
                    <option value={5}>5 seconds</option>
                    <option value={10}>10 seconds</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Aspect Ratio</label>
                <div className="flex gap-2">
                  {(['9:16', '16:9', '1:1', '4:3'] as AspectRatio[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setAspectRatio(r)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                        aspectRatio === r
                          ? 'bg-primary-50 dark:bg-primary-500/10 border-primary-300 dark:border-primary-500 text-primary-700 dark:text-primary-300'
                          : 'border-surface-200 dark:border-surface-700 text-surface-600 dark:text-surface-400 hover:border-surface-300 dark:hover:border-surface-600'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              {mode === 'image_to_video' && (
                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Source Image URL</label>
                  <input
                    type="url"
                    value={sourceImageUrl}
                    onChange={(e) => setSourceImageUrl(e.target.value)}
                    placeholder="https://example.com/product.jpg"
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Prompt</label>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Describe the video motion, camera angles, and style..."
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">
                  Negative Prompt <span className="text-surface-400">(optional)</span>
                </label>
                <input
                  type="text"
                  value={negativePrompt}
                  onChange={(e) => setNegativePrompt(e.target.value)}
                  placeholder="blurry, low quality, distorted..."
                  className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>

              <button
                onClick={handleGenerate}
                disabled={generating || !title.trim() || !prompt.trim()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-primary-400 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {generating ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-4 h-4" />
                    Generate Video
                  </>
                )}
              </button>
            </div>
          </Card>

          <Card>
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
              <Play className="w-5 h-5 text-green-500" />
              Recent Videos
            </h3>
            {tasksLoading ? (
              <ListSkeleton />
            ) : tasks.length === 0 ? (
              <EmptyState icon={Video} title="No videos yet" message="No videos generated yet" />
            ) : (
              <div className="space-y-3">
                {tasks.slice(0, 8).map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-800 flex items-center justify-center flex-shrink-0">
                        <Film className="w-5 h-5 text-surface-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-surface-900 dark:text-surface-100 truncate">
                          {task.title}
                        </p>
                        <p className="text-xs text-surface-500 dark:text-surface-400">
                          {task.duration}s &middot; {task.aspectRatio} &middot; {task.mode.replace(/_/g, ' ')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(task.status)}
                      {task.videoUrl && (
                        <a
                          href={task.videoUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1.5 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-md transition-colors"
                        >
                          <Eye className="w-4 h-4 text-surface-500" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Full Pipeline Tab */}
      {activeTab === 'pipeline' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <Card>
              <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4 flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-500" />
                Full Pipeline: Product &rarr; Video &rarr; Text &rarr; Publish
              </h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Title</label>
                    <input
                      type="text"
                      value={pipelineTitle}
                      onChange={(e) => setPipelineTitle(e.target.value)}
                      placeholder="Product launch video"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Tone</label>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
                    >
                      <option value="engaging">Engaging</option>
                      <option value="professional">Professional</option>
                      <option value="casual">Casual</option>
                      <option value="luxury">Luxury</option>
                      <option value="playful">Playful</option>
                      <option value="bold">Bold</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Mode</label>
                    <select
                      value={pipelineMode}
                      onChange={(e) => setPipelineMode(e.target.value as VideoMode)}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
                    >
                      <option value="image_to_video">Image to Video</option>
                      <option value="text_to_video">Text to Video</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Duration</label>
                    <select
                      value={pipelineDuration}
                      onChange={(e) => setPipelineDuration(Number(e.target.value) as VideoDuration)}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
                    >
                      <option value={5}>5 seconds</option>
                      <option value={10}>10 seconds</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Aspect Ratio</label>
                    <select
                      value={pipelineAspectRatio}
                      onChange={(e) => setPipelineAspectRatio(e.target.value as AspectRatio)}
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm"
                    >
                      <option value="9:16">9:16 (Vertical)</option>
                      <option value="16:9">16:9 (Horizontal)</option>
                      <option value="1:1">1:1 (Square)</option>
                      <option value="4:3">4:3</option>
                    </select>
                  </div>
                </div>

                {pipelineMode === 'image_to_video' && (
                  <div>
                    <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Source Image URL</label>
                    <input
                      type="url"
                      value={pipelineImageUrl}
                      onChange={(e) => setPipelineImageUrl(e.target.value)}
                      placeholder="https://example.com/product.jpg"
                      className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Prompt</label>
                  <textarea
                    value={pipelinePrompt}
                    onChange={(e) => setPipelinePrompt(e.target.value)}
                    placeholder="Describe the video motion, product showcase, camera angles..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-1">Target Audience <span className="text-surface-400">(optional)</span></label>
                  <input
                    type="text"
                    value={targetAudience}
                    onChange={(e) => setTargetAudience(e.target.value)}
                    placeholder="Fashion-forward women aged 25-35"
                    className="w-full px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-100 text-sm focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-surface-700 dark:text-surface-300 mb-2">Publish to Platforms</label>
                  <div className="flex flex-wrap gap-2">
                    {(Object.keys(platformLabels) as SocialPlatform[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => togglePlatform(p)}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                          targetPlatforms.includes(p)
                            ? 'bg-primary-50 dark:bg-primary-500/10 border-primary-300 dark:border-primary-500 text-primary-700 dark:text-primary-300'
                            : 'border-surface-200 dark:border-surface-700 text-surface-500 dark:text-surface-400 hover:border-surface-300 dark:hover:border-surface-600'
                        }`}
                      >
                        {platformLabels[p]}
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  onClick={handleRunPipeline}
                  disabled={runningPipeline || !pipelineTitle.trim() || !pipelinePrompt.trim() || targetPlatforms.length === 0}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-purple-600 to-primary-600 hover:from-purple-700 hover:to-primary-700 disabled:from-purple-400 disabled:to-primary-400 text-white rounded-lg text-sm font-medium transition-all"
                >
                  {runningPipeline ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Running Pipeline...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4" />
                      Run Full Pipeline
                    </>
                  )}
                </button>
              </div>
            </Card>
          </div>

          <Card>
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100 mb-4">Pipeline Steps</h3>
            <div className="space-y-4">
              {[
                { step: 1, label: 'Product Selection', desc: 'Pick a Shopify product or enter details', icon: ShoppingBag },
                { step: 2, label: 'Kling AI Video', desc: 'Generate 5s/10s video from image or text', icon: Film },
                { step: 3, label: 'AI Text Enhancement', desc: 'Claude generates captions, hashtags, CTAs', icon: Type },
                { step: 4, label: 'Social Publish', desc: 'Publish to all selected platforms', icon: Share2 },
              ].map((s) => (
                <div key={s.step} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-500/10 flex items-center justify-center text-primary-600 dark:text-primary-400 text-xs font-bold">
                      {s.step}
                    </div>
                    {s.step < 4 && <div className="w-px h-6 bg-surface-200 dark:bg-surface-700 mt-1" />}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <s.icon className="w-4 h-4 text-surface-500" />
                      <p className="text-sm font-medium text-surface-900 dark:text-surface-100">{s.label}</p>
                    </div>
                    <p className="text-xs text-surface-500 dark:text-surface-400 mt-0.5">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* Video Tasks Tab */}
      {activeTab === 'tasks' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">Video Generation Tasks</h3>
            <button
              onClick={() => refetchTasks()}
              className="p-2 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-surface-500" />
            </button>
          </div>

          {tasksError && <ApiErrorDisplay error={tasksError} />}

          {tasksLoading ? (
            <ListSkeleton />
          ) : tasks.length === 0 ? (
            <EmptyState icon={Video} title="No video tasks" message="No video tasks yet. Generate your first video above." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 dark:border-surface-700">
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Title</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Mode</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Duration</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Ratio</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Status</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Created</th>
                    <th className="text-left py-3 px-3 text-xs font-medium text-surface-500 dark:text-surface-400 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {tasks.map((task) => (
                    <tr key={task.id} className="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50">
                      <td className="py-3 px-3 font-medium text-surface-900 dark:text-surface-100 max-w-[200px] truncate">{task.title}</td>
                      <td className="py-3 px-3 text-surface-600 dark:text-surface-400">{task.mode.replace(/_/g, ' ')}</td>
                      <td className="py-3 px-3 text-surface-600 dark:text-surface-400">{task.duration}s</td>
                      <td className="py-3 px-3 text-surface-600 dark:text-surface-400">{task.aspectRatio}</td>
                      <td className="py-3 px-3">{getStatusBadge(task.status)}</td>
                      <td className="py-3 px-3 text-surface-500 dark:text-surface-400 text-xs">
                        {new Date(task.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-3">
                        {task.videoUrl && (
                          <a
                            href={task.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary-600 dark:text-primary-400 hover:underline text-xs"
                          >
                            View
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Pipeline Runs Tab */}
      {activeTab === 'pipelines' && (
        <Card>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-surface-900 dark:text-surface-100">Pipeline Runs</h3>
            <button
              onClick={() => refetchPipelines()}
              className="p-2 hover:bg-surface-100 dark:hover:bg-surface-800 rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4 text-surface-500" />
            </button>
          </div>

          {pipelinesError && <ApiErrorDisplay error={pipelinesError} />}

          {pipelinesLoading ? (
            <ListSkeleton />
          ) : pipelines.length === 0 ? (
            <EmptyState icon={Send} title="No pipeline runs" message="No pipeline runs yet. Run your first full pipeline above." />
          ) : (
            <div className="space-y-3">
              {pipelines.map((run) => (
                <div
                  key={run.id}
                  className="p-4 rounded-lg border border-surface-200 dark:border-surface-700 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      {getStatusBadge(run.status)}
                      <span className="text-xs text-surface-500 dark:text-surface-400">
                        {new Date(run.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-xs font-mono text-surface-400">{run.id.slice(0, 8)}...</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {run.targetPlatforms.map((p) => (
                      <span
                        key={p}
                        className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-400"
                      >
                        {platformLabels[p as SocialPlatform] ?? p}
                      </span>
                    ))}
                  </div>
                  {run.results && typeof run.results === 'object' && 'videoUrl' in run.results && (
                    <div className="mt-2 text-xs text-primary-600 dark:text-primary-400">
                      Video generated &middot; {(run.results as Record<string, unknown>).enhancementCount as number ?? 0} text enhancements
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
