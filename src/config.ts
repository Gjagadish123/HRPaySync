// Single place for client-specific values. Swap CLIENT_NAME once the client confirms it.
export const CLIENT_NAME = "Client";
export const APP_NAME = `${CLIENT_NAME} Manpower`;
export const SITE = { id: "site-1", name: "Main Plant", timeZone: "Asia/Kolkata" } as const;
/** The board and "today" switch to the next work date at this time, so a running night shift stays on the board. */
export const WORK_DAY_STARTS_AT = "06:00";
