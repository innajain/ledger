import { ListSkeleton } from '@/app/_components/ListSkeleton'

export default function Loading() {
  return <ListSkeleton itemCount={8} headerWidth="w-40 sm:w-56" buttonWidth="w-full sm:w-40" variant="list" />
}
