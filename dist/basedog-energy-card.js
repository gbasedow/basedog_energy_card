/* basedog_energy_card v0.17.0 */
const CARD_VERSION="0.17.0";
const TAG="basedog-energy-card";
const ORDER=["floor","area","entity"];
const DEFAULT={type:"custom:basedog-energy-card",title:"Energieverbrauch",entity:"",entities:[],labels:[],duration:24,duration_unit:"hours",time_mode:"now",end_time:"",levels:[...ORDER],show_labels:true,orientation:"auto",group_below_kwh:0};
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
 constructor(){super();this.attachShadow({mode:"open"});this.config=normalize({});this.last=0;this._signature="";this.vertical=false;this.cardWidth=0;this.resizeObserver=new ResizeObserver(entries=>{const w=entries[0]?.contentRect?.width||this.clientWidth;const next=this.config.orientation==="vertical"||this.config.orientation!=="horizontal"&&w<700;if(next!==this.vertical||Math.abs(w-this.cardWidth)>4){this.cardWidth=w;this.vertical=next;this.render();}});this.resizeObserver.observe(this);}
 static getConfigElement(){return document.createElement("basedog-energy-card-editor");}
 static getStubConfig(){return {...DEFAULT};}
 setConfig(c){const next=normalize(c),sig=JSON.stringify(next);this.config=next;this.vertical=next.orientation==="vertical"||next.orientation!=="horizontal"&&(this.cardWidth||this.clientWidth)<700;if(sig!==this._signature){this._signature=sig;this.last=0;this.render();this.load();}}
 set hass(h){this._h=h;if(Date.now()-this.last>60000)this.load();}
 disconnectedCallback(){this.resizeObserver?.disconnect();}
 connectedCallback(){this.resizeObserver?.observe(this);}
 getCardSize(){return 8;}
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
  const css='<style>:host{display:block}ha-card{display:block;overflow:hidden}.card-header{font-family:var(--ha-card-header-font-family,inherit);font-size:var(--ha-card-header-font-size,24px);font-weight:var(--ha-font-weight-normal,400);letter-spacing:-.012em;line-height:32px;color:var(--ha-card-header-color,var(--primary-text-color));padding:24px 16px 16px;display:block}.content{padding:0 16px 16px}.card-header+.content{padding-top:0}.muted{color:var(--secondary-text-color);font-size:12px;margin:8px 0 0}p.warning,p.error{margin:0 0 8px}.warning{color:var(--warning-color,#c57c00)}.error{color:var(--error-color,#d44)}.scroll{overflow-x:auto}svg{display:block;width:100%;max-width:100%;height:auto}.scroll{min-width:0} .sankey-hover{cursor:help} .tip{position:fixed;z-index:9999;pointer-events:none;background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,#777);box-shadow:0 6px 20px #0004;border-radius:8px;padding:10px 12px;max-width:280px;white-space:pre-line;font-size:13px;display:none}svg text{fill:var(--primary-text-color,currentColor);font-family:var(--ha-font-family-body,var(--paper-font-body1_-_font-family,Roboto,sans-serif));font-size:12px;font-weight:400}svg path.sankey-hover{transition:fill-opacity .15s}svg path.sankey-hover:hover{fill-opacity:.7}svg rect.sankey-hover{cursor:default}.sankey-hover{cursor:default}details{margin-top:10px;font-size:13px}details li{overflow-wrap:anywhere}</style>';
  const body=!c.entity?"Bitte die zentrale Energieentität im Karteneditor auswählen.":this.error?'<p class="error">'+esc(this.error)+'</p>':r?this.diagram(r):"Lade Verbrauchsdaten …";
  this.shadowRoot.innerHTML=css+'<ha-card>'+(c.title?'<div class="card-header">'+esc(c.title)+'</div>':'')+'<div class="content">'+body+'</div></ha-card>';
  const tip=this.shadowRoot.querySelector("#sankey-tip");
  if(tip){
   const svg=this.shadowRoot.querySelector("svg");
   svg?.addEventListener("pointermove",e=>{const el=e.target.closest?.("[data-tip]");if(!el){tip.style.display="none";return;}tip.textContent=el.getAttribute("data-tip");tip.style.display="block";const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.max(8,Math.min(e.clientX+14,window.innerWidth-w-8))+"px";tip.style.top=Math.max(8,Math.min(e.clientY+14,window.innerHeight-h-8))+"px";});
   svg?.addEventListener("pointerleave",()=>tip.style.display="none");
  }
 }
 diagram(data){
  const levels=activeLevels(this.config),vertical=this.vertical,showLabels=this.config.show_labels!==false;
  const root={id:"root",name:this._h?.states[this.config.entity]?.attributes?.friendly_name||this.config.entity,value:Math.max(0,data.total),depth:0};
  const nodes=[root],byId=new Map([["root",root]]),children=new Map(),map=new Map();
  const threshold=Math.max(0,Number(this.config.group_below_kwh)||0),small=new Map(),rows=[];
  for(const row of data.rows){
   if(row.value>0&&threshold>0&&row.value<threshold){
    const key=JSON.stringify(levels.filter(x=>x!=="entity").map(x=>row[x]));
    if(!small.has(key))small.set(key,{...row,id:"group:"+key,name:"Zusammengefasst",value:0});
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
     const n={id:path,parent,depth:i+1,name,value:0};
     map.set(path,n);nodes.push(n);byId.set(path,n);
     if(!children.has(parent))children.set(parent,[]);
     children.get(parent).push(n);
    }
    map.get(path).value+=row.value;parent=path;
   }
  }
  const assigned=data.rows.reduce((s,x)=>s+Math.max(0,x.value),0);
  if(data.total>assigned+0.00001){
   // Pass-through chain: the residual must span EVERY depth like the
   // native HA Sankey's generated pass-through nodes, without counting twice.
   let parent="root";
   for(let i=1;i<=levels.length;i++){
    const n={id:"other:"+i,parent,depth:i,name:"Nicht erfasster Verbrauch",value:data.total-assigned,residual:true};
    nodes.push(n);byId.set(n.id,n);
    if(!children.has(parent))children.set(parent,[]);
    children.get(parent).push(n);
    parent=n.id;
   }
  }
  const depth=Math.max(1,...nodes.map(n=>n.depth));
  // Keep siblings together and put the residual last, like the native HA chart.
  for(const list of children.values())list.sort((a,b)=>(a.residual?1:0)-(b.residual?1:0));
  const rank=new Map(),walk=id=>{for(const n of children.get(id)||[]){rank.set(n.id,rank.size);walk(n.id);}};
  walk("root");
  const columns=Array.from({length:depth+1},(_,i)=>nodes.filter(n=>n.depth===i).sort((a,b)=>(rank.get(a.id)??-1)-(rank.get(b.id)??-1)));
  const max=Math.max(.001,root.value,assigned);
  // Fit both orientations to the configured grid height, not intrinsic SVG height.
  // Root always spans the full usable cross-axis, including the residual flow.
  const configuredHeight=Math.max(180,(Number(this.config.grid_options?.rows)||8)*56);
  const viewWidth=vertical?360:Math.max(850,this.cardWidth||850);
  const viewHeight=Math.max(110,configuredHeight-115);
  const breadth=vertical?viewWidth:viewHeight;
  const breadthStart=vertical?12:12,breadthEnd=vertical?12:12;
  const gap=6,nodeThickness=vertical?15:14;
  const layout=new Map();
  const rootSpan=breadth-breadthStart-breadthEnd;
  const levelStart=vertical?25:18;
  const levelEnd=vertical?viewHeight-20:viewWidth-(showLabels?130:18);
  const levelStep=Math.max(1,(levelEnd-levelStart-nodeThickness)/Math.max(1,depth));
  // A fixed residual lane branches ONCE from the root, then stays at
  // exactly the same position and width through every subsequent level.
  const residual=nodes.find(n=>n.residual);
  const residualWidth=residual?rootSpan*residual.value/Math.max(.001,root.value):0;
  const residualStart=breadthStart+rootSpan-residualWidth;
  for(let i=0;i<columns.length;i++){
   const col=columns[i],normal=col.filter(n=>!n.residual);
   const residualNode=col.find(n=>n.residual);
   const normalValue=normal.reduce((s,n)=>s+Math.max(0,n.value),0);
   const normalSpan=rootSpan-residualWidth;
   const reserveGap=i===0||!residualNode?0:Math.min(10,normalSpan*.04);
   const available=Math.max(0,normalSpan-reserveGap);
   const gap=i===0?0:Math.min(vertical?9:12,available/Math.max(1,normal.length*3));
   const gaps=Math.min(available*.32,Math.max(0,normal.length-1)*gap);
   const scale=(available-gaps)/Math.max(.001,normalValue);
   const used=normalValue*scale+gaps;
   let cursor=breadthStart+Math.max(0,(available-used)/2);
   const levelPos=levelStart+i*levelStep;
   for(const n of normal){
    const span=Math.max(.05,n.value*scale);
    layout.set(n.id,{x:vertical?cursor:levelPos,y:vertical?levelPos:cursor,w:vertical?span:nodeThickness,h:vertical?nodeThickness:span,span});
    cursor+=span+gap;
   }
   if(residualNode){
    layout.set(residualNode.id,{x:vertical?residualStart:levelPos,y:vertical?levelPos:residualStart,w:vertical?residualWidth:nodeThickness,h:vertical?nodeThickness:residualWidth,span:residualWidth});
   }
  }
  // Match the native energy Sankey theme colors (--graph-color-N).
  const styles=getComputedStyle(this),palette=Array.from({length:54},(_,i)=>styles.getPropertyValue("--graph-color-"+(i+1)).trim()||styles.getPropertyValue("--color-"+(i+1)).trim());
  const primary=styles.getPropertyValue("--energy-grid-consumption-color").trim()||styles.getPropertyValue("--energy-grid-consumption-color-0").trim()||"#488fc7";
  const homeColor=styles.getPropertyValue("--energy-solar-color").trim()||styles.getPropertyValue("--primary-color").trim()||"#00a6c7";
  const gray=styles.getPropertyValue("--state-unavailable-color").trim()||"#bdbdbd";
  const nodeColor=new Map([["root",primary]]);let colorIndex=0;
  for(const n of nodes.slice(1)){
   nodeColor.set(n.id,n.residual||n.name==="Zusammengefasst"?gray:n.depth===depth?(palette[colorIndex++%54]||homeColor):primary);
  }
  const color=n=>nodeColor.get(n.id)||primary;
  const tooltip=n=>esc(n.name+" · "+n.value.toFixed(3)+" kWh");
  const outgoing=new Map(),incoming=new Map();
  let paths="",bars="",labels="",gradients="";
  // HA's ECharts series uses lineStyle.color='gradient', opacity=.4.
  // Use a unique linear gradient per ribbon from source-node to target-node.
  const gradientId=n=>"basedog-flow-"+nodes.indexOf(n);
  for(const n of nodes.slice(1)){
   const p=layout.get(n.id),q=layout.get(n.parent);
   if(!p||!q||n.value<=0)continue;
   // Source and destination ports are scaled independently to their nodes.
   const siblings=children.get(n.parent)||[];
   const siblingSum=siblings.reduce((s,k)=>s+Math.max(0,k.value),0);
   const sourceFlow=q.span*n.value/Math.max(.001,siblingSum);
   const targetFlow=p.span;
   const sourceOffset=outgoing.get(n.parent)||0,targetOffset=incoming.get(n.id)||0;
   outgoing.set(n.parent,sourceOffset+sourceFlow);incoming.set(n.id,targetOffset+targetFlow);
   let d;
   if(vertical){
    const x1=q.x+sourceOffset,x2=p.x+targetOffset,y1=q.y+q.h,y2=p.y,cy=y1+(y2-y1)*.5;
    d='M'+x1+' '+y1+' C'+x1+' '+cy+','+x2+' '+cy+','+x2+' '+y2+
      ' L'+(x2+targetFlow)+' '+y2+' C'+(x2+targetFlow)+' '+cy+','+(x1+sourceFlow)+' '+cy+','+(x1+sourceFlow)+' '+y1+' Z';
   }else{
    const y1=q.y+sourceOffset,y2=p.y+targetOffset,x1=q.x+q.w,x2=p.x,cx=x1+(x2-x1)*.5;
    d='M'+x1+' '+y1+' C'+cx+' '+y1+','+cx+' '+y2+','+x2+' '+y2+
      ' L'+x2+' '+(y2+targetFlow)+' C'+cx+' '+(y2+targetFlow)+','+cx+' '+(y1+sourceFlow)+','+x1+' '+(y1+sourceFlow)+' Z';
   }
   const gid=gradientId(n),isResidual=!!n.residual;
   // Assigned flows stay monochrome through all intermediate levels.
   // Only the last link to a consumer gets the source-to-consumer gradient.
   const sourceColor=isResidual?'color-mix(in srgb, '+primary+' '+(100*(1-(n.depth-1)/Math.max(1,depth))).toFixed(2)+'%, '+gray+')':primary;
   const targetColor=isResidual?'color-mix(in srgb, '+primary+' '+(100*(1-n.depth/Math.max(1,depth))).toFixed(2)+'%, '+gray+')':color(n);
   const isLastAssigned=!isResidual&&n.depth===depth;
   const transition=isResidual?0:isLastAssigned?0:100;
   const endColor=isResidual?targetColor:isLastAssigned?color(n):sourceColor;
   gradients+='<linearGradient id="'+gid+'" x1="'+(vertical?'0%':'0%')+'" y1="0%" x2="'+(vertical?'0%':'100%')+'" y2="'+(vertical?'100%':'0%')+'"><stop offset="0%" stop-color="'+esc(sourceColor)+'"/><stop offset="'+transition+'%" stop-color="'+esc(sourceColor)+'"/><stop offset="100%" stop-color="'+esc(endColor)+'"/></linearGradient>';
   paths+='<path class="sankey-hover" data-tip="'+tooltip(n)+'" d="'+d+'" fill="url(#'+gid+')" fill-opacity=".4"><title>'+tooltip(n)+'</title></path>';
   // Label inside the ribbon, only if it remains legible at the rendered scale.
   const text=n.name+' · '+n.value.toFixed(2)+' kWh',needed=text.length*6.5+10;
   const physicalFlow=Math.min(sourceFlow,targetFlow)*(vertical?Math.min(1,(this.cardWidth||360)/viewWidth):1);
   const run=levelStep-nodeThickness;
   if(showLabels&&physicalFlow>=14&&run>=needed){
    const px=vertical?p.x+p.w/2:q.x+q.w+run/2;
    const py=vertical?q.y+q.h+run/2:p.y+p.h/2+4;
    labels+='<text class="flow-label" x="'+px+'" y="'+py+'" text-anchor="middle" font-size="12" '+(vertical?'transform="rotate(-90 '+px+' '+py+')"':'')+'>'+esc(text)+'</text>';
   }
  }
  const actualScale=vertical?Math.min(1,(this.cardWidth||360)/viewWidth):Math.min(1,(this.cardWidth||viewWidth)/viewWidth);
  for(const n of nodes){
   const p=layout.get(n.id);if(!p)continue;
   bars+='<rect class="sankey-hover" data-tip="'+tooltip(n)+'" x="'+p.x+'" y="'+p.y+'" width="'+p.w+'" height="'+p.h+'" rx="2" fill="'+esc(color(n))+'"><title>'+tooltip(n)+'</title></rect>';
   const name=n.name+'\n'+n.value.toFixed(2)+' kWh',longest=Math.max(n.name.length*6.4,n.value.toFixed(2).length*6.4+27);
   const available=vertical?p.w:p.h;
   // Native chart uses a per-node font fit. Never render below 10 CSS pixels.
   if(showLabels&&available*actualScale>=longest*actualScale+6&&actualScale*12>=10){
    if(vertical){
     const x=p.x+p.w/2,y=p.y+30;
     labels+='<text x="'+x+'" y="'+y+'" text-anchor="middle" font-size="12">'+esc(n.name)+'</text><text x="'+x+'" y="'+(y+14)+'" text-anchor="middle" font-size="12">'+n.value.toFixed(2)+' kWh</text>';
    }else{
     const x=p.x+p.w+5,y=p.y+p.h/2;
     labels+='<text x="'+x+'" y="'+y+'" font-size="12">'+esc(n.name)+'</text><text x="'+x+'" y="'+(y+14)+'" font-size="12">'+n.value.toFixed(2)+' kWh</text>';
    }
   }
  }
  const missing=data.missing.length?'<details><summary class="warning">'+data.missing.length+' ausgewählte Entitäten ohne auswertbare Energie-Statistiken</summary><ul>'+data.missing.map(id=>'<li>'+esc(id)+'</li>').join("")+'</ul></details>':"";
  return (assigned>data.total+.00001?'<p class="warning">Zugeordnete Werte übersteigen den Gesamtverbrauch. Prüfe Doppelzählungen.</p>':"")+'<div class="scroll"><svg style="display:block;width:100%;height:auto;max-width:100%;overflow:visible" viewBox="0 0 '+viewWidth+' '+viewHeight+'" role="img" aria-label="Sankey-Energieverbrauch">'+'<defs>'+gradients+'</defs>'+paths+bars+labels+'</svg></div><p class="muted">Gesamt: '+data.total.toFixed(2)+' kWh · '+data.rows.length+' von '+data.selected+' Entitäten mit Verbrauchswerten</p><div id="sankey-tip" class="tip" role="tooltip"></div>'+missing;
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
   '<label>Strukturierung</label><p class="hint">Ebenen einzeln ein- oder ausschalten. Die Reihenfolge ist immer Etage → Bereich → Entität.</p>'+
   ORDER.map(k=>'<label class="check"><input type="checkbox" data-level="'+k+'" '+(c.levels.includes(k)?"checked":"")+'>'+({floor:"Etage",area:"Bereich",entity:"Entität"}[k])+'</label>').join("");
  this.shadowRoot.querySelectorAll("[data-key]").forEach(el=>el.addEventListener("change",()=>{
   const k=el.dataset.key,v=["entities","labels"].includes(k)?el.value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean):["duration","group_below_kwh"].includes(k)?Number(el.value):el.value;
   this.config={...this.config,[k]:v};this.emit();
  }));
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
