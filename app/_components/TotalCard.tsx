type TotalCardProps = {
  title: string;
  total: string;
  colorScheme: 'purple' | 'green' | 'orange' | 'blue';
  icon: React.ReactNode;
};

const colorSchemes = {
  purple: {
    bg: 'from-purple-50 to-purple-100',
    border: 'border-purple-200',
    text: 'text-purple-900',
    iconBg: 'bg-purple-600',
  },
  green: {
    bg: 'from-green-50 to-green-100',
    border: 'border-green-200',
    text: 'text-green-900',
    iconBg: 'bg-green-600',
  },
  orange: {
    bg: 'from-orange-50 to-orange-100',
    border: 'border-orange-200',
    text: 'text-orange-900',
    iconBg: 'bg-orange-600',
  },
  blue: {
    bg: 'from-blue-50 to-blue-100',
    border: 'border-blue-200',
    text: 'text-blue-900',
    iconBg: 'bg-blue-600',
  },
};

export function TotalCard({ title, total, colorScheme, icon }: TotalCardProps) {
  const colors = colorSchemes[colorScheme];

  return (
    <div className={`bg-gradient-to-br ${colors.bg} rounded-xl shadow-sm border ${colors.border} p-6`}>
      <div className="flex items-center justify-between">
        <div>
          <h2 className={`text-sm font-medium ${colors.text} mb-1`}>{title}</h2>
          <p className={`text-4xl font-bold ${colors.text}`}>{total}</p>
        </div>
        <div className={`w-16 h-16 ${colors.iconBg} rounded-lg flex items-center justify-center`}>
          {icon}
        </div>
      </div>
    </div>
  );
}