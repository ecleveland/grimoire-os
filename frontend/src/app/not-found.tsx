import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-2xl mx-auto text-center py-12">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Page not found</h1>
      <p className="mt-2 text-gray-600 dark:text-gray-400">
        The page you asked for does not exist or has moved.
      </p>
      <Link
        href="/"
        className="mt-6 inline-block rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
      >
        Go home
      </Link>
    </div>
  );
}
