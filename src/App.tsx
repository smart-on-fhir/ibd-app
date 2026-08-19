import { RouterProvider }       from 'react-router'
import { ClinicalDataProvider } from 'clinical-primitives'
import { router }               from './router'


export default function App() {
  return (
    <ClinicalDataProvider>
      <RouterProvider router={router} />
    </ClinicalDataProvider>
  )
}
