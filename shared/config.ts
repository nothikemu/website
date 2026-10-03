/** Identity + integration settings. Shared by the browser bundle and the /api routes. */
export const SITE = {
  name: 'hikemu',
  handle: 'nothikemu',
  domain: 'hkmu.me',
  tagline: 'computers used to feel like magic.',
  discordId: '1338171592882262088',
  github: 'nothikemu',
  x: 'nothikemu',
  steamVanity: 'hikemu',
  /** IANA zone used for the little local-time clock on the profile card. */
  timezone: 'America/Chicago',
} as const;

export const LINKS = {
  github: `https://github.com/${SITE.github}`,
  x: `https://x.com/${SITE.x}`,
  steam: `https://steamcommunity.com/id/${SITE.steamVanity}`,
  discord: `https://discord.com/users/${SITE.discordId}`,
} as const;
