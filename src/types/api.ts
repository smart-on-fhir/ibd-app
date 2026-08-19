export interface PatientIndexRecord {
  id: string
  mrn: string
  name: { family: string; given: string[] }
  gender: 'male' | 'female' | 'other' | 'unknown'
  birthDate: string
  conditions: Array<{ code: string; display: string; system: string }>
  lastVisit: string | null
  deceased?: boolean
}

export interface PatientListResult {
  patients: PatientIndexRecord[]
  total: number
  limit: number
  offset: number
}

export interface PatientFilters {
  search?: string
  gender?: string
  ageMin?: number
  ageMax?: number
  conditionCode?: string
  lastVisitAfter?: string
  lastVisitBefore?: string
  limit?: number
  offset?: number
}

export interface NoteHit {
  id: string
  patientId: string
  date: string
  type: string
  content: string
  score?: number
}

export interface NotesResult {
  hits: NoteHit[]
  total: number
  status?: 'ok' | 'unavailable'
  reason?: string
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}
