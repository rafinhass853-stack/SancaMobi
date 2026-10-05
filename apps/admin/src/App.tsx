import { useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./lib/firebase";

type Driver = { id:string; displayName?:string; email?:string; status?:string; approved?:boolean; online?:boolean; city?:string };\ntype Store = { id:string; displayName?:string; email?:string; status?:string; active?:boolean };

export default function App() {
  const [active,setActive]=useState("Dashboard");
  const [user,setUser]=useState(auth.currentUser);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [drivers,setDrivers]=useState<Driver[]>([]);
  const [rides,setRides]=useState<any[]>([]);\n  const [deliveries,setDeliveries]=useState<any[]>([]);\n  const [stores,setStores]=useState<Store[]>([]);
  const [pricing,setPricing]=useState({baseFareCents:600,perKmCents:220,perMinuteCents:35,minimumFareCents:1000,cancellationFeeCents:0,commissionPercent:20});
  const [message,setMessage]=useState("");

  useEffect(()=>onAuthStateChanged(auth,setUser),[]);
  useEffect(()=>{
    if(!user)return;
    const unsub=onSnapshot(query(collection(db,"drivers"),orderBy("updatedAt","desc"),limit(100)),s=>setDrivers(s.docs.map(d=>({id:d.id,...d.data()} as Driver))),e=>setMessage(e.message));
    const unsubR=onSnapshot(query(collection(db,"rides"),orderBy("createdAt","desc"),limit(50)),s=>setRides(s.docs.map(d=>({id:d.id,...d.data()}))),e=>setMessage(e.message));
    const unsubP=onSnapshot(doc(db,"pricing","default"),s=>{if(s.exists())setPricing(p=>({...p,...s.data()} as typeof p));});\n    const unsubD=onSnapshot(query(collection(db,"deliveries"),orderBy("createdAt","desc"),limit(50)),s=>setDeliveries(s.docs.map(d=>({id:d.id,...d.data()}))),e=>setMessage(e.message));\n    const unsubS=onSnapshot(query(collection(db,"stores"),orderBy("updatedAt","desc"),limit(100)),s=>setStores(s.docs.map(d=>({id:d.id,...d.data()} as Store))),e=>setMessage(e.message));
    return()=>{unsub();unsubR();unsubP();unsubD();unsubS();};
  },[user]);

  async function login(){
    try{await signInWithEmailAndPassword(auth,email,password);setMessage("");}
    catch(e){setMessage(e instanceof Error?e.message:"Falha no login");}
  }
  async function approve(id:string,approved:boolean){
    try{await httpsCallable(functions,"setDriverApproval")({driverId:id,approved});setMessage("Cadastro atualizado.");}
    catch(e){setMessage(e instanceof Error?e.message:"Sem permissão administrativa.");}
  }
  async function save(){
    try{const fn=httpsCallable(functions,"savePricing");await fn(pricing);setMessage("Tarifas salvas.");}
    catch(e){setMessage(e instanceof Error?e.message:"Sem permissão administrativa.");}
  }

  if(!user)return <div className="login"><h1>SancaMobi</h1><p>Painel administrativo</p><input placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button onClick={login}>Entrar</button>{message&&<small>{message}</small>}</div>;

  const online=drivers.filter(d=>d.online).length;
  const open=rides.filter(r=>!["TRIP_COMPLETED","CANCELLED","FAILED","EXPIRED","NO_DRIVER"].includes(r.status)).length;\n  const openDeliveries=deliveries.filter(r=>!["DELIVERED","CANCELLED","FAILED","EXPIRED","NO_COURIER"].includes(r.status)).length;
  const modules=["Dashboard","Corridas","Entregas","Motoristas","Lojas","Passageiros","Veículos","Financeiro","Tarifas","Suporte"];

  return <div className="shell">
    <aside className="sidebar"><div className="brand">SancaMobi</div><div className="brand-subtitle">São Carlos</div><nav>{modules.map(m=><button key={m} className={active===m?"nav-item active":"nav-item"} onClick={()=>setActive(m)}>{m}</button>)}</nav><button className="logout" onClick={()=>auth.signOut()}>Sair</button></aside>
    <main className="content"><header className="header"><div><h1>{active}</h1><p>Operação em tempo real</p></div><span className="environment">PRODUÇÃO</span></header>
      {message&&<div className="notice">{message}</div>}
      {active==="Dashboard"&&<><section className="cards"><article><strong>{rides.length}</strong><span>Corridas recentes</span></article><article><strong>{online}</strong><span>Motoristas online</span></article><article><strong>{open}</strong><span>Corridas em andamento</span></article><article><strong>{drivers.filter(d=>d.approved).length}</strong><span>Motoristas aprovados</span></article><article><strong>{openDeliveries}</strong><span>Entregas ativas</span></article><article><strong>{stores.filter(s=>s.active).length}</strong><span>Lojas ativas</span></article></section><section className="panel"><h2>Resumo operacional</h2><p>Backend regional: southamerica-east1 · Projeto Firebase: sancamobi.</p></section></>}
      {active==="Motoristas"&&<section className="panel"><h2>Motoristas</h2>{drivers.map(d=><div className="row" key={d.id}><div><b>{d.displayName||"Sem nome"}</b><small>{d.email||""} · {d.city||"São Carlos"} · {d.status||"PENDING_APPROVAL"}</small></div><span>{d.online?"ONLINE":"OFFLINE"}</span><div>{!d.approved?<button onClick={()=>approve(d.id,true)}>Aprovar</button>:<button onClick={()=>approve(d.id,false)}>Bloquear</button>}</div></div>)}</section>}
      {active==="Corridas"&&<section className="panel"><h2>Últimas corridas</h2>{rides.map(r=><div className="row" key={r.id}><b>{r.id.slice(0,8)}</b><span>{r.status}</span><span>R$ {(Number(r.estimatedFareCents||0)/100).toFixed(2)}</span></div>)}</section>}\n      {active==="Entregas"&&<section className="panel"><h2>Entregas</h2>{deliveries.map(r=><div className="row" key={r.id}><b>{r.id.slice(0,8)}</b><span>{r.status}</span><span>R$ {(Number(r.estimatedFareCents||0)/100).toFixed(2)}</span><span>{r.paymentStatus||"PENDING"}</span></div>)}</section>}\n      {active==="Lojas"&&<section className="panel"><h2>Lojas</h2>{stores.map(s=><div className="row" key={s.id}><div><b>{s.displayName||"Sem nome"}</b><small>{s.email||""} · {s.status||"PENDING_APPROVAL"}</small></div><span>{s.active?"ATIVA":"PENDENTE"}</span><button onClick={async()=>{try{await httpsCallable(functions,"setStoreApproval")({storeId:s.id,approved:!s.active});setMessage("Loja atualizada.")}catch(e){setMessage(e instanceof Error?e.message:"Sem permissão.")}}}>{s.active?"Bloquear":"Aprovar"}</button></div>)}</section>}
      {active==="Tarifas"&&<section className="panel form"><h2>Tarifa padrão</h2>{Object.entries(pricing).filter(([k])=>k!=="commissionPercent"||true).map(([k,v])=><label key={k}>{k}<input type="number" value={v} onChange={e=>setPricing(p=>({...p,[k]:Number(e.target.value)}))}/></label>)}<button onClick={save}>Salvar tarifas</button></section>}
      {["Passageiros","Veículos","Financeiro","Suporte"].includes(active)&&<section className="panel"><h2>{active}</h2><p>Módulo conectado à base. As operações desta área serão ampliadas sobre o mesmo backend seguro.</p></section>}
    </main>
  </div>;
}
