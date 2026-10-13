// Setup gộp xưởng: nạp từ API (/api/workshop-groups). Phần thuần (đổi tên xưởng) ở workshopGroupsCore.ts.
import { fetchWorkshopGroups } from '../services/dataService';
import { setMapping } from './workshopGroupsCore';
export { normWorkshop, applyWorkshopMapping, workshopGroupOf, canonicalizeWorkshops } from './workshopGroupsCore';

let inFlight: Promise<Record<string, string>> | null = null;

/** Nạp setup mới nhất (dùng chung 1 request nếu đang nạp). */
export async function loadWorkshopGroups(): Promise<Record<string, string>> {
  if (inFlight) return inFlight;
  inFlight = fetchWorkshopGroups(false)
    .then(d => { setMapping(d.mapping); return d.mapping; })
    .finally(() => { inFlight = null; });
  return inFlight;
}

