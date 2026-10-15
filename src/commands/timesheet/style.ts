// Look shared by the PDF and the xlsx export. Palette taken from the logo: navy for the dark
// parts, gold for the light ones.
export const HEX = {
  muted: "#666f7d",
  white: "#ffffff",
  black: "#000000",
  navy: "#132237",
  gold: "#ddb98a"
} as const;

export const AUTHOR = "Bruno Roberto Santos · Fullstack";

export const WEEKDAYS = ["segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado", "domingo"];
export const MONTHS = [
  ...["janeiro", "fevereiro", "março", "abril", "maio", "junho"],
  ...["julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
];

export const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export const bannerTitle = (month: number, year: number) => `Timesheet · ${capitalize(MONTHS[month]!)}/${year}`;

export const slugify = (text: string) =>
  text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const MAX_PROJECTS_IN_NAME = 3;
const ALL_PROJECTS = "todos-os-projetos";

/** projeto-slug_Mes_ano.ext; with several projects they are joined by "+". */
export function exportFileName(projects: string[], month: number, year: number, ext: string) {
  const slugs = projects.map(slugify).filter(Boolean);
  const who = slugs.length === 0 || slugs.length > MAX_PROJECTS_IN_NAME ? ALL_PROJECTS : slugs.join("+");
  return `${who}_${capitalize(MONTHS[month]!)}_${year}.${ext}`;
}

export const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];

export const isWeekend = (date: Date) => date.getDay() === 0 || date.getDay() === 6;

export const hoursAndMinutes = (hours: number) => {
  const minutes = Math.round(hours * 60);
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
};
