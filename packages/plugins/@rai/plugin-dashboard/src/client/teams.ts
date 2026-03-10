export interface Team {
  key: string;
  label: string;
}

export const TEAMS: Team[] = [
  { key: 'data-collection', label: 'Data Collection' },
  { key: 'capture', label: 'Capture' },
  { key: 'craft', label: 'Craft' },
  { key: 'compose', label: 'Compose' },
  { key: 'apt', label: 'APT' },
];
