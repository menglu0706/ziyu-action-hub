export const PLATFORMS=['微博','QQ音乐','网易云音乐'] as const;

export type Platform=(typeof PLATFORMS)[number];

export function isPlatform(value:string|undefined):value is Platform{
  return typeof value==='string'&&PLATFORMS.includes(value as Platform);
}
