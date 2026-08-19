export function IBDOverviewWidget() {
  return (
    <dl className="space-y-2.5 text-sm">
      <div>
        <dt className="text-xs text-gray-400">Disease activity</dt>
        <dd className="font-medium text-amber-700">Mild — Harvey-Bradshaw 5</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-400">Current biologic</dt>
        <dd className="text-gray-800">Ustekinumab (Stelara) — q8w SC</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-400">Last infusion / injection</dt>
        <dd className="text-gray-800">21 days ago</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-400">Next due</dt>
        <dd className="font-medium text-amber-700">In 6 days</dd>
      </div>
      <div>
        <dt className="text-xs text-gray-400">Latest CRP</dt>
        <dd className="font-medium text-red-600">
          8.2 mg/L{' '}
          <span className="text-xs font-normal text-gray-400">↑ elevated</span>
        </dd>
      </div>
      <div>
        <dt className="text-xs text-gray-400">Latest fecal calprotectin</dt>
        <dd className="text-gray-800">412 µg/g</dd>
      </div>
    </dl>
  )
}
