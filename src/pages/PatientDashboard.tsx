import { useClinicalData, lib } from "clinical-primitives";


export function PatientDashboard() {
  const { patient } = useClinicalData();

  return (
    <div className="p-6">
      <h1 className="mb-5 text-xl font-semibold text-stone-900">Overview</h1>

      <div className="mb-10 text-sm">
        <div className="text-sky-600 border-b border-stone-200 mb-2 pb-1 tracking-wider text-xs">NAMES</div>
        {Array.isArray(patient?.name) && <table>
          <tbody>
            {patient?.name.map((n, i) => (
              <tr key={i}>
                <td className="text-stone-500 text-end px-2 capitalize">{n.use}:</td>
                <td>{lib.Person.displayName(n)}</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>

      <div className="mb-10 text-sm">
        <div className="text-sky-600 border-b border-stone-200 mb-2 pb-1 tracking-wider text-xs">IDENTIFIERS</div>
        {Array.isArray(patient?.identifier) && <table>
          <tbody>
            {patient?.identifier.map((id, i) => (
              <tr key={i}>
                <td className="text-stone-500 text-end px-2 capitalize">{id.type?.text ?? id.system?.split('/').pop() ?? '--'}:</td>
                <td>{id.value}</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>

      <div className="mb-10 text-sm">
        <div className="text-sky-600 border-b border-stone-200 mb-2 pb-1 tracking-wider text-xs">ADDRESSES</div>
        {Array.isArray(patient?.address) && <table>
          <tbody>
            {patient?.address.map((a, i) => (
              <tr key={i}>
                <td className="px-2">{lib.Person.displayAddress(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>}
      </div>
    </div>
  )
}
