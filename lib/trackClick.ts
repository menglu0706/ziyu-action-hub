'use client';
import {createClient} from '@/lib/supabase/client';

export function trackClick(buttonKey:string){
  void (async()=>{
    try{await createClient().rpc('increment_button_click',{p_button_key:buttonKey})}
    catch{/* non-critical telemetry */}
  })();
}
