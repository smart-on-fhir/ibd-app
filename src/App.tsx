import { RouterProvider }                from 'react-router'
import { ClinicalDataProvider, Tooltip } from 'clinical-primitives'
import { router }                        from './router'


export default function App() {
  return (
    <ClinicalDataProvider>
      <RouterProvider router={router} />

      {/* One per app. Components do not render their own tooltips — they mark
          themselves with `data-tooltip` and this listens for them — so without
          it the timeline's bars and readings have nothing to show. */}
      <Tooltip />
    </ClinicalDataProvider>
  )
}
