import { ListSkeleton } from '../_components/ListSkeleton';

export default function Loading() {
  return <ListSkeleton itemCount={5} headerWidth="w-24 sm:w-32" buttonWidth="w-full sm:w-40" variant="hierarchy" />;
}
