import { useState, useEffect }        from 'react'
import { ChevronRight }               from 'lucide-react'
import { useNavigate }                from 'react-router'
import { lib, useClinicalData }       from 'clinical-primitives'
import { fetchBundle, fetchPatients } from '../api'
import { useDebounce }                from '../hooks/useDebounce'
import { Spinner }                    from '../components/ui/Spinner'
import { ErrorMessage }               from '../components/ui/ErrorMessage'
import { EmptyState }                 from '../components/ui/EmptyState'
import type {
  PatientIndexRecord,
  PatientFilters
} from '../types/api'


export function PatientList() {
  const navigate                = useNavigate()
  const [search  , setSearch  ] = useState('')
  const [patients, setPatients] = useState<PatientIndexRecord[]>([])
  const [total   , setTotal   ] = useState(0)
  const [status  , setStatus  ] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error   , setError   ] = useState<string | null>(null)
  const debouncedSearch         = useDebounce(search, 300)
  const { selectFile, loadFromBundle } = useClinicalData()

  useEffect(() => {
    const controller = new AbortController()
    setStatus('loading')
    const filters: PatientFilters = {}
    if (debouncedSearch)
      filters.search = debouncedSearch
    
    fetchPatients(filters, controller.signal)
      .then(result => {
        setPatients(result.patients)
        setTotal(result.total)
        setStatus('ready')
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setError(e.message)
          setStatus('error')
        }
      })
    
    return () => controller.abort()
  }, [debouncedSearch]);

  async function handleRowClick(patient: PatientIndexRecord) {
    const bundle = await fetchBundle(patient.id)
    await loadFromBundle(bundle as any)
    navigate(`/patients/${patient.id}`)
  }

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-stone-900">Patients</h1>
          <label className="cursor-pointer text-sm text-sky-600 hover:text-sky-800" onClick={() => {
            selectFile().then(patient => {
              // console.log("patient:", patient)
              if (patient) {
                navigate(`/patients/${patient.id}`)
              }
            })
          }}>
              Load local bundle
          </label>
        </div>

        <div className="mb-4">
          <input
            type="text"
            placeholder="Search by name or MRN…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-white px-4 py-2.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {status === 'loading' && <Spinner />}
        {status === 'error' && error && <ErrorMessage message={error} />}
        {status === 'ready' && patients.length === 0 && (
          <EmptyState message="No patients match your search." />
        )}
        {status === 'ready' && patients.length > 0 && (
          <>
            <div className="px-4 py-2 text-xs text-stone-500">
              {total} patient{total !== 1 ? 's' : ''}
            </div>
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white">
              <ul className="divide-y divide-stone-200/50">
                {patients.map(patient => (
                  <li
                    key={patient.id}
                    onClick={() => handleRowClick(patient)}
                    className="flex cursor-pointer items-center gap-x-4 pe-2 px-4 py-1 hover:bg-blue-50"
                  >
                    <div className="flex-1 grid w-full items-baseline gap-x-4 grid-cols-[1fr] sm:grid-cols-[3fr_6em_2fr]">
                      <div className="max-w-full truncate flex items-center gap-x-2">
                        <div className="sm:text-sm text-stone-900 max-w-full truncate">{lib.Person.displayPersonName(patient as any)}</div>
                        {patient.deceased && (<span className="text-red-700 border border-orange-200/50 uppercase bg-orange-100 text-[10px] py-[2px] px-1.5 leading-none rounded-full" title="Deceased">deceased</span>)}
                      </div>
                      <div className="flex items-center gap-x-3">
                        <span className="text-xs text-stone-500 sm:w-18 text-nowrap">{lib.Patient.displayPatientAge(patient as any)}</span>
                        <span className="text-xs text-stone-500 sm:w-18">{lib.Person.displayPersonGender(patient as any)}</span>
                      </div>
                      { patient.mrn ?
                        <div className="text-[12px] text-stone-400 truncate min-w-0 align-middle font-mono sm:text-end">{patient.mrn}</div> :
                        <div className="text-xs text-stone-300 truncate min-w-0 align-middle">--</div> }  
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300" />
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
