import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { PatientList }                           from './pages/PatientList'
import { PatientShell }                          from './pages/PatientShell'
import { PatientDashboard }                      from './pages/PatientDashboard'
import { TreatmentOutcomesPage }                 from './pages/TreatmentOutcomes'
import { PatientSearch }                         from './pages/PatientSearch'
import { TimelinePage }                          from './pages/Timeline'
import { NotesPage }                             from './pages/Notes'
import { LabsPage }                              from './pages/Labs'
import { IBDDashboard }                          from './modules/ibd/IBDDashboard'


export const router = createBrowserRouter([
  {
    element: <Outlet />,
    children: [
      { path: '/'        , element: <Navigate to="/patients" replace /> },
      { path: '/patients', element: <PatientList /> },
      {
        path: '/patients/:id',
        element: <PatientShell />,
        children: [
          { index: true          , element: <PatientDashboard />      },
          { path: 'page/notes'   , element: <NotesPage />             },
          { path: 'page/search'  , element: <PatientSearch />         },
          { path: 'ibd/timeline' , element: <TimelinePage />          },
          { path: 'ibd/labs'     , element: <LabsPage />              },
          { path: 'ibd/outcomes' , element: <TreatmentOutcomesPage /> },
          { path: 'ibd/summary'  , element: <IBDDashboard />          },
        ],
      },
    ],
  },
])
