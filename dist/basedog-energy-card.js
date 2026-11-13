/* basedog_energy_card v0.19.0 */
const CARD_VERSION="0.19.0";
const TAG="basedog-energy-card";
const ORDER=["floor","area","entity"];
const DEFAULT={type:"custom:basedog-energy-card",title:"Energieverbrauch",entity:"",entities:[],labels:[],duration:24,duration_unit:"hours",time_mode:"now",end_time:"",levels:[...ORDER],show_labels:true,show_values:false,orientation:"auto",group_below_kwh:0};
const UNITS={Wh:.001,kWh:1,MWh:1000,J:1/3600000,kJ:1/3600,MJ:1/3.6};
const DURATIONS={minutes:60000,hours:3600000,days:86400000,weeks:604800000};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const unique=a=>[...new Set(a||[])];
const activeLevels=c=>ORDER.filter(x=>(Array.isArray(c.levels)?c.levels:ORDER).includes(x));
const kwh=(v,unit)=>Object.hasOwn(UNITS,unit)?v*UNITS[unit]:null;
function delta(points){
 if(!Array.isArray(points)||!points.length)return null;
 const sums=points.filter(p=>p.sum!=null&&Number.isFinite(Number(p.sum)));
 if(sums.length>=2)return Math.max(0,Number(sums.at(-1).sum)-Number(sums[0].sum));
 const changes=points.filter(p=>p.change!=null&&Number.isFinite(Number(p.change)));
 return changes.length?Math.max(0,changes.reduce((n,p)=>n+Number(p.change),0)):null;
}
function normalize(c){return {...DEFAULT,...c,levels:activeLevels(c),entities:unique(c.entities),labels:unique(c.labels)};}
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
 set hass(h){this._h=h;if(Date.now()-this.last>60000)this.load();}
 disconnectedCallback(){this.resizeObserver?.disconnect();}
 connectedCallback(){this.resizeObserver?.observe(this);}
 getCardSize(){return 5;}
 getGridOptions(){return {columns:12,min_columns:6,rows:6,min_rows:2};}
 set layout(v){if(v!==this._layout){this._layout=v;if(this.shadowRoot.firstChild)this.render();}}
 get layout(){return this._layout;}
 async load(){
  const h=this._h,c=this.config;if(!h||!c.entity||this.busy)return;
  this.busy=true;this.last=Date.now();
  try{
   const end=c.time_mode==="now"?Date.now():new Date(c.end_time).getTime();
   if(!Number.isFinite(end))throw Error("Ungültiger Bezugszeitpunkt");
   const start=end-(Number(c.duration)||24)*(DURATIONS[c.duration_unit]||DURATIONS.hours);
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
   const labels=new Set(c.labels);
   const chosen=new Set(c.entities);
   for(const e of entities){
    const device=deviceMap.get(e.device_id);
    if(e.labels?.some(l=>labels.has(l))||device?.labels?.some(l=>labels.has(l)))chosen.add(e.entity_id);
   }
   chosen.delete(c.entity);
   const ids=[c.entity,...chosen];
   const energyIds=ids.filter(id=>Object.hasOwn(UNITS,h.states[id]?.attributes?.unit_of_measurement||""));
   const excluded=[...chosen].filter(id=>!energyIds.includes(id));
   if(!energyIds.includes(c.entity))throw Error("Die Gesamtentität benötigt eine Energieeinheit (z. B. kWh).");
   const stats=await h.callWS({type:"recorder/statistics_during_period",start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),statistic_ids:energyIds,period:"hour",types:["sum","change"]});
   const values=new Map(),missing=[...excluded];
   for(const id of energyIds){
    const v=delta(stats?.[id]),value=v===null?null:kwh(v,h.states[id]?.attributes?.unit_of_measurement);
    if(value===null){if(id!==c.entity)missing.push(id);}else values.set(id,value);
   }
   if(!values.has(c.entity))throw Error("Für den Gesamtzähler sind im Zeitraum keine Langzeitstatistiken verfügbar.");
   const rows=[...chosen].filter(id=>values.has(id)).map(id=>{
    const e=entityMap.get(id),p=place(e,deviceMap,areaMap,floorMap);
    return {id,name:h.states[id]?.attributes?.friendly_name||id,value:values.get(id),...p};
   });
   this.result={total:values.get(c.entity),rows,missing:unique(missing),selected:chosen.size};
   this.error="";
  }catch(e){this.error=String(e.message||e);}
  finally{this.busy=false;this.render();}
 }
 render(){
  const c=this.config,r=this.result;
  const css='<style>:host{display:block}ha-card{height:400px;display:flex;flex-direction:column;overflow:hidden;box-sizing:border-box}ha-card.is-vertical{height:500px}ha-card.is-grid,ha-card.is-panel{height:100%}.content{flex:1;display:flex;flex-direction:column;min-height:0;box-sizing:border-box}.chart{flex:1;position:relative;min-height:0;min-width:0}.chart svg{position:absolute;inset:0;width:100%;height:100%;display:block;overflow:visible}.card-header{font-family:var(--ha-card-header-font-family,inherit);font-size:var(--ha-card-header-font-size,24px);font-weight:var(--ha-font-weight-normal,400);letter-spacing:-.012em;line-height:32px;color:var(--ha-card-header-color,var(--primary-text-color));padding:24px 16px 16px;display:block}.content{padding:0 16px 16px}.card-header+.content{padding-top:0}.muted{color:var(--secondary-text-color);font-size:12px;margin:8px 0 0}p.warning,p.error{margin:0 0 8px}.warning{color:var(--warning-color,#c57c00)}.error{color:var(--error-color,#d44)}.scroll{overflow-x:auto}svg{display:block;width:100%;max-width:100%;height:auto}.scroll{min-width:0} .sankey-hover{cursor:help} .tip{position:fixed;z-index:9999;pointer-events:none;background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,#777);box-shadow:0 6px 20px #0004;border-radius:8px;padding:10px 12px;max-width:280px;white-space:pre-line;font-size:13px;display:none}svg text{fill:var(--primary-text-color,currentColor);font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,Roboto,sans-serif));font-size:12px;font-weight:400}svg path.sankey-hover{transition:fill-opacity .15s}svg path.sankey-hover:hover{fill-opacity:.7}svg rect.sankey-hover{cursor:default}.sankey-hover{cursor:default}details{margin-top:10px;font-size:13px}details li{overflow-wrap:anywhere}</style>';
  const body=!c.entity?"Bitte die zentrale Energieentität im Karteneditor auswählen.":this.error?'<p class="error">'+esc(this.error)+'</p>':r?this.diagram(r):"Lade Verbrauchsdaten …";
  this.shadowRoot.innerHTML=css+'<ha-card class="'+(this.vertical?"is-vertical ":"")+(this._layout==="grid"?"is-grid":this._layout==="panel"?"is-panel":"")+'">'+(c.title?'<div class="card-header">'+esc(c.title)+'</div>':'')+'<div class="content">'+body+'</div></ha-card>';
  {const ch=this.shadowRoot.querySelector(".chart");
   if(ch&&!this._measuring){const w=Math.round(ch.clientWidth),h=Math.round(ch.clientHeight);
    if(w>0&&h>0&&(Math.abs(w-(this.chartW||0))>1||Math.abs(h-(this.chartH||0))>1)){this.chartW=w;this.chartH=h;this._measuring=true;try{this.render();}finally{this._measuring=false;}return;}}}
  const tip=this.shadowRoot.querySelector("#sankey-tip");
  if(tip){
   const svg=this.shadowRoot.querySelector("svg");
   svg?.addEventListener("pointermove",e=>{const el=e.target.closest?.("[data-tip]");if(!el){tip.style.display="none";return;}tip.textContent=el.getAttribute("data-tip");tip.style.display="block";const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.max(8,Math.min(e.clientX+14,window.innerWidth-w-8))+"px";tip.style.top=Math.max(8,Math.min(e.clientY+14,window.innerHeight-h-8))+"px";});
   svg?.addEventListener("pointerleave",()=>tip.style.display="none");
  }
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
  const threshold=Math.max(0,Number(cfg.group_below_kwh)||0),small=new Map(),rows=[];
  for(const row of data.rows){
   if(row.value>0&&threshold>0&&row.value<threshold){
    const key=JSON.stringify(levels.filter(x=>x!=="entity").map(x=>row[x]));
    if(!small.has(key))small.set(key,{...row,id:"group:"+key,name:"Zusammengefasst",value:0,grouped:true});
    small.get(key).value+=row.value;
   }else rows.push(row);
  }
  rows.push(...small.values());
  for(const row of rows){
   if(!(row.value>0))continue;
   let parent="root",path="";
   for(let i=0;i<levels.length;i++){
    const level=levels[i],name=level==="entity"?row.name:row[level];
    path+=JSON.stringify([level,level==="entity"?row.id:name])+"/";
    if(!map.has(path)){
     const n={id:path,parent,depth:i+1,label:name,value:0,color:primary,leaf:i===levels.length-1,grouped:row.grouped&&level==="entity"};
     map.set(path,n);add(n,parent);
    }
    map.get(path).value+=row.value;parent=path;
   }
  }
  const lastDepth=Math.max(1,levels.length);
  let leafIndex=0;
  for(const n of nodes)if(n.leaf)n.color=n.grouped?gray:graph(leafIndex++);
  const assigned=data.rows.reduce((s,x)=>s+Math.max(0,x.value),0);
  if(data.total>assigned+.00001){
   const n={id:"untracked",parent:"root",depth:lastDepth,label:"Nicht erfasster Verbrauch",value:data.total-assigned,color:gray,leaf:true,untracked:true};
   add(n,"root");
  }
  for(const n of nodes)if(n.parent)links.push({source:n.parent,target:n.id,value:n.value});
  // depth-first order keeps siblings with their parents; untracked goes last (like native).
  for(const list of children.values())list.sort((a,b)=>(a.untracked?1:0)-(b.untracked?1:0));
  const rank=new Map(),walk=id=>{for(const n of children.get(id)||[]){rank.set(n.id,rank.size);walk(n.id);}};
  walk("root");
  const sections=lastDepth+1;
  const columns=Array.from({length:sections},(_,i)=>nodes.filter(n=>n.depth===i).sort((a,b)=>(rank.get(a.id)??-1)-(rank.get(b.id)??-1)));
  // --- geometry: port of HA's sankey-layout.ts (justify, pass-through nodes, space-around) ---
  const hasTitle=!!cfg.title;
  const W=this.chartW||Math.max(200,Math.round((this.cardWidth||this.clientWidth||600)-32));
  const H=this.chartH||Math.max(120,(vertical?500:400)-(hasTitle?72+16:32));
  const labelSpace=Math.max(30,W/sections-NODE-LABEL_DIST);
  const bottomSpace=showValues?LABEL_DIST+FONT*3+MARGIN:25;
  const left=vertical?MARGIN:0,top=vertical?0:MARGIN;
  const across=vertical?W-2*MARGIN:H-2*MARGIN;
  const plotAlong=vertical?H-bottomSpace:W;
  const depthSize=plotAlong/sections;
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
    const a=i*depthSize;
    pos.set(it.id,vertical?{x:left+off,y:a,w:it.size,h:NODE,size:it.size,pitch:it.size+step,pt:!it.real}:{x:a,y:top+off,w:NODE,h:it.size,size:it.size,pitch:it.size+step,pt:!it.real});
    off+=it.size+step;
   }
  });
  const breadth=id=>{const p=pos.get(id);return vertical?p.x:p.y;};
  // edge ports: thickness from the source node, ordered by neighbour position
  const outs=new Map(),ins=new Map();
  for(const l of links){
   const s=pos.get(l.source),sv=nodeById.get(l.source).value;
   l.size=l.value/Math.max(1e-9,sv)*s.size;
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
   return null;
  };
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
    const f=fit(n,labelSpace,Math.max(p.h+2,p.pitch-1));if(!f)continue;
    const cy=p.y+p.h/2,lh=f.fs*1.2,x=p.x+p.w+LABEL_DIST;
    labels+=f.lines.map((t,i)=>'<text x="'+x+'" y="'+(cy+(i-(f.lines.length-1)/2)*lh)+'" dominant-baseline="middle" font-size="'+f.fs+'">'+esc(t)+'</text>').join("");
   }
  }
  const missing=data.missing.length?'<details><summary class="warning">'+data.missing.length+' ausgewählte Entitäten ohne auswertbare Energie-Statistiken</summary><ul>'+data.missing.map(id=>'<li>'+esc(id)+'</li>').join("")+'</ul></details>':"";
  return (assigned>data.total+.00001?'<p class="warning">Zugeordnete Werte übersteigen den Gesamtverbrauch. Prüfe Doppelzählungen.</p>':"")+'<div class="chart"><svg viewBox="0 0 '+W+' '+H+'" role="img" aria-label="Sankey-Energieverbrauch"><defs>'+gradients+'</defs>'+paths+bars+labels+'</svg></div><div id="sankey-tip" class="tip" role="tooltip"></div>'+missing;
 }
}
class BasedogEnergyEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:"open"});this.config=normalize({});}
 setConfig(c){this.config=normalize(c);this.render();}
 set hass(h){this._h=h;if(!this.shadowRoot.childElementCount)this.render();}
 render(){
  const c=this.config,h=this._h,states=Object.values(h?.states||{}).filter(s=>Object.hasOwn(UNITS,s.attributes?.unit_of_measurement||""));
  const options=states.map(s=>'<option value="'+esc(s.entity_id)+'" '+(c.entity===s.entity_id?"selected":"")+'>'+esc(s.attributes?.friendly_name||s.entity_id)+'</option>').join("");
  const input=(key,title,value,type="text")=>'<label>'+title+'</label><input data-key="'+key+'" type="'+type+'" value="'+esc(value)+'">';
  const select=(key,title,opts)=>'<label>'+title+'</label><select data-key="'+key+'">'+opts.map(([v,t])=>'<option value="'+v+'" '+(c[key]===v?"selected":"")+'>'+t+'</option>').join("")+'</select>';
  this.shadowRoot.innerHTML='<style>.version{display:flex;align-items:center;justify-content:space-between;padding:12px 14px;margin-bottom:12px;border:1px solid var(--divider-color,#aaa);border-radius:8px;background:var(--secondary-background-color,#f6f6f6);font-weight:600}.version strong{font-size:16px;color:var(--primary-color,#1682a0)}label{display:block;margin:12px 0 4px;font-weight:600}input,textarea,select{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--divider-color,#aaa);border-radius:6px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}.check{display:flex;gap:10px;align-items:center;font-weight:400}.check input{width:auto}.hint{font-size:12px;color:var(--secondary-text-color)}</style>'+'<div class="version"><span>basedog_energy_card</span><strong>Version '+CARD_VERSION+'</strong></div>'+
   input("title","Titel",c.title)+'<label>Zentrale Energieentität</label><select data-key="entity"><option value="">Auswählen</option>'+options+'</select>'+
   '<label>Weitere Entitäten (eine ID pro Zeile)</label><textarea data-key="entities" rows="4">'+esc(c.entities.join("\n"))+'</textarea>'+
   '<label>Labels (eine Label-ID pro Zeile)</label><textarea data-key="labels" rows="3">'+esc(c.labels.join("\n"))+'</textarea>'+
   input("duration","Dauer",c.duration,"number")+
   input("group_below_kwh","Verbräuche unter (kWh) zusammenfassen, 0 = aus",c.group_below_kwh||0,"number")+
   select("duration_unit","Einheit",[["minutes","Minuten"],["hours","Stunden"],["days","Tage"],["weeks","Wochen"]])+
   select("orientation","Darstellung",[[ "auto","Automatisch nach Breite"],["vertical","Immer vertikal"],["horizontal","Immer horizontal"]])+
   select("time_mode","Bezugszeitpunkt",[["now","Jetzt"],["fixed","Fester Zeitpunkt"]])+
   input("end_time","Fester Endzeitpunkt",c.end_time,"datetime-local")+
   '<label class="check"><input type="checkbox" data-show-labels '+(c.show_labels!==false?"checked":"")+'> Beschriftungen im Diagramm anzeigen</label>'+
   '<label class="check"><input type="checkbox" data-show-values '+(c.show_values===true?"checked":"")+'> Werte (kWh) in den Beschriftungen anzeigen</label>'+
   '<label>Strukturierung</label><p class="hint">Ebenen einzeln ein- oder ausschalten. Die Reihenfolge ist immer Etage → Bereich → Entität.</p>'+
   ORDER.map(k=>'<label class="check"><input type="checkbox" data-level="'+k+'" '+(c.levels.includes(k)?"checked":"")+'>'+({floor:"Etage",area:"Bereich",entity:"Entität"}[k])+'</label>').join("");
  this.shadowRoot.querySelectorAll("[data-key]").forEach(el=>el.addEventListener("change",()=>{
   const k=el.dataset.key,v=["entities","labels"].includes(k)?el.value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean):["duration","group_below_kwh"].includes(k)?Number(el.value):el.value;
   this.config={...this.config,[k]:v};this.emit();
  }));
  this.shadowRoot.querySelector("[data-show-values]").addEventListener("change",el=>{this.config={...this.config,show_values:el.target.checked};this.emit();});
  this.shadowRoot.querySelector("[data-show-labels]").addEventListener("change",el=>{this.config={...this.config,show_labels:el.target.checked};this.emit();});
  this.shadowRoot.querySelectorAll("[data-level]").forEach(el=>el.addEventListener("change",()=>{
   const levels=new Set(this.config.levels);if(el.checked)levels.add(el.dataset.level);else levels.delete(el.dataset.level);
   this.config={...this.config,levels:ORDER.filter(k=>levels.has(k))};this.emit();
  }));
 }
 emit(){this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this.config},bubbles:true,composed:true}));}
}
if(!customElements.get(TAG))customElements.define(TAG,BasedogEnergyCard);
if(!customElements.get("basedog-energy-card-editor"))customElements.define("basedog-energy-card-editor",BasedogEnergyEditor);
window.customCards=window.customCards||[];
if(!window.customCards.some(x=>x.type===TAG))window.customCards.push({type:TAG,name:"basedog_energy_card",description:"Energie-Sankey nach Etage, Bereich und Entität"});
