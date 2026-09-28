'use client';
import {useState} from 'react';
import {AdminCard,AdminShell,StatusTag} from './AdminShell';
import WATCHED from '@/supabase/functions/_shared/accounts.json';

// Team runbook for the Weibo watcher, complete enough for someone else to run the relay when the
// owner is away (⑧). It must never contain secret values (cookies, keys) or the spare Weibo
// account's identity -- only where to get them.

function Sql({label,code}:{label:string;code:string}){
  const [copied,setCopied]=useState('');
  const copy=async(event:React.MouseEvent<HTMLButtonElement>)=>{
    const pre=event.currentTarget.closest('.playbook-sql')?.querySelector('pre');
    try{await navigator.clipboard.writeText(code);setCopied('已复制')}
    catch{if(pre){const range=document.createRange();range.selectNodeContents(pre);const selection=getSelection();selection?.removeAllRanges();selection?.addRange(range)}setCopied('已选中，按 Ctrl+C')}
    setTimeout(()=>setCopied(''),1600);
  };
  return <div className="playbook-sql"><div><span>{label}</span><button type="button" onClick={copy}>{copied||'复制'}</button></div><pre>{code}</pre></div>;
}
function Facts({rows}:{rows:[string,React.ReactNode][]}){return <dl className="playbook-facts">{rows.map(([term,value])=><div key={term}><dt>{term}</dt><dd>{value}</dd></div>)}</dl>}
// Links to watched Weibo accounts (uid -> name, from _shared/accounts.json).
function AccountLinks({accounts}:{accounts:Record<string,string>}){return <>{Object.entries(accounts).map(([uid,name],i)=><span key={uid}>{i>0&&' · '}<a href={`https://weibo.com/u/${uid}`} target="_blank" rel="noreferrer">{name}</a></span>)}</>}
function Steps({children}:{children:React.ReactNode}){return <ol className="playbook-steps">{children}</ol>}
function Mode({id,title,tag,tone,children}:{id:string;title:string;tag:string;tone:'red'|'gold'|'blue'|'green';children:React.ReactNode}){
  return <AdminCard className="playbook-card"><section id={id}><div className="playbook-head"><h2>{title}</h2><StatusTag tone={tone}>{tag}</StatusTag></div>{children}</section></AdminCard>;
}

const RUN_SQL='SQL 的运行方法：Supabase Dashboard → 项目 ziyu-action-hub → SQL Editor → + New query → 粘贴 → Run。编辑器只显示最后一段的结果，多段查询请逐段选中后按 Ctrl+Enter。';

export function AdminPlaybook(){
  return <AdminShell title="故障手册" subtitle="微博监控出现提醒或异常时，按本页从上往下排查">
    <AdminCard className="playbook-card">
      <nav className="playbook-toc" aria-label="目录">
        {[['how','系统怎么运作'],['heat-rules','加热匹配规则'],['triage','快速判断'],['cookie','① 登录过期'],['ratelimit','② 微博限流 / 临时故障'],['stopped','③ 监控没有运行'],['wrong','④ 发布了错误任务'],['missing','⑤ 该发布却没发布'],['quota','⑥ 微信提醒额度用完'],['pause','⑦ 紧急暂停 / 重新开启'],['relay','⑧ 自己运行读取程序'],['sql','常用 SQL'],['reference','关键信息']].map(([id,label])=><a key={id} href={`#${id}`}>{label}</a>)}
      </nav>
    </AdminCard>

    <AdminCard className="playbook-card"><section id="how">
      <h2>系统怎么运作</h2>
      <p>微博不接受云服务器读取，所以由<b>负责人家用电脑</b>上的读取程序（<code>weibo-relay</code>）约每 3–4 分钟读取一次下面这些账号的最新微博，交给 Supabase 的 <code>weibo-watcher</code> 处理。发现新微博后，按规则在 /urgent 生成<b>置顶任务</b>，部分原创微博同时生成 /media 物料。一般发帖后 <b>2–5 分钟</b>网站可见。</p>
      <p><b>夜间暂停：</b>北京时间 1:00–8:00 不读取微博（这段时间的微博都可以延后处理），卡片显示「夜间暂停」，也不会发出「已停止」提醒。夜间发布的微博会在 8:00 后的第一次扫描中补发。</p>
      <p>家用电脑关机、休眠或断网时读取会暂停；超过 15 分钟没有收到扫描会发出「微博监控已停止」提醒。电脑恢复后会自动补发期间的新微博（每个账号最近约 10 条以内）。</p>
      <div className="table-scroll"><table className="admin-table playbook-table"><thead><tr><th>账号</th><th>处理哪些微博</th><th>任务标题</th><th>描述</th><th>物料</th></tr></thead><tbody>
        <tr><td>梓渝的小喇叭0706</td><td>只处理原创</td><td>重要通知：+ 第一句</td><td>无</td><td>无</td></tr>
        <tr><td>我是梓渝_</td><td>原创 + 转发</td><td>原创：宝梓营业啦，快快来！！百万转，百万评！<br/>直播：宝梓直播啦快来！！！！<br/>转发：任务博来啦，快来zzp!</td><td>第一句</td><td>有图片 / 视频 / 语音的原创（非直播）</td></tr>
        <tr><td>我是梓渝_ · 梓渝超话</td><td>在超话内发的帖子（这些不会出现在关注动态里，单独读取）</td><td>宝梓超话营业啦，快来！！</td><td>第一句（语音显示为「发了一条 N 秒的语音」）</td><td>有图片 / 视频 / 语音的帖子</td></tr>
        <tr><td>梓渝ZIYU工作室</td><td>只处理原创</td><td>第一句</td><td>无</td><td>有图片 / 视频 / 语音的原创</td></tr>
        <tr><td>月之必要</td><td>只处理含「打榜任务 / 打木旁任务 / 打木旁rw / 打榜rw」的原创</td><td colSpan={3}><b>不新建任务</b>，而是把日常任务「YUNI音乐日常任务」的「一句话最快做法」替换为这条微博的全文。原内容记录在监控日志里，需要时可手动恢复。含「加热」的微博按下面的加热规则处理，其他微博直接忽略。</td></tr>
        <tr><td>加热账号（{Object.values(WATCHED.heat).join('、')}）</td><td colSpan={4}>转发和带其他微博链接的原创，按规则生成「红膏加热」或「速来空瓶」任务，详见 <a href="#heat-rules">加热匹配规则</a>。</td></tr>
        <tr><td><StatusTag tone="blue">分享卡片 → 物料</StatusTag></td><td colSpan={4}>加热账号发的小红书 / 抖音分享卡片在吸食页生成物料，不生成加热任务，详见 <a href="#heat-rules">加热匹配规则</a>。</td></tr>
        <tr><td><StatusTag tone="blue">加热任务</StatusTag></td><td colSpan={4}>只出现在 /heat，不置顶、不进 /urgent，不发微信提醒；有效期、去重、合集替代和轮换见 <a href="#heat-rules">加热匹配规则</a>。</td></tr>
        <tr><td><StatusTag tone="blue">共创微博</StatusTag></td><td colSpan={4}>标题固定为「星品共创百万转百万评千万赞」，描述为「品牌名 星品 共创」（如「有棵树 星品 共创」），不生成物料。</td></tr>
      </tbody></table></div>
      <div className="playbook-note"><b>基本规则</b>
        <ul className="playbook-rules">
          <li>同一条微博只处理一次；网站上已有相同链接的任务（包括手动添加的）时自动跳过——<b>手动任务优先</b>。</li>
          <li>网站同一时间只有一个置顶。新任务置顶后，上一个任务取消置顶但仍保留在 /urgent。</li>
          <li><b>「我是梓渝_」优先：</b>如果当前置顶是「我是梓渝_」发布不到 6 小时的微博，另外两个账号的新任务<b>不置顶</b>，而是出现在「进行中的任务」最上方。「我是梓渝_」的新微博始终置顶。</li>
          <li><b>自动下线：</b>自动生成的任务在创建 24 小时后自动下线（每 5 分钟检查一次）。物料不受影响。手动重新上线后不会再次自动下线。</li>
        </ul></div>
      <p><b>第一处查看位置：</b>后台首页的「微博监控」卡片——显示运行状态、上次扫描时间、最近错误，以及最近处理过的 10 条微博（带原帖和任务链接）。</p>
    </section></AdminCard>

    <AdminCard className="playbook-card"><section id="heat-rules">
      <h2>加热匹配规则</h2>
      <p><b>检查范围：</b>加热账号（<AccountLinks accounts={WATCHED.heat}/>）的原创和转发。以下三种情况先单独处理，不进入加热规则：月之必要带打榜关键词的微博只更新「YUNI音乐日常任务」；只有一张图的小红书二维码 / 抖音分享卡片生成物料（见下方分享卡片）；后台关闭「加热页面」时不生成加热任务。</p>

      <h3>第一步：直接忽略（按顺序判断）</h3>
      <div className="table-scroll"><table className="admin-table playbook-table"><thead><tr><th>#</th><th>情况</th><th>日志显示</th></tr></thead><tbody>
        <tr><td>1</td><td>转发的转发（文字里带 //@ 转发链）</td><td>转发的转发</td></tr>
        <tr><td>2</td><td>原创但没有引用任何其他微博链接</td><td>原创但没有引用其他微博</td></tr>
        <tr><td>3</td><td>链接 / 转发的全部是「我是梓渝_」的微博，且没有评论链接、也不是 点到 / 上赞 / 上👍 的点赞任务（紧急任务已覆盖）</td><td>目标是梓渝个人博（紧急任务已覆盖）</td></tr>
        <tr><td>4</td><td>标题（【…】或第一行）含 指南 / 教程 / 攻略 / 养号 / 🐏號</td><td>教程 / 指南帖</td></tr>
        <tr><td>5</td><td>提到 星品 / 新宣，或带星品影响力链接</td><td>星品任务</td></tr>
        <tr><td>5b</td><td>提到 加速卡 / jsk（大小写都算，但不含在其他英文单词里）</td><td>加速卡任务</td></tr>
        <tr><td>6</td><td>唯一的指令是转发目标（例如 800转、300🧱、万砖），没有赞 / 评 / 🍎 目标、加热 / 加🔥 或空瓶指令——这是要扩散，不是加热</td><td>扩散任务（只要转发）</td></tr>
      </tbody></table></div>

      <h3>第二步：判断类型（只看加热账号自己写的文字，被转发的原帖文字不算）</h3>
      <div className="table-scroll"><table className="admin-table playbook-table"><thead><tr><th>顺序</th><th>类型</th><th>条件</th></tr></thead><tbody>
        <tr><td>①</td><td><b>空瓶</b></td><td>文字含 🈳、无前排 / 🈚前排、控评、控一下、空瓶、速空 / 来空 / 去空、空一下、空这；或带指向具体评论的链接（控评）；或<b>文字含 点到 / 上赞 / 上👍，并且直接链接了 我是梓渝_ 或 梓渝ZIYU工作室 的微博</b>（点赞冲数据）。「空腹」「控制」等普通词语、单独的「前排」「前排🈶」不算。</td></tr>
        <tr><td>②</td><td><b>红膏</b></td><td>转发或链接了 我是梓渝_ / 梓渝ZIYU工作室 / 梓渝的小喇叭0706 的微博；或文字里同时有<b>加热指令</b>（见③）和<b>红膏关键词</b>：梓渝 / YUNI / 芋泥（任何时候都算）；红膏 / 热搜 / 主榜 / 文娱榜 / 蓝V / 公益 / 官号 / 正向 / rs（只在没有别家话题时算——别家话题指不含梓渝 / YUNI / 芋泥的 #话题#）。只提到梓渝、没有加热指令的（例如打榜催进度）不算。</td></tr>
        <tr><td>③</td><td><b>空瓶</b></td><td>以上都不符合，但文字里有<b>加热指令</b>：加热、加🔥 / ➕🔥、目标数（数字加 👍 赞 转 评 🧱 🍎，或 万 / 千 加 👍 赞 转 评）、速来、稳热门、点…热门、外显、艾特智搜。</td></tr>
        <tr><td>—</td><td>忽略</td><td>以上都没有：日志显示「没有梓渝关键词或加热指令」。只带话题（#…#）不算加热指令。</td></tr>
      </tbody></table></div>

      <h3>第三步：生成的卡片</h3>
      <Facts rows={[
        ['标题','「账号名 红膏加热」或「账号名 速来空瓶」。红膏且文字提到 热搜 / 主榜 / 文娱榜 / rs 的，标题后加 🔥 热搜 标记。'],
        ['描述','第一行固定「先转发扩散再加热！！！」；然后是加热账号自己的文字（到第一个链接为止），如果写了目标（🎯、3000👍、万赞…）只保留带目标的句子；🔥 热搜 卡片另起一行列出话题。显示时目标数橙色高亮，话题和 @ 蓝色，《作品名》加粗。'],
        ['链接','加热账号的这条微博本身。'],
        ['有效期','从微博发布时间起：红膏 10 小时、空瓶 6 小时（后台可修改截止时间）；到点自动下线。'],
      ]}/>

      <h3>第四步：去重、替代与轮换</h3>
      <Steps>
        <li><b>每条微博只处理一次</b>（已处理过的直接跳过）。</li>
        <li><b>同一条微博已是在线加热任务</b>：跳过（已存在相同链接的加热任务）。</li>
        <li><b>转发的原帖本身已是在线加热任务</b>（例如另一个加热账号的原创）：跳过（原帖已在加热列表）。</li>
        <li><b>已被覆盖</b>：每个加热任务会记下它覆盖的微博（转发 = 被转发的原帖；合集 = 列出的每条微博和它自己）。多个账号转发同一条原帖，以最先发布的为准，后来的跳过（同一原帖已有加热任务）；合集里已经列出的微博之后再单独出现也跳过（已在合集加热任务中）。</li>
        <li><b>合集替代</b>：新的合集原创生成任务后，被它完全覆盖的在线自动加热任务会下线（合集替代下线 N 条）；还有其他内容的旧合集保留。</li>
        <li><b>轮换</b>：加热页最多 15 条，原创优先、再按时间从新到旧；红膏和空瓶都有时每类至少保留 2 条。排不进的自动任务立即下线（轮换下线 N 条）。</li>
        <li><b>显示</b>：红膏在上、空瓶在下，每组按时间从新到旧，连续编号；到点的卡片立即移除并重新编号。</li>
        <li><b>后台手动发布的加热任务</b>不会被合集替代、轮换或整理下线。</li>
      </Steps>
      <div className="playbook-note"><b>规则改了、或漏了任务？</b>在读取程序的电脑上运行 <code>node scripts/heat-backfill.mjs</code>：补上最近 10 小时漏掉的加热任务 / 物料，并按当前规则整理在线卡片（更新标题和描述、补记覆盖、合集替代、去掉重复转发）。可以放心重复运行。注意：会覆盖在后台手动改过的自动卡片标题 / 描述。</div>

      <h3>分享卡片 → 物料</h3>
      <p>加热账号发的<b>只有一张图</b>的原创，如果图是<b>小红书二维码卡片</b>或<b>抖音分享卡片</b>，并且卡片或文字提到「我是梓渝 / 梓渝工作室 / 瑞鹤」，就在吸食页生成一条物料，不生成加热任务。小红书：识别二维码读取笔记，标题、内容、作者都是原文，链接直接打开笔记，同一篇笔记只生成一次。抖音：抖音码无法识别，读取卡片文字（@作者和文案），链接指向这条微博（保存图片后用抖音「扫一扫」打开）。文字识别不清楚时，标题改为「梓渝 抖音更新」这类固定标题，不显示乱码。<b>同一主体（梓渝 / 梓渝工作室 / 瑞鹤）同一天只生成一次</b>——不同加热账号转发的同一张卡片不会重复生成。</p>
    </section></AdminCard>

    <AdminCard className="playbook-card"><section id="triage">
      <h2>快速判断</h2>
      <div className="table-scroll"><table className="admin-table playbook-table"><thead><tr><th>收到的提醒 / 看到的现象</th><th>最可能的原因</th><th>处理</th></tr></thead><tbody>
        <tr><td><StatusTag tone="red">微博监控失败</StatusTag> 错误含「登录已过期或被限制」「返回异常数据」</td><td>备用账号登录失效</td><td><a href="#cookie">① 登录过期</a></td></tr>
        <tr><td><StatusTag tone="red">微博监控失败</StatusTag> 错误含「HTTP 4xx / 5xx」</td><td>微博限流或临时故障</td><td><a href="#ratelimit">② 限流 / 临时故障</a></td></tr>
        <tr><td><StatusTag tone="red">微博监控已停止</StatusTag>，或卡片显示「未在运行」</td><td>家用电脑关机 / 断网 / 读取程序被关闭</td><td><a href="#stopped">③ 监控没有运行</a></td></tr>
        <tr><td>网站出现标题或内容不对的任务</td><td>规则不适用于这条微博</td><td><a href="#wrong">④ 撤回与修正</a></td></tr>
        <tr><td>微博发了，网站迟迟没有</td><td>被跳过、处理失败或尚未扫描到</td><td><a href="#missing">⑤ 排查漏发</a></td></tr>
        <tr><td>提醒末尾出现「今日微信提醒额度已用完」</td><td>当天 5 条额度已用完</td><td><a href="#quota">⑥ 额度用完</a></td></tr>
        <tr><td>需要立刻停止自动发布</td><td>—</td><td><a href="#pause">⑦ 紧急暂停</a></td></tr>
        <tr><td><StatusTag tone="green">微博监控已恢复</StatusTag></td><td>故障已自行恢复</td><td>无需处理（故障期间的新微博会自动补发）</td></tr>
      </tbody></table></div>
    </section></AdminCard>

    <Mode id="cookie" title="① 登录过期" tag="最常见" tone="red">
      <Facts rows={[['症状','提醒「微博监控失败：…微博登录已过期或被限制」或「微博返回异常数据」；卡片显示「扫描失败」。'],['原因','监控使用的备用微博账号登录失效，通常每几周到几个月一次；或该账号被微博要求验证。'],['影响','恢复前不会发布任何新任务。连续失败后监控会自动放慢重试（30 分钟、1 小时、2 小时，最长 4 小时一次），避免账号被进一步限制。恢复后会自动补发期间的新微博（每个账号最近约 10 条以内）。']]}/>
      <h3>处理步骤</h3>
      <Steps>
        <li><b>联系负责人更新登录。</b>负责人联系不上时，由团队指定的接手人按 <a href="#relay">⑧ 自己运行读取程序</a> 第 4–5 步重新登录备用账号、更新 <code>WEIBO_COOKIE</code>。其他人不要尝试登录该账号。</li>
        <li><b>等待期间：</b>如有紧急任务，在后台「发布任务」手动添加。之后自动补发时，若链接相同会自动跳过，不会重复。</li>
        <li><b>立即重试：</b>更新登录后，重启运行读取程序的电脑上的 <code>weibo-relay</code>（关闭窗口后重新运行），会立即重新扫描。</li>
        <li><b>确认恢复：</b>约 2 分钟后，后台卡片应显示「运行中」，并收到「微博监控已恢复」提醒；也可以运行下方<a href="#sql">常用 SQL</a> 中的「最近扫描」，最新几行 <code>ok = true</code>。</li>
      </Steps>
      <div className="playbook-note playbook-note-red"><b>安全提醒</b>任何人向你索要微博 Cookie、登录信息或 Supabase 密钥，都不要提供。它们只填入运行读取程序那台电脑的 <code>.env.local</code>。本手册不包含、也不应添加任何密钥或账号信息（只说明去哪里取）。</div>
    </Mode>

    <Mode id="ratelimit" title="② 微博限流 / 临时故障" tag="通常会自行恢复" tone="gold">
      <Facts rows={[['症状','提醒中的错误为「微博请求失败 HTTP 403 / 418 / 429 / 5xx」；可能只影响部分账号。'],['原因','微博对频繁访问限流，或微博自身临时故障。'],['影响','故障期间不发布；连续失败时监控自动放慢重试（30 分钟起，最长 4 小时一次）；恢复后自动补发。']]}/>
      <h3>处理步骤</h3>
      <Steps>
        <li><b>先等待</b>：监控会自动放慢重试，多数情况会自行恢复并收到「已恢复」提醒。期间可手动添加紧急任务。</li>
        <li>打开 <code>m.weibo.cn</code> 看微博本身是否正常。如果微博全站异常，等待即可。</li>
        <li>超过 2 小时仍未恢复，或错误为 <code>HTTP 403</code>「请求被拒绝」：多半是备用账号被微博风控，<b>联系负责人</b>检查账号（见 <a href="#cookie">①</a>）。</li>
        <li>负责人处理后，重启家用电脑上的 <code>weibo-relay</code>，立即重试。</li>
      </Steps>
    </Mode>

    <Mode id="stopped" title="③ 监控没有运行" tag="最先检查家用电脑" tone="red">
      <Facts rows={[['症状','收到「微博监控已停止」提醒；或卡片显示「未在运行」（上次扫描超过 8 分钟）。'],['原因','最常见：负责人的家用电脑关机、休眠、断网，或 weibo-relay 窗口被关闭。少见：Supabase 项目被暂停、定时任务停用、函数报错。']]}/>
      <div className="playbook-note playbook-note-gold"><b>注意</b>「微博监控已停止」提醒由 Supabase 每分钟的检查发出。如果 Supabase 本身出问题（项目暂停、定时任务停用），<b>不会</b>有任何提醒——只能靠后台卡片或发现网站没更新来察觉。</div>
      <h3>检查步骤</h3>
      <Steps>
        <li><b>家用电脑：</b>联系负责人确认电脑开机、联网、没有休眠，并且 <code>weibo-relay</code> 窗口在运行（没有就重新运行）。负责人联系不上时，按 <a href="#relay">⑧</a> 在自己的电脑上运行。恢复后几分钟内会收到「微博监控已恢复」。</li>
        <li><b>项目是否被暂停：</b>打开 Supabase Dashboard。如果项目显示 <b>Paused</b>，点击 <b>Restore</b>，等待几分钟。（免费套餐长时间无访问可能被暂停；此时整个网站也无法访问。）</li>
        <li><b>定时任务是否启用：</b>运行下方第 1 段 SQL，确认 <code>active = true</code>；若为 false，运行第 2 段重新启用。</li>
        <li><b>定时任务调用结果：</b>运行第 3 段 SQL：<code>200</code> 正常；<code>403</code> 调用密钥不匹配，联系负责人；<code>500</code> 函数报错，把 <code>content</code> 列截图发给负责人；没有任何记录说明定时任务没有发出请求，检查第 2 步。</li>
        <li><b>Supabase 状态：</b>查看 <code>status.supabase.com</code> 是否有东京区（ap-northeast-1）故障。</li>
      </Steps>
      <Sql label="1 · 定时任务状态" code={`select jobid, jobname, schedule, active\nfrom cron.job\norder by jobname;`}/>
      <Sql label="2 · 重新启用定时任务" code={`select cron.alter_job(\n  (select jobid from cron.job where jobname = 'weibo-watcher'),\n  active := true\n);`}/>
      <Sql label="3 · 最近调用的返回结果" code={`select status_code, left(content::text, 200) as content, error_msg, created\nfrom net._http_response\norder by created desc\nlimit 10;`}/>
    </Mode>

    <Mode id="wrong" title="④ 发布了错误的任务" tag="手动修正" tone="gold">
      <Facts rows={[['症状','/urgent 出现标题、描述不对的任务，或不该发的微博被置顶。'],['说明','每条微博只会处理一次，修改或删除后不会被重新生成。']]}/>
      <h3>处理步骤</h3>
      <Steps>
        <li>后台 → <b>任务管理</b>，带紫色「微博」标签的是自动生成的任务。也可以在首页卡片点「任务」直接打开。</li>
        <li>按需要操作：<b>编辑</b>（改标题、描述后保存）、<b>取消置顶</b>、<b>下线</b>或<b>删除</b>。</li>
        <li>如果同时生成了物料：后台 → <b>物料管理</b>，找到同名物料编辑或删除。</li>
        <li>如果同一类微博反复出错，把<b>原帖链接</b>和<b>希望的标题/描述</b>发给负责人调整规则。</li>
      </Steps>
      <div className="playbook-note"><b>置顶被抢走？</b>网站只有一个置顶位。新微博会自动占用置顶（「我是梓渝_」6 小时内的置顶除外），原来的置顶任务取消置顶但保留在 /urgent。如需把某个任务重新置顶，编辑该任务打开「首页强制置顶」。</div>
      <div className="playbook-note"><b>自动任务不见了？</b>自动生成的任务 24 小时后会自动下线。在「任务管理 → 已下线」中可以找到，需要的话点「上线」即可，之后不会再自动下线。</div>
    </Mode>

    <Mode id="missing" title="⑤ 该发布却没有发布" tag="先看卡片列表" tone="blue">
      <p>先在后台首页「微博监控」卡片的列表中找这条微博（可点「原帖」核对）。卡片只显示<b>已发布、失败和处理中</b>的微博；被<b>跳过</b>的微博不在卡片里，请运行下方<a href="#sql">常用 SQL</a> 中的「今天失败或跳过的微博」查看跳过原因。</p>
      <div className="table-scroll"><table className="admin-table playbook-table"><thead><tr><th>列表中的状态</th><th>含义</th><th>需要做什么</th></tr></thead><tbody>
        <tr><td><StatusTag tone="green">已发布</StatusTag></td><td>已生成任务</td><td>若网站仍看不到，等 1 分钟缓存刷新后再看</td></tr>
        <tr><td><StatusTag tone="gray">跳过</StatusTag> 该账号只处理原创</td><td>工作室账号的转发，按规则忽略</td><td>无需处理；确实需要就手动添加</td></tr>
        <tr><td><StatusTag tone="gray">跳过</StatusTag> 系统生成的红包微博</td><td>「我是梓渝_」发粉丝红包时微博自动生成的微博，按规则忽略</td><td>无需处理；确实需要就手动添加</td></tr>
        <tr><td><StatusTag tone="gray">跳过</StatusTag> 同一原帖已生成任务</td><td>这条微博转发的原帖之前已经生成过任务</td><td>无需处理</td></tr>
        <tr><td><StatusTag tone="gray">跳过</StatusTag> 已存在相同链接的任务</td><td>网站上已有指向同一微博的任务（常见于已手动添加）</td><td>无需处理——手动任务优先</td></tr>
        <tr><td><StatusTag tone="red">失败</StatusTag></td><td>处理时出错，原因显示在下方</td><td>手动添加该任务；把原因截图发给负责人</td></tr>
        <tr><td>列表中找不到</td><td>还没扫描到、扫描失败，或微博未出现在账号主页（仅粉丝可见、已删除、发布早于监控启动）</td><td>等 2 分钟；看卡片是否在报错（① ② ③）；仍没有就手动添加</td></tr>
      </tbody></table></div>
      <p><b>手动添加：</b>后台 → 发布任务，粘贴微博链接。若网站已有相同链接的任务，会出现重复提示，按提示选择即可。</p>
    </Mode>

    <Mode id="quota" title="⑥ 微信提醒额度用完" tag="当天有效" tone="gold">
      <Facts rows={[['规则','Server酱免费版每天 5 条：前 4 条用于「新发布」提醒（同一次扫描的多条任务合并为 1 条），第 5 条只留给「监控失败」。第 4 条末尾会附上额度用完的警告。'],['重置','每天北京时间 00:00。']]}/>
      <h3>收到额度警告后</h3>
      <Steps>
        <li>自动发布<b>仍在正常工作</b>，只是不再发微信提醒。</li>
        <li>当天请定时查看网站 /urgent 和后台首页的卡片，核对新任务是否正确（见 <a href="#wrong">④</a>）。</li>
        <li>如果当天微博非常多、需要人工把关，可以暂时关闭自动发布，改为手动添加（见 <a href="#pause">⑦</a>），第二天再打开。</li>
        <li>如果经常用完，可升级 Server酱付费版，并请负责人调高每日上限。</li>
      </Steps>
    </Mode>

    <Mode id="pause" title="⑦ 紧急暂停 / 重新开启" tag="1 分钟内生效" tone="blue">
      <h3>暂停</h3>
      <Steps>
        <li>后台首页 → 「微博监控」卡片 → 关闭右上角的<b>「自动发布」</b>开关，卡片显示「已关闭」。</li>
        <li>后台打不开时，用下方 SQL 暂停。</li>
      </Steps>
      <div className="playbook-note"><b>只关闭加热页面</b>同一张卡片上的<b>「加热页面」</b>开关：关闭后导航里的「加热」消失，/heat 自动跳转到紧急页，监控也不再生成加热任务（紧急任务和打榜更新照常）。约 30 秒内对所有人生效。重新开启后，可用 <code>node scripts/heat-backfill.mjs</code> 补回关闭期间的加热任务。后台打不开时可用 SQL：<code>update public.site_settings set heat_enabled = false;</code></div>
      <Sql label="用 SQL 暂停" code="update public.weibo_watcher_settings set enabled = false;"/>
      <h3>重新开启</h3>
      <p>打开同一个开关（或把上面 SQL 的 <code>false</code> 改为 <code>true</code>）。</p>
      <div className="playbook-note playbook-note-gold"><b>重新开启时会补发</b>暂停期间的新微博（每个账号最近约 10 条以内）会在开启后的第一次扫描中全部生成任务。<b>如果不希望补发</b>，在开启<b>之前</b>先运行下面的「重置起点」SQL：下一次扫描只记录当前位置，之后的新微博才会发布。</div>
      <Sql label="重置起点（不补发暂停期间的微博）" code="delete from public.weibo_watch_state;"/>
    </Mode>
    <Mode id="relay" title="⑧ 自己运行读取程序（负责人不在时）" tag="接手 / 换电脑" tone="blue">
      <Facts rows={[
        ['用途','读取程序 weibo-relay 负责读取微博，只能在普通家庭宽带的电脑上运行（微博拒绝云服务器、公司网络和 VPN）。负责人的电脑不可用时，任何有后台和 Supabase 权限的人都可以按本节在自己的电脑上运行。'],
        ['同一时间只运行一个','两台电脑同时运行，微博会看到同一账号从两个地方频繁读取，容易被限制。接手前先确认负责人电脑上的窗口已经关闭；负责人回来后，两人商量好只留一台。'],
        ['需要准备','一台 Windows 或 Mac 电脑（家庭宽带，能长时间开机）；备用微博账号的登录方式（团队约定的保管处，建议提前向负责人要好）；Supabase Dashboard 权限；本网站代码（GitHub 仓库 menglu0706/ziyu-action-hub，需要仓库访问权限）。'],
      ]}/>
      <h3>第一次准备（约 15 分钟）</h3>
      <Steps>
        <li><b>安装 Node.js：</b>打开 <code>nodejs.org</code>，下载 LTS 版本并安装（一路「下一步」）。安装后打开 PowerShell（Mac 用「终端」）输入 <code>node -v</code>，显示 <code>v18</code> 或更高即可。</li>
        <li><b>下载网站代码：</b>GitHub 仓库页面 → 绿色 <b>Code</b> 按钮 → <b>Download ZIP</b>，解压到例如「文档\action-hub」。</li>
        <li><b>安装分享卡片识别组件（一次）：</b>在代码文件夹里的 <code>scripts</code> 文件夹打开终端，运行 <code>npm install</code>（约 1 分钟）。它用来识别小红书二维码和抖音分享卡片上的文字；不装也能运行，只是不会生成这类物料。第一次识别时还会自动下载约 10 MB 的中文识别数据。</li>
        <li><b>取得 WATCHER_KEY：</b>在 Supabase SQL Editor 运行下方「读取程序密钥」SQL，复制结果（一长串字符）。</li>
        <li><b>取得 WEIBO_COOKIE：</b>在这台电脑的 Chrome 里用备用微博账号登录 <code>m.weibo.cn</code> → 按 <b>F12</b> → 顶部 <b>Application</b>（应用）→ 左侧 <b>Cookies</b> → <code>https://m.weibo.cn</code> → 找到名称为 <b>SUB</b> 的一行，双击 Value 复制。之后<b>不要</b>在这个浏览器里点「退出登录」，否则 Cookie 立即失效。</li>
        <li><b>写入 .env.local：</b>在代码文件夹最外层（和 <code>package.json</code> 同一层）新建文本文件，命名为 <code>.env.local</code>（注意没有 .txt 后缀），内容两行：<br/><code>{'WEIBO_COOKIE="SUB=刚才复制的值"'}</code><br/><code>WATCHER_KEY=刚才复制的密钥</code><br/>这个文件只留在这台电脑上，不要发给任何人，也不要上传。</li>
        <li><b>检查关注：</b>备用微博账号必须关注下方<a href="#reference">关键信息</a>里的全部监控账号——读取程序读的是它的关注动态，没关注的账号读不到。</li>
        <li><b>关闭自动睡眠：</b>Windows：设置 → 系统 → 电源 → 「插入电源时，设备进入睡眠状态」选「从不」。Mac：系统设置 → 电池 / 节能 → 防止自动进入睡眠。</li>
      </Steps>
      <h3>运行</h3>
      <Steps>
        <li>打开代码文件夹，在空白处按住 Shift 点右键 →「在此处打开 PowerShell 窗口 / 在终端中打开」（Mac：右键文件夹 → 服务 → 新建位于文件夹位置的终端窗口），输入 <code>node scripts/weibo-relay.mjs</code> 回车。</li>
        <li>窗口会显示每次扫描的时间和结果。<b>保持窗口打开</b>（可以最小化）；关闭窗口或按 Ctrl+C 即停止。</li>
        <li>北京时间 1:00–8:00 程序会自动暂停，8:00 后自动继续，不需要操作。</li>
        <li><b>确认：</b>几分钟内，后台首页「微博监控」卡片显示「运行中」和最新扫描时间；之前有「已停止」提醒的话，会收到「微博监控已恢复」。</li>
      </Steps>
      <div className="playbook-note"><b>补发加热任务</b>某个账号第一次被读取时，只记录它最新一条微博作为起点，不会补发之前的微博。需要把最近的加热任务补上时，在同一个文件夹运行 <code>node scripts/heat-backfill.mjs</code>：它读取加热账号最近 10 小时的微博并逐条显示结果（已创建 / 跳过 / 忽略），已处理过的会自动跳过，可以放心重复运行。</div>
      <h3>什么时候需要重启（关闭窗口后重新运行）</h3>
      <Steps>
        <li>更新了 <code>WEIBO_COOKIE</code>（重新登录）之后。</li>
        <li>网站代码更新之后：重新下载 ZIP 覆盖旧文件，保留原来的 <code>.env.local</code>。</li>
        <li>增加或删除监控账号之后（改动由负责人或开发者完成）：增加账号时先重启读取程序、再部署监控函数；删除账号时顺序相反。</li>
      </Steps>
      <Sql label="读取程序密钥（WATCHER_KEY，只填入 .env.local，勿外传）" code={`select decrypted_secret\nfrom vault.decrypted_secrets\nwhere name = 'weibo_watcher_key';`}/>
    </Mode>

    <AdminCard className="playbook-card"><section id="sql">
      <h2>常用 SQL</h2>
      <p className="muted">{RUN_SQL}</p>
      <Sql label="最近扫描（约每 3–4 分钟一行，ok = true）" code={`select scanned_at, ok, error, duration_ms\nfrom public.weibo_scan_log\norder by scanned_at desc\nlimit 10;`}/>
      <Sql label="最近处理的微博" code={`select created_at, uid, kind, status, reason, title, post_id\nfrom public.weibo_ingest\norder by created_at desc\nlimit 20;`}/>
      <Sql label="今天失败或跳过的微博" code={`select created_at, uid, kind, status, reason, post_id\nfrom public.weibo_ingest\nwhere status in ('failed', 'skipped', 'processing')\n  and created_at > now() - interval '1 day'\norder by created_at desc;`}/>
      <Sql label="今天已发送的微信提醒" code={`select kind, sent_at\nfrom public.weibo_alerts\nwhere sent_on = (now() at time zone 'Asia/Shanghai')::date\norder by sent_at;`}/>
    </section></AdminCard>

    <AdminCard className="playbook-card"><section id="reference">
      <h2>关键信息</h2>
      <div className="table-scroll"><table className="admin-table playbook-table"><thead><tr><th>项目</th><th>值 / 位置</th></tr></thead><tbody>
        <tr><td>Supabase 项目</td><td>ziyu-action-hub（东京 ap-northeast-1）</td></tr>
        <tr><td>读取程序</td><td>负责人家用电脑上的 <code>weibo-relay</code>（约每 3–4 分钟读取一次微博；负责人不在时见 <a href="#relay">⑧</a>）</td></tr>
        <tr><td>监控函数</td><td>Edge Functions → <code>weibo-watcher</code>（处理读取结果；日志也在这里）</td></tr>
        <tr><td>定时任务</td><td><code>weibo-watcher</code>（每分钟检查是否收到扫描，超过 15 分钟没有则提醒）、<code>expire-auto-tasks</code>（每 5 分钟下线超过 24 小时的自动任务，以及过了截止时间的加热任务）、<code>purge-cron-history</code>（每天清理 7 天前的运行记录）、<code>purge-old-auto-data</code>（每天 4:05 删除下线超过 30 天的自动任务和 60 天前的监控记录；后台手动发布的任务不会被删除）</td></tr>
        <tr><td>密钥</td><td>保存在 Supabase，由负责人管理，<b>请勿修改或外传</b></td></tr>
        <tr><td>备用微博账号</td><td>由负责人保管；接手人提前向负责人要好登录方式，存放在团队约定的保管处</td></tr>
        <tr><td>监控账号<br/>（备用账号必须全部关注）</td><td><b>紧急任务：</b><AccountLinks accounts={WATCHED.urgent}/><br/><b>打榜更新：</b><AccountLinks accounts={WATCHED.update}/><br/><b>加热：</b><AccountLinks accounts={WATCHED.heat}/></td></tr>
      </tbody></table></div>
      <p className="muted">需要修改规则（标题、描述、处理哪些微博）、调整提醒额度或新增监控账号时，请联系负责人。</p>
    </section></AdminCard>
  </AdminShell>;
}
