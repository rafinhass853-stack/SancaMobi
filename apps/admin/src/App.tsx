import { useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, onAuthStateChanged } from "firebase/auth";
import { collection, doc, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "./lib/firebase";

type Driver = { id:string; displayName?:string; email?:string; status?:string; approved?:boolean; online?:boolean; city?:string };
type Store = { id:string; displayName?:string; email?:string; status?:string; active?:boolean };
type Passenger = { id:string; displayName?:string; email?:string; status?:string; active?:boolean };

export default function App() {
  const [active,setActive]=useState("Dashboard");
  const [user,setUser]=useState(auth.currentUser);
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [drivers,setDrivers]=useState<Driver[]>([]);
  const [rides,setRides]=useState<any[]>([]);
  const [deliveries,setDeliveries]=useState<any[]>([]);
  const [stores,setStores]=useState<Store[]>([]);
  const [passengers,setPassengers]=useState<Passenger[]>([]);
  const [pricing,setPricing]=useState({baseFareCents:600,perKmCents:220,perMinuteCents:35,minimumFareCents:1000,cancellationFeeCents:0,commissionPercent:20});
  const [message,setMessage]=useState("");
  const [showGuide,setShowGuide]=useState(false);

  useEffect(()=>onAuthStateChanged(auth,setUser),[]);
  useEffect(()=>{
    if(!user)return;
    const unsub=onSnapshot(query(collection(db,"drivers"),orderBy("updatedAt","desc"),limit(100)),s=>setDrivers(s.docs.map(d=>({id:d.id,...d.data()} as Driver))),e=>setMessage(e.message));
    const unsubR=onSnapshot(query(collection(db,"rides"),orderBy("createdAt","desc"),limit(50)),s=>setRides(s.docs.map(d=>({id:d.id,...d.data()}))),e=>setMessage(e.message));
    const unsubP=onSnapshot(doc(db,"pricing","default"),s=>{if(s.exists())setPricing(p=>({...p,...s.data()} as typeof p));});
    const unsubD=onSnapshot(query(collection(db,"deliveries"),orderBy("createdAt","desc"),limit(50)),s=>setDeliveries(s.docs.map(d=>({id:d.id,...d.data()}))),e=>setMessage(e.message));
    const unsubS=onSnapshot(query(collection(db,"stores"),orderBy("updatedAt","desc"),limit(100)),s=>setStores(s.docs.map(d=>({id:d.id,...d.data()} as Store))),e=>setMessage(e.message));
    const unsubU=onSnapshot(query(collection(db,"passengers"),orderBy("updatedAt","desc"),limit(100)),s=>setPassengers(s.docs.map(d=>({id:d.id,...d.data()} as Passenger))),e=>setMessage(e.message));
    return()=>{unsub();unsubR();unsubP();unsubD();unsubS();unsubU();};
  },[user]);

  async function login(){
    try{await signInWithEmailAndPassword(auth,email,password);setMessage("");}
    catch(e){setMessage(e instanceof Error?e.message:"Falha no login");}
  }
  async function approve(id:string,approved:boolean,courier=false){
    try{
      if(approved){
        await httpsCallable(functions,"reviewDriverCompliance")({
          driverId:id,
          approved:true,
          licenseValid:true,
          earVerified:true,
          vehicleDocumentVerified:true,
          insuranceVerified:true,
          localAuthorizationVerified:true
        });
      }
      await httpsCallable(functions,courier?"setCourierApproval":"setDriverApproval")({driverId:id,approved});
      setMessage(courier?"Entregador aprovado para entregas.":"Motorista aprovado para passageiros.");
    } catch(e){setMessage(e instanceof Error?e.message:"Sem permissão administrativa ou documentação incompleta.");}
  }
  async function save(){
    try{const fn=httpsCallable(functions,"savePricing");await fn(pricing);setMessage("Tarifas salvas.");}
    catch(e){setMessage(e instanceof Error?e.message:"Sem permissão administrativa.");}
  }

  if(!user)return <div className="login"><h1>SancaMobi</h1><p>Painel administrativo</p><input placeholder="E-mail" value={email} onChange={e=>setEmail(e.target.value)}/><input placeholder="Senha" type="password" value={password} onChange={e=>setPassword(e.target.value)}/><button onClick={login}>Entrar</button>{message&&<small>{message}</small>}</div>;

  const online=drivers.filter(d=>d.online).length;
  const open=rides.filter(r=>!["TRIP_COMPLETED","CANCELLED","FAILED","EXPIRED","NO_DRIVER"].includes(r.status)).length;
  const openDeliveries=deliveries.filter(r=>!["DELIVERED","CANCELLED","FAILED","EXPIRED","NO_COURIER"].includes(r.status)).length;
  const modules=["Dashboard","Corridas","Entregas","Motoristas","Entregadores","Lojas","Passageiros","Cadastros","Veículos","Financeiro","Tarifas","Suporte"];

  return <div className="shell">
    <aside className="sidebar"><div className="brand">SancaMobi</div><div className="brand-subtitle">São Carlos</div><nav>{modules.map(m=><button key={m} className={active===m?"nav-item active":"nav-item"} onClick={()=>setActive(m)}>{m}</button>)}<button className="nav-item guide-button" onClick={()=>setShowGuide(true)}>Como funciona</button></nav><button className="logout" onClick={()=>auth.signOut()}>Sair</button></aside>
    <main className="content"><header className="header"><div><h1>{active}</h1><p>Operação em tempo real</p></div><span className="environment">PRODUÇÃO</span></header>
      {message&&<div className="notice">{message}</div>}
      {active==="Dashboard"&&<><section className="cards"><article><strong>{rides.length}</strong><span>Corridas recentes</span></article><article><strong>{online}</strong><span>Motoristas online</span></article><article><strong>{open}</strong><span>Corridas em andamento</span></article><article><strong>{drivers.filter(d=>d.approved).length}</strong><span>Motoristas aprovados</span></article><article><strong>{openDeliveries}</strong><span>Entregas ativas</span></article><article><strong>{stores.filter(s=>s.active).length}</strong><span>Lojas ativas</span></article></section><section className="panel"><h2>Resumo operacional</h2><p>Backend regional: southamerica-east1 · Projeto Firebase: sancamobi.</p></section></>}
      {(active==="Motoristas"||active==="Entregadores")&&<section className="panel"><h2>{active}</h2>{drivers.filter(d=>active==="Entregadores"?d.deliveryEnabled!==false:true).map(d=><div className="row" key={d.id}><div><b>{d.displayName||"Sem nome"}</b><small>{d.email||""} · {d.city||"São Carlos"} · {d.status||"PENDING_APPROVAL"} · {d.deliveryEnabled!==false?"ENTREGADOR":"PASSAGEIROS"}</small></div><span>{d.online?"ONLINE":"OFFLINE"}</span><div>{!d.approved?<button onClick={()=>approve(d.id,true,active==="Entregadores")}>Aprovar após conferir</button>:<button onClick={()=>approve(d.id,false,active==="Entregadores")}>Bloquear</button>}</div></div>)}</section>}
      {active==="Corridas"&&<section className="panel"><h2>Últimas corridas</h2>{rides.map(r=><div className="row" key={r.id}><b>{r.id.slice(0,8)}</b><span>{r.status}</span><span>R$ {(Number(r.estimatedFareCents||0)/100).toFixed(2)}</span></div>)}</section>}
      {active==="Entregas"&&<section className="panel"><h2>Entregas</h2>{deliveries.map(r=><div className="row" key={r.id}><b>{r.id.slice(0,8)}</b><span>{r.status}</span><span>R$ {(Number(r.estimatedFareCents||0)/100).toFixed(2)}</span><span>{r.paymentStatus||"PENDING"}</span></div>)}</section>}
      {active==="Lojas"&&<section className="panel"><h2>Lojas</h2>{stores.map(s=><div className="row" key={s.id}><div><b>{s.displayName||"Sem nome"}</b><small>{s.email||""} · {s.status||"PENDING_APPROVAL"}</small></div><span>{s.active?"ATIVA":"PENDENTE"}</span><button onClick={async()=>{try{await httpsCallable(functions,"setStoreApproval")({storeId:s.id,approved:!s.active});setMessage("Loja atualizada.")}catch(e){setMessage(e instanceof Error?e.message:"Sem permissão.")}}}>{s.active?"Bloquear":"Aprovar"}</button></div>)}</section>}
      {active==="Tarifas"&&<section className="panel form"><h2>Tarifa padrão</h2>{Object.entries(pricing).filter(([k])=>k!=="commissionPercent"||true).map(([k,v])=><label key={k}>{k}<input type="number" value={v} onChange={e=>setPricing(p=>({...p,[k]:Number(e.target.value)}))}/></label>)}<button onClick={save}>Salvar tarifas</button></section>}
      {active==="Passageiros"&&<section className="panel"><h2>Passageiros</h2>{passengers.map(p=><div className="row" key={p.id}><div><b>{p.displayName||"Sem nome"}</b><small>{p.email||""} · {p.status||"PENDING_APPROVAL"}</small></div><span>{p.active?"ATIVO":"PENDENTE"}</span><button onClick={async()=>{try{await httpsCallable(functions,"setPassengerApproval")({passengerId:p.id,approved:!p.active});setMessage("Passageiro atualizado.")}catch(e){setMessage(e instanceof Error?e.message:"Sem permissão.")}}}>{p.active?"Bloquear":"Aprovar"}</button></div>)}</section>}
      {active==="Cadastros"&&<section className="panel"><h2>Fluxo de cadastro e aprovação</h2><p>Você continua sendo o ponto de controle: motoristas e entregadores entram como PENDENTE, lojas entram como PENDENTE e só ficam operacionais após sua aprovação.</p><div className="cards"><article><strong>{drivers.filter(d=>!d.approved).length}</strong><span>Motoristas/entregadores aguardando aprovação</span></article><article><strong>{stores.filter(s=>!s.active).length}</strong><span>Estabelecimentos aguardando aprovação</span></article></div><h3>Checklist antes de aprovar</h3><ul><li>Motorista: CNH, EAR, documento do veículo, seguro e autorização local quando aplicável.</li><li>Entregador: identidade/cadastro, veículo e dados operacionais.</li><li>Estabelecimento: nome, contato, endereço e operação.</li></ul></section>}
      {["Veículos","Financeiro","Suporte"].includes(active)&&<section className="panel"><h2>{active}</h2><p>Módulo conectado à base. As operações desta área serão ampliadas sobre o mesmo backend seguro.</p></section>}
    </main>
  </div>;
}
