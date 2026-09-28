import type { Patient }                from 'fhir/r4'
import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useNavigate, useParams } from 'react-router'
import { useClinicalData, lib }        from 'clinical-primitives'
import { ChartColumnDecreasing, Clock, Search, Sidebar, UserCircle, UserCircleIcon, Users, FileText }  from 'lucide-react'
import { Spinner }                     from '../components/ui/Spinner'
import { ErrorMessage }                from '../components/ui/ErrorMessage'
import { useMediaQuery }               from '../hooks/useMediaQuery'
import { getPatientData }             from '../api/ihl'

// Vertical iPad (1024px tall side up) and anything narrower gets a collapsed sidebar
const NARROW_SCREEN = '(max-width: 1024px)'

const SIDEBAR_PREFERENCE_KEY = 'ihl.sidebar'

/**
 * Whether the reader wants the sidebar, remembered across sessions.
 *
 * Absent means "not yet decided", which is open — the layout it was designed
 * around. Wrapped because `localStorage` throws rather than returning null in
 * a few real situations: Safari's private mode, and any embedding that blocks
 * third-party storage. A missing preference is not worth a broken page.
 */
function readSidebarPreference(): boolean {
    try {
        return localStorage.getItem(SIDEBAR_PREFERENCE_KEY) !== 'closed'
    } catch {
        return true
    }
}

function writeSidebarPreference(open: boolean): void {
    try {
        localStorage.setItem(SIDEBAR_PREFERENCE_KEY, open ? 'open' : 'closed')
    } catch {
        // Nothing to do and nothing worth saying: the sidebar still works, it
        // just starts from the default next time.
    }
}

function SidebarToggle({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Toggle sidebar"
      data-tooltip="Toggle sidebar"
      className="text-stone-300 hover:text-stone-500 hover:bg-stone-200 rounded p-0.5 cursor-pointer"
    >
      <Sidebar strokeWidth={1} />
    </button>
  )
}

function NavItem({ to, label, icon }: { to: string; label: string, icon: React.ReactNode }) {
  return (
    <NavLink to={to} end className={({ isActive }) =>
        `flex items-center gap-1 rounded-md px-3 py-1.5 text-sm border ${isActive
            ? 'bg-slate-200 font-semibold text-slate-800 border-slate-300'
            : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-900 border-transparent'
        }`
      }
    >
      {icon}
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

function PatientHeader({ patient, onToggleSidebar }: { patient: Patient; onToggleSidebar?: () => void }) {
  return (
    <div className="flex items-center gap-2 border-b border-stone-200 bg-white -mt-6 -mx-6 p-6 sticky -top-6 z-20">
      { onToggleSidebar && <SidebarToggle onClick={onToggleSidebar} /> }
      <div>
        <UserCircle className="h-10 w-10 text-slate-500 fill-slate-400/10" strokeWidth={0.75} />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="truncate font-semibold text-stone-900 text-base min-w-0">
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
      <NavItem to={base}               icon={<Clock className="inline-block h-4 w-4 mr-1" />} label="IBD Timeline" />
      <NavItem to={`${base}/cohort`}   icon={<Users className="inline-block h-4 w-4 mr-1" />} label="Similarity Cohort" />
      <NavItem to={`${base}/survival`} icon={<ChartColumnDecreasing className="inline-block h-4 w-4 mr-1" />} label="Survival Analysis" />
      <NavItem to={`${base}/search`}   icon={<Search className="inline-block h-4 w-4 mr-1" />} label="Health Record Search" />
      <NavItem to={`${base}/notes`}    icon={<FileText className="inline-block h-4 w-4 mr-1" />} label="Clinical Notes" />
    </nav>
  )
}


export function PatientShell() {
  const { patient, isLoading, error, loadFromResources } = useClinicalData();
  const { id }                        = useParams<{ id: string }>()
  const isNarrow                      = useMediaQuery(NARROW_SCREEN)
  // The stored preference is state rather than a ref: it is read while
  // rendering — deciding what to restore when the breakpoint is crossed — and
  // reading a ref there is exactly what React tells you not to do.
  const [sidebarPreference, setSidebarPreference] = useState(readSidebarPreference)
  const [sidebarOpen, setSidebarOpen] = useState(() => !isNarrow && sidebarPreference)
  const [wasNarrow, setWasNarrow]     = useState(isNarrow)
  const [loadError, setLoadError]     = useState<Error | null>(null)

  // Which id has already been asked for. A ref rather than state because it
  // must not cause a render: it exists to stop the effect below from asking
  // twice — including after a failure, which would otherwise retry forever.
  const requestedId = useRef<string | null>(null)

  // Crossing the breakpoint may close the sidebar but never opens it against
  // the reader's wishes: going narrow collapses it because there is no room,
  // and coming back wide restores whatever they last chose rather than assuming
  // open. Without that asymmetry a deliberately closed sidebar reappears on
  // every resize.
  if (wasNarrow !== isNarrow) {
    setWasNarrow(isNarrow)
    setSidebarOpen(isNarrow ? false : sidebarPreference)
  }

  function setSidebar(open: boolean) {
    setSidebarOpen(open)

    // Only a choice made with room on screen is a choice about the layout. On a
    // narrow screen the sidebar is an overlay that is opened to use and
    // dismissed straight after, and recording that would let one tap on a phone
    // reconfigure the desktop.
    if (!isNarrow) {
      setSidebarPreference(open)
      writeSidebarPreference(open)
    }
  }

  // Arriving by URL rather than from the patient list — a deep link, a
  // bookmark, a refresh — means nothing has been loaded yet. Selecting a local
  // bundle in PatientList fills the context before navigating, so that path
  // never gets here with an empty one.
  useEffect(() => {
    if (patient || isLoading || !id || requestedId.current === id) {
      return
    }

    requestedId.current = id
    setLoadError(null)

    getPatientData(id, 'ibd')
      // `@types/fhir`'s Resource and the library's FhirResource describe the
      // same JSON, but only the latter carries an index signature, so one is
      // not assignable to the other. Asserted once, here at the boundary,
      // rather than loosening either type.
      .then(resources => loadFromResources(resources as unknown as FhirResource[]))
      .catch(e => setLoadError(e instanceof Error ? e : new Error(String(e))))
  }, [patient, isLoading, id, loadFromResources])

  if (isLoading) return <PatientLoader />
  if (error) return <PatientError error={error + ''} />
  if (loadError) return <PatientError error={loadError} />

  if (!patient) {
    // An id is on the URL, so it is being fetched — the empty state below is
    // for the case where there is nothing to fetch.
    if (id) return <PatientLoader />

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
    <div className="relative flex h-screen overflow-hidden bg-stone-100/80 text-slate-600">
      { sidebarOpen && isNarrow && <div className="absolute inset-0 z-2000 bg-stone-900/20" onClick={() => setSidebar(false)} /> }
      <aside
        className={`flex w-56 shrink-0 flex-col overflow-y-auto transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          isNarrow ? 'absolute inset-y-0 left-0 z-2000 shadow-lg bg-stone-100 ' + (sidebarOpen ? 'ring-1 ring-stone-400/20' : '') : sidebarOpen ? '' : 'hidden'
        }`}
      >
        <h1 className='my-5 ms-5 me-2 flex items-center justify-between gap-2'>
          <div className='font-semibold text-slate-600'>
            IHL IBD APP
          </div>
          <SidebarToggle onClick={() => setSidebar(false)} />
        </h1>
        <PatientNav />
        <PatientFooter />
      </aside>
      <main className={ "flex-1 overflow-auto bg-white p-6" + (isNarrow ? "" : " border m-1 rounded-lg border-stone-200") }>
        <PatientHeader
          patient={patient}
          onToggleSidebar={ sidebarOpen && !isNarrow ? undefined : () => setSidebar(!sidebarOpen) }
        />
        <Outlet />
      </main>
    </div>
  )
}
