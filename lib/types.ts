export type Category='音乐'|'数据'|'商务'|'超话'|'日常'|'其他';
export type Task={id:string;title:string;platform:string;category:Category;urgency:number;required:number;minutes:number;deadline:string|null;createdAt?:string;quick:string;description:string;url:string;pinned:boolean;daily:boolean;multi:boolean;progress:number;goal:number|null;completed?:boolean;steps:string[]};
export type Guide={id:string;type:'tip'|'guide'|'faq';title:string;summary:string;body:string;category:string};
export type QuickLink={id:string;title:string;platform:string;url:string;icon:string;sortOrder:number;enabled:boolean};
export type TextTemplate={id:string;title:string;type:string;content:string;pinned:boolean;sortOrder:number;enabled:boolean};
export type MediaItem={id:string;title:string;category:string;publishedAt:string;coverUrl:string;url:string;isNew:boolean;enabled:boolean};
export type VisualSetting={id?:string;module:string;enabled:boolean;imageUrl:string;position:string;size:string;overlay:number;decorativeText:string;textEnabled:boolean};
