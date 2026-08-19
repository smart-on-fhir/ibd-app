import type { DomainModule } from '../types/modules'
import { IBDModule } from './ibd'

export const MODULE_MAP: Record<string, DomainModule> = {
  ibd: IBDModule,
}

export function resolveModules(ids: string[]): DomainModule[] {
  return ids.flatMap(id => (MODULE_MAP[id] ? [MODULE_MAP[id]] : []))
}
