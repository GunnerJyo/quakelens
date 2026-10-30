(() => {
  'use strict';
  const FEEDS = {
    all_day: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    all_week: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_week.geojson',
    all_month: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_month.geojson'
  };
  const $ = (id) => document.getElementById(id);
  const els = {period:$('period'),magnitude:$('magnitude'),magValue:$('magnitude-value'),count:$('count-stat'),strong:$('strong-stat'),largest:$('largest-stat'),largestPlace:$('largest-place'),list:$('event-list'),result:$('result-count'),updated:$('updated-at'),refresh:$('refresh'),mapMode:$('map-mode'),mapError:$('map-error'),toast:$('toast')};
  const appConfig = window.QUAKELENS_CONFIG || {};
  let map, allFeatures = [], visibleFeatures = [], currentFeed = 'all_week', selectedId = null, toastTimer, awsKey = appConfig.mapKey || '', awsRegion = appConfig.region || 'us-east-1';
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const number = (v, digits=0) => Number.isFinite(v) ? v.toLocaleString(undefined,{maximumFractionDigits:digits}) : '—';
  const relative = (time) => { const mins = Math.max(0,Math.round((Date.now()-time)/60000)); if(mins<1)return 'just now'; if(mins<60)return `${mins}m ago`; const hrs=Math.floor(mins/60); if(hrs<24)return `${hrs}h ago`; return `${Math.floor(hrs/24)}d ago`; };
  const depthColor = (depth) => depth < 70 ? '#f4a46f' : depth < 300 ? '#e5d184' : '#7dc7c0';
  const depthBand = (depth) => depth < 70 ? 'Shallow' : depth < 300 ? 'Intermediate' : 'Deep';
  function showToast(message) { els.toast.textContent=message; els.toast.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>els.toast.classList.remove('show'),2600); }

  function osmStyle() {
    return {version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap contributors'}},layers:[{id:'osm',type:'raster',source:'osm'}]};
  }
  function makeMapStyle() {
    const key=awsKey, region=awsRegion;
    if(key) return `https://maps.geo.${region}.amazonaws.com/v2/styles/Standard/descriptor?key=${encodeURIComponent(key)}`;
    return osmStyle();
  }
  function setMapMode() { const aws=!!awsKey; els.mapMode.textContent=aws?'AMAZON LOCATION SERVICE':'OPEN BASEMAP'; document.querySelector('.map-credit').textContent=aws?'Map: Amazon Location Service':'Map tiles © OpenStreetMap contributors'; }
  function initMap() {
    if(!window.maplibregl){setTimeout(initMap,100);return;}
    setMapMode();
    if(!awsKey){els.mapError.hidden=false;els.mapError.textContent='Map configuration is unavailable. Please try again later.';}
    map=new maplibregl.Map({container:'map',style:makeMapStyle(),center:[12,19],zoom:1.35,minZoom:1,maxZoom:13,renderWorldCopies:true,attributionControl:true});
    map.addControl(new maplibregl.NavigationControl({showCompass:false}),'bottom-right');
    map.on('load',()=>{map.addSource('earthquakes',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterRadius:42,clusterMaxZoom:5});
      map.addLayer({id:'quake-clusters',type:'circle',source:'earthquakes',filter:['has','point_count'],paint:{'circle-color':['step',['get','point_count'],'#b8dfc9',20,'#edc077',80,'#ec8c61'],'circle-radius':['step',['get','point_count'],17,20,22,80,29],'circle-opacity':.92,'circle-stroke-width':1.5,'circle-stroke-color':'#17232b'}});
      map.addLayer({id:'quake-cluster-count',type:'symbol',source:'earthquakes',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Open Sans Bold','Arial Unicode MS Bold'],'text-size':11},paint:{'text-color':'#17232b'}});
      map.addLayer({id:'quake-points',type:'circle',source:'earthquakes',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['get','mag'],0,3,2,5,4,8,6,12,8,17],'circle-color':['case',['<',['get','depth'],70],'#f4a46f',['<',['get','depth'],300],'#e5d184','#7dc7c0'],'circle-opacity':.88,'circle-stroke-color':'#17232b','circle-stroke-width':1.15}});
      map.on('click','quake-points',(e)=>{const f=e.features?.[0];if(f)selectFeature(f.properties.eventId,true);});
      map.on('mouseenter','quake-points',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','quake-points',()=>map.getCanvas().style.cursor='');
      map.on('click','quake-clusters',(e)=>{const f=map.queryRenderedFeatures(e.point,{layers:['quake-clusters']})[0];if(f)map.getSource('earthquakes').getClusterExpansionZoom(f.properties.cluster_id,(err,z)=>{if(!err)map.easeTo({center:f.geometry.coordinates,zoom:z});});});
      map.on('mouseenter','quake-clusters',()=>map.getCanvas().style.cursor='pointer');map.on('mouseleave','quake-clusters',()=>map.getCanvas().style.cursor='');
      loadFeed();
    });
    map.on('error',(e)=>{if(awsKey&&e?.sourceId===undefined){els.mapError.hidden=false;els.mapError.textContent='Amazon Location could not load this style. Check the key, region, and map read permissions.';}});
  }
  function updateSource() { if(!map?.getSource('earthquakes'))return;map.getSource('earthquakes').setData({type:'FeatureCollection',features:visibleFeatures}); }
  function updateStats() {
    els.count.textContent=number(visibleFeatures.length);els.strong.textContent=number(visibleFeatures.filter(f=>(f.properties.mag??0)>=4.5).length);
    const largest=[...visibleFeatures].sort((a,b)=>(b.properties.mag??-1)-(a.properties.mag??-1))[0];els.largest.textContent=largest?`M ${number(largest.properties.mag,1)}`:'—';els.largestPlace.textContent=largest?.properties.place||'No events match these filters';els.result.textContent=`${number(visibleFeatures.length)} shown`;
  }
  function renderList() {
    const sorted=[...visibleFeatures].sort((a,b)=>(b.properties.mag??-1)-(a.properties.mag??-1)).slice(0,100);
    if(!sorted.length){els.list.innerHTML='<div class="empty-state">No events match this magnitude threshold in the selected window. Try lowering the filter.</div>';return;}
    els.list.innerHTML=sorted.map(f=>{const p=f.properties, color=depthColor(p.depth??0);return `<article class="event-row ${p.eventId===selectedId?'selected':''}" data-id="${esc(p.eventId)}" tabindex="0" role="button" aria-label="Magnitude ${number(p.mag,1)} earthquake, ${esc(p.place)}"><div class="mag-pill" style="--mag-color:${color}">${number(p.mag,1)}</div><div><div class="event-place">${esc(p.place||'Location not reported')}</div><div class="event-meta">${relative(p.time)} · ${number(p.depth,0)} km ${depthBand(p.depth??0).toLowerCase()}</div></div><span class="event-chevron">›</span></article>`;}).join('');
    els.list.querySelectorAll('.event-row').forEach(row=>{const go=()=>selectFeature(row.dataset.id,true);row.addEventListener('click',go);row.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();go();}});});
  }
  function applyFilters() { const min=Number(els.magnitude.value);els.magValue.textContent=min===0?'All':`M ${number(min,1)}+`;visibleFeatures=allFeatures.filter(f=>(f.properties.mag??0)>=min);updateStats();renderList();updateSource(); }
  function loadFeed() {
    currentFeed=els.period.value;els.list.innerHTML='<div class="loading-state"><span class="spinner"></span>Fetching the latest catalog</div>';els.updated.textContent='Updating…';els.refresh.disabled=true;
    fetch(FEEDS[currentFeed],{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error(`USGS returned ${r.status}`);return r.json();}).then(data=>{allFeatures=(data.features||[]).filter(f=>f.geometry?.type==='Point').map(f=>({...f,properties:{...f.properties,eventId:f.id,depth:f.geometry.coordinates[2]??0}}));selectedId=null;els.updated.textContent=`UPDATED ${new Date().toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`;applyFilters();if(allFeatures.length===0)els.list.innerHTML='<div class="empty-state">No events in this feed right now.</div>';}).catch(err=>{els.updated.textContent='FEED UNAVAILABLE';els.list.innerHTML=`<div class="empty-state">Could not load the USGS feed. Check your connection and try refresh.<br><br><span style="color:#8799a4">${esc(err.message)}</span></div>`;}).finally(()=>{els.refresh.disabled=false;});
  }
  function selectFeature(id,fly) { const f=allFeatures.find(x=>x.properties.eventId===id);if(!f)return;selectedId=id;renderList();const [lng,lat]=f.geometry.coordinates;const p=f.properties;if(fly)map.easeTo({center:[lng,lat],zoom:Math.max(map.getZoom(),4.2),duration:700});new maplibregl.Popup({closeButton:true,offset:10,maxWidth:'260px'}).setLngLat([lng,lat]).setHTML(`<div class="popup-title">M ${number(p.mag,1)} · ${esc(p.place||'Earthquake')}</div><div class="popup-meta">${new Date(p.time).toLocaleString()}<br>Depth: ${number(p.depth,1)} km (${depthBand(p.depth??0)})</div><a class="popup-link" href="${esc(p.url)}" target="_blank" rel="noreferrer">Open USGS event details ↗</a>`).addTo(map); }
  function switchProvider() { if(!map)return;els.mapError.hidden=true;map.setStyle(makeMapStyle());setMapMode();map.once('style.load',()=>{const src=map.getSource('earthquakes');if(!src){map.addSource('earthquakes',{type:'geojson',data:{type:'FeatureCollection',features:[]},cluster:true,clusterRadius:42,clusterMaxZoom:5});map.addLayer({id:'quake-clusters',type:'circle',source:'earthquakes',filter:['has','point_count'],paint:{'circle-color':['step',['get','point_count'],'#b8dfc9',20,'#edc077',80,'#ec8c61'],'circle-radius':['step',['get','point_count'],17,20,22,80,29],'circle-opacity':.92,'circle-stroke-width':1.5,'circle-stroke-color':'#17232b'}});map.addLayer({id:'quake-cluster-count',type:'symbol',source:'earthquakes',filter:['has','point_count'],layout:{'text-field':['get','point_count_abbreviated'],'text-font':['Open Sans Bold','Arial Unicode MS Bold'],'text-size':11},paint:{'text-color':'#17232b'}});map.addLayer({id:'quake-points',type:'circle',source:'earthquakes',filter:['!',['has','point_count']],paint:{'circle-radius':['interpolate',['linear'],['get','mag'],0,3,2,5,4,8,6,12,8,17],'circle-color':['case',['<',['get','depth'],70],'#f4a46f',['<',['get','depth'],300],'#e5d184','#7dc7c0'],'circle-opacity':.88,'circle-stroke-color':'#17232b','circle-stroke-width':1.15}});map.on('click','quake-points',(e)=>{const f=e.features?.[0];if(f)selectFeature(f.properties.eventId,true);});map.on('click','quake-clusters',(e)=>{const f=map.queryRenderedFeatures(e.point,{layers:['quake-clusters']})[0];if(f)map.getSource('earthquakes').getClusterExpansionZoom(f.properties.cluster_id,(err,z)=>{if(!err)map.easeTo({center:f.geometry.coordinates,zoom:z});});});}updateSource();}); }
  els.period.addEventListener('change',loadFeed);els.magnitude.addEventListener('input',applyFilters);els.refresh.addEventListener('click',loadFeed);
  initMap();
})();
