/**
 * fuel-price-card v1.0
 * - History-API Trend: sucht letzten Wert der sich vom aktuellen unterscheidet
 * - Kein Sub-Editor, Sensoren direkt inline
 * - Guenstigste Tankstelle zuerst (sort_by_price)
 */
(function () {
  'use strict';

  // _trendCache: entity_id -> { trend, cur }
  // _trendPending: Set von entity_ids die gerade geladen werden
  const _trendCache   = {};
  const _trendPending = new Set();

  async function fetchTrend(hass, card, entityId, cur) {
    if (_trendPending.has(entityId)) return;
    _trendPending.add(entityId);
    try {
      const start = new Date(Date.now() - 30 * 24 * 3600 * 1000);
      const end   = new Date();
      const url   = `history/period/${start.toISOString()}?end_time=${encodeURIComponent(end.toISOString())}&filter_entity_id=${entityId}&minimal_response=true&no_attributes=true&significant_changes_only=false`;
      const data  = await hass.callApi('GET', url);
      const states = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
      console.log('[FPC] history', entityId, states.length, 'states, cur=', cur);
      let found = false;
      for (let i = states.length - 1; i >= 0; i--) {
        // minimal_response liefert {s, lu} statt {state, last_updated}
        const raw = states[i].s ?? states[i].state;
        const v = parseFloat(raw);
        if (!isNaN(v) && Math.abs(v - cur) > 0.001) {
          const trend = cur > v ? 'up' : 'down';
          console.log('[FPC] trend', entityId, cur, trend === 'up' ? '>' : '<', v);
          _trendCache[entityId] = { trend, cur };
          found = true;
          break;
        }
      }
      if (!found) {
        console.log('[FPC] neutral (alle gleich)', entityId);
        _trendCache[entityId] = { trend: 'neutral', cur };
      }
    } catch(e) {
      console.warn('[FPC] fetchTrend error', entityId, e);
      _trendCache[entityId] = { trend: 'neutral', cur };
    } finally {
      _trendPending.delete(entityId);
      card._render();
    }
  }

  function getTrend(hass, card, entityId, cur) {
    if (!entityId || cur == null || isNaN(cur)) return 'neutral';
    const cached = _trendCache[entityId];
    if (!cached) {
      fetchTrend(hass, card, entityId, cur);
      return 'neutral';
    }
    if (Math.abs(cached.cur - cur) > 0.001) {
      _trendCache[entityId] = { trend: cached.trend, cur };
      fetchTrend(hass, card, entityId, cur);
    }
    return cached.trend;
  }

  function esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }
  function fmtPrice(state) {
    if (state == null || isNaN(state)) return '-';
    return parseFloat(state).toFixed(2).replace('.', ',');
  }
  function getTime(hass, entityId) {
    const s = hass?.states[entityId];
    if (!s?.last_updated) return '';
    const d = new Date(s.last_updated);
    return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
  }
  function stationMinPrice(hass, st) {
    let min = Infinity;
    for (const f of (st.fuels || [])) {
      const raw = hass?.states[f.entity]?.state;
      if (raw != null && !isNaN(raw)) min = Math.min(min, parseFloat(raw));
    }
    return min === Infinity ? null : min;
  }

  class FuelPriceCard extends HTMLElement {
    constructor() { super(); this.attachShadow({ mode: 'open' }); }

    setConfig(cfg) {
      if (!cfg.stations && cfg.fuels) {
        this._config = {
          stations:      [{ title: cfg.title || 'Tankstelle', subtitle: cfg.subtitle || '', logo_url: cfg.logo_url || '', fuels: cfg.fuels }],
          sort_by_price: cfg.sort_by_price || false,
        };
      } else {
        if (!cfg.stations?.length) throw new Error('fuel-price-card: "stations" erforderlich.');
        this._config = cfg;
      }
      this._render();
    }

    set hass(h) { this._hass = h; this._render(); }

    _render() {
      if (!this._config) return;
      const isPreview   = !!this._config._preview;
      const sortByPrice = !!this._config.sort_by_price;

      let stations = [...(this._config.stations || [])];
      if (sortByPrice && !isPreview) {
        stations = stations.slice().sort((a, b) => {
          const pa = stationMinPrice(this._hass, a);
          const pb = stationMinPrice(this._hass, b);
          if (pa === null && pb === null) return 0;
          if (pa === null) return 1;
          if (pb === null) return -1;
          return pa - pb;
        });
      }

      const html = stations.map((st, idx) => {
        const fuels   = st.fuels || [];
        const timeStr = fuels.length ? getTime(this._hass, fuels[0].entity) : '';
        const logo    = st.logo_url ? `<img class="logo" src="${esc(st.logo_url)}" alt="">` : `<div class="logo-ph"></div>`;
        const minPrice   = stationMinPrice(this._hass, st);
        const cheapBadge = sortByPrice && idx === 0 && minPrice !== null && !isPreview
          ? `<span class="cheap-badge">&#11088; G&uuml;nstigste</span>` : '';

        const chips = fuels.map(f => {
          let numVal = null, trendVal = 'neutral', priceStr = '-';
          const raw = this._hass?.states[f.entity]?.state;
          if (raw != null && !isNaN(raw)) {
            numVal   = parseFloat(raw);
            trendVal = getTrend(this._hass, this, f.entity, numVal);
            priceStr = fmtPrice(numVal);
          } else if (isPreview || !f.entity) {
            priceStr = '1,99'; trendVal = 'down';
          }
          const col = trendVal === 'up' ? '#f44336' : trendVal === 'down' ? '#4caf50' : '#8a8a8a';
          const arr = trendVal === 'up' ? '&#9650;' : trendVal === 'down' ? '&#9660;' : '&#9679;';
          const eid = esc(f.entity || '');
          return `<div class="chip" data-entity="${eid}" style="cursor:${eid?'pointer':'default'}">
            <div class="chip-lbl">${esc(f.label||f.entity||'-')}&thinsp;<span style="color:${col};font-size:11px">${arr}</span></div>
            <div class="chip-val">${priceStr}<sup class="sup">9</sup>&thinsp;<span class="eur">€</span></div>
          </div>`;
        }).join('');

        return `<div class="station">${logo}
          <div class="right">
            <div class="info">
              <span class="info-title">${esc(st.title||'Tankstelle')}</span>
              ${st.subtitle?`<span class="info-sub">${esc(st.subtitle)}</span>`:''}
              ${cheapBadge}
              ${timeStr?`<span class="info-time">${timeStr} Uhr</span>`:''}
            </div>
            <div class="chips">${chips}</div>
          </div></div>`;
      }).join('<div class="divider"></div>');

      this.shadowRoot.innerHTML = `<style>
        :host{display:block}ha-card{overflow:hidden}
        .station{display:grid;grid-template-columns:45px 1fr;align-items:center;gap:12px;padding:12px 16px}
        .divider{height:1px;background:var(--divider-color,rgba(255,255,255,.08));margin:0 16px}
        .logo{width:42px;height:42px;object-fit:contain;border-radius:4px;display:block}
        .logo-ph{width:42px;height:42px;background:rgba(255,255,255,.08);border-radius:4px}
        .right{display:flex;flex-direction:row;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .info{display:flex;flex-direction:column;line-height:1.4}
        .info-title{font-weight:700;font-size:15px;color:var(--primary-text-color)}
        .info-sub{font-size:14px;color:var(--primary-text-color)}
        .info-time{font-size:12px;color:#a0a0a0;margin-top:2px}
        .cheap-badge{font-size:11px;color:#4caf50;margin-top:1px}
        .chips{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
        .chip{background:rgba(255,255,255,.08);border-radius:6px;padding:6px 10px;display:flex;flex-direction:column;align-items:center;gap:3px;min-width:68px}
        .chip-lbl{font-size:13px;color:#e1e1e1;text-align:center;white-space:nowrap}
        .chip-val{font-size:18px;font-weight:400;color:var(--primary-text-color);white-space:nowrap}
        .sup{font-size:11px;vertical-align:super}
        .eur{font-size:14px;color:var(--primary-text-color);font-weight:300}
      </style><ha-card>${html}</ha-card>`;

      this.shadowRoot.querySelectorAll('.chip[data-entity]').forEach(chip => {
        chip.addEventListener('click', () => {
          const eid = chip.dataset.entity;
          if (eid) this.dispatchEvent(new CustomEvent('hass-more-info', { detail: { entityId: eid }, bubbles: true, composed: true }));
        });
      });
    }

    getCardSize() { return this._config?.stations?.length || 1; }
    static getConfigElement() { return document.createElement('fuel-price-card-editor'); }
    static getStubConfig() {
      return { _preview: true, sort_by_price: false, stations: [{ title: 'Tankstelle', subtitle: '', logo_url: '', fuels: [{ entity: '', label: 'Diesel' }, { entity: '', label: 'Benzin' }] }] };
    }
  }

  // ============================================================
  //  UI-EDITOR
  // ============================================================
  const GLOBAL_SCHEMA  = [{ name: 'sort_by_price', label: 'G\u00FCnstigste Tankstelle immer zuerst anzeigen', selector: { boolean: {} } }];
  const STATION_SCHEMA = [
    { name: 'title',    label: 'Stationsname',    selector: { text: {} } },
    { name: 'subtitle', label: 'Ort/Untertitel',  selector: { text: {} } },
    { name: 'logo_url', label: 'Logo-URL',         selector: { text: {} } },
  ];
  const EDITOR_STYLE = `<style>
    *,*::before,*::after{box-sizing:border-box}
    .editor-root{display:flex;flex-direction:column}
    .global-section{margin-bottom:12px}
    .st-block{margin-bottom:12px}
    .st-header{display:flex;align-items:center;gap:6px;padding:8px 4px;cursor:pointer;user-select:none;border-bottom:1px solid var(--divider-color,#333)}
    .st-header:hover{background:rgba(255,255,255,.03);border-radius:4px}
    .st-header-title{flex:1;font-size:14px;font-weight:600;color:var(--primary-text-color)}
    .st-header-count{font-size:12px;color:var(--secondary-text-color,#888)}
    .chevron{font-size:13px;color:var(--secondary-text-color,#888);transition:transform .15s}
    .chevron.open{transform:rotate(90deg)}
    .fuel-list{display:flex;flex-direction:column;gap:4px;padding-top:8px}
    .fuel-row{display:flex;align-items:center;gap:6px;padding:4px 0}
    .drag-handle{cursor:grab;color:var(--secondary-text-color,#666);font-size:20px;padding:0 2px;flex-shrink:0;user-select:none}
    .drag-handle:active{cursor:grabbing}
    .icon-btn{background:none;border:none;cursor:pointer;color:var(--secondary-text-color,#888);border-radius:50%;width:36px;height:36px;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0;transition:background .15s,color .15s}
    .icon-btn:hover{background:rgba(255,255,255,.08);color:var(--primary-text-color)}
    .icon-btn.delete:hover{background:rgba(244,67,54,.12);color:#f44336}
    .add-fuel-btn{display:flex;align-items:center;gap:6px;padding:8px 4px;margin-top:4px;background:none;border:none;cursor:pointer;color:var(--primary-color,#03a9f4);font-size:14px;border-radius:4px;width:100%}
    .add-fuel-btn:hover{background:rgba(3,169,244,.08)}
    .st-actions{display:flex;gap:4px}
    .add-station-btn{display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;background:var(--primary-color,#03a9f4);color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-top:8px}
    .add-station-btn:hover{filter:brightness(1.12)}
    ha-form{display:block}
    .form-section{padding:12px 0 0}
    .sensors-label{font-size:12px;font-weight:600;color:var(--secondary-text-color,#888);text-transform:uppercase;letter-spacing:.5px;padding:8px 0 4px}
    .section-sep{height:1px;background:var(--divider-color,#333);margin:12px 0 4px}
  </style>`;

  class FuelPriceCardEditor extends HTMLElement {
    constructor() {
      super();
      this._cfg = { stations: [], sort_by_price: false };
      this._hass = null; this._open = 0; this._dragging = null;
    }

    connectedCallback() {
      this.addEventListener('click', e => {
        const btn = e.target.closest('[data-a]');
        if (!btn) return;
        e.stopPropagation();
        const a = btn.dataset.a, si = parseInt(btn.dataset.si??-1), fi = parseInt(btn.dataset.fi??-1);
        if (a==='st-up')    this._moveStation(si,-1);
        if (a==='st-down')  this._moveStation(si,1);
        if (a==='st-del')   this._removeStation(si);
        if (a==='fuel-add') this._addFuel(si);
        if (a==='fuel-del') this._removeFuel(si,fi);
        if (a==='st-add')   this._addStation();
      });
      this._render();
    }

    setConfig(cfg) {
      const clean = JSON.parse(JSON.stringify(cfg));
      delete clean._preview;
      let next;
      if (!clean.stations && clean.fuels) {
        next = { sort_by_price: clean.sort_by_price||false, stations: [{ title: clean.title||'', subtitle: clean.subtitle||'', logo_url: clean.logo_url||'', fuels: clean.fuels||[] }] };
      } else {
        next = clean;
        if (!Array.isArray(next.stations)) next.stations = [];
        if (next.sort_by_price === undefined) next.sort_by_price = false;
      }
      if (this._selfUpdate) { this._selfUpdate = false; this._cfg = next; return; }
      this._cfg = next;
      this._render();
    }

    set hass(h) {
      this._hass = h;
      this.querySelectorAll('ha-form').forEach(f => { f.hass = h; });
      this.querySelectorAll('ha-entity-picker').forEach(p => { p.hass = h; });
    }

    _fire() {
      this._selfUpdate = true;
      this.dispatchEvent(new CustomEvent('config-changed', { detail: { config: JSON.parse(JSON.stringify(this._cfg)) }, bubbles: true, composed: true }));
    }

    _addStation()       { this._cfg.stations.push({title:'',subtitle:'',logo_url:'',fuels:[]}); this._open=this._cfg.stations.length-1; this._render(); this._fire(); }
    _removeStation(i)   { this._cfg.stations.splice(i,1); this._open=Math.max(0,Math.min(this._open,this._cfg.stations.length-1)); this._render(); this._fire(); }
    _moveStation(i,dir) { const j=i+dir; if(j<0||j>=this._cfg.stations.length)return; [this._cfg.stations[i],this._cfg.stations[j]]=[this._cfg.stations[j],this._cfg.stations[i]]; this._open=j; this._render(); this._fire(); }
    _addFuel(si)        { this._cfg.stations[si].fuels.push({entity:'',label:''}); this._render(); this._fire(); }
    _removeFuel(si,fi)  { this._cfg.stations[si].fuels.splice(fi,1); this._render(); this._fire(); }
    _moveFuel(si,from,to) { const f=this._cfg.stations[si].fuels; if(to<0||to>=f.length)return; const[item]=f.splice(from,1); f.splice(to,0,item); this._render(); this._fire(); }

    _render() {
      const stations = this._cfg.stations || [];
      this.innerHTML = EDITOR_STYLE + `<div class="editor-root" id="root"></div>`;
      const root = this.querySelector('#root');

      const gs = document.createElement('div'); gs.className='global-section';
      const gf = document.createElement('ha-form');
      if(this._hass) gf.hass=this._hass;
      gf.schema=GLOBAL_SCHEMA; gf.data={sort_by_price:!!this._cfg.sort_by_price}; gf.computeLabel=s=>s.label||s.name;
      gf.addEventListener('value-changed',e=>{ const v=e.detail.value; if(v.sort_by_price!==undefined){this._cfg.sort_by_price=v.sort_by_price;this._fire();} });
      gs.appendChild(gf); root.appendChild(gs);
      const s0=document.createElement('div'); s0.className='section-sep'; root.appendChild(s0);

      stations.forEach((st,si) => {
        const isOpen = si===this._open;
        const fuels  = st.fuels||[];
        const block  = document.createElement('div'); block.className='st-block';

        const hdr = document.createElement('div'); hdr.className='st-header';
        hdr.innerHTML=`<span class="chevron ${isOpen?'open':''}">&#9658;</span><span class="st-header-title">${esc(st.title||'Neue Tankstelle')}</span><span class="st-header-count">${fuels.length}</span><div class="st-actions"><button class="icon-btn" data-a="st-up" data-si="${si}">&#8593;</button><button class="icon-btn" data-a="st-down" data-si="${si}">&#8595;</button><button class="icon-btn delete" data-a="st-del" data-si="${si}">&#10005;</button></div>`;
        hdr.addEventListener('click',e=>{ if(e.target.closest('button'))return; this._open=isOpen?-1:si; this._render(); });
        block.appendChild(hdr);

        if(!isOpen){ root.appendChild(block); return; }

        const body=document.createElement('div');

        const stSlot=document.createElement('div'); stSlot.className='form-section';
        const stForm=document.createElement('ha-form');
        if(this._hass) stForm.hass=this._hass;
        stForm.schema=STATION_SCHEMA;
        stForm.data={title:st.title||'',subtitle:st.subtitle||'',logo_url:st.logo_url||''};
        stForm.computeLabel=s=>s.label||s.name;
        stForm.addEventListener('value-changed',e=>{ const v=e.detail.value; if(v.title!==undefined){this._cfg.stations[si].title=v.title;hdr.querySelector('.st-header-title').textContent=v.title||'Neue Tankstelle';} if(v.subtitle!==undefined)this._cfg.stations[si].subtitle=v.subtitle; if(v.logo_url!==undefined)this._cfg.stations[si].logo_url=v.logo_url; });
        stForm.addEventListener('focusout',()=>this._fire());
        stSlot.appendChild(stForm); body.appendChild(stSlot);

        const sep=document.createElement('div'); sep.className='section-sep'; body.appendChild(sep);
        const lbl=document.createElement('div'); lbl.className='sensors-label'; lbl.textContent='Sensoren'; body.appendChild(lbl);

        const list=document.createElement('div'); list.className='fuel-list';
        const fuelRe=/preis|price|diesel|super|benzin|kraftstoff|sprit|fuel|lpg|autogas|erdgas|cng|e10|e5|vpower|ultimate|excellium|momentum/i;

        fuels.forEach((f,fi)=>{
          const row=document.createElement('div'); row.className='fuel-row'; row.draggable=true; row.dataset.fi=String(fi);
          const handle=document.createElement('span'); handle.className='drag-handle'; handle.innerHTML='&#8801;'; row.appendChild(handle);

          const usedInStation=new Set(fuels.filter((_,i)=>i!==fi&&fuels[i].entity).map(x=>x.entity));

          const form=document.createElement('ha-form');
          if(this._hass) form.hass=this._hass;
          form.schema=[{name:'entity',label:'Sensor',selector:{entity:{}}},{name:'label',label:'Anzeigename',selector:{text:{}}}];
          form.data={entity:f.entity||'',label:f.label||''};
          form.computeLabel=s=>s.label;
          form.style.cssText='flex:1;min-width:0;';
          form.addEventListener('value-changed',e=>{ const v=e.detail.value; if(v.entity!==undefined){this._cfg.stations[si].fuels[fi].entity=v.entity;this._fire();} if(v.label!==undefined)this._cfg.stations[si].fuels[fi].label=v.label; });
          form.addEventListener('focusout',()=>this._fire());
          row.appendChild(form);

          const filterFn=(stateObj)=>{
            if(!stateObj.entity_id.startsWith('sensor.')) return false;
            if(usedInStation.has(stateObj.entity_id)&&stateObj.entity_id!==f.entity) return false;
            const hasKeyword=fuelRe.test(stateObj.entity_id)||fuelRe.test(stateObj.attributes?.friendly_name||'');
            const v=parseFloat(stateObj.state);
            const inPriceRange=!isNaN(v)&&v>=0&&v<=10;
            return hasKeyword||inPriceRange;
          };
          const applyFilter=(attempt)=>{
            const picker=form.shadowRoot?.querySelector('ha-entity-picker')||form.querySelector('ha-entity-picker');
            if(picker){ picker.entityFilter=filterFn; return; }
            if(attempt<10) setTimeout(()=>applyFilter(attempt+1),50);
          };
          setTimeout(()=>applyFilter(0),0);

          const del=document.createElement('button'); del.className='icon-btn delete'; del.dataset.a='fuel-del'; del.dataset.si=String(si); del.dataset.fi=String(fi); del.title='Entfernen'; del.innerHTML='&#10005;'; row.appendChild(del);

          row.addEventListener('dragstart',e=>{this._dragging=fi;e.dataTransfer.effectAllowed='move';});
          row.addEventListener('dragover', e=>e.preventDefault());
          row.addEventListener('drop',    e=>{e.preventDefault();if(this._dragging!==null&&this._dragging!==fi)this._moveFuel(si,this._dragging,fi);this._dragging=null;});
          row.addEventListener('dragend', ()=>{this._dragging=null;});
          list.appendChild(row);
        });

        const addBtn=document.createElement('button'); addBtn.className='add-fuel-btn'; addBtn.dataset.a='fuel-add'; addBtn.dataset.si=String(si); addBtn.innerHTML='&#65291; Sensor hinzuf\u00FCgen'; list.appendChild(addBtn);
        body.appendChild(list); block.appendChild(body); root.appendChild(block);
      });

      const addSt=document.createElement('button'); addSt.className='add-station-btn'; addSt.dataset.a='st-add'; addSt.innerHTML='&#65291; Tankstelle hinzuf\u00FCgen'; root.appendChild(addSt);
      if(this._hass) this.querySelectorAll('ha-form').forEach(f=>{f.hass=this._hass;});
    }
  }

  customElements.define('fuel-price-card',        FuelPriceCard);
  customElements.define('fuel-price-card-editor', FuelPriceCardEditor);
  window.customCards = window.customCards || [];
  window.customCards.push({ type: 'fuel-price-card', name: 'Fuel Price Card', description: 'Kraftstoffpreise', preview: true });

  console.info('%c FUEL-PRICE-CARD %c v1.0 ', 'background:#03a9f4;color:#fff;padding:2px 6px;border-radius:3px 0 0 3px;font-weight:bold', 'background:#1e1e1e;color:#03a9f4;padding:2px 6px;border-radius:0 3px 3px 0;font-weight:bold');
})();
