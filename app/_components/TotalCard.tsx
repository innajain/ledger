type TotalCardProps = {
  title: string;
  total: string;
  colorScheme: 'purple' | 'green' | 'orange' | 'blue';
  icon: React.ReactNode;
};

const colorSchemes = {
  purple: {
    bg: 'from-purple-50 to-purple-100 dark:from-purple-950 dark:to-purple-900',
    border: 'border-purple-200 dark:border-purple-800',
    text: 'text-purple-900 dark:text-purple-100',
    iconBg: 'bg-purple-600 dark:bg-purple-500',
  },
  green: {
    bg: 'from-green-50 to-green-100 dark:from-green-950 dark:to-green-900',
    border: 'border-green-200 dark:border-green-800',
    text: 'text-green-900 dark:text-green-100',
    iconBg: 'bg-green-600 dark:bg-green-500',
  },
  orange: {
    bg: 'from-orange-50 to-orange-100 dark:from-orange-950 dark:to-orange-900',
    border: 'border-orange-200 dark:border-orange-800',
    text: 'text-orange-900 dark:text-orange-100',
    iconBg: 'bg-orange-600 dark:bg-orange-500',
  },
  blue: {
    bg: 'from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900',
    border: 'border-blue-200 dark:border-blue-800',
    text: 'text-blue-900 dark:text-blue-100',
    iconBg: 'bg-blue-600 dark:bg-blue-500',
  },
};

export function TotalCard({ title, total, colorScheme, icon }: TotalCardProps) {
  const colors = colorSchemes[colorScheme];

  return (
    <div className={`bg-gradient-to-br ${colors.bg} rounded-xl shadow-sm border ${colors.border} p-4 sm:p-6 transition-all hover-lift animate-scale-in`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex-1 min-w-0">
          <h2 className={`text-xs sm:text-sm font-medium ${colors.text} mb-1`}>{title}</h2>
          <p className={`text-2xl sm:text-3xl lg:text-4xl font-bold ${colors.text} truncate`}>{total}</p>
        </div>
        <div className={`w-12 h-12 sm:w-14 sm:h-14 lg:w-16 lg:h-16 ${colors.iconBg} rounded-lg flex items-center justify-center flex-shrink-0 transition-transform hover:scale-110`}>
          {icon}
        </div>
      </div>
    </div>
  );
}