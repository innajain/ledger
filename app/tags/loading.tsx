import { ListSkeleton } from '../_components/ListSkeleton'

export default function Loading() {
  return <ListSkeleton itemCount={6} headerWidth="w-24 sm:w-32" buttonWidth="w-full sm:w-36" variant="grid" />
}
