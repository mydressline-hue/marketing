import { useState, useEffect, useCallback } from 'react';
import {
  Cpu, Activity, CheckCircle, AlertTriangle, XCircle, RefreshCw,
  Play, Pause, ChevronDown, ChevronUp, Zap, Clock, Wifi, WifiOff
} from 'lucide-react';
import PageHeader from '../components/shared/PageHeader';
import Card from '../components/shared/Card';
import StatusBadge from '../components/shared/StatusBadge';
import ConfidenceScore from '../components/shared/ConfidenceScore';
import { KPISkeleton, CardSkeleton, TableSkeleton, ChartSkeleton } from '../components/shared/LoadingSkeleton';
import { ApiErrorDisplay } from '../components/shared/ErrorBoundary';
import EmptyState from '../components/shared/EmptyState';
import { useApiQuery, useApiMutation } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
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

interface DecisionItem {
  decision: string;
  sources: string;
  confidence: number;
  impact: string;
  status: string;
}

interface Contradiction {
  agents: string[];
  issue: string;
  resolution: string;
  status: string;
}

interface CrossChallengeResult {
  contradictions: Contradiction[];
  systemHealth: { metric: string; value: number }[];
}

interface OrchestrationResult {
  success: boolean;
  message: string;
}

export default function Orchestrator() {
  const [expandedAgent, setExpandedAgent] = useState<number | null>(null);

  // API queries
  const {
    data: agents,
    loading: agentsLoading,
    error: agentsError,
    refetch: refetchAgents,
  } = useApiQuery<AgentDetail[]>('/v1/agents');

  const {
    data: decisions,
    loading: decisionsLoading,
    error: decisionsError,
    refetch: refetchDecisions,
  } = useApiQuery<DecisionItem[]>('/v1/agents/orchestrator/decisions');

  const {
    data: crossChallenge,
    loading: crossChallengeLoading,
    error: crossChallengeError,
    refetch: refetchCrossChallenge,
  } = useApiQuery<CrossChallengeResult>('/v1/agents/challenge/run');

  // Mutation for running orchestration cycle
  const {
    mutate: executeOrchestration,
    loading: orchestrating,
  } = useApiMutation<OrchestrationResult>('/v1/agents/orchestrate', { method: 'POST' });

  // WebSocket for live agent updates
  const { connected, subscribe } = useWebSocket();

  useEffect(() => {
    const unsubAgents = subscribe('agent_status_update', () => {
      refetchAgents();
    });
    const unsubDecisions = subscribe('decision_update', () => {
      refetchDecisions();
    });
    const unsubCrossChallenge = subscribe('cross_challenge_update', () => {
      refetchCrossChallenge();
    });
    return () => {
      unsubAgents();
      unsubDecisions();
      unsubCrossChallenge();
    };
  }, [subscribe, refetchAgents, refetchDecisions, refetchCrossChallenge]);

  const handleRunOrchestration = useCallback(async () => {
    await executeOrchestration({});
    refetchAgents();
    refetchDecisions();
    refetchCrossChallenge();
  }, [executeOrchestration, refetchAgents, refetchDecisions, refetchCrossChallenge]);

  // Derived data
  const agentList = agents || [];
  const contradictions = crossChallenge?.contradictions || [];
  const systemHealth = crossChallenge?.systemHealth || [];

  const activeCount = agentList.filter(a => a.status === 'active').length;
  const avgConfidence = agentList.length > 0
    ? Math.round(agentList.reduce((s, a) => s + a.confidence, 0) / agentList.length)
    : 0;
  const totalCompleted = agentList.reduce((s, a) => s + a.tasksCompleted, 0);
  const unresolvedContradictions = contradictions.filter(c => c.status !== 'completed').length;

  const performanceData = agentList.slice(0, 10).map(a => ({
    name: a.name.split(' ')[0],
    confidence: a.confidence,
    tasks: a.tasksCompleted,
  }));

  const isLoading = agentsLoading && decisionsLoading && crossChallengeLoading;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Orchestrator"
        subtitle="Agent Coordination, Cross-Challenge Protocol & Decision Matrix"
        icon={<Cpu className="w-5 h-5" />}
        actions={
          <div className="flex items-center gap-2">
            <span className={`flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
              connected ? 'bg-success-50 text-success-700' : 'bg-surface-100 text-surface-500'
            }`}>
              {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
              {connected ? 'Live' : 'Offline'}
            </span>
            <button
              onClick={handleRunOrchestration}
              disabled={orchestrating}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-4 h-4 ${orchestrating ? 'animate-spin' : ''}`} />
              {orchestrating ? 'Running...' : 'Run Orchestration'}
            </button>
          </div>
        }
      />

      {/* KPI cards */}
      {isLoading ? (
        <KPISkeleton count={4} />
      ) : (
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
            <p className="text-2xl font-bold">{totalCompleted.toLocaleString()}</p>
          </div>
          <div className="bg-white rounded-xl border border-surface-200 p-5">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="w-4 h-4 text-warning-600" />
              <span className="text-sm text-surface-500">Contradictions</span>
            </div>
            <p className="text-2xl font-bold">{unresolvedContradictions}</p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          {agentsLoading ? (
            <CardSkeleton lines={10} />
          ) : agentsError ? (
            <ApiErrorDisplay error={agentsError} onRetry={refetchAgents} />
          ) : agentList.length === 0 ? (
            <Card title="Agent Status Matrix" subtitle="All 20 agents with real-time status">
              <EmptyState
                icon={<Cpu className="w-6 h-6 text-surface-400" />}
                title="No agents found"
                description="Agent status data is not yet available."
              />
            </Card>
          ) : (
            <Card title="Agent Status Matrix" subtitle="All 20 agents with real-time status">
              <div className="space-y-1">
                {agentList.map(agent => (
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
          )}
        </div>

        <div className="space-y-6">
          {crossChallengeLoading ? (
            <>
              <ChartSkeleton height={250} />
              <ChartSkeleton height={250} />
            </>
          ) : crossChallengeError ? (
            <ApiErrorDisplay error={crossChallengeError} onRetry={refetchCrossChallenge} />
          ) : (
            <>
              <Card title="System Health" subtitle="Overall performance metrics">
                {systemHealth.length === 0 ? (
                  <EmptyState title="No health data" description="System health metrics are not yet available." />
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <RadarChart data={systemHealth}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748b' }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Radar dataKey="value" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.2} strokeWidth={2} />
                    </RadarChart>
                  </ResponsiveContainer>
                )}
              </Card>

              <Card title="Agent Performance" subtitle="Confidence & task count">
                {performanceData.length === 0 ? (
                  <EmptyState title="No performance data" description="Agent performance data is not yet available." />
                ) : (
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
                )}
              </Card>
            </>
          )}
        </div>
      </div>

      {/* Contradiction Detection */}
      {crossChallengeLoading ? (
        <CardSkeleton lines={3} />
      ) : crossChallengeError ? (
        <ApiErrorDisplay error={crossChallengeError} onRetry={refetchCrossChallenge} compact />
      ) : (
        <Card title="Contradiction Detection" subtitle="Cross-agent inconsistencies and resolutions"
          actions={
            <span className="text-xs font-medium text-warning-600 bg-warning-50 px-2 py-1 rounded-full">
              {unresolvedContradictions} unresolved
            </span>
          }
        >
          {contradictions.length === 0 ? (
            <EmptyState
              icon={<CheckCircle className="w-6 h-6 text-success-400" />}
              title="No contradictions"
              description="All agents are in agreement. No cross-agent contradictions detected."
            />
          ) : (
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
          )}
        </Card>
      )}

      {/* Decision Matrix */}
      {decisionsLoading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : decisionsError ? (
        <ApiErrorDisplay error={decisionsError} onRetry={refetchDecisions} />
      ) : (
        <Card title="Decision Matrix" subtitle="Final aggregated recommendations">
          {!decisions || decisions.length === 0 ? (
            <EmptyState
              icon={<XCircle className="w-6 h-6 text-surface-400" />}
              title="No decisions yet"
              description="Run an orchestration cycle to generate decision matrix recommendations."
              action={
                <button
                  onClick={handleRunOrchestration}
                  disabled={orchestrating}
                  className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${orchestrating ? 'animate-spin' : ''}`} />
                  Run Orchestration
                </button>
              }
            />
          ) : (
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
                  {decisions.map((d, i) => (
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
          )}
        </Card>
      )}
    </div>
  );
}
