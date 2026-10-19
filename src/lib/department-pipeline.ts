import { DEPARTMENT_PIPELINE } from "@/lib/rbac";

export function nextDepartmentName(current: string): string | null {
  const idx = DEPARTMENT_PIPELINE.indexOf(current as (typeof DEPARTMENT_PIPELINE)[number]);
  if (idx === -1 || idx === DEPARTMENT_PIPELINE.length - 1) return null;
  return DEPARTMENT_PIPELINE[idx + 1];
}
