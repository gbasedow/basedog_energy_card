/* basedog_energy_card v0.24.0 */
const CARD_VERSION="0.24.0";
const TAG="basedog-energy-card";
const ORDER=["floor","area","entity"];
const DEFAULT={type:"custom:basedog-energy-card",title:"Energieverbrauch",entity:"",source:"energy",levels:[...ORDER],show_date_picker:false,show_labels:true,show_values:false,orientation:"auto",group_mode:"value",group_below_kwh:0,group_levels:1,top_n:10};
const SOURCES=["energy","labels","entities"];
const UNITS={Wh:.001,kWh:1,MWh:1000,GJ:1/0.0036,MJ:1/3.6,kJ:1/3600,J:1/3600000};
const LEGACY=["duration","duration_unit","time_mode","end_time"];
const dayStart=d=>{const x=new Date(d);x.setHours(0,0,0,0);return x;};
const addDays=(d,n)=>{const x=new Date(d);x.setDate(x.getDate()+n);return dayStart(x);};
const isoDay=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const unique=a=>[...new Set(a||[])];
const activeLevels=c=>ORDER.filter(x=>(Array.isArray(c.levels)?c.levels:ORDER).includes(x));
// Energy of the period: sum of the hourly changes (the sum-difference would drop the first hour).
function delta(points){
 if(!Array.isArray(points)||!points.length)return null;
 const changes=points.filter(p=>p.change!=null&&Number.isFinite(Number(p.change)));
 if(changes.length)return Math.max(0,changes.reduce((n,p)=>n+Number(p.change),0));
 const sums=points.filter(p=>p.sum!=null&&Number.isFinite(Number(p.sum)));
 return sums.length>=2?Math.max(0,Number(sums.at(-1).sum)-Number(sums[0].sum)):null;
}
function normalize(c={}){
 const out={...DEFAULT,...c};
 for(const k of LEGACY)delete out[k];
 const labels=unique(c.labels),entities=unique(c.entities);
 // migrate configs from before the source option: labels win if only labels were used
 out.source=SOURCES.includes(c.source)?c.source:entities.length?"entities":labels.length?"labels":"energy";
 delete out.labels;delete out.entities;
 if(out.source==="labels")out.labels=labels;
 if(out.source==="entities")out.entities=entities;
 out.levels=activeLevels(c);
 out.group_below_kwh=Math.max(0,Number(out.group_below_kwh)||0);
 out.group_levels=Math.min(3,Math.max(1,Math.round(Number(out.group_levels)||1)));
 out.show_date_picker=out.show_date_picker===true;
 out.group_mode=out.group_mode==="top"?"top":"value";
 out.top_n=Math.max(1,Math.round(Number(out.top_n)||10));
 return out;
}
function place(r,devices,areas,floors){
 const d=devices.get(r?.device_id),a=areas.get(r?.area_id||d?.area_id);
 const f=floors.get(a?.floor_id);
 return {area:a?.name||"Ohne Bereich",floor:f?.name||"Ohne Etage"};
}
class BasedogEnergyCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:"open"});this.config=normalize({});this.last=0;this._signature="";this.vertical=false;this.cardWidth=0;this.resizeObserver=new ResizeObserver(entries=>{const w=entries[0]?.contentRect?.width||this.clientWidth,h=entries[0]?.contentRect?.height||0;const next=this.config.orientation==="vertical"||this.config.orientation!=="horizontal"&&w<700;if(next!==this.vertical||Math.abs(w-this.cardWidth)>4||Math.abs(h-(this.hostHeight||0))>4){this.hostHeight=h;this.cardWidth=w;this.vertical=next;this.render();}});this.resizeObserver.observe(this);}
 static getConfigElement(){return document.createElement("basedog-energy-card-editor");}
 static getStubConfig(){return {...DEFAULT};}
 setConfig(c){const next=normalize(c),sig=JSON.stringify(next);this.config=next;this.vertical=next.orientation==="vertical"||next.orientation!=="horizontal"&&(this.cardWidth||this.clientWidth)<700;if(sig!==this._signature){this._signature=sig;this.last=0;this.render();this.load();}}
 set hass(h){this._h=h;const today=!this.config.show_date_picker||!this._day||+this._day===+dayStart(new Date());
  if(!this.last||(today&&Date.now()-this.last>60000))this.load();}
 setDay(d){const today=dayStart(new Date());d=dayStart(d);if(d>today)d=today;this._day=d;this.result=null;this.last=0;this.render();this.load();}
 disconnectedCallback(){this.resizeObserver?.disconnect();this._chartRO?.disconnect();}
 connectedCallback(){this.resizeObserver?.observe(this);}
 getCardSize(){return 5;}
 getGridOptions(){return {columns:12,min_columns:6,rows:6,min_rows:2};}
 set layout(v){if(v!==this._layout){this._layout=v;if(this.shadowRoot.firstChild)this.render();}}
 get layout(){return this._layout;}
 async load(){
  const h=this._h,c=this.config;if(!h||!c.entity)return;
  if(this.busy){this._again=true;return;}
  this.busy=true;this.last=Date.now();
  try{
   const today=dayStart(new Date());
   if(!c.show_date_picker||!this._day)this._day=today;
   const day=this._day,start=day.getTime(),end=Math.min(addDays(day,1).getTime(),Date.now());
   const [entities,devices,areas,floors]=await Promise.all([
    h.callWS({type:"config/entity_registry/list"}),
    h.callWS({type:"config/device_registry/list"}),
    h.callWS({type:"config/area_registry/list"}),
    h.callWS({type:"config/floor_registry/list"}).catch(()=>[])
   ]);
   const deviceMap=new Map(devices.map(d=>[d.id,d]));
   const areaMap=new Map(areas.map(a=>[a.area_id,a]));
   const floorMap=new Map(floors.map(f=>[f.floor_id,f]));
   const entityMap=new Map(entities.map(e=>[e.entity_id,e]));
   const chosen=new Set(),names=new Map();
   if(c.source==="energy"){
    // devices from the energy dashboard; sub-devices (included_in_stat) are skipped to avoid double counting
    const prefs=await h.callWS({type:"energy/get_prefs"});
    for(const d of prefs?.device_consumption||[]){
     if(!d?.stat_consumption||d.included_in_stat)continue;
     chosen.add(d.stat_consumption);if(d.name)names.set(d.stat_consumption,d.name);
    }
   }else if(c.source==="labels"){
    const labels=new Set(c.labels||[]);
    for(const e of entities){
     const device=deviceMap.get(e.device_id);
     if(e.labels?.some(l=>labels.has(l))||device?.labels?.some(l=>labels.has(l)))chosen.add(e.entity_id);
    }
   }else for(const id of c.entities||[])chosen.add(id);
   chosen.delete(c.entity);
   const ids=[c.entity,...chosen];
   const meta=await h.callWS({type:"recorder/get_statistics_metadata",statistic_ids:ids}).catch(()=>[]);
   const metaMap=new Map((meta||[]).map(m=>[m.statistic_id,m]));
   const isEnergy=id=>{const m=metaMap.get(id);if(m)return m.unit_class==="energy"||Object.hasOwn(UNITS,m.statistics_unit_of_measurement||"");
    return h.states[id]?.attributes?.device_class==="energy"||Object.hasOwn(UNITS,h.states[id]?.attributes?.unit_of_measurement||"");};
   const energyIds=ids.filter(isEnergy);
   const excluded=[...chosen].filter(id=>!energyIds.includes(id));
   if(!energyIds.includes(c.entity))throw Error("Die Gesamtentität ist keine Energie-Entität mit Langzeitstatistik (z. B. kWh).");
   const stats=await h.callWS({type:"recorder/statistics_during_period",start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),statistic_ids:energyIds,period:"hour",types:["change","sum"],units:{energy:"kWh"}});
   const values=new Map(),missing=[...excluded];
   for(const id of energyIds){
    let v=delta(stats?.[id]);
    // fallback when the backend did not convert: use the unit from metadata/state
    const unit=metaMap.get(id)?.statistics_unit_of_measurement||h.states[id]?.attributes?.unit_of_measurement;
    if(v!==null&&!metaMap.get(id)&&Object.hasOwn(UNITS,unit||""))v*=UNITS[unit];
    if(v===null){if(id!==c.entity)missing.push(id);}else values.set(id,v);
   }
   if(!values.has(c.entity))throw Error("Für den Gesamtzähler sind an diesem Tag keine Langzeitstatistiken verfügbar.");
   const rows=[...chosen].filter(id=>values.has(id)).map(id=>{
    const e=entityMap.get(id),p=place(e,deviceMap,areaMap,floorMap);
    return {id,name:names.get(id)||h.states[id]?.attributes?.friendly_name||metaMap.get(id)?.name||id,value:values.get(id),...p};
   });
   this.result={total:values.get(c.entity),rows,missing:unique(missing),selected:chosen.size};
   this.error="";
  }catch(e){this.error=String(e?.message||e);}
  finally{this.busy=false;this.render();if(this._again){this._again=false;this.load();}}
 }
 render(){
  const c=this.config,r=this.result;
  const css='<style>:host{display:block;height:100%}ha-card{height:400px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}ha-card.is-vertical{height:500px}ha-card.is-grid,ha-card.is-panel{height:100%;min-height:300px}.content{flex:1;display:flex;flex-direction:column;min-height:0;box-sizing:border-box}.chart{flex:1;position:relative;min-height:120px;min-width:0}.chart svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}.card-header{font-family:var(--ha-card-header-font-family,inherit);font-size:var(--ha-card-header-font-size,24px);font-weight:var(--ha-font-weight-normal,400);letter-spacing:-.012em;line-height:32px;color:var(--ha-card-header-color,var(--primary-text-color));padding:24px 16px 16px;display:block}.content{padding:0 16px 16px}.card-header+.content{padding-top:0}ha-card.has-datebar .content{padding-bottom:2px}.datebar{flex:none;display:flex;align-items:center;justify-content:flex-end;gap:2px;padding:0 8px 6px 10px;font-size:13px;color:var(--secondary-text-color)}.datebar button{position:relative;display:inline-flex;align-items:center;gap:6px;height:28px;border:0;border-radius:14px;background:none;color:inherit;font:inherit;cursor:pointer;padding:0 8px}.datebar button:hover:not(:disabled){background:color-mix(in srgb,var(--primary-text-color) 8%,transparent)}.datebar button:disabled{opacity:.35;cursor:default}.datebar ha-icon{--mdc-icon-size:18px}.datebar .nav{width:28px;padding:0;justify-content:center}.datebar .spacer{flex:1}.datebar .today{font-size:12px;font-weight:500;padding:0 10px;color:var(--primary-color);background:color-mix(in srgb,var(--primary-color) 12%,transparent)}.datebar .today:disabled{opacity:.5}.datebar input{position:absolute;inset:0;opacity:0;pointer-events:none;width:100%;border:0;padding:0}.muted{color:var(--secondary-text-color);font-size:12px;margin:8px 0 0}p.warning,p.error{margin:0 0 8px}.warning{color:var(--warning-color,#c57c00)}.error{color:var(--error-color,#d44)}.scroll{overflow-x:auto}svg{display:block;width:100%;max-width:100%;height:auto}.scroll{min-width:0} .sankey-hover{cursor:help} .tip{position:fixed;z-index:9999;pointer-events:none;background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,#777);box-shadow:0 6px 20px #0004;border-radius:8px;padding:10px 12px;max-width:280px;white-space:pre-line;font-size:13px;display:none}svg text{fill:var(--primary-text-color,currentColor);font-family:Roboto,Noto,sans-serif;font-weight:400}svg path.sankey-hover{transition:fill-opacity .15s}svg path.sankey-hover:hover{fill-opacity:.7}svg rect.sankey-hover{cursor:default}.sankey-hover{cursor:default}details{flex:none;margin-top:8px;font-size:13px}details summary{cursor:pointer}details ul{max-height:140px;overflow:auto;margin:6px 0 0;padding-left:20px}details li{overflow-wrap:anywhere;line-height:1.5}details .id{color:var(--secondary-text-color);font-size:12px}</style>';
  const body=!c.entity?"Bitte die zentrale Energieentität im Karteneditor auswählen.":this.error?'<p class="error">'+esc(this.error)+'</p>':r?this.diagram(r):"Lade Verbrauchsdaten …";
  this.shadowRoot.innerHTML=css+'<ha-card class="'+(this.vertical?"is-vertical ":"")+(c.show_date_picker?"has-datebar ":"")+(this._layout==="grid"?"is-grid":this._layout==="panel"?"is-panel":"")+'">'+(c.title?'<div class="card-header">'+esc(c.title)+'</div>':'')+'<div class="content">'+body+'</div>'+this.dateBar()+'</ha-card>';
  {const ch=this.shadowRoot.querySelector(".chart");
   if(ch&&!this._measuring){const w=Math.round(ch.clientWidth),h=Math.round(ch.clientHeight);
    if(w>0&&h>0&&(Math.abs(w-(this.chartW||0))>1||Math.abs(h-(this.chartH||0))>1)){this.chartW=w;this.chartH=h;this._measuring=true;try{this.render();}finally{this._measuring=false;}return;}}
   // keep the SVG in sync with the real chart box: HA resizes grid cells after the first render
   this._chartRO?.disconnect();
   if(ch){this._chartRO=new ResizeObserver(entries=>{const r=entries[0]?.contentRect;if(!r)return;const w=Math.round(r.width),h=Math.round(r.height);
    if(w>0&&h>0&&(Math.abs(w-(this.chartW||0))>1||Math.abs(h-(this.chartH||0))>1)){this.chartW=w;this.chartH=h;cancelAnimationFrame(this._raf);this._raf=requestAnimationFrame(()=>this.render());}});
    this._chartRO.observe(ch);}}
  this.bindDateBar();
  {const d=this.shadowRoot.querySelector("#missing");if(d){d.querySelector("summary").onclick=()=>{this._missingOpen=!d.open;};}}
  const tip=this.shadowRoot.querySelector("#sankey-tip");
  if(tip){
   const svg=this.shadowRoot.querySelector("svg");
   svg?.addEventListener("pointermove",e=>{const el=e.target.closest?.("[data-tip]");if(!el){tip.style.display="none";return;}tip.textContent=el.getAttribute("data-tip");tip.style.display="block";const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.max(8,Math.min(e.clientX+14,window.innerWidth-w-8))+"px";tip.style.top=Math.max(8,Math.min(e.clientY+14,window.innerHeight-h-8))+"px";});
   svg?.addEventListener("pointerleave",()=>tip.style.display="none");
  }
 }
 dateBar(){
  if(!this.config.show_date_picker)return "";
  const today=dayStart(new Date()),day=this._day||today,isToday=+day===+today;
  const lang=this._h?.locale?.language||this._h?.language||undefined;
  const opts=day.getFullYear()===today.getFullYear()?{day:"numeric",month:"short"}:{day:"numeric",month:"short",year:"numeric"};
  const label=new Intl.DateTimeFormat(lang,opts).format(day);
  return '<div class="datebar"><button class="date" id="db-date" title="Datum wählen"><ha-icon icon="mdi:calendar"></ha-icon><span>'+esc(label)+'</span><input type="date" id="db-input" tabindex="-1" max="'+isoDay(today)+'" value="'+isoDay(day)+'"></button>'+
   '<button class="today" id="db-today" '+(isToday?"disabled":"")+'>Heute</button>'+
   '<button class="nav" id="db-prev" title="Vorheriger Tag"><ha-icon icon="mdi:chevron-left"></ha-icon></button>'+
   '<button class="nav" id="db-next" title="Nächster Tag" '+(isToday?"disabled":"")+'><ha-icon icon="mdi:chevron-right"></ha-icon></button></div>';
 }
 bindDateBar(){
  const r=this.shadowRoot,input=r.querySelector("#db-input");if(!input)return;
  const day=()=>this._day||dayStart(new Date());
  r.querySelector("#db-prev").onclick=()=>this.setDay(addDays(day(),-1));
  r.querySelector("#db-next").onclick=()=>this.setDay(addDays(day(),1));
  r.querySelector("#db-today").onclick=()=>this.setDay(new Date());
  r.querySelector("#db-date").onclick=()=>{try{input.showPicker();}catch(e){input.focus();input.click();}};
  input.onchange=()=>{if(input.value){const [y,m,d]=input.value.split("-").map(Number);this.setDay(new Date(y,m-1,d));}};
 }
 diagram(data){
  // Layout and look follow the native HA energy Sankey (ha-sankey-chart.ts / ECharts):
  // nodeWidth 15, nodeGap 6, label font 12, link opacity .4 with curveness .5,
  // one shared value scale, nodes stacked from the top, labels right of / below nodes.
  const cfg=this.config,levels=activeLevels(cfg),vertical=this.vertical;
  const showValues=cfg.show_values===true;
  const NODE=15,GAP=6,LABEL_DIST=5,FONT=12,MARGIN=5;
  const st=getComputedStyle(this),cv=n=>st.getPropertyValue(n).trim();
  const primary=cv("--primary-color")||"#03a9f4",gray=cv("--state-unavailable-color")||"#bdbdbd";
  const graph=i=>cv("--graph-color-"+(i+1))||cv("--color-"+((i%54)+1))||primary;
  const lang=this._h?.locale?.language||this._h?.language||undefined;
  const fmt=v=>new Intl.NumberFormat(lang,v<.1?{maximumFractionDigits:3}:{maximumFractionDigits:2}).format(v)+" kWh";
  // --- tree of nodes -------------------------------------------------------
  const root={id:"root",label:this._h?.states[cfg.entity]?.attributes?.friendly_name||cfg.entity,value:Math.max(0,data.total),depth:0,color:primary};
  const nodes=[root],children=new Map(),map=new Map(),links=[];
  const add=(n,parent)=>{nodes.push(n);if(parent){if(!children.has(parent))children.set(parent,[]);children.get(parent).push(n);}};
  // Top N: keep the N largest consumers, everything else becomes one group node from the root.
  const topMode=cfg.group_mode==="top";
  let treeRows=data.rows.filter(r=>r.value>0),others=[];
  if(topMode){const sorted=[...treeRows].sort((a,b)=>b.value-a.value);treeRows=sorted.slice(0,cfg.top_n);others=sorted.slice(cfg.top_n);}
  for(const row of treeRows){
   let parent="root",path="";
   for(let i=0;i<levels.length;i++){
    const level=levels[i],name=level==="entity"?row.name:row[level];
    path+=JSON.stringify([level,level==="entity"?row.id:name])+"/";
    if(!map.has(path)){
     const n={id:path,parent,depth:i+1,label:name,value:0,color:primary,leaf:i===levels.length-1};
     map.set(path,n);add(n,parent);
    }
    map.get(path).value+=row.value;parent=path;
   }
  }
  const lastDepth=Math.max(1,levels.length);
  // Fold small values: bottom-up over the configured number of levels, all children of one
  // parent below the threshold become one "Zusammengefasst" node in the last column.
  const threshold=Math.max(0,Number(cfg.group_below_kwh)||0);
  const groupLevels=Math.min(lastDepth,Math.max(1,Number(cfg.group_levels)||1));
  if(topMode&&others.length)add({id:"group:top",parent:"root",depth:lastDepth,label:"Zusammengefasst ("+others.length+")",value:others.reduce((t,r)=>t+r.value,0),leaf:true,grouped:true},"root");
  if(!topMode&&threshold>0){
   const removed=new Set(),drop=id=>{removed.add(id);for(const k of children.get(id)||[])drop(k.id);};
   for(let k=0;k<groupLevels;k++){
    const d=lastDepth-k;
    for(const parent of nodes.filter(n=>n.depth===d-1&&!removed.has(n.id))){
     const list=children.get(parent.id)||[];
     const small=list.filter(n=>n.depth===d&&!n.grouped&&n.value<threshold);
     if(small.length<2)continue;
     small.forEach(n=>drop(n.id));
     children.set(parent.id,list.filter(n=>!removed.has(n.id)));
     add({id:"group:"+parent.id+"@"+d,parent:parent.id,depth:lastDepth,label:"Zusammengefasst ("+small.length+")",value:small.reduce((t,n)=>t+n.value,0),leaf:true,grouped:true},parent.id);
    }
   }
   for(let i=nodes.length-1;i>=0;i--)if(removed.has(nodes[i].id))nodes.splice(i,1);
  }
  let leafIndex=0;
  for(const n of nodes)if(n.leaf)n.color=n.grouped?gray:graph(leafIndex++);
  const assigned=data.rows.reduce((s,x)=>s+Math.max(0,x.value),0);
  if(data.total>assigned+.00001){
   const n={id:"untracked",parent:"root",depth:lastDepth,label:"Nicht erfasster Verbrauch",value:data.total-assigned,color:gray,leaf:true,untracked:true};
   add(n,"root");
  }
  for(const n of nodes)if(n.parent)links.push({source:n.parent,target:n.id,value:n.value});
  // depth-first order keeps siblings with their parents; untracked goes last (like native).
  const tail=n=>n.untracked?2:n.grouped?1:0;
  for(const list of children.values())list.sort((a,b)=>tail(a)-tail(b));
  const rank=new Map(),walk=id=>{for(const n of children.get(id)||[]){rank.set(n.id,rank.size);walk(n.id);}};
  walk("root");
  const sections=lastDepth+1;
  const columns=Array.from({length:sections},(_,i)=>nodes.filter(n=>n.depth===i).sort((a,b)=>(rank.get(a.id)??-1)-(rank.get(b.id)??-1)));
  const ctx=this._ctx||(this._ctx=document.createElement("canvas").getContext("2d"));
  const FAMILY="Roboto, Noto, sans-serif";
  const width=(text,fs)=>{ctx.font=fs+"px "+FAMILY;return ctx.measureText(text).width;};
  const wrap=(text,fs,maxW)=>{
   const lines=[];let cur="";
   for(const word of String(text).split(/\s+/).filter(Boolean)){
    if(width(word,fs)>maxW)return null;
    const next=cur?cur+" "+word:word;
    if(cur&&width(next,fs)>maxW){lines.push(cur);cur=word;}else cur=next;
   }
   if(cur)lines.push(cur);
   return lines;
  };
  const fit=(n,maxW,maxH)=>{
   for(let fs=FONT;fs>=4;fs-=.5){
    const lines=wrap(n.label,fs,maxW);
    if(!lines)continue;
    if(showValues){if(width(fmt(n.value),fs)>maxW)continue;lines.push(fmt(n.value));}
    if(vertical?lines.length<=3:lines.length*fs*1.2<=maxH)return {fs,lines};
   }
   if(showValues){
    const one=n.label+" · "+fmt(n.value);
    for(let fs=FONT;fs>=4;fs-=.5)if(width(one,fs)<=maxW&&(vertical||fs*1.2<=maxH))return {fs,lines:[one]};
   }
   return null;
  };
  // --- geometry: port of HA's sankey-layout.ts (justify, pass-through nodes, space-around) ---
  const hasTitle=!!cfg.title;
  const W=this.chartW||Math.max(200,Math.round((this.cardWidth||this.clientWidth||600)-32));
  const H=this.chartH||Math.max(120,(vertical?500:400)-(hasTitle?72+16:32));
  const left=vertical?MARGIN:0,top=vertical?0:MARGIN;
  const across=vertical?W-2*MARGIN:H-2*MARGIN;
  const sectionSize=Math.max(20,across-GAP*2);
  const nodeById=new Map(nodes.map(n=>[n.id,n]));
  // pass-through nodes: a link spanning several sections occupies space in each one
  const sectionItems=Array.from({length:sections},()=>[]);
  for(const n of nodes)sectionItems[n.depth].push({id:n.id,value:n.value,rank:n.id==="root"?-1:(rank.get(n.id)??0),real:true});
  for(const l of links){
   const s=nodeById.get(l.source),t=nodeById.get(l.target);l.pts=[];
   for(let d=s.depth+1;d<t.depth;d++){
    const id="pt:"+l.source+">"+l.target+"@"+d;l.pts.push(id);
    sectionItems[d].push({id,value:l.value,rank:rank.get(l.target)??0,real:false});
   }
  }
  const setSizes=(items,avail,total,prev)=>{
   let ratio=total/Math.max(1,avail);if(ratio<prev)ratio=prev;
   let deficit=0;
   const res=items.map(it=>{
    if(it.size===1)return it;
    let size=Math.floor(it.value/ratio);
    if(size<1){deficit+=1-size;size=1;}
    return {...it,size};
   });
   return deficit>0?setSizes(res,avail-deficit,total,ratio):{items:res,ratio};
  };
  let globalRatio=0;
  const secs=sectionItems.map(list=>{
   list.sort((a,b)=>a.rank-b.rank);
   const items=list.map(x=>({...x,size:0})),total=items.reduce((s,x)=>s+x.value,0);
   const r=setSizes(items,sectionSize-(items.length+1)*GAP,total,globalRatio);
   if(r.ratio>globalRatio)globalRatio=r.ratio;
   return r;
  });
  const pos=new Map();
  secs.forEach((sec,i)=>{
   if(sec.ratio!==globalRatio)for(const it of sec.items)it.size=Math.max(1,Math.floor(it.value/globalRatio));
   const used=sec.items.reduce((s,x)=>s+x.size,0),empty=sectionSize-used,step=empty/(sec.items.length+1);
   let off=step;
   for(const it of sec.items){
    const a=0;
    pos.set(it.id,vertical?{x:left+off,y:a,w:it.size,h:NODE,size:it.size,pitch:it.size+step,pt:!it.real,idx:i}:{x:a,y:top+off,w:NODE,h:it.size,size:it.size,pitch:it.size+step,pt:!it.real,idx:i});
    off+=it.size+step;
   }
  });
  // use the complete width (horizontal) / height (vertical): the last row/column
  // gets exactly the space its labels need, all sections are spread evenly up to it.
  const labelsOn=cfg.show_labels!==false;
  let lastLabelW=0,bottomSpace=MARGIN;
  if(labelsOn){
   const lastNodes=nodes.filter(n=>n.depth===lastDepth);
   if(vertical){
    let need=0;
    for(const n of lastNodes){const p=pos.get(n.id),f=fit(n,Math.max(1,p.w+6-MARGIN),Infinity);if(f)need=Math.max(need,f.lines.length*f.fs*1.2);}
    bottomSpace=need?LABEL_DIST+need+MARGIN:MARGIN;
   }else{
    // reserve exactly the width the (possibly shrunk) labels really occupy
    const cap=Math.max(60,W*.35);
    for(const n of lastNodes){
     const p=pos.get(n.id),f=fit(n,cap,Math.max(p.h+2,p.pitch-1));
     if(f)for(const line of f.lines)lastLabelW=Math.max(lastLabelW,width(line,f.fs));
    }
    lastLabelW=Math.min(Math.ceil(lastLabelW)+3,cap);
   }
  }
  const lastAlong=vertical?H-NODE-bottomSpace:W-NODE-(labelsOn?LABEL_DIST+lastLabelW:0);
  const depthSize=Math.max(1,lastAlong)/(sections-1);
  const labelSpace=lastLabelW||Math.max(30,depthSize-NODE-LABEL_DIST);
  for(const p of pos.values()){if(vertical)p.y=p.idx*depthSize;else p.x=p.idx*depthSize;}
  const labelSpaceFor=n=>n.depth===lastDepth?Math.max(30,lastLabelW):Math.max(30,depthSize-NODE-LABEL_DIST);
  const breadth=id=>{const p=pos.get(id);return vertical?p.x:p.y;};
  // edge ports: thickness from the source node, ordered by neighbour position
  const outs=new Map(),ins=new Map();
  for(const l of links){
   const s=pos.get(l.source),sv=nodeById.get(l.source).value;
   l.size=Math.max(1,l.value/Math.max(1e-9,sv)*s.size);
   if(!outs.has(l.source))outs.set(l.source,[]);outs.get(l.source).push(l);
   if(!ins.has(l.target))ins.set(l.target,[]);ins.get(l.target).push(l);
  }
  for(const list of outs.values()){list.sort((a,b)=>breadth(a.target)-breadth(b.target));let o=0;for(const l of list){l.sOff=o;o+=l.size;}}
  for(const list of ins.values()){list.sort((a,b)=>breadth(a.source)-breadth(b.source));let o=0;for(const l of list){l.tOff=o;o+=l.size;}}
  // --- links (same bezier construction as HA's sankey-path.ts, curveness .5) ---
  let gradients="",paths="",bars="",labels="";
  const tipText=(a,b)=>esc(a+"\n"+b);
  const CURVE=.5;
  const seg=(a,b,type)=>type==="line"?' L'+b.x+' '+b.y:vertical?
    ' C'+a.x+' '+(a.y*(1-CURVE)+b.y*CURVE)+','+b.x+' '+(b.y*(1-CURVE)+a.y*CURVE)+','+b.x+' '+b.y:
    ' C'+(a.x*(1-CURVE)+b.x*CURVE)+' '+a.y+','+(b.x*(1-CURVE)+a.x*CURVE)+' '+b.y+','+b.x+' '+b.y;
  links.forEach((l,i)=>{
   const s=pos.get(l.source),t=pos.get(l.target),src=nodeById.get(l.source),tgt=nodeById.get(l.target);
   if(!s||!t||!(l.value>0))return;
   const w=l.size;
   const pts=[vertical?{x:s.x+l.sOff,y:s.y+s.h,type:"curve"}:{x:s.x+s.w,y:s.y+l.sOff,type:"curve"}];
   for(const id of l.pts){
    const p=pos.get(id);
    pts.push({x:p.x,y:p.y,type:"curve"});
    pts.push(vertical?{x:p.x,y:p.y+p.h,type:"line"}:{x:p.x+p.w,y:p.y,type:"line"});
   }
   pts.push(vertical?{x:t.x+l.tOff,y:t.y,type:"curve"}:{x:t.x,y:t.y+l.tOff,type:"curve"});
   const off=p=>vertical?{x:p.x+w,y:p.y}:{x:p.x,y:p.y+w};
   let d='M'+pts[0].x+' '+pts[0].y;
   for(let k=1;k<pts.length;k++)d+=seg(pts[k-1],pts[k],pts[k].type);
   const last=off(pts[pts.length-1]);d+=' L'+last.x+' '+last.y;
   for(let k=pts.length-2;k>=0;k--)d+=seg(off(pts[k+1]),off(pts[k]),pts[k+1].type);
   d+=' Z';
   const gid="basedog-flow-"+i,a=pts[0],b=pts[pts.length-1];
   gradients+='<linearGradient id="'+gid+'" gradientUnits="userSpaceOnUse" x1="'+a.x+'" y1="'+a.y+'" x2="'+(vertical?a.x:b.x)+'" y2="'+(vertical?b.y:a.y)+'"><stop offset="0" stop-color="'+esc(src.color)+'"/><stop offset="1" stop-color="'+esc(tgt.color)+'"/></linearGradient>';
   paths+='<path class="sankey-hover" data-tip="'+tipText(src.label+" → "+tgt.label,fmt(l.value))+'" d="'+d+'" fill="url(#'+gid+')" fill-opacity=".4"></path>';
  });
  // --- labels (wrapped, font reduced to fit, like the native labelLayout) -----
  for(const n of nodes){
   const p=pos.get(n.id);if(!p)continue;
   const tip=tipText(n.label,fmt(n.value));
   bars+='<rect class="sankey-hover" data-tip="'+tip+'" x="'+p.x+'" y="'+p.y+'" width="'+p.w+'" height="'+p.h+'" rx="2" fill="'+esc(n.color)+'"></rect>';
   if(cfg.show_labels===false)continue;
   if(vertical){
    const maxW=Math.max(1,p.w+6-MARGIN),f=fit(n,maxW,Infinity);if(!f)continue;
    const cx=p.x+p.w/2,lh=f.fs*1.2;
    labels+=f.lines.map((t,i)=>'<text x="'+cx+'" y="'+(p.y+p.h+LABEL_DIST+lh/2+i*lh)+'" text-anchor="middle" dominant-baseline="middle" font-size="'+f.fs+'">'+esc(t)+'</text>').join("");
   }else{
    const f=fit(n,labelSpaceFor(n),Math.max(p.h+2,p.pitch-1));if(!f)continue;
    const cy=p.y+p.h/2,lh=f.fs*1.2,x=p.x+p.w+LABEL_DIST;
    labels+=f.lines.map((t,i)=>'<text x="'+x+'" y="'+(cy+(i-(f.lines.length-1)/2)*lh)+'" dominant-baseline="middle" font-size="'+f.fs+'">'+esc(t)+'</text>').join("");
   }
  }
  const missing=data.missing.length?'<details id="missing"'+(this._missingOpen?' open':'')+'><summary class="warning">'+data.missing.length+' ausgewählte Entitäten ohne auswertbare Energie-Statistiken</summary><ul>'+
   data.missing.map(id=>{const n=this._h?.states[id]?.attributes?.friendly_name;return '<li>'+(n?esc(n)+' <span class="id">'+esc(id)+'</span>':esc(id))+'</li>';}).join("")+'</ul></details>':"";
  return (assigned>data.total+.00001?'<p class="warning">Zugeordnete Werte übersteigen den Gesamtverbrauch. Prüfe Doppelzählungen.</p>':"")+'<div class="chart"><svg preserveAspectRatio="xMinYMin meet" viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sankey-Energieverbrauch"><defs>'+gradients+'</defs>'+paths+bars+labels+'</svg></div><div id="sankey-tip" class="tip" role="tooltip"></div>'+missing;
 }
}
const EDITOR_LABELS={title:"Titel",entity:"Zentrale Energieentität (Gesamtverbrauch)",source:"Quelle der Verbraucher",labels:"Labels",entities:"Energie-Entitäten",
 show_date_picker:"Datumsauswahl unten anzeigen",orientation:"Darstellung",levels:"Ebenen",show_labels:"Beschriftung anzeigen",
 show_values:"Energiewerte (kWh) anzeigen",group_below_kwh:"Kleine Werte zusammenfassen unter",group_levels:"Zusammenfassen über Ebenen",group_mode:"Zusammenfassen nach",top_n:"Anzahl der größten Verbraucher (N)"};
const EDITOR_HELP={source:"Energie-Dashboard: Geräte aus den Energie-Einstellungen. Labels/Entitäten: eigene Auswahl.",
 show_date_picker:"Ohne Datumsauswahl wird immer der heutige Tag angezeigt.",levels:"Reihenfolge immer Etage → Bereich → Entität.",
 group_below_kwh:"Dezimalzahl in kWh, z. B. 0,05. 0 = aus",show_values:"Wird an die Beschriftung angehängt, wenn Platz ist; sonst im Tooltip.",group_levels:"1 = nur Entitäten, 2 = auch Bereiche, 3 = auch Etagen",top_n:"Alle übrigen Verbraucher werden zu einem Knoten zusammengefasst."};
const ENERGY_FILTER={domain:"sensor",device_class:"energy"};
function editorSchema(c){
 return [
  {name:"title",selector:{text:{}}},
  {name:"entity",required:true,selector:{entity:{filter:ENERGY_FILTER}}},
  {name:"source",selector:{select:{mode:"dropdown",options:[{value:"energy",label:"Energie-Dashboard"},{value:"labels",label:"Labels"},{value:"entities",label:"Entitäten"}]}}},
  ...(c.source==="labels"?[{name:"labels",selector:{label:{multiple:true}}}]:[]),
  ...(c.source==="entities"?[{name:"entities",selector:{entity:{multiple:true,filter:ENERGY_FILTER}}}]:[]),
  {name:"show_labels",selector:{boolean:{}}},
  {name:"show_values",selector:{boolean:{}}},
  {name:"show_date_picker",selector:{boolean:{}}},
  {name:"orientation",selector:{select:{mode:"dropdown",options:[{value:"auto",label:"Automatisch nach Breite"},{value:"vertical",label:"Immer vertikal"},{value:"horizontal",label:"Immer horizontal"}]}}},
  {name:"levels",selector:{select:{multiple:true,mode:"list",options:[{value:"floor",label:"Etage"},{value:"area",label:"Bereich"},{value:"entity",label:"Entität"}]}}},
  {name:"group_mode",selector:{select:{mode:"dropdown",options:[{value:"value",label:"Wert (Schwelle)"},{value:"top",label:"Top N"}]}}},
  ...(c.group_mode==="top"?[{name:"top_n",selector:{number:{min:1,step:1,mode:"box"}}}]:[{type:"grid",name:"",schema:[
   {name:"group_below_kwh",selector:{number:{min:0,step:"any",mode:"box",unit_of_measurement:"kWh"}}},
   {name:"group_levels",selector:{number:{min:1,max:3,step:1,mode:"box"}}}
  ]}])
 ];
}
class BasedogEnergyEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:"open"});this.config=normalize({});}
 setConfig(c){this.config=normalize(c);this.update();}
 set hass(h){this._h=h;this.update();}
 connectedCallback(){this.ensureForm();}
 async ensureForm(){
  // ha-form and the selectors are lazy loaded by HA; loading a built-in card editor pulls them in.
  if(!customElements.get("ha-form")){
   try{const helpers=await window.loadCardHelpers?.();const card=await helpers?.createCardElement({type:"entities",entities:[]});await card?.constructor?.getConfigElement?.();}catch(e){}
  }
  this.update();
 }
 update(){
  const r=this.shadowRoot;
  if(!r.childElementCount){
   r.innerHTML='<style>.version{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;margin-bottom:12px;border:1px solid var(--divider-color,#aaa);border-radius:8px;font-size:13px;color:var(--secondary-text-color)}.version b{color:var(--primary-text-color);font-weight:500}</style>'+
    '<div class="version"><b>basedog_energy_card</b><span>Version '+CARD_VERSION+'</span></div>';
   const form=document.createElement("ha-form");
   form.computeLabel=s=>EDITOR_LABELS[s.name]??s.name;
   form.computeHelper=s=>EDITOR_HELP[s.name];
   form.addEventListener("value-changed",ev=>{ev.stopPropagation();this.config=normalize({...ev.detail.value,type:this.config.type});this.update();this.emit();});
   r.append(form);this._form=form;
  }
  if(this._h)this._form.hass=this._h;
  const data={...this.config,labels:this.config.labels||[],entities:this.config.entities||[]};
  this._form.schema=editorSchema(this.config);
  this._form.data=data;
 }
 emit(){this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this.config},bubbles:true,composed:true}));}
}
if(!customElements.get(TAG))customElements.define(TAG,BasedogEnergyCard);
if(!customElements.get("basedog-energy-card-editor"))customElements.define("basedog-energy-card-editor",BasedogEnergyEditor);
window.customCards=window.customCards||[];
if(!window.customCards.some(x=>x.type===TAG))window.customCards.push({type:TAG,name:"basedog_energy_card",description:"Energie-Sankey eines Tages nach Etage, Bereich und Entität"});
