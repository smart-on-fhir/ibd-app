import { createBrowserRouter, Navigate, Outlet } from 'react-router'
import { PatientList }                           from './pages/PatientList'
import { PatientShell }                          from './pages/PatientShell'
import { PatientDashboard }                      from './pages/PatientDashboard'
import { PatientSearch }                         from './pages/PatientSearch'
import { TimelinePage }                          from './pages/Timeline'
import { NotesPage }                             from './pages/Notes'
import { CohortPage }                            from './pages/Cohort'
import { SurvivalPage }                          from './pages/Survival'


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
          { path: 'notes'        , element: <NotesPage />             },
          { path: 'search'       , element: <PatientSearch />         },
          { path: 'timeline'     , element: <TimelinePage />          },
          { path: 'cohort'       , element: <CohortPage />            },
          { path: 'survival'     , element: <SurvivalPage />          },
        ],
      },
    ],
  },
])
