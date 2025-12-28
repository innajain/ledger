import Link from 'next/link';

type PageHeaderProps = {
  title: string;
  description: string;
  createUrl: string;
  createLabel: string;
};

export function PageHeader({ title, description, createUrl, createLabel }: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-100">{title}</h1>
        <p className="text-slate-600 dark:text-slate-400 mt-1">{description}</p>
      </div>
      <Link
        href={createUrl}
        className="px-4 py-2 bg-blue-600 dark:bg-blue-500 text-white rounded-lg hover:bg-blue-700 dark:hover:bg-blue-600 transition-colors font-medium shadow-sm"
      >
        {createLabel}
      </Link>
    </div>
  );
}