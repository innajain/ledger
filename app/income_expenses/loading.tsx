import { ListSkeleton } from '../_components/ListSkeleton'

export default function Loading() {
  return <ListSkeleton itemCount={7} headerWidth="w-36 sm:w-48" buttonWidth="w-full sm:w-48" variant="hierarchy" />
}
