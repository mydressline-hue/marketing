interface ConfidenceScoreProps {
  score: number;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
}

export default function ConfidenceScore({ score, size = 'md', showLabel = true }: ConfidenceScoreProps) {
  const getColor = (s: number) => {
    if (s >= 80) return { ring: 'text-success-500', bg: 'bg-success-50', text: 'text-success-700' };
    if (s >= 60) return { ring: 'text-primary-500', bg: 'bg-primary-50', text: 'text-primary-700' };
    if (s >= 40) return { ring: 'text-warning-500', bg: 'bg-warning-50', text: 'text-warning-700' };
    return { ring: 'text-danger-500', bg: 'bg-danger-50', text: 'text-danger-700' };
  };

  const colors = getColor(score);
  const dimensions = size === 'sm' ? 'w-10 h-10' : size === 'md' ? 'w-14 h-14' : 'w-20 h-20';
  const textSize = size === 'sm' ? 'text-xs' : size === 'md' ? 'text-sm' : 'text-lg';
  const circumference = 2 * Math.PI * 18;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex items-center gap-2">
      <div className={`relative ${dimensions} flex items-center justify-center`}>
        <svg className="w-full h-full -rotate-90" viewBox="0 0 40 40">
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3"
            className="text-surface-200" />
          <circle cx="20" cy="20" r="18" fill="none" stroke="currentColor" strokeWidth="3"
            className={colors.ring}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round" />
        </svg>
        <span className={`absolute ${textSize} font-bold ${colors.text}`}>{score}</span>
      </div>
      {showLabel && (
        <span className={`text-xs font-medium ${colors.text} ${colors.bg} px-2 py-0.5 rounded-full`}>
          {score >= 80 ? 'High' : score >= 60 ? 'Good' : score >= 40 ? 'Medium' : 'Low'}
        </span>
      )}
    </div>
  );
}
