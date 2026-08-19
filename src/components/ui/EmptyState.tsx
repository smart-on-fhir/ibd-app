interface EmptyStateProps {
  message: string
}

export function EmptyState({ message }: EmptyStateProps) {
  return (
    <div className="flex items-center justify-center p-12 text-sm text-gray-400">
      {message}
    </div>
  )
}
