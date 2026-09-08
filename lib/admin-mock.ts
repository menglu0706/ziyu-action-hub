export type AdminTask={id:string|number;title:string;category:string;urgency:string;required:string;minutes:number;deadline:string;status:'上线'|'草稿'|'下线';url?:string;quick?:string;description?:string;rawDeadline?:string|null;audience?:string;pinned?:boolean;daily?:boolean;multi?:boolean;history?:boolean;leader?:boolean;push?:boolean};
export type QuickLink={id:string|number;name:string;platform:string;url:string;icon:string;order:number;enabled:boolean};
export type TextTemplate={id:string|number;title:string;type:string;body:string;pinned:boolean;order:number;enabled:boolean};
export type MediaRecord={id:string|number;title:string;category:string;date:string;publishedAt:string;cover:string;url:string;isNew:boolean;enabled:boolean};
export type GuideRecord={id:string|number;title:string;summary:string;body:string;category:string;guideType:'tip'|'guide'|'faq';order:number;status:'上线'|'草稿'|'下线';rawStatus:'draft'|'published'|'offline'};

export const adminTasks:AdminTask[]=[
 {id:1,title:'QQ音乐｜巅峰榜投金币',category:'音乐',urgency:'紧急',required:'必做',minutes:2,deadline:'今天 18:00',status:'上线'},
 {id:2,title:'微博｜商务互动',category:'商务',urgency:'重要',required:'必做',minutes:1,deadline:'今天 23:59',status:'上线'},
 {id:3,title:'超话签到＋超LIKE',category:'日常',urgency:'普通',required:'建议',minutes:1,deadline:'—',status:'上线'},
 {id:4,title:'新歌打榜｜由你榜',category:'音乐',urgency:'重要',required:'建议',minutes:2,deadline:'明天 12:00',status:'草稿'},
 {id:5,title:'评论互动（复制模板）',category:'数据',urgency:'普通',required:'可做',minutes:2,deadline:'—',status:'下线'},
];
export const quickLinks:QuickLink[]=['QQ音乐','微博','微博超话','腾讯视频','抖音','星品入口','网易云音乐','豆瓣','百度','自定义入口'].map((name,i)=>({id:i+1,name,platform:i===9?'自定义':'平台',url:'#',icon:['♫','微','#','▶','♪','星','云','豆','百','＋'][i],order:i+1,enabled:i<9}));
export const textTemplates:TextTemplate[]=[
 {id:1,title:'今日超话支持',type:'超话文案',body:'梓渝全肯定',pinned:true,order:1,enabled:true},
 {id:2,title:'转发支持短句',type:'转发支持文案',body:'看向你，只看向你',pinned:false,order:2,enabled:true},
 {id:3,title:'评论互动',type:'评论互动文案',body:'ZUYUNI99',pinned:false,order:3,enabled:true},
 {id:4,title:'ZZP 默认尾巴',type:'ZZP尾巴',body:'YUNI会永远永远陪梓渝黏黏糊糊走下去……',pinned:true,order:4,enabled:true},
];
export const mediaRecords:MediaRecord[]=[
 {id:1,title:'舞台直拍｜蓝色现场',category:'舞台',date:'2026-09-08',publishedAt:'2026-09-08T12:00',cover:'',url:'https://weibo.com',isNew:true,enabled:true},
 {id:2,title:'新采访完整片段',category:'采访',date:'2026-09-07',publishedAt:'2026-09-07T12:00',cover:'',url:'https://weibo.com',isNew:true,enabled:true},
 {id:3,title:'品牌活动高清图集',category:'商务',date:'2026-09-06',publishedAt:'2026-09-06T12:00',cover:'',url:'https://weibo.com',isNew:false,enabled:true},
];
export const guideRecords:GuideRecord[]=[
 {id:1,title:'巅峰榜怎么做最快？',summary:'两分钟完成今日金币投票',body:'从快捷入口进入 QQ 音乐后完成投票。',category:'音乐',guideType:'tip',order:1,status:'上线',rawStatus:'published'},
 {id:2,title:'金币怎么攒？',summary:'每日获取金币的常用途径',body:'完成平台日常任务并留意金币到账提示。',category:'音乐',guideType:'guide',order:2,status:'上线',rawStatus:'published'},
 {id:3,title:'新手必看',summary:'从最重要的一件事开始',body:'先完成紧急页置顶任务。',category:'日常',guideType:'faq',order:3,status:'草稿',rawStatus:'draft'},
];
export const rankingRows=['蓝鲸日记','小鱼汽水','ZUYUNI99','梓渝的小尾巴','晴空鱼群','银河小鱼','MoreForZIYU','只看向你'].map((nickname,i)=>({rank:i+1,nickname,count:52-i*4,category:['音乐','综合','数据','商务'][i%4]}));
export const mockUsers=[
 {nickname:'YUNI_小鱼',joined:'2026-06-12',today:6,total:368,public:true,status:'正常'},
 {nickname:'蓝鲸日记',joined:'2026-06-18',today:9,total:512,public:true,status:'正常'},
 {nickname:'晴空鱼群',joined:'2026-07-03',today:4,total:229,public:false,status:'正常'},
 {nickname:'海盐汽水',joined:'2026-07-21',today:0,total:86,public:true,status:'停用'},
];
