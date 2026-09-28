// Reads 小红书 / 抖音 share cards: an image a 加热 account posts to Weibo that shows another
// platform's post plus a code to open it. Used by weibo-relay.mjs and heat-backfill.mjs on the home
// PC (no CPU limits there); the result rides along with the post to the watcher as post.shareCard,
// which turns it into a /media item.
//   小红书: a standard QR code -> xhslink.com short link -> the note page, whose embedded data has
//           the exact title, content, author and time. Dedupe key: the note id.
//   抖音:   a 抖音码 (not a QR code; only the 抖音 app can scan it). The card's text is read with OCR:
//           @author and caption. Dedupe key: author + Beijing date (they post at most once a day).
// Needs `npm install` in scripts/ (jsqr, jpeg-js, tesseract.js). Without it, cards are skipped.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const UA='Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
// Only posts this recent are examined; older ones were handled (or skipped) long ago.
const MAX_AGE_MS=2*24*3600e3;
// At most this many new images are read per scan, so one busy scan stays short.
const MAX_PER_SCAN=6;
// OCR misreads the names that matter; these fix the ones seen on real cards.
const OCR_FIXES=[[/[样梓][渝洽瑜谕]|样渝/g,'梓渝'],[/拌音|抖首|抖昔/g,'抖音'],[/瑞鶴|瑞鸽/g,'瑞鹤']];

let libs;
async function loadLibs(){
  if(libs!==undefined)return libs;
  try{
    const [jsQR,jpeg,tesseract]=await Promise.all([import('jsqr'),import('jpeg-js'),import('tesseract.js')]);
    libs={jsQR:jsQR.default,jpeg:jpeg.default,tesseract:tesseract.default??tesseract};
  }catch{
    console.log('未安装分享卡片识别组件，跳过小红书 / 抖音分享卡片（在 scripts 文件夹运行一次 npm install 即可启用）');
    libs=null;
  }
  return libs;
}
let worker;
// The Chinese OCR data (~2.5 MB) is downloaded once and kept in scripts/.ocr-cache (git-ignored).
const OCR_CACHE=path.join(path.dirname(fileURLToPath(import.meta.url)),'.ocr-cache');
async function ocrWorker(){
  if(!worker){fs.mkdirSync(OCR_CACHE,{recursive:true});worker=await libs.tesseract.createWorker('chi_sim',1,{cachePath:OCR_CACHE})}
  return worker;
}

const fixText=text=>OCR_FIXES.reduce((s,[from,to])=>s.replace(from,to),text);
// Chinese OCR text comes out with a space between every character; keep spaces only between Latin words.
const squeeze=text=>text.replace(/(?<=[^\x00-\x7f]) +| +(?=[^\x00-\x7f])/g,'').trim();

async function download(url){
  const res=await fetch(url,{headers:{'User-Agent':UA,Referer:'https://weibo.com/'}});
  if(!res.ok)throw new Error(`图片下载失败 HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

// The QR code's text, looking first at the bottom-right quarter (where share cards put it).
function readQr(image){
  const {width,height,data}=image;
  const crop=(x0,y0)=>{const w=width-x0,h=height-y0,out=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)out.set(data.subarray(((y0+y)*width+x0)*4,((y0+y)*width+width)*4),y*w*4);return libs.jsQR(out,w,h)};
  return (crop(Math.floor(width/2),Math.floor(height*3/4))??libs.jsQR(new Uint8ClampedArray(data),width,height))?.data??null;
}

// A 小红书 note from its share link: the note page embeds its data in window.__INITIAL_STATE__.
async function readXhsNote(shortUrl){
  const res=await fetch(shortUrl,{headers:{'User-Agent':UA},redirect:'follow'});
  const noteId=res.url.match(/\/(?:discovery\/item|explore)\/([0-9a-f]{24})/)?.[1]??null;
  const html=await res.text();
  const raw=html.match(/window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*<\/script>/s)?.[1];
  let note=null;
  if(raw){
    const find=obj=>{if(!obj||typeof obj!=='object')return null;if('title' in obj&&'desc' in obj&&('user' in obj||'imageList' in obj))return obj;for(const value of Object.values(obj)){const found=find(value);if(found)return found}return null};
    try{note=find(JSON.parse(raw.replace(/\bundefined\b/g,'null')))}catch{}
  }
  return {
    platform:'小红书',url:shortUrl,key:noteId?`xhs:${noteId}`:null,
    title:note?.title?.trim()||null,
    // Topics come as "#梓渝[话题]#"; keep them as plain #梓渝.
    desc:(note?.desc??'').replace(/\[话题\]#/g,'').replace(/\s+/g,' ').trim()||null,
    author:note?.user?.nickname??note?.user?.nickName??null,
    time:note?.time?new Date(note.time).toISOString():null,
  };
}

// A region of the image (fractions of its size) prepared for OCR: grayscale, contrast stretched,
// enlarged 2x, as JPEG. Tesseract reads the small card text far better this way.
function prepare(image,left,top,right,bottom){
  const x0=Math.floor(image.width*left),y0=Math.floor(image.height*top),w=Math.floor(image.width*(right-left)),h=Math.floor(image.height*(bottom-top));
  const gray=new Uint8Array(w*h);let lo=255,hi=0;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=((y0+y)*image.width+x0+x)*4,v=(image.data[i]*299+image.data[i+1]*587+image.data[i+2]*114)/1000|0;
    gray[y*w+x]=v;if(v<lo)lo=v;if(v>hi)hi=v;
  }
  const W=w*2,H=h*2,out=Buffer.alloc(W*H*4),span=Math.max(1,hi-lo);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=Math.round((gray[(y>>1)*w+(x>>1)]-lo)*255/span),o=(y*W+x)*4;out[o]=out[o+1]=out[o+2]=v;out[o+3]=255}
  return libs.jpeg.encode({data:out,width:W,height:H},92).data;
}
// The recognised lines' text; each line's OCR confidence (0-100) is kept in lines.confidence.
async function ocrLines(image,box){
  const {data}=await (await ocrWorker()).recognize(prepare(image,...box),{},{blocks:true});
  const lines=[];lines.confidence=[];
  for(const block of data.blocks??[])for(const para of block.paragraphs)for(const line of para.lines){
    const text=fixText(squeeze(line.words.map(word=>word.text).join(' ')));
    if(text){lines.push(text);lines.confidence.push(line.confidence??0)}
  }
  return lines;
}

// A 抖音 share card, in two passes: the wide band under the photo must contain the card's footer
// (保存图片到相册 · 打开抖音扫一扫); the text box left of the 抖音码 then gives "@author" and the caption
// (reading it alone keeps the code's pattern out of the text).
async function readDouyinCard(image){
  const footer=(await ocrLines(image,[0,0.6,1,0.97])).join('');
  if(!/扫一扫/.test(footer)||!/保存图片|抖音/.test(footer))return null;
  const lines=await ocrLines(image,[0.08,0.66,0.63,0.86]);
  const at=lines.findIndex(line=>line.startsWith('@'));
  if(at<0)return null;
  const author=lines[at].replace(/^@/,'').replace(/[^\p{Script=Han}\p{L}\p{N}_-].*$/u,'');
  // Emoji often come through as a stray '#': collapse repeats and keep one space before each topic.
  const captionAt=lines.map((line,i)=>i).slice(at+1).filter(i=>!/保存图片|扫一扫/.test(lines[i]));
  const caption=captionAt.map(i=>lines[i]).join('').replace(/#{2,}/g,'#').replace(/\s*#/g,' #').replace(/\s+/g,' ').trim();
  // The caption's average OCR confidence; the watcher doesn't show a caption that read poorly.
  const confidence=captionAt.length?Math.round(captionAt.reduce((sum,i)=>sum+lines.confidence[i],0)/captionAt.length):0;
  return {platform:'抖音',url:null,key:null,title:caption||null,desc:(caption.match(/#[^#\s]+/g)??[]).join(' ')||null,author:author||null,time:null,confidence};
}

// The share card in a post's first image, or null.
async function readCard(mblog){
  const pic=mblog.pics?.[0];
  const url=pic?.large?.url??pic?.url;
  if(!url)return null;
  const buffer=await download(url.replace(/\/(orj\d+|mw\d+|large|bmiddle|thumb\d+|wap\d+)\//,'/mw2000/'));
  let image=null;
  try{image=libs.jpeg.decode(buffer,{useTArray:true,formatAsRGBA:true,maxMemoryUsageInMB:512})}catch{return null}
  // Share cards are tall screenshots; skip ordinary photos without reading them.
  if(image.height<image.width*1.4)return null;
  const qr=readQr(image);
  if(qr&&/xhslink\.com|xiaohongshu\.com/.test(qr))return readXhsNote(qr.replace(/^http:/,'https:'));
  if(qr)return null;
  return readDouyinCard(image);
}

const cache=new Map();
// Attaches post.shareCard to recent original posts with an image from the given accounts.
export async function attachShareCards(posts,uids){
  if(!await loadLibs())return;
  let read=0;
  for(const mblog of posts){
    // A share card is posted alone: a post with more than one image is something else.
    if(!uids.has(String(mblog.user?.id))||mblog.retweeted_status||(mblog.pic_num??mblog.pics?.length??0)!==1)continue;
    if(Date.now()-new Date(mblog.created_at).getTime()>MAX_AGE_MS)continue;
    if(!cache.has(mblog.id)){
      if(read>=MAX_PER_SCAN)continue;
      read++;
      try{cache.set(mblog.id,await readCard(mblog))}
      catch(error){console.log(`分享卡片读取失败（${mblog.bid??mblog.id}）：${error.message}`);continue}
    }
    const card=cache.get(mblog.id);
    if(card)mblog.shareCard=card;
  }
}
