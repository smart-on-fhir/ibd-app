import type { Patient }                from 'fhir/r4'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { useClinicalData, lib }        from 'clinical-primitives'
import { UserCircle, UserCircleIcon }  from 'lucide-react'
import { Spinner }                     from '../components/ui/Spinner'
import { ErrorMessage }                from '../components/ui/ErrorMessage'


function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink to={to} end className={({ isActive }) =>
        `block rounded-md px-3 py-1.5 text-sm ${isActive
            ? 'bg-sky-100 font-medium text-sky-800'
            : 'text-gray-600 hover:bg-stone-100 hover:text-stone-900'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

function PatientLoader() {
  return (
    <div className="flex flex-col items-center justify-center h-[100vh]">
      <Spinner />
      <p>Loading patient. Please wait...</p>
    </div>
  )
}

function PatientError({ error }: { error: Error | string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[100vh]">
      <ErrorMessage message={error + ''} />
    </div>
  )
}

function PatientHeader({ patient }: { patient: Patient }) {
  return (
    <div className="border-b border-stone-200 px-2 py-4 flex items-center gap-2">
      <div>
        <UserCircle className="h-9 w-9 text-stone-400 fill-stone-400/20" strokeWidth={0.5} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="truncate font-semibold text-stone-900 text-sm min-w-0">
            { lib.Person.displayPersonName(patient) }
          </div>
        </div>
        <div className="space-y-0.5 text-xs text-stone-400">
          { lib.Patient.displayPatientAge(patient) } · <span className="capitalize">{ lib.Person.displayPersonGender(patient) }</span>
        </div>
      </div>
    </div>
  )
}

function PatientFooter() {
  const navigate = useNavigate()
  return (
    <div className="border-t border-stone-200 px-4 py-3">
      <button
        onClick={() => navigate('/patients')}
        className="text-xs text-gray-400 hover:text-blue-600 cursor-pointer"
      >
        ← Back to patients
      </button>
    </div>
  )
}

function PatientNav() {
  const { id } = useParams<{ id: string }>()
  const base = `/patients/${id}`
  return (
    <nav className="flex-1 space-y-1 px-2 py-3">
      <NavItem to={base} label="Patient Dashboard" />
      <NavItem to={`${base}/page/notes`} label="Clinical Notes" />
      <NavItem to={`${base}/page/search`} label="Search" />
      <div className="pt-4">
        <div className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-stone-400">IBD</div>
        <NavItem to={`${base}/ibd/summary`} label="Summary" />
        <NavItem to={`${base}/ibd/timeline`} label="Timeline" />
        <NavItem to={`${base}/ibd/labs`} label="Lab Trends" />
        <NavItem to={`${base}/ibd/outcomes`} label="Treatment Outcomes" />
      </div>
    </nav>
  )
}


export function PatientShell() {
  const { patient, isLoading, error } = useClinicalData();
  const [settled, setSettled] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (patient) {
      setSettled(false)
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    timerRef.current = setTimeout(() => setSettled(true), 300)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [patient])

  if (isLoading) return <PatientLoader />
  if (error) return <PatientError error={error + ''} />

  if (!patient) {
    if (!settled) return <PatientLoader />
    return (
      <div className="flex h-screen overflow-hidden bg-stone-50">
        <main className="flex-1 overflow-auto place-content-center flex flex-col items-center justify-center gap-4">
          <Link to="/patients" className="text-blue-600 cursor-pointer bg-blue-500/10 border border-blue-300/20 hover:border-blue-600/30 rounded-lg px-6 py-3 pe-7 flex items-center gap-2">
            <UserCircleIcon className="h-10 w-10 inline-block stroke-1" />
            Select Patient
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-stone-50">
      <aside className="flex w-56 shrink-0 flex-col border-r border-stone-200 bg-white overflow-y-auto">
        <PatientHeader patient={patient} />
        <PatientNav />
        <PatientFooter />
      </aside>
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
