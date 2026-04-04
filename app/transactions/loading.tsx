import { ListSkeleton } from '../_components/ListSkeleton'

export default function Loading() {
  return <ListSkeleton itemCount={8} headerWidth="w-32 sm:w-40" buttonWidth="w-full sm:w-48" variant="list" />
}
