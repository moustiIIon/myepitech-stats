// Shared shape for a scraped Epitech project. Dates are epoch millis (from
// Date.getTime()) so they serialize cleanly through chrome.storage.local.
export interface ProjectRecord {
  id: string;
  year: string;
  unitCode: string;
  campusGroup: string;
  href: string;
  title: string;
  module: string;
  status: string;
  startDate: number;
  endDate?: number;
  deadlineDate?: number;
  firstSeenAt: number;
  lastSeenAt: number;
}

export type ProjectStore = Record<string, ProjectRecord>;

export const STORAGE_KEY = "projects" as const;
