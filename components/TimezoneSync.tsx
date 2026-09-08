'use client';
import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {updateTimezone} from '@/app/user-actions';
export function TimezoneSync({current}:{current:string|null}){const router=useRouter();useEffect(()=>{const timezone=Intl.DateTimeFormat().resolvedOptions().timeZone;if(timezone&&timezone!==current)updateTimezone(timezone).then(()=>router.refresh())},[current,router]);return null}
