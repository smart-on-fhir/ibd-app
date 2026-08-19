import type { DomainModule } from '../../types/modules'
import { IBDDashboard }      from './IBDDashboard'
import { IBDOverviewWidget } from './IBDOverviewWidget'


export const IBDModule: DomainModule = {
  id: 'ibd',
  label: 'IBD',
  color: 'indigo',
  activation: {
    conditionCodes: [
      'K50'  , 'K50.0', 'K50.1', 'K50.8', 'K50.9',
      'K51'  , 'K51.0', 'K51.2', 'K51.3', 'K51.4',
      'K51.5', 'K51.8', 'K51.9',
    ],
  },
  routes: [
    { path: 'ibd', element: <IBDDashboard /> },
  ],
  navItems: [
    { label: 'IBD Dashboard', to: 'ibd' },
  ],
  overviewWidget: IBDOverviewWidget,
}
