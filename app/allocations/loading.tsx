import { ListSkeleton } from '../_components/ListSkeleton'

export default function Loading() {
  return <ListSkeleton itemCount={6} headerWidth="w-32 sm:w-40" buttonWidth="w-full sm:w-48" variant="hierarchy" />
}
