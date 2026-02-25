import { useState } from 'react';
import {
  Cpu, Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Play, Pause, ChevronDown, ChevronUp, Zap, Clock
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis
} from 'recharts';

interface AgentDetail {
  id: number;
  name: string;
  status: 'active' | 'idle' | 'warning' | 'error';
  confidence: number;
  tasksCompleted: number;
  tasksPending: number;
  lastAction: string;
  lastUpdated: string;
  challenges: string[];
  crossChallengedBy: string[];
}

const agents: AgentDetail[] = [
  { id: 1, name: 'Market Intelligence', status: 'active', confidence: 92, tasksCompleted: 48, tasksPending: 3, lastAction: 'Updated country rankings for Q1', lastUpdated: '2 min ago', challenges: ['Country Strategy', 'Revenue Forecast', 'Budget Optimizer'], crossChallengedBy: ['Competitive Intel'] },
  { id: 2, name: 'Country Strategy', status: 'active', confidence: 88, tasksCompleted: 35, tasksPending: 5, lastAction: 'Generated UAE market entry blueprint', lastUpdated: '5 min ago', challenges: ['Paid Ads', 'Localization', 'Compliance'], crossChallengedBy: ['Market Intelligence'] },
  { id: 3, name: 'Paid Ads Architecture', status: 'active', confidence: 91, tasksCompleted: 127, tasksPending: 12, lastAction: 'Optimized Google US bidding strategy', lastUpdated: '1 min ago', challenges: ['Budget Optimizer', 'A/B Testing', 'Fraud Detection'], crossChallengedBy: ['Analytics'] },
  { id: 4, name: 'Organic Social', status: 'active', confidence: 85, tasksCompleted: 342, tasksPending: 8, lastAction: 'Scheduled 12 posts for tomorrow', lastUpdated: '3 min ago', challenges: ['Creative Studio', 'Brand Consistency', 'Localization'], crossChallengedBy: ['Content & Blog'] },
  { id: 5, name: 'Content & Blog', status: 'active', confidence: 87, tasksCompleted: 89, tasksPending: 7, lastAction: 'Published SEO article for DE market', lastUpdated: '8 min ago', challenges: ['Shopify', 'Localization', 'Brand Consistency'], crossChallengedBy: ['Organic Social'] },
  { id: 6, name: 'Creative Studio', status: 'active', confidence: 83, tasksCompleted: 1247, tasksPending: 15, lastAction: 'Generated TikTok ad variants', lastUpdated: '4 min ago', challenges: ['Brand Consistency', 'A/B Testing', 'Paid Ads'], crossChallengedBy: ['Brand Consistency'] },
  { id: 7, name: 'Analytics', status: 'active', confidence: 94, tasksCompleted: 56, tasksPending: 2, lastAction: 'Updated attribution model', lastUpdated: '1 min ago', challenges: ['Revenue Forecast', 'Budget Optimizer', 'Data Engineering'], crossChallengedBy: ['Revenue Forecast'] },
  { id: 8, name: 'Budget Optimizer', status: 'active', confidence: 90, tasksCompleted: 34, tasksPending: 4, lastAction: 'Reallocated $15K from Snap to TikTok UK', lastUpdated: '6 min ago', challenges: ['Paid Ads', 'Revenue Forecast', 'Fraud Detection'], crossChallengedBy: ['Analytics'] },
  { id: 9, name: 'A/B Testing', status: 'active', confidence: 86, tasksCompleted: 46, tasksPending: 12, lastAction: 'Declared winner for landing page test', lastUpdated: '12 min ago', challenges: ['Conversion', 'Creative Studio', 'Paid Ads'], crossChallengedBy: ['Analytics'] },
  { id: 10, name: 'Conversion', status: 'active', confidence: 82, tasksCompleted: 28, tasksPending: 6, lastAction: 'Analyzed checkout funnel drop-offs', lastUpdated: '15 min ago', challenges: ['A/B Testing', 'Shopify', 'Data Engineering'], crossChallengedBy: ['A/B Testing'] },
  { id: 11, name: 'Shopify Integration', status: 'active', confidence: 95, tasksCompleted: 324, tasksPending: 1, lastAction: 'Synced 248 products successfully', lastUpdated: '30 sec ago', challenges: ['Data Engineering', 'Content & Blog', 'Conversion'], crossChallengedBy: ['Data Engineering'] },
  { id: 12, name: 'Localization', status: 'active', confidence: 89, tasksCompleted: 156, tasksPending: 22, lastAction: 'Completed Japanese translation batch', lastUpdated: '20 min ago', challenges: ['Brand Consistency', 'Content & Blog', 'Compliance'], crossChallengedBy: ['Country Strategy'] },
  { id: 13, name: 'Compliance', status: 'warning', confidence: 78, tasksCompleted: 14, tasksPending: 3, lastAction: 'Flagged UAE ad for review', lastUpdated: '7 min ago', challenges: ['Paid Ads', 'Content & Blog', 'Localization'], crossChallengedBy: ['Security'] },
  { id: 14, name: 'Competitive Intel', status: 'active', confidence: 81, tasksCompleted: 67, tasksPending: 4, lastAction: 'Detected competitor price change', lastUpdated: '10 min ago', challenges: ['Market Intelligence', 'Country Strategy', 'Paid Ads'], crossChallengedBy: ['Market Intelligence'] },
  { id: 15, name: 'Fraud Detection', status: 'active', confidence: 97, tasksCompleted: 892, tasksPending: 7, lastAction: 'Blocked $2.4K click fraud', lastUpdated: '45 sec ago', challenges: ['Paid Ads', 'Data Engineering', 'Budget Optimizer'], crossChallengedBy: ['Security'] },
  { id: 16, name: 'Brand Consistency', status: 'active', confidence: 94, tasksCompleted: 142, tasksPending: 4, lastAction: 'Verified 12 new creatives', lastUpdated: '9 min ago', challenges: ['Creative Studio', 'Organic Social', 'Localization'], crossChallengedBy: ['Creative Studio'] },
  { id: 17, name: 'Data Engineering', status: 'active', confidence: 96, tasksCompleted: 2400, tasksPending: 0, lastAction: 'All pipelines healthy', lastUpdated: '10 sec ago', challenges: ['Analytics', 'Shopify', 'Security'], crossChallengedBy: ['Fraud Detection'] },
  { id: 18, name: 'Security', status: 'active', confidence: 95, tasksCompleted: 147, tasksPending: 1, lastAction: 'Completed API key rotation', lastUpdated: '2 hr ago', challenges: ['Data Engineering', 'Compliance', 'Fraud Detection'], crossChallengedBy: ['Compliance'] },
  { id: 19, name: 'Revenue Forecast', status: 'idle', confidence: 88, tasksCompleted: 12, tasksPending: 2, lastAction: 'Generated Q2 projections', lastUpdated: '1 hr ago', challenges: ['Analytics', 'Budget Optimizer', 'Market Intelligence'], crossChallengedBy: ['Analytics'] },
  { id: 20, name: 'Orchestrator', status: 'active', confidence: 93, tasksCompleted: 580, tasksPending: 0, lastAction: 'Cross-challenge cycle completed', lastUpdated: 'now', challenges: ['All Agents'], crossChallengedBy: [] },
];

const performanceData = agents.slice(0, 10).map(a => ({
  name: a.name.split(' ')[0],
  confidence: a.confidence,
  tasks: a.tasksCompleted,
}));

const systemHealth = [
  { metric: 'Agent Uptime', value: 99 },
  { metric: 'Data Freshness', value: 97 },
  { metric: 'Cross-Challenge', value: 92 },
  { metric: 'Decision Speed', value: 88 },
  { metric: 'Risk Awareness', value: 95 },
  { metric: 'Accuracy', value: 91 },
];

const contradictions = [
  { agents: ['Budget Optimizer', 'Paid Ads'], issue: 'Budget Optimizer recommends pausing Snap DE, but Paid Ads sees emerging traction', resolution: 'Pending review - reduced budget by 50% as compromise', status: 'in_progress' },
  { agents: ['Market Intelligence', 'Country Strategy'], issue: 'Market Intel ranks India #4 but Country Strategy flags regulatory complexity', resolution: 'Adjusted risk score, India moved to #6', status: 'completed' },
  { agents: ['Compliance', 'Creative Studio'], issue: 'UAE ad copy flagged for potential cultural sensitivity', resolution: 'Awaiting human review', status: 'warning' },
];

export default function Orchestrator() {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  const activeCount = agents.filter(a => a.status === 'active').length;
  const avgConfidence = Math.round(agents.reduce((s, a) => s + a.confidence, 0) / agents.length);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Orchestrator"
        subtitle="Agent Coordination, Cross-Challenge Protocol & Decision Matrix"
        icon={<Cpu className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors">
              <RefreshCw className="w-4 h-4" /> Run Cross-Challenge
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-success-600" />
            <span className="text-sm text-surface-500">Active Agents</span>
          </div>
          <p className="text-2xl font-bold">{activeCount}/20</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap className="w-4 h-4 text-primary-600" />
            <span className="text-sm text-surface-500">Avg Confidence</span>
          </div>
          <p className="text-2xl font-bold">{avgConfidence}%</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle className="w-4 h-4 text-success-600" />
            <span className="text-sm text-surface-500">Tasks Completed</span>
          </div>
          <p className="text-2xl font-bold">{agents.reduce((s, a) => s + a.tasksCompleted, 0).toLocaleString()}</p>
        </div>
        <div className="bg-white rounded-xl border border-surface-200 p-5">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-warning-600" />
            <span className="text-sm text-surface-500">Contradictions</span>
          </div>
          <p className="text-2xl font-bold">{contradictions.filter(c => c.status !== 'completed').length}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card title="Agent Status Matrix" subtitle="All 20 agents with real-time status">
            <div className="space-y-1">
              {agents.map(agent => (
                <div key={agent.id} className="border border-surface-100 rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedAgent(expandedAgent === agent.id ? null : agent.id)}
                    className="w-full flex items-center justify-between p-3 hover:bg-surface-50 transition-colors text-left"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2.5 h-2.5 rounded-full ${
                        agent.status === 'active' ? 'bg-success-500' :
                        agent.status === 'idle' ? 'bg-surface-400' :
                        agent.status === 'warning' ? 'bg-warning-500' : 'bg-danger-500'
                      }`} />
                      <span className="text-sm font-medium text-surface-900">{agent.id}. {agent.name}</span>
                      <StatusBadge status={agent.status} />
                    </div>
                    <div className="flex items-center gap-4">
                      <ConfidenceScore score={agent.confidence} size="sm" showLabel={false} />
                      <span className="text-xs text-surface-500 hidden sm:inline">{agent.lastUpdated}</span>
                      {expandedAgent === agent.id ? <ChevronUp className="w-4 h-4 text-surface-400" /> : <ChevronDown className="w-4 h-4 text-surface-400" />}
                    </div>
                  </button>
                  {expandedAgent === agent.id && (
                    <div className="px-3 pb-3 border-t border-surface-100 bg-surface-50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3 text-sm">
                        <div>
                          <p className="text-surface-500 mb-1">Last Action</p>
                          <p className="text-surface-800">{agent.lastAction}</p>
                        </div>
                        <div>
                          <p className="text-surface-500 mb-1">Tasks</p>
                          <p className="text-surface-800">{agent.tasksCompleted} completed, {agent.tasksPending} pending</p>
                        </div>
                        <div>
                          <p className="text-surface-500 mb-1">Challenges</p>
                          <div className="flex flex-wrap gap-1">
                            {agent.challenges.map(c => (
                              <span key={c} className="px-2 py-0.5 bg-primary-50 text-primary-700 text-xs rounded-full">{c}</span>
                            ))}
                          </div>
                        </div>
                        <div>
                          <p className="text-surface-500 mb-1">Challenged By</p>
                          <div className="flex flex-wrap gap-1">
                            {agent.crossChallengedBy.map(c => (
                              <span key={c} className="px-2 py-0.5 bg-warning-50 text-warning-700 text-xs rounded-full">{c}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-surface-200 rounded-lg hover:bg-surface-50">
                          <Play className="w-3 h-3" /> Run
                        </button>
                        <button className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-surface-200 rounded-lg hover:bg-surface-50">
                          <Pause className="w-3 h-3" /> Pause
                        </button>
                        <button className="flex items-center gap-1 px-3 py-1.5 text-xs bg-white border border-surface-200 rounded-lg hover:bg-surface-50">
                          <RefreshCw className="w-3 h-3" /> Reset
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="System Health" subtitle="Overall performance metrics">
            <ResponsiveContainer width="100%" height={250}>
              <RadarChart data={systemHealth}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </Card>

          <Card title="Agent Performance" subtitle="Confidence & task count">
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={performanceData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={70} />
                <Tooltip
                  contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', fontSize: '12px' }}
                />
                <Bar dataKey="confidence" fill="#3b82f6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>
      </div>

      <Card title="Contradiction Detection" subtitle="Cross-agent inconsistencies and resolutions"
        actions={
          <span className="text-xs font-medium text-warning-600 bg-warning-50 px-2 py-1 rounded-full">
            {contradictions.filter(c => c.status !== 'completed').length} unresolved
          </span>
        }
      >
        <div className="space-y-3">
          {contradictions.map((c, i) => (
            <div key={i} className={`p-4 rounded-lg border ${
              c.status === 'completed' ? 'border-success-200 bg-success-50/30' :
              c.status === 'warning' ? 'border-warning-200 bg-warning-50/30' :
              'border-primary-200 bg-primary-50/30'
            }`}>
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  {c.status === 'completed' ? <CheckCircle className="w-4 h-4 text-success-600" /> :
                   c.status === 'warning' ? <AlertTriangle className="w-4 h-4 text-warning-600" /> :
                   <Clock className="w-4 h-4 text-primary-600" />}
                  <div className="flex gap-1">
                    {c.agents.map(a => (
                      <span key={a} className="px-2 py-0.5 bg-white border border-surface-200 text-xs font-medium rounded-full">{a}</span>
                    ))}
                  </div>
                </div>
                <StatusBadge status={c.status} />
              </div>
              <p className="text-sm text-surface-800 mb-1"><strong>Issue:</strong> {c.issue}</p>
              <p className="text-sm text-surface-600"><strong>Resolution:</strong> {c.resolution}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Decision Matrix" subtitle="Final aggregated recommendations">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-3 px-4 font-semibold text-surface-600">Decision</th>
                <th className="text-left py-3 px-4 font-semibold text-surface-600">Source Agents</th>
                <th className="text-left py-3 px-4 font-semibold text-surface-600">Confidence</th>
                <th className="text-left py-3 px-4 font-semibold text-surface-600">Impact</th>
                <th className="text-left py-3 px-4 font-semibold text-surface-600">Status</th>
              </tr>
            </thead>
            <tbody>
              {[
                { decision: 'Scale Google US +20%', sources: 'Paid Ads, Budget, Analytics', confidence: 94, impact: 'High', status: 'active' },
                { decision: 'Launch TikTok UK campaign', sources: 'Country Strategy, Creative', confidence: 87, impact: 'Medium', status: 'active' },
                { decision: 'Pause Snap DE campaigns', sources: 'Budget, Fraud Detection', confidence: 82, impact: 'Low', status: 'review' },
                { decision: 'Enter UAE market Q2', sources: 'Market Intel, Country Strategy', confidence: 76, impact: 'High', status: 'planned' },
                { decision: 'Rotate Meta ad creatives', sources: 'Creative, A/B Testing', confidence: 91, impact: 'Medium', status: 'active' },
              ].map((d, i) => (
                <tr key={i} className="border-b border-surface-100 hover:bg-surface-50">
                  <td className="py-3 px-4 font-medium text-surface-900">{d.decision}</td>
                  <td className="py-3 px-4 text-surface-600">{d.sources}</td>
                  <td className="py-3 px-4"><ConfidenceScore score={d.confidence} size="sm" showLabel={false} /></td>
                  <td className="py-3 px-4"><StatusBadge status={d.impact.toLowerCase()} /></td>
                  <td className="py-3 px-4"><StatusBadge status={d.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
