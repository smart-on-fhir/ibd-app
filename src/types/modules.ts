import type { RouteObject } from 'react-router'

export interface ModuleNavItem {
  label: string
  to: string
}

export interface PatientWidgetProps {
  patientId: string
}

export interface DomainModule {
  id: string
  label: string
  color?: string
  activation: { conditionCodes: string[] }
  routes: RouteObject[]
  navItems: ModuleNavItem[]
  overviewWidget?: React.ComponentType<PatientWidgetProps>
}
