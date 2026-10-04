export type Auth = 'WPA' | 'WEP' | 'nopass';
export type Design = '1' | '2';
export type BulkMode = 'replace' | 'append' | 'merge';

export interface UnitData {
  ref: string;
  ssid: string;
  pass: string;
  auth: Auth;
  hidden: boolean;
}

/* `id` lives only in memory, as a stable React key. It is never saved. */
export interface Unit extends UnitData {
  id: string;
}

export interface Options {
  showRef: boolean;
  showPayload: boolean;
  design: Design;
}

export interface AppState {
  units: Unit[];
  options: Options;
}

export interface PlanItem {
  line: number;
  u: UnitData;
  notes: string[];
  action: 'add' | 'update' | 'skip';
  at?: number;
}

export interface Plan {
  mode: BulkMode;
  delim: string;
  header: boolean;
  items: PlanItem[];
  added: number;
  updated: number;
  skipped: number;
}

export interface Warning {
  err?: boolean;
  msg: string;
}
