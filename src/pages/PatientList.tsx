import { useState, useEffect }                      from 'react'
import { ChevronRight, FileBracesIcon, UserCircle } from 'lucide-react'
import { Link, useNavigate }                        from 'react-router'
import { lib, useClinicalData }                     from 'clinical-primitives'
import { Spinner }                                  from '../components/ui/Spinner'
import { ErrorMessage }                             from '../components/ui/ErrorMessage'
import { EmptyState }                               from '../components/ui/EmptyState'
import type { Patient }                             from 'fhir/r4'
import { getAllPatients }                           from '../api/ihl'
import { useResetClinicalData }                     from '../hooks/usePrefetch'


export function PatientList() {
  const navigate                = useNavigate()
  const [patients, setPatients] = useState<Patient[]>([])
  const [total   , setTotal   ] = useState(0)
  // Starts as "loading": the effect below fetches on mount, so there is no
  // idle moment worth rendering.
  const [status  , setStatus  ] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error   , setError   ] = useState<string | null>(null)
  const { selectFile }        = useClinicalData()
  const resetClinicalData     = useResetClinicalData()

  useEffect(() => {
    const controller = new AbortController()
    resetClinicalData();

    getAllPatients("sim-ibd-patients", { signal: controller.signal })
      .then(patients => {
        setPatients(patients)
        setTotal(patients.length)
        setStatus('ready')
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setError(e.message)
          setStatus('error')
        }
      });
    
    return () => controller.abort()
  }, [resetClinicalData]);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-baseline gap-2">
          <UserCircle strokeWidth={1} className='h-8 w-8 relative top-1.5 text-stone-400' />
          <div className='flex-1'>
            <div className="flex items-baseline justify-between">
              <h1 className="text-2xl font-semibold text-stone-700">Select a Patient</h1>
              <label className="cursor-pointer text-sm text-sky-600 hover:underline flex items-center gap-1" onClick={() => {
                selectFile().then(patient => {
                  // console.log("patient:", patient)
                  if (patient) {
                    navigate(`/patients/${patient.id}`)
                  }
                })
              }}>
                  Load bundle file
                  <FileBracesIcon size={20} strokeWidth={1} className='text-stone-400' />
              </label>
            </div>
            <div className="pb-2 text-xs text-stone-400">
              {total} patient{total !== 1 ? 's' : ''} available
            </div>
          </div>
        </div>

        {status === 'loading' && <Spinner />}
        {status === 'error'   && error && <ErrorMessage message={error} />}
        {status === 'ready'   && patients.length === 0 && <EmptyState message="No patients found." />}
        {status === 'ready'   && patients.length > 0 && (
          <>
            <div className="overflow-hidden rounded-lg border border-stone-200 bg-white mt-8">
              <ul className="divide-y divide-stone-200/50">
                {patients.map((patient, i) => (
                  <Link
                    to={`/patients/${patient.id}`}
                    key={patient.id + "_" + i}
                    className="flex cursor-pointer items-center gap-x-4 pe-2 px-4 py-1 hover:bg-blue-50"
                  >
                    <div className="flex-1 grid w-full items-center gap-x-4 grid-cols-[5em_7em_1fr] sm:grid-cols-[2fr_1fr_1fr] grid-rows-2 sm:grid-rows-1 my-2">
                      <div className="max-w-full truncate flex items-center gap-x-2 col-span-4 sm:col-span-1">
                        <div className="sm:text-sm text-stone-900 max-w-full truncate font-semibold">
                          {lib.Person.displayPersonName(patient)}
                        </div>
                      </div>
                      <span className="text-xs text-stone-500 sm:w-18 text-nowrap grid-row-2 sm:grid-row-1 grid-col-1 sm:grid-col-2">
                        {lib.Patient.displayPatientAge(patient) || 'no DOB'} {lib.Person.displayPersonGender(patient)}
                      </span>
                      <span className="text-xs text-nowrap grid-col-2 sm:grid-col-1 grid-row-2 sm:grid-row-1">
                        <span className="text-stone-400">DOB:</span> <span className="text-stone-500">
                          { patient.birthDate ? new Date(patient.birthDate).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'no DOB'}
                        </span>
                      </span>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-stone-300" />
                  </Link>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
