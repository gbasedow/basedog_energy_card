/* basedog_energy_card v0.5.1 */
const CARD_VERSION="0.5.1";
const TAG="basedog-energy-card";
const ORDER=["floor","area","entity"];
const DEFAULT={type:"custom:basedog-energy-card",title:"Energieverbrauch",entity:"",entities:[],labels:[],duration:24,duration_unit:"hours",time_mode:"now",end_time:"",levels:[...ORDER],show_labels:true};
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
 constructor(){super();this.attachShadow({mode:"open"});this.config=normalize({});this.last=0;this._signature="";this.vertical=false;this.resizeObserver=new ResizeObserver(entries=>{const w=entries[0]?.contentRect?.width||this.clientWidth;const next=w<700;if(next!==this.vertical){this.vertical=next;this.render();}});this.resizeObserver.observe(this);}
 static getConfigElement(){return document.createElement("basedog-energy-card-editor");}
 static getStubConfig(){return {...DEFAULT};}
 setConfig(c){const next=normalize(c),sig=JSON.stringify(next);this.config=next;if(sig!==this._signature){this._signature=sig;this.last=0;this.render();this.load();}}
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
  const css='<style>:host{display:block}ha-card{padding:16px}.head{display:flex;align-items:center;justify-content:space-between;gap:8px}.head h3{margin:4px 0 10px}button{cursor:pointer;border:0;background:transparent;color:inherit;font-size:22px}.muted{color:var(--secondary-text-color);font-size:12px}.warning{color:var(--warning-color,#c57c00)}.error{color:var(--error-color,#d44)}.scroll{overflow-x:auto}svg{display:block;width:auto;max-width:none;height:auto} .sankey-hover{cursor:help} .tip{position:fixed;z-index:9999;pointer-events:none;background:var(--card-background-color,#222);color:var(--primary-text-color,#fff);border:1px solid var(--divider-color,#777);box-shadow:0 6px 20px #0004;border-radius:8px;padding:10px 12px;max-width:280px;white-space:pre-line;font-size:13px;display:none}svg text{fill:var(--primary-text-color,currentColor);font:12px sans-serif}details{margin-top:10px;font-size:13px}details li{overflow-wrap:anywhere}</style>';
  const body=!c.entity?"Bitte die zentrale Energieentität im Karteneditor auswählen.":this.error?'<p class="error">'+esc(this.error)+'</p>':r?this.diagram(r):"Lade Verbrauchsdaten …";
  this.shadowRoot.innerHTML=css+'<ha-card><div class="head"><h3>'+esc(c.title)+' <small style="font-size:11px;font-weight:normal;opacity:.65">v'+CARD_VERSION+'</small></h3><button title="Aktualisieren" id="reload">↻</button></div>'+body+'</ha-card>';
  this.shadowRoot.querySelector("#reload").onclick=()=>{this.last=0;this.load();};
  const tip=this.shadowRoot.querySelector("#sankey-tip");
  if(tip){
   const svg=this.shadowRoot.querySelector("svg");
   svg?.addEventListener("pointermove",e=>{const el=e.target.closest?.("[data-tip]");if(!el){tip.style.display="none";return;}tip.textContent=el.getAttribute("data-tip");tip.style.display="block";const w=tip.offsetWidth,h=tip.offsetHeight;tip.style.left=Math.max(8,Math.min(e.clientX+14,window.innerWidth-w-8))+"px";tip.style.top=Math.max(8,Math.min(e.clientY+14,window.innerHeight-h-8))+"px";});
   svg?.addEventListener("pointerleave",()=>tip.style.display="none");
  }
 }
 diagram(data){
  const levels=activeLevels(this.config),vertical=this.vertical,showLabels=this.config.show_labels!==false;
  const nodes=[{id:"root",name:this._h?.states[this.config.entity]?.attributes?.friendly_name||this.config.entity,value:data.total,depth:0}],map=new Map();
  for(const row of data.rows){
   let parent="root",path="";
   for(let i=0;i<levels.length;i++){
    const level=levels[i],name=level==="entity"?row.name:row[level];
    path+=JSON.stringify([level,level==="entity"?row.id:name])+"/";
    if(!map.has(path))map.set(path,{id:path,parent,depth:i+1,name,value:0});
    map.get(path).value+=row.value;parent=path;
   }
  }
  nodes.push(...map.values());
  const assigned=data.rows.reduce((s,x)=>s+x.value,0);
  if(data.total>assigned+.00001)nodes.push({id:"other",parent:"root",depth:1,name:"Nicht zugeordnet",value:data.total-assigned});
  const depth=Math.max(1,...nodes.map(n=>n.depth));
  const columns=Array.from({length:depth+1},(_,i)=>nodes.filter(n=>n.depth===i));
  // A generous, measured column width keeps full labels inside the SVG viewport.
  const maxLabel=Math.max(16,...nodes.map(n=>n.name.length));
  const columnWidth=Math.max(300,Math.min(760,maxLabel*7.4+95));
  const horizontalHeight=Math.max(420,...columns.map(col=>col.length*39+50));
  // Mobile: keep the viewBox narrow and grow vertically with the number of entities.
  // This avoids scaling 43 nodes into a few unreadable pixels.
  const mobileWidth=360,mobileRowHeight=48,mobileSectionGap=72;
  const sectionStarts=[];
  let sectionY=20;
  for(const col of columns){sectionStarts.push(sectionY);sectionY+=Math.max(1,col.length)*mobileRowHeight+mobileSectionGap;}
  const width=vertical?mobileWidth:(depth+1)*columnWidth+35;
  const height=vertical?sectionY+15:horizontalHeight;
  const pos=new Map(),max=Math.max(1,...columns.map(cc=>cc.reduce((s,n)=>s+n.value,0)));
  for(let i=0;i<columns.length;i++){
   const col=columns[i];
   if(vertical){
    for(let j=0;j<col.length;j++){
     const n=col[j],w=Math.max(24,Math.min(320,n.value/max*320));
     pos.set(n.id,{x:15,y:sectionStarts[i]+28+j*mobileRowHeight,w,h:14});
    }
   }else{
    const space=height-48-col.length*9;
    const weights=col.map(n=>Math.max(15,n.value/max*space));
    const factor=Math.min(1,space/Math.max(1,weights.reduce((a,b)=>a+b,0)));
    let cursor=20;
    for(let j=0;j<col.length;j++){
     const size=weights[j]*factor;
     pos.set(col[j].id,{x:15+i*columnWidth,y:cursor,w:16,h:size});
     cursor+=size+9;
    }
   }
  }
  const tip=n=>esc(n.name+" · "+n.value.toFixed(3)+" kWh");
  let paths="",bars="";
  for(const n of nodes.slice(1)){
   const p=pos.get(n.id),q=pos.get(n.parent);if(!q)continue;
   const sx=vertical?q.x+q.w/2:q.x+q.w,sy=vertical?q.y+q.h:q.y+q.h/2;
   const tx=vertical?p.x+p.w/2:p.x,ty=vertical?p.y:p.y+p.h/2;
   const d=vertical?"M"+sx+" "+sy+" C"+sx+" "+((sy+ty)/2)+","+tx+" "+((sy+ty)/2)+","+tx+" "+ty:"M"+sx+" "+sy+" C"+((sx+tx)/2)+" "+sy+","+((sx+tx)/2)+" "+ty+","+tx+" "+ty;
   const stroke=Math.max(5,Math.min(vertical?p.w:p.h,vertical?q.w:q.h)*.7);
   paths+='<path class="sankey-hover" data-tip="'+tip(n)+'" d="'+d+'" fill="none" stroke="#26a4bd" stroke-opacity=".35" stroke-width="'+stroke+'"><title>'+tip(n)+'</title></path>';
  }
  for(const n of nodes){
   const p=pos.get(n.id);
   bars+='<rect class="sankey-hover" data-tip="'+tip(n)+'" x="'+p.x+'" y="'+p.y+'" width="'+p.w+'" height="'+p.h+'" rx="3" fill="#238fa7"><title>'+tip(n)+'</title></rect>';
   if(showLabels){
    const tx=vertical?p.x:p.x+p.w+7,ty=vertical?p.y+p.h+15:p.y+Math.min(16,p.h/2+4);
    bars+='<text x="'+tx+'" y="'+ty+'" font-size="12">'+esc(n.name)+'</text>';
   }
  }
  const headers=columns.map((col,i)=>'<text x="'+(vertical?20:15+i*columnWidth)+'" y="'+(vertical?16:13)+'" font-weight="bold" '+(vertical?'transform="translate(0 '+(sectionStarts[i])+')"':'')+'>'+esc(i===0?"Gesamt":({floor:"Etage",area:"Bereich",entity:"Entität"}[levels[i-1]]||"Weitere"))+'</text>').join("");
  const missing=data.missing.length?'<details><summary class="warning">'+data.missing.length+' ausgewählte Entitäten ohne auswertbare Energie-Statistiken</summary><ul>'+data.missing.map(id=>'<li>'+esc(id)+'</li>').join("")+'</ul></details>':"";
  return '<p class="muted">Gesamt: '+data.total.toFixed(2)+' kWh · '+data.rows.length+' von '+data.selected+' Entitäten mit Verbrauchswerten · '+(vertical?"Vertikale Ansicht":"Horizontale Ansicht")+'</p>'+(assigned>data.total+.00001?'<p class="warning">Zugeordnete Werte übersteigen den Gesamtverbrauch. Prüfe Doppelzählungen.</p>':"")+'<div class="scroll"><svg style="display:block;width:100%;height:auto;max-width:100%;overflow:hidden" viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Sankey-Energieverbrauch">'+headers+paths+bars+'</svg></div><div id="sankey-tip" class="tip" role="tooltip"></div>'+missing;
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
   select("duration_unit","Einheit",[["minutes","Minuten"],["hours","Stunden"],["days","Tage"],["weeks","Wochen"]])+
   select("time_mode","Bezugszeitpunkt",[["now","Jetzt"],["fixed","Fester Zeitpunkt"]])+
   input("end_time","Fester Endzeitpunkt",c.end_time,"datetime-local")+
   '<label class="check"><input type="checkbox" data-show-labels '+(c.show_labels!==false?"checked":"")+'> Beschriftungen im Diagramm anzeigen</label>'+
   '<label>Strukturierung</label><p class="hint">Ebenen einzeln ein- oder ausschalten. Die Reihenfolge ist immer Etage → Bereich → Entität.</p>'+
   ORDER.map(k=>'<label class="check"><input type="checkbox" data-level="'+k+'" '+(c.levels.includes(k)?"checked":"")+'>'+({floor:"Etage",area:"Bereich",entity:"Entität"}[k])+'</label>').join("");
  this.shadowRoot.querySelectorAll("[data-key]").forEach(el=>el.addEventListener("change",()=>{
   const k=el.dataset.key,v=["entities","labels"].includes(k)?el.value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean):k==="duration"?Number(el.value):el.value;
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
