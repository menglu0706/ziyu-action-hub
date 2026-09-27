'use client';
import {createContext,useContext} from 'react';
import type {SiteSettings} from '@/lib/types';

// Site-wide switches (public.site_settings), read once in the root layout and shared with client
// components such as the nav, including on loading and error screens.
export const DEFAULT_SITE_SETTINGS:SiteSettings={heatEnabled:true};
const SiteSettingsContext=createContext<SiteSettings>(DEFAULT_SITE_SETTINGS);

export function SiteSettingsProvider({value,children}:{value:SiteSettings;children:React.ReactNode}){
  return <SiteSettingsContext.Provider value={value}>{children}</SiteSettingsContext.Provider>;
}
export const useSiteSettings=()=>useContext(SiteSettingsContext);
