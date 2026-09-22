export function ProgressBar({ value, label }: { value: number; label?: string }) {
  const clamped = Math.min(100, Math.max(0, value))

  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 w-full max-w-xs mx-auto">
      { label && <p className="text-sm text-gray-500">{label}</p> }
      <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
        <div
          className="h-full rounded-full bg-indigo-600 transition-[width] duration-200 ease-out"
          style={{ width: `${clamped}%` }}
          role="progressbar"
          aria-valuenow={clamped}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
      <p className="text-xs text-gray-400 tabular-nums">{clamped}%</p>
    </div>
  )
}
