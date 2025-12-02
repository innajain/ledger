import Link from 'next/link';

type EmptyStateProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  actionUrl: string;
  actionLabel: string;
};

export function EmptyState({ icon, title, description, actionUrl, actionLabel }: EmptyStateProps) {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-12 text-center">
      <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-medium text-slate-900 mb-2">{title}</h3>
      <p className="text-slate-600 mb-6">{description}</p>
      <Link
        href={actionUrl}
        className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
      >
        {actionLabel}
      </Link>
    </div>
  );
}