// src/pages/StockRoom.js
// Stock Room — clean layout: Requests → Quick actions → Inventory (collapsible categories)

import React, { useEffect, useMemo, useRef, useState } from 'react';
import TopNav from '../components/TopNav';
import { db } from '../firebase';
import { useAuth } from '../AuthContext';
import {
  collection, onSnapshot, orderBy, query, doc, runTransaction, serverTimestamp,
} from 'firebase/firestore';
import { createItem, receiveStock, issueStock } from '../services/inventory';
import { isAdmin } from '../utils/roles';

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));
function fmtDateTime(v){ try{ const d=v?.toDate?v.toDate():new Date(v);
  return new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(d);
} catch{ return String(v||'');}}
function timeAgo(ts){ try{ const d=ts?.toDate?ts.toDate():new Date(ts);
  const mins=Math.max(0,Math.floor((Date.now()-d.getTime())/60000));
  if(mins<60)return`${mins}m`;const hrs=Math.floor(mins/60);if(hrs<24)return`${hrs}h`;
  return`${Math.floor(hrs/24)}d`;
}catch{return'';}}

export default function StockRoom(){
  const { user, profile, role:ctxRole } = useAuth();
  const role = ctxRole || profile?.role || '';
  const admin = isAdmin(role);

  const [items,setItems]=useState([]);
  const [reqs,setReqs]=useState([]);
  const [selectedReq,setSelectedReq]=useState(null);
  const [lastTs,setLastTs]=useState(null);

  const [search,setSearch]=useState(()=>localStorage.getItem('sr.q')||'');
  const [lowOnly,setLowOnly]=useState(()=>localStorage.getItem('sr.low')==='1');
  const [sortBy,setSortBy]=useState(()=>localStorage.getItem('sr.sortBy')||'minGap');
  const searchRef=useRef(null);

  const [receive,setReceive]=useState({ itemId:'', qty:0, reason:'receive' });
  const [issue,setIssue]=useState({ itemId:'', qty:0, reason:'issue' });
  const [newItem,setNewItem]=useState({ name:'', unit:'pcs', minQty:0, maxQty:0, initialQty:0 });

  useEffect(()=>localStorage.setItem('sr.q',search),[search]);
  useEffect(()=>localStorage.setItem('sr.low',lowOnly?'1':'0'),[lowOnly]);
  useEffect(()=>localStorage.setItem('sr.sortBy',sortBy),[sortBy]);

  useEffect(()=>{
    const onKey=(e)=>{ const tag=String(e.target?.tagName||'').toUpperCase();
      if(tag==='INPUT'||tag==='TEXTAREA')return;
      if(e.key==='/'){ e.preventDefault(); searchRef.current?.focus(); }
      if(e.key.toLowerCase()==='e') exportVisibleAsCSV();
    };
    window.addEventListener('keydown',onKey);
    return()=>window.removeEventListener('keydown',onKey);
  },[]);

  useEffect(()=>{
    const un1=onSnapshot(query(collection(db,'inventory'),orderBy('name')),(snap)=>{
      const arr=[]; snap.forEach(d=>arr.push({id:d.id,...d.data()})); setItems(arr); setLastTs(new Date());
    });
    const un2=onSnapshot(query(collection(db,'supplyRequests'),orderBy('createdAt')),(snap)=>{
      const arr=[]; snap.forEach(d=>arr.push({id:d.id,...d.data()})); setReqs(arr.reverse()); setLastTs(new Date());
    });
    return()=>{ un1(); un2(); };
  },[]);

  const byNameLower=useMemo(()=>{ const m=new Map(); items.forEach(it=>m.set(String(it.name||'').toLowerCase(),it)); return m;},[items]);
  const byId=useMemo(()=>{ const m=new Map(); items.forEach(it=>m.set(it.id,it)); return m;},[items]);

  const pending=useMemo(()=>reqs.filter(r=>(r.status||'pending')==='pending'),[reqs]);
  const approved=useMemo(()=>reqs.filter(r=>r.status==='approved'),[reqs]);

  const visible=useMemo(()=>{
    const q=search.trim().toLowerCase();
    let arr=items.slice();
    if(lowOnly) arr=arr.filter(it=>(+it.qty||0) <= (+it.minQty||0));
    if(q) arr=arr.filter(it=>`${it.name} ${it.unit||''} ${it.category||''}`.toLowerCase().includes(q));
    arr.sort((a,b)=>{
      const qa=+a.qty||0, qb=+b.qty||0;
      if(sortBy==='qtyAsc') return qa-qb;
      if(sortBy==='qtyDesc') return qb-qa;
      if(sortBy==='name') return String(a.name||'').localeCompare(String(b.name||''));
      if(sortBy==='minGap'){ const ga=qa-(+a.minQty||0), gb=qb-(+b.minQty||0); return ga-gb; }
      return 0;
    });
    return arr;
  },[items,search,lowOnly,sortBy]);

  const grouped = useMemo(()=>{
    const m = new Map();
    visible.forEach(it=>{
      const c = String(it.category || 'General');
      if(!m.has(c)) m.set(c, []);
      m.get(c).push(it);
    });
    return Array.from(m.entries()).sort((a,b)=>a[0].localeCompare(b[0]));
  },[visible]);

  const lastUpdated = lastTs ? `Live • ${fmtDateTime(lastTs)}` : 'Live';

  async function handleCreateItem(e){ e.preventDefault();
    if(!admin) return alert('Admin only.');
    try{
      const payload={ name:String(newItem.name||'').trim(), unit:String(newItem.unit||'pcs').trim(),
        category:'general', minQty:+newItem.minQty||0, maxQty:+newItem.maxQty||0, initialQty:+newItem.initialQty||0 };
      if(!payload.name) return alert('Item name required.');
      await createItem(payload);
      setNewItem({ name:'', unit:'pcs', minQty:0, maxQty:0, initialQty:0 });
    }catch(err){ console.error(err); alert(err.message); }
  }
  async function handleReceive(e){ e.preventDefault();
    if(!admin) return alert('Admin only.');
    try{
      if(!receive.itemId) return alert('Select item');
      const qty=+receive.qty; if(!qty||qty<=0) return alert('Enter quantity > 0');
      await receiveStock({ itemId:receive.itemId, qty, reason:receive.reason, byUid:user?.uid });
      setReceive({ itemId:'', qty:0, reason:'receive' });
    }catch(err){ console.error(err); alert(err.message); }
  }
  async function handleIssue(e){ e.preventDefault();
    if(!admin) return alert('Admin only.');
    try{
      if(!issue.itemId) return alert('Select item');
      const qty=+issue.qty; if(!qty||qty<=0) return alert('Enter quantity > 0');
      await issueStock({ itemId:issue.itemId, qty, reason:issue.reason, byUid:user?.uid });
      setIssue({ itemId:'', qty:0, reason:'issue' });
    }catch(err){ console.error(err); alert(err.message); }
  }

  async function txResolveAndReserve(tx, request, itemsByIdLocal, itemsByNameMap){
    const itemsInReq=Array.isArray(request.items)?request.items:[];
    if(itemsInReq.length===0) throw new Error('Request has no items.');
    const resolved=itemsInReq.map(it=>{
      const qty=+it.qty||0; if(!qty||qty<=0) return null;
      let invId=it.itemId; if(!invId&&it.name){ const f=itemsByNameMap.get(String(it.name).toLowerCase()); if(f) invId=f.id; }
      if(!invId) throw new Error(`Cannot resolve inventory item for "${it.name||'unknown'}".`);
      const inv=itemsByIdLocal.get(invId);
      return { itemId:invId, name:it.name||inv?.name||invId, unit:it.unit||inv?.unit||'', qty, ref:doc(db,'inventory',invId) };
    }).filter(Boolean);
    const snaps=[]; for(const r of resolved) snaps.push(await tx.get(r.ref));
    resolved.forEach((r,i)=>{ const d=snaps[i].data(); const onHand=+(d?.qty??0); const res=+(d?.reservedQty??0);
      if((onHand-res)<r.qty) throw new Error(`${r.name}: need ${r.qty}, only ${onHand-res} available.`);
    });
    return { resolved, snaps };
  }

  async function handleApprove(id){
    if(!admin) return alert('Admin only.');
    try{
      await runTransaction(db,async(tx)=>{
        const reqRef=doc(db,'supplyRequests',id); const reqSnap=await tx.get(reqRef);
        if(!reqSnap.exists()) throw new Error('Request not found.');
        const request=reqSnap.data(); if((request.status||'pending')!=='pending') throw new Error(`Request is already ${request.status}.`);
        const { resolved, snaps } = await txResolveAndReserve(tx, request, byId, byNameLower);
        resolved.forEach((r,i)=>{ const d=snaps[i].data(); const cur=+(d?.reservedQty??0); tx.update(r.ref,{ reservedQty: cur + r.qty }); });
        tx.update(reqRef,{ status:'approved', approvedAt:serverTimestamp(), approvedBy:user?.uid||null,
          reservedItems: resolved.map(({itemId,name,unit,qty})=>({itemId,name,unit,qty})) });
      });
    }catch(err){ console.error(err); alert(err.message||String(err)); }
  }

  async function handleDispatch(id){
    if(!admin) return alert('Admin only.');
    try{
      await runTransaction(db,async(tx)=>{
        const reqRef=doc(db,'supplyRequests',id); const reqSnap=await tx.get(reqRef);
        if(!reqSnap.exists()) throw new Error('Request not found.');
        const request=reqSnap.data(); if(request.status!=='approved') throw new Error(`Request is ${request.status||'not approved'}.`);
        const lines=(Array.isArray(request.reservedItems)&&request.reservedItems.length)?request.reservedItems:(Array.isArray(request.items)?request.items:[]);
        const resolved=lines.map(it=>{ const qty=+it.qty||0; if(!qty||qty<=0) return null;
          const invId=it.itemId || byNameLower.get(String(it.name||'').toLowerCase())?.id;
          if(!invId) throw new Error(`Cannot resolve inventory item for dispatch: "${it.name||'unknown'}"`);
          return { itemId:invId, name:it.name, unit:it.unit||'', qty, ref:doc(db,'inventory',invId) };
        }).filter(Boolean);
        const snaps=[]; for(const r of resolved) snaps.push(await tx.get(r.ref));
        resolved.forEach((r,i)=>{ const d=snaps[i].data(); const cur=+(d?.qty??0); const res=+(d?.reservedQty??0);
          const newQty=cur-r.qty, newRes=res-r.qty; if(newQty<0) throw new Error(`${r.name}: not enough stock to dispatch.`);
          if(newRes<0) throw new Error(`${r.name}: reservation underflow.`); tx.update(r.ref,{ qty:newQty, reservedQty:newRes }); });
        tx.update(reqRef,{ status:'dispatched', dispatchedAt:serverTimestamp(), dispatchedBy:user?.uid||null });
      });
    }catch(err){ console.error(err); alert(err.message||String(err)); }
  }

  async function handleUnapprove(id){
    if(!admin) return alert('Admin only.');
    try{
      await runTransaction(db,async(tx)=>{
        const reqRef=doc(db,'supplyRequests',id); const reqSnap=await tx.get(reqRef);
        if(!reqSnap.exists()) throw new Error('Request not found.');
        const request=reqSnap.data(); if(request.status!=='approved') throw new Error(`Request is ${request.status||'not approved'}.`);
        const lines=(Array.isArray(request.reservedItems)&&request.reservedItems.length)?request.reservedItems:(Array.isArray(request.items)?request.items:[]);
        const resolved=lines.map(it=>{ const qty=+it.qty||0; if(!qty||qty<=0) return null;
          const invId=it.itemId || byNameLower.get(String(it.name||'').toLowerCase())?.id;
          if(!invId) throw new Error(`Cannot resolve inventory item to release: "${it.name||'unknown'}"`);
          return { itemId:invId, name:it.name, unit:it.unit||'', qty, ref:doc(db,'inventory',invId) };
        }).filter(Boolean);
        const snaps=[]; for(const r of resolved) snaps.push(await tx.get(r.ref));
        resolved.forEach((r,i)=>{ const d=snaps[i].data(); const res=+(d?.reservedQty??0);
          const newRes=res-r.qty; if(newRes<0) throw new Error(`${r.name}: reservation underflow on release.`); tx.update(r.ref,{ reservedQty:newRes }); });
        tx.update(reqRef,{ status:'pending', approvedAt:null, approvedBy:null, reservedItems:[] });
      });
    }catch(err){ console.error(err); alert(err.message||String(err)); }
  }

  function selectItem(id){
    setReceive(s=>({...s,itemId:id}));
    setIssue(s=>({...s,itemId:id}));
  }

  function exportVisibleAsCSV(){
    const head=['name','unit','qty','minQty','reservedQty'];
    const rows=visible.map(it=>[it.name??'', it.unit??'', +it.qty||0, +it.minQty||0, +it.reservedQty||0]);
    const esc=s=>{ const v=String(s??''); return (v.includes('"')||v.includes(',')||v.includes('\n'))?`"${v.replace(/"/g,'""')}"`:v; };
    const csv=[head.map(esc).join(','), ...rows.map(r=>r.map(esc).join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a'); a.href=url; a.download=`inventory_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }
  function exportReorderCSV(){
    const head=['name','unit','currentQty','reservedQty','minQty','qtyToOrder'];
    const rows=items.map(it=>{ const qty=+it.qty||0, min=+it.minQty||0, res=+it.reservedQty||0; const need=Math.max(0,min-(qty-res));
      return {name:it.name||'', unit:it.unit||'', qty, res, min, need}; }).filter(r=>r.min>0&&r.need>0);
    if(!rows.length){ alert('No low items that need reordering.'); return; }
    const esc=s=>{ const v=String(s??''); return (v.includes('"')||v.includes(',')||v.includes('\n'))?`"${v.replace(/"/g,'""')}"`:v; };
    const csv=[head.map(esc).join(','), ...rows.map(r=>[r.name,r.unit,r.qty,r.res,r.min,r.need].map(esc).join(','))].join('\n');
    const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));
    const a=document.createElement('a'); a.href=url; a.download=`reorder_low_${new Date().toISOString().slice(0,10)}.csv`; a.click(); URL.revokeObjectURL(url);
  }

  return (
    <>
      <TopNav />
      <div className="stockroom-wrap">
        {/* Slim toolbar */}
        <div className="srm-toolbar card">
          <input
            ref={searchRef}
            className="input srm-search"
            placeholder="Search items, units, categories…  (/)"
            value={search}
            onChange={(e)=>setSearch(e.target.value)}
            aria-label="Search inventory"
          />
          <div className="srm-controls">
            <button className={`seg ${lowOnly?'active':''}`} onClick={()=>setLowOnly(v=>!v)}>
              {lowOnly ? 'Low only' : 'All items'}
            </button>
            <select className="seg" value={sortBy} onChange={(e)=>setSortBy(e.target.value)} aria-label="Sort inventory">
              <option value="minGap">Closest to min</option>
              <option value="qtyAsc">Qty ↑</option>
              <option value="qtyDesc">Qty ↓</option>
              <option value="name">Name A–Z</option>
            </select>
            <div className="srm-right">
              <button className="seg" onClick={exportVisibleAsCSV}>Export CSV</button>
              <button className="seg" onClick={exportReorderCSV}>Reorder CSV</button>
            </div>
          </div>
          <div className="tiny muted srm-live">{lastUpdated}</div>
        </div>

        {/* 1) Requests — top, full width */}
        <section className="card">
          <div className="card-h">Requests</div>
          <div className="reqs">
            {pending.length===0 && <div className="muted small">No pending requests.</div>}
            {pending.slice(0,10).map(r=>(
              <div key={r.id} className="req">
                <div className="req-main" onClick={()=>setSelectedReq(r)}>
                  <div className="req-title">{r.trackId||'Request'}</div>
                  <div className="muted tiny">{r.createdAt?`${timeAgo(r.createdAt)} ago`:'—'}</div>
                </div>
                {admin && <div className="req-actions"><button className="btn primary" onClick={()=>handleApprove(r.id)}>Approve</button></div>}
              </div>
            ))}
            {approved.length>0 && (
              <>
                <div className="divider">Approved</div>
                {approved.slice(0,10).map(r=>(
                  <div key={r.id} className="req">
                    <div className="req-main" onClick={()=>setSelectedReq(r)}>
                      <div className="req-title">{r.trackId||'Request'}</div>
                      <div className="muted tiny">{r.approvedAt?`approved ${timeAgo(r.approvedAt)} ago`:''}</div>
                    </div>
                    {admin && (
                      <div className="req-actions">
                        <button className="btn primary" onClick={()=>handleDispatch(r.id)}>Dispatch</button>
                        <button className="btn ghost" onClick={()=>handleUnapprove(r.id)}>Unapprove</button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </div>
        </section>

        {/* 2) Quick actions — now its own full-width card under requests */}
        <section className="card">
          <div className="card-h">Quick actions</div>
          <div className="qa-grid">
            <form onSubmit={handleReceive} className="qa-row">
              <select className="input" value={receive.itemId} onChange={(e)=>setReceive({...receive,itemId:e.target.value})}>
                <option value="">Receive → select item…</option>
                {items.map(it=>(<option key={it.id} value={it.id}>{it.name}</option>))}
              </select>
              <input className="input" type="number" placeholder="Qty" value={receive.qty} onChange={(e)=>setReceive({...receive,qty:e.target.value})}/>
              <button className="btn primary" disabled={!admin}>Receive</button>
            </form>

            <form onSubmit={handleIssue} className="qa-row">
              <select className="input" value={issue.itemId} onChange={(e)=>setIssue({...issue,itemId:e.target.value})}>
                <option value="">Issue → select item…</option>
                {items.map(it=>(<option key={it.id} value={it.id}>{it.name}</option>))}
              </select>
              <input className="input" type="number" placeholder="Qty" value={issue.qty} onChange={(e)=>setIssue({...issue,qty:e.target.value})}/>
              <button className="btn" disabled={!admin}>Issue</button>
            </form>

            <div className="muted small">Add item</div>
            <form onSubmit={handleCreateItem} className="qa-row add">
              <input className="input" placeholder="Name" value={newItem.name} onChange={(e)=>setNewItem({...newItem,name:e.target.value})}/>
              <input className="input" placeholder="Unit" value={newItem.unit} onChange={(e)=>setNewItem({...newItem,unit:e.target.value})}/>
              <input className="input" type="number" placeholder="Min" value={newItem.minQty} onChange={(e)=>setNewItem({...newItem,minQty:e.target.value})}/>
              <input className="input" type="number" placeholder="Max" value={newItem.maxQty} onChange={(e)=>setNewItem({...newItem,maxQty:e.target.value})}/>
              <input className="input" type="number" placeholder="Start qty" value={newItem.initialQty} onChange={(e)=>setNewItem({...newItem,initialQty:e.target.value})}/>
              <button className="btn primary" disabled={!admin}>Save</button>
            </form>
          </div>
        </section>

        {/* 3) Inventory — full width, collapsible categories (closed by default) */}
        <section className="card">
          <div className="card-h">Inventory</div>
          {grouped.length===0 && (<div className="muted small">No items.</div>)}

          {grouped.map(([cat, arr])=>(
            <details key={cat} className="srm-cat">
              <summary className="srm-cat-sum">
                <span className="srm-cat-name">{cat}</span>
                <span className="srm-badge">{arr.length}</span>
              </summary>

              <table className="table responsive srm-table">
                <thead>
                  <tr>
                    <th style={{textAlign:'left'}}>Item</th>
                    <th>Qty</th>
                    <th>Reserved</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {arr.map(it=>{
                    const qty=+it.qty||0, min=+it.minQty||0, res=+it.reservedQty||0;
                    const low = qty<=min; const critical = min>0 && qty<=Math.floor(min*0.5);
                    const coverPct = min>0 ? clamp(Math.round((qty/min)*100)) : null;
                    return (
                      <tr
                        key={it.id}
                        className={`${low?'row-low':''} ${critical?'row-critical':''}`}
                        onClick={()=>selectItem(it.id)}
                        style={{cursor:'pointer'}}
                      >
                        <td data-label="Item" className="ellipsis">{it.name}{it.unit?<span className="tiny muted"> · {it.unit}</span>:null}</td>
                        <td data-label="Qty">{qty}</td>
                        <td data-label="Reserved">{res>0?res:'—'}</td>
                        <td data-label="Status">
                          <span className={`pill ${low?'danger':'ok'}`}>{low?'Low':'OK'}</span>
                          {coverPct!=null && <div className="bar"><div className="fill" style={{width:`${coverPct}%`}}/></div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </details>
          ))}
        </section>
      </div>

      {/* Modal */}
      {selectedReq && (
        <div className="modal" onClick={()=>setSelectedReq(null)} role="dialog" aria-modal="true">
          <div className="modal-card" onClick={(e)=>e.stopPropagation()}>
            <div className="modal-h">
              <div className="h">{selectedReq.trackId || 'Request'}</div>
              <button className="btn ghost" onClick={()=>setSelectedReq(null)}>Close</button>
            </div>
            <div className="muted tiny" style={{marginBottom:8}}>
              Status: <strong>{selectedReq.status || 'pending'}</strong>
              {selectedReq.createdAt && <> · Created: {fmtDateTime(selectedReq.createdAt)}</>}
              {selectedReq.approvedAt && <> · Approved: {fmtDateTime(selectedReq.approvedAt)}</>}
              {selectedReq.dispatchedAt && <> · Dispatched: {fmtDateTime(selectedReq.dispatchedAt)}</>}
            </div>
            {selectedReq.note && (<div className="note">{selectedReq.note}</div>)}
            {selectedReq.photoURL && (<img src={selectedReq.photoURL} alt="" className="attachment" />)}
            <div className="sub">
              <div className="muted tiny">Items</div>
              <ul className="lines">
                {(selectedReq.reservedItems?.length?selectedReq.reservedItems:selectedReq.items)?.map((line,i)=>(
                  <li key={i}>{line.name} — {line.qty} {line.unit}</li>
                ))}
              </ul>
            </div>
            {admin && (
              <div className="actions">
                {selectedReq.status==='pending' && <button className="btn primary" onClick={()=>handleApprove(selectedReq.id)}>Approve & Reserve</button>}
                {selectedReq.status==='approved' && (
                  <>
                    <button className="btn primary" onClick={()=>handleDispatch(selectedReq.id)}>Dispatch</button>
                    <button className="btn ghost" onClick={()=>handleUnapprove(selectedReq.id)}>Unapprove</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <style>{`
        :root { --glass:#15171a; --border:#2a2d31; --muted:#a4a6ab; --accent:#5eead4; }
        * { box-sizing:border-box; }
        .muted{ color: var(--muted); } .tiny{ font-size:12px; } .small{ font-size:13px; }
        .ellipsis{ overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

        .stockroom-wrap{ max-width:1200px; margin:0 auto; padding:10px 10px 18px; }
        .card{ background:#17181a; border:1px solid var(--border); border-radius:14px; padding:10px; margin-bottom:10px; }
        .card-h{ font-weight:700; margin-bottom:8px; }

        /* Toolbar (tight) */
        .srm-toolbar.card{ background: var(--glass); }
        .srm-toolbar{ display:grid; gap:6px; }
        .srm-search{ width:100%; background:#111216; border:1px solid var(--border); border-radius:10px; padding:9px 10px; color:#fff; }
        .seg{ background:#191b20; border:1px solid var(--border); border-radius:10px; padding:7px 10px; color:#ddd; }
        .seg.active{ outline:2px solid var(--accent); }
        .srm-controls{ display:grid; grid-template-columns: auto auto 1fr; gap:6px; align-items:center; }
        .srm-right{ justify-self:end; display:flex; gap:6px; }
        .srm-live{ text-align:right; }

        /* Requests */
        .reqs{ display:flex; flex-direction:column; gap:6px; }
        .req{ display:flex; gap:8px; justify-content:space-between; align-items:center; padding:8px; border:1px solid var(--border); border-radius:10px; background:#101216; }
        .req:hover{ background:#0d0f13; }
        .req-main{ cursor:pointer; }
        .req-title{ font-weight:600; }
        .req-actions{ display:flex; gap:6px; }
        .divider{ margin:6px 0; padding-top:6px; border-top:1px dashed var(--border); color:var(--muted); font-size:12px; }

        /* Quick actions — overflow-safe */
        .qa-grid{ display:flex; flex-direction:column; gap:6px; }
        .qa-row{
          display:grid;
          /* input | qty | action */
          grid-template-columns: minmax(0,1fr) 84px 100px;
          gap:6px; align-items:center;
        }
        .qa-row > *{ min-width:0; }
        .input{ width:100%; background:#111216; border:1px solid var(--border); border-radius:8px; padding:8px 9px; color:#fff; }
        .btn{ width:100%; padding:8px 10px; border-radius:8px; border:1px solid var(--border); background:#191b20; color:#e7e8ea; }
        .btn.ghost{ background:#121419; color:#c9cace; }
        .btn.primary{ background:#1c3a31; color:#c0f3e7; border-color:#2b564a; }
        .btn:disabled{ opacity:0.5; cursor:not-allowed; }

        /* Add item: inputs on one row, Save full width below */
        .qa-row.add{ grid-template-columns: minmax(0,1fr) 72px 72px 72px 88px; }
        .qa-row.add .btn{ grid-column: 1 / -1; justify-self: stretch; }

        /* Collapsible categories */
        .srm-cat{ border:1px solid var(--border); border-radius:12px; background:#111216; margin-bottom:8px; overflow:hidden; }
        .srm-cat-sum{ list-style:none; display:flex; justify-content:space-between; align-items:center; gap:10px; padding:9px 12px; background:#0e1014; cursor:pointer; }
        .srm-cat-sum::-webkit-details-marker{ display:none; }
        .srm-cat-sum::after{ content:'▸'; font-size:12px; color:#9aa0a6; margin-left:8px; }
        .srm-cat[open] .srm-cat-sum::after{ content:'▾'; }
        .srm-cat-name{ font-weight:700; }
        .srm-badge{ background:#1a2226; color:#d7e2e6; border:1px solid var(--border); padding:2px 8px; border-radius:999px; font-size:12px; }

        /* Table (no Min/Select) */
        .srm-table{ width:100%; border-collapse: separate; border-spacing: 0 6px; }
        .srm-table thead th{ text-align:center; font-weight:600; color:var(--muted); background:#0c0e12; }
        .srm-table tbody td{ background:#101216; border:1px solid var(--border); padding:8px; text-align:center; }
        .srm-table tbody tr td:first-child{ border-radius:10px 0 0 10px; text-align:left; }
        .srm-table tbody tr td:last-child { border-radius:0 10px 10px 0; }
        .row-low td{ background:#1b1414; } .row-critical td{ background:#241010; }

        .pill{ display:inline-block; padding:2px 8px; font-size:12px; border-radius:999px; border:1px solid var(--border); }
        .pill.ok{ background:#1b2b20; color:#a7e3b8; border-color:#2b4534; }
        .pill.danger{ background:#3c2222; color:#ffc9c9; border-color:#5a3030; }

        .bar{ height:6px; width:88px; border-radius:999px; overflow:hidden; background:#1c1f24; border:1px solid var(--border); margin:4px auto 0; }
        .bar .fill{ height:100%; background:linear-gradient(90deg,#22c55e,#14b8a6); }

        /* Mobile card-table & toolbar stack */
        @media (max-width: 720px){
          .srm-controls{ grid-template-columns: 1fr; }
          .srm-right{ justify-self:stretch; }
          .srm-right .seg{ width:100%; }
          .srm-live{ text-align:left; }

          .qa-row{ grid-template-columns: minmax(0,1fr) 1fr; }
          .qa-row .btn{ grid-column: 1 / -1; }
          .qa-row.add{ grid-template-columns: 1fr 1fr; }

          .srm-table thead{ display:none; }
          .srm-table tbody tr{ display:block; border:1px solid var(--border); border-radius:12px; background:#181a1c; padding:8px 8px 6px; margin:8px 0; }
          .srm-table tbody tr + tr{ margin-top:10px; }
          .srm-table tbody td{ display:grid; grid-template-columns: 42% 1fr; gap:8px; padding:8px 6px; border:none; background:transparent; text-align:left; }
          .srm-table tbody td::before{ content: attr(data-label); color: var(--muted); font-size:12px; }
          .srm-table tbody tr td:first-child{ border-radius:0; }
          .srm-table tbody tr td:last-child{ border-radius:0; }
          .bar{ width:100%; margin-left:0; }
        }

        /* Modal */
        .modal{ position:fixed; inset:0; background:rgba(0,0,0,0.5); display:grid; place-items:center; padding:10px; z-index:999; }
        .modal-card{ width:min(760px,96vw); background:#0c0e12; border:1px solid var(--border); border-radius:14px; padding:12px; max-height:92vh; overflow:auto; }
        .modal-h{ display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; }
        .modal-h .h{ font-weight:700; }
        .note{ background:#0f1014; border:1px dashed var(--border); padding:8px; border-radius:10px; white-space:pre-wrap; margin-bottom:8px; }
        .attachment{ width:100%; border-radius:10px; border:1px solid var(--border); margin-bottom:8px; }
        .sub{ background:#0f1014; border:1px solid var(--border); border-radius:10px; padding:8px; }
        .lines{ margin:6px 0 0; padding-left:18px; }
        .actions{ display:flex; gap:6px; margin-top:8px; }
      `}</style>
    </>
  );
}
