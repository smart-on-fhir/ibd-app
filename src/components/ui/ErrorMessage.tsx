import { TriangleAlert } from "lucide-react"

interface ErrorMessageProps {
  message: string
}

export function ErrorMessage({ message }: ErrorMessageProps) {
  return (
    <div className="rounded-md bg-red-50 p-4 text-sm text-red-700 border border-red-200 flex items-center gap-2">
      <div>
        <TriangleAlert className="h-6 w-6 flex-shrink-0 fill-red-500/20" aria-hidden="true" />
      </div>
      <div>
        {message}
      </div>
    </div>
  )
}
