const TAG="basedog-sankey-card";
const defaults={type:"custom:basedog-sankey-card",title:"Energieverbrauch",entity:"",entities:[],labels:[],duration:24,duration_unit:"hours",time_mode:"now",end_time:"",levels:["floor","area","entity"]};
const safe=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const durationMs={minutes:60000,hours:3600000,days:86400000,weeks:604800000};
const scale=u=>({Wh:.001,kWh:1,MWh:1000,J:1/3600000,kJ:1/3600,MJ:1/3.6})[u]??null;
function energy(rows){if(!Array.isArray(rows)||!rows.length)return null;const valid=rows.filter(x=>x.sum!==null&&x.sum!==undefined&&Number.isFinite(Number(x.sum)));if(valid.length>1)return Math.max(0,Number(valid.at(-1).sum)-Number(valid[0].sum));const changes=rows.filter(x=>x.change!==null&&x.change!==undefined&&Number.isFinite(Number(x.change)));return changes.length?Math.max(0,changes.reduce((a,x)=>a+Number(x.change),0)):null;}
class BasedogSankeyCard extends HTMLElement{
 constructor(){super();this.attachShadow({mode:"open"});this.config={...defaults};this.last=0;}
 setConfig(c){this.config={...defaults,...c};this.draw();this.load();}
 set hass(h){this._h=h;if(Date.now()-this.last>60000)this.load();}
 getCardSize(){return 8;}
 static getConfigElement(){return document.createElement("basedog-sankey-card-editor");}
 static getStubConfig(){return {...defaults};}
 async load(){const h=this._h,c=this.config;if(!h||!c.entity||this.busy)return;this.busy=true;this.last=Date.now();try{
 const end=c.time_mode==="now"?Date.now():new Date(c.end_time).getTime();if(!Number.isFinite(end))throw Error("Ungültiger Bezugszeitpunkt");
 const start=end-(Number(c.duration)||24)*(durationMs[c.duration_unit]||durationMs.hours);
 const [registry,areas,floors]=await Promise.all([h.callWS({type:"config/entity_registry/list"}),h.callWS({type:"config/area_registry/list"}),h.callWS({type:"config/floor_registry/list"}).catch(()=>[])]);
 const selected=new Set(c.entities||[]),labels=new Set(c.labels||[]);
 for(const r of registry)if(r.labels?.some(l=>labels.has(l)))selected.add(r.entity_id);
 selected.delete(c.entity);const ids=[c.entity,...selected];
 const stats=await h.callWS({type:"recorder/statistics_during_period",start_time:new Date(start).toISOString(),end_time:new Date(end).toISOString(),statistic_ids:ids,period:"hour",types:["sum","change"]});
 const vals=new Map();for(const id of ids){const v=energy(stats?.[id]),factor=scale(h.states[id]?.attributes?.unit_of_measurement);if(v!==null&&factor!==null)vals.set(id,v*factor);}
 if(!vals.has(c.entity))throw Error("Keine geeigneten Langzeitstatistiken für die zentrale Entität.");
 const areaMap=new Map(areas.map(a=>[a.area_id,a])),floorMap=new Map(floors.map(f=>[f.floor_id,f])),regMap=new Map(registry.map(r=>[r.entity_id,r]));
 const rows=[...selected].filter(id=>vals.has(id)).map(id=>{const r=regMap.get(id),a=areaMap.get(r?.area_id);return {name:h.states[id]?.attributes?.friendly_name||id,value:vals.get(id),floor:floorMap.get(a?.floor_id)?.name||"Ohne Etage",area:a?.name||"Ohne Bereich",entity:h.states[id]?.attributes?.friendly_name||id};});
 this.result={total:vals.get(c.entity),rows};this.error="";}catch(e){this.error=String(e.message||e);}finally{this.busy=false;this.draw();}}
 draw(){const c=this.config,r=this.result;const styles='<style>:host{display:block}ha-card{padding:16px;overflow:hidden}.head{display:flex;align-items:center;justify-content:space-between}button{border:0;background:none;color:inherit;cursor:pointer}.small{opacity:.7;font-size:12px}.error{color:var(--error-color,#c33)}svg{width:100%;min-width:650px}text{fill:var(--primary-text-color,currentColor);font:12px sans-serif}</style>';
 let body=!c.entity?"Zentrale Verbrauchsentität im Karteneditor auswählen.":this.error?'<p class="error">'+safe(this.error)+'</p>':r?this.diagram(r):"Lade Energieverbrauch …";
 this.shadowRoot.innerHTML=styles+'<ha-card><div class="head"><h3>'+safe(c.title)+'</h3><button id="reload" title="Aktualisieren">↻</button></div>'+body+'</ha-card>';
 this.shadowRoot.querySelector("#reload").onclick=()=>{this.last=0;this.load();};}
 diagram(r){const c=this.config,levels=c.levels||defaults.levels,groups=new Map(),total=r.total;for(const x of r.rows){let path="";for(let i=0;i<levels.length;i++){const name=x[levels[i]]||"Ohne Zuordnung";path+=levels[i]+":"+name+"/";if(!groups.has(path))groups.set(path,{id:path,name,depth:i+1,value:0,parent:i===0?"root":path.slice(0,path.lastIndexOf("/",path.length-2)+1)});groups.get(path).value+=x.value;}}
 const assigned=r.rows.reduce((a,x)=>a+x.value,0),nodes=[{id:"root",name:this._h?.states[c.entity]?.attributes?.friendly_name||c.entity,value:total,depth:0},...groups.values()];
 if(total>assigned+.0001)nodes.push({id:"other",name:"Nicht zugeordnet",value:total-assigned,depth:1,parent:"root"});
 const depth=Math.max(1,...nodes.map(n=>n.depth)),width=1000,height=Math.max(350,nodes.length*24),columns=Array.from({length:depth+1},(_,i)=>nodes.filter(n=>n.depth===i)),max=Math.max(total,...columns.map(col=>col.reduce((a,n)=>a+n.value,0)),1);
 const pos=new Map();for(let i=0;i<columns.length;i++){let y=18;for(const n of columns[i]){const hh=Math.max(5,n.value/max*(height-36));pos.set(n.id,{x:20+i*950/depth,y,h:hh});y+=hh+9;}}
 let paths="",rects="";for(const n of nodes){const p=pos.get(n.id);if(n.parent){const q=pos.get(n.parent);if(q){const sy=q.y+q.h/2,ty=p.y+p.h/2,x1=q.x+12,x2=p.x,m=(x1+x2)/2;paths+='<path d="M '+x1+' '+sy+' C '+m+' '+sy+','+m+' '+ty+','+x2+' '+ty+'" stroke="#38a7bd" stroke-opacity=".4" stroke-width="'+Math.max(2,n.value/max*(height-36))+'" fill="none"/>';}}
 rects+='<rect x="'+p.x+'" y="'+p.y+'" width="12" height="'+p.h+'" rx="2" fill="#238fa7"/><text x="'+(p.x+16)+'" y="'+(p.y+12)+'">'+safe(n.name)+' ('+n.value.toFixed(2)+' kWh)</text>';}
 return '<p class="small">Gesamt: '+total.toFixed(2)+' kWh · '+safe(c.duration)+' '+safe(c.duration_unit)+'</p>'+(assigned>total+.0001?'<p class="error">Achtung: Zugeordneter Verbrauch übersteigt den Gesamtverbrauch.</p>':"")+'<div style="overflow-x:auto"><svg viewBox="0 0 '+width+' '+height+'" role="img" aria-label="Energie Sankey Diagramm">'+paths+rects+'</svg></div>';}
}
class BasedogSankeyEditor extends HTMLElement{
 constructor(){super();this.attachShadow({mode:"open"});this.config={...defaults};}
 setConfig(c){this.config={...defaults,...c};this.render();}
 set hass(h){this._h=h;if(!this.shadowRoot.childElementCount)this.render();}
 render(){const c=this.config,h=this._h,states=Object.values(h?.states||{}).filter(s=>scale(s.attributes?.unit_of_measurement)!==null);
 const opts=states.map(s=>'<option value="'+safe(s.entity_id)+'" '+(c.entity===s.entity_id?"selected":"")+'>'+safe(s.attributes?.friendly_name||s.entity_id)+'</option>').join("");
 const field=(name,label,value)=>'<label>'+label+'</label><input data-k="'+name+'" value="'+safe(value)+'">';
 const choices=(name,label,values)=>'<label>'+label+'</label><select data-k="'+name+'">'+values.map(([v,t])=>'<option value="'+v+'" '+(c[name]===v?"selected":"")+'>'+t+'</option>').join("")+'</select>';
 this.shadowRoot.innerHTML='<style>label{display:block;margin:12px 0 4px;font-weight:600}input,textarea,select{box-sizing:border-box;width:100%;padding:9px;border:1px solid var(--divider-color,#aaa);border-radius:6px;background:var(--card-background-color,#fff);color:var(--primary-text-color,#222)}</style>'+field("title","Titel",c.title)+'<label>Zentrale Verbrauchsentität</label><select data-k="entity"><option value="">Auswählen</option>'+opts+'</select><label>Weitere Entitäten (eine Entity-ID pro Zeile)</label><textarea data-k="entities" rows="4">'+safe((c.entities||[]).join("\n"))+'</textarea><label>Labels (Label-IDs, eine pro Zeile)</label><textarea data-k="labels" rows="3">'+safe((c.labels||[]).join("\n"))+'</textarea>'+field("duration","Dauer",c.duration)+choices("duration_unit","Dauereinheit",[["minutes","Minuten"],["hours","Stunden"],["days","Tage"],["weeks","Wochen"]])+choices("time_mode","Bezugszeitpunkt",[["now","Jetzt"],["fixed","Fester Zeitpunkt"]])+'<label>Endzeitpunkt</label><input data-k="end_time" type="datetime-local" value="'+safe(c.end_time)+'"><label>Ebenen (Reihenfolge)</label>'+[0,1,2].map(i=>'<select data-level="'+i+'">'+["floor","area","entity"].map(v=>'<option value="'+v+'" '+(c.levels[i]===v?"selected":"")+'>'+({floor:"Etage",area:"Bereich",entity:"Entität"}[v])+'</option>').join("")+'</select>').join("");
 this.shadowRoot.querySelectorAll("[data-k]").forEach(el=>el.addEventListener("change",()=>{const k=el.dataset.k;this.config={...this.config,[k]:["entities","labels"].includes(k)?el.value.split(/[\n,]/).map(x=>x.trim()).filter(Boolean):k==="duration"?Number(el.value):el.value};this.emit();}));
 this.shadowRoot.querySelectorAll("[data-level]").forEach(el=>el.addEventListener("change",()=>{const levels=[...this.config.levels];levels[Number(el.dataset.level)]=el.value;if(new Set(levels).size!==3){this.render();return;}this.config={...this.config,levels};this.emit();}));}
 emit(){this.dispatchEvent(new CustomEvent("config-changed",{detail:{config:this.config},bubbles:true,composed:true}));}
}
if(!customElements.get(TAG))customElements.define(TAG,BasedogSankeyCard);
if(!customElements.get("basedog-sankey-card-editor"))customElements.define("basedog-sankey-card-editor",BasedogSankeyEditor);
window.customCards=window.customCards||[];window.customCards.push({type:TAG,name:"basedog_sankey_card",description:"Sankey-Energieverbrauch nach Etage, Bereich und Entität"});