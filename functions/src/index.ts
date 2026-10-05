import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";
import { createHmac, timingSafeEqual } from "node:crypto";

initializeApp();
setGlobalOptions({ region: "southamerica-east1", maxInstances: 10 });
const db = getFirestore();

function uid(request: any): string {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Authentication required.");
  return request.auth.uid;
}
function n(value: unknown, name: string): number {
  const x = Number(value);
  if (!Number.isFinite(x)) throw new HttpsError("invalid-argument", name + " is required.");
  return x;
}
function km(aLat:number,aLng:number,bLat:number,bLng:number):number {
  const r=6371, dLat=(bLat-aLat)*Math.PI/180, dLng=(bLng-aLng)*Math.PI/180;
  const x=Math.sin(dLat/2)**2+Math.cos(aLat*Math.PI/180)*Math.cos(bLat*Math.PI/180)*Math.sin(dLng/2)**2;
  return r*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

export const healthCheck = onCall(() => ({ ok:true, service:"sancamobi-functions", projectId:process.env.GCLOUD_PROJECT ?? "sancamobi" }));

export const ensurePassengerProfile = onCall(async request => {
  const id=uid(request), name=String(request.data?.displayName ?? request.auth?.token.name ?? "Passageiro");
  await db.collection("passengers").doc(id).set({userId:id,displayName:name,email:request.auth?.token.email ?? null,active:true,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await db.collection("users").doc(id).set({role:"PASSENGER",displayName:name,email:request.auth?.token.email ?? null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {ok:true};
});

export const ensureDriverProfile = onCall(async request => {
  const id=uid(request), name=String(request.data?.displayName ?? request.auth?.token.name ?? "Motorista");
  await db.collection("drivers").doc(id).set({userId:id,displayName:name,email:request.auth?.token.email ?? null,status:"PENDING_APPROVAL",online:false,city:"São Carlos",approved:false,deliveryEnabled:true,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await db.collection("users").doc(id).set({role:"DRIVER",roles:["DRIVER"],displayName:name,email:request.auth?.token.email ?? null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {ok:true,status:"PENDING_APPROVAL"};
});

export const setDriverAvailability = onCall(async request => {
  const id=uid(request), ref=db.collection("drivers").doc(id), snap=await ref.get();
  if (!snap.exists || snap.data()?.approved !== true) throw new HttpsError("failed-precondition","Motorista ainda não aprovado.");
  const online=Boolean(request.data?.online);
  const data:any={online,updatedAt:FieldValue.serverTimestamp()};
  if(online){data.latitude=n(request.data?.latitude,"latitude");data.longitude=n(request.data?.longitude,"longitude");data.locationUpdatedAt=FieldValue.serverTimestamp();}
  await ref.update(data); return {ok:true,online};
});

export const updateDriverLocation = onCall(async request => {
  const id=uid(request), ref=db.collection("drivers").doc(id), snap=await ref.get();
  if(!snap.exists || snap.data()?.online !== true) throw new HttpsError("failed-precondition","Motorista está offline.");
  const latitude = n(request.data?.latitude,"latitude");
  const longitude = n(request.data?.longitude,"longitude");
  const now = FieldValue.serverTimestamp();
  await ref.update({latitude,longitude,locationUpdatedAt:now,updatedAt:now});

  const activeRides = await db.collection("rides")
    .where("driverId","==",id)
    .where("status","in",["ACCEPTED","DRIVER_ARRIVING","DRIVER_ARRIVED","TRIP_STARTED"])
    .limit(10)
    .get();

  const activeDeliveries = await db.collection("deliveries").where("courierId","==",id).where("status","in",["ACCEPTED","GOING_TO_PICKUP","ARRIVED_PICKUP","PICKED_UP","IN_DELIVERY","ARRIVED_DESTINATION"]).limit(10).get();
  if (!activeDeliveries.empty) {
    const batch = db.batch();
    for (const delivery of activeDeliveries.docs) {
      batch.update(delivery.ref, { courierLocation: { latitude, longitude }, courierLocationUpdatedAt: now, updatedAt: now });
    }
    await batch.commit();
  }

  if (!activeRides.empty) {
    const batch = db.batch();
    for (const ride of activeRides.docs) {
      batch.update(ride.ref, {
        driverLocation: { latitude, longitude },
        driverLocationUpdatedAt: now,
        updatedAt: now
      });
    }
    await batch.commit();
  }

  return {ok:true};
});

export const calculateRideFare = onCall(async request => {
  uid(request);
  const distance=n(request.data?.distanceKm,"distanceKm"), duration=n(request.data?.durationMin,"durationMin");
  const p=(await db.collection("pricing").doc("default").get()).data() ?? {};
  const fare=Math.max(Math.round(Number(p.baseFareCents??600)+distance*Number(p.perKmCents??220)+duration*Number(p.perMinuteCents??35)),Number(p.minimumFareCents??1000));
  return {fareCents:fare,currency:"BRL",distanceKm:distance,durationMin:duration};
});

export const createRide = onCall(async request => {
  const passengerId=uid(request);
  const pickup={latitude:n(request.data?.pickup?.latitude,"pickup.latitude"),longitude:n(request.data?.pickup?.longitude,"pickup.longitude")};
  const destination={latitude:n(request.data?.destination?.latitude,"destination.latitude"),longitude:n(request.data?.destination?.longitude,"destination.longitude")};
  const distance=n(request.data?.estimatedDistanceKm,"estimatedDistanceKm"), duration=n(request.data?.estimatedDurationMin,"estimatedDurationMin");
  if(distance<=0 || distance>500 || duration<=0 || duration>720) throw new HttpsError("invalid-argument","Distância ou duração inválida.");
  const p=(await db.collection("pricing").doc("default").get()).data() ?? {};
  const fare=Math.max(Math.round(Number(p.baseFareCents??600)+distance*Number(p.perKmCents??220)+duration*Number(p.perMinuteCents??35)),Number(p.minimumFareCents??1000));
  const drivers=await db.collection("drivers").where("online","==",true).where("approved","==",true).limit(100).get();
  const candidates=drivers.docs.map(d=>({id:d.id,data:d.data()})).filter(x=>Number.isFinite(Number(x.data.latitude))&&Number.isFinite(Number(x.data.longitude))).map(x=>({id:x.id,distance:km(pickup.latitude,pickup.longitude,Number(x.data.latitude),Number(x.data.longitude))})).sort((a,b)=>a.distance-b.distance).slice(0,5);
  const ref=db.collection("rides").doc();
  await ref.set({passengerId,pickup,destination,status:candidates.length?"SEARCHING":"NO_DRIVER",estimatedDistanceKm:distance,estimatedDurationMin:duration,estimatedFareCents:fare,candidateDriverIds:candidates.map(x=>x.id),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  if(candidates.length){const batch=db.batch();for(const c of candidates)batch.set(db.collection("rideOffers").doc(ref.id+"_"+c.id),{rideId:ref.id,driverId:c.id,status:"OFFERED",distanceToPickupKm:c.distance,createdAt:FieldValue.serverTimestamp()});await batch.commit();}
  return {rideId:ref.id,status:candidates.length?"SEARCHING":"NO_DRIVER",candidates:candidates.length};
});

export const acceptRide = onCall(async request => {
  const driverId=uid(request), rideId=String(request.data?.rideId??"");
  if(!rideId) throw new HttpsError("invalid-argument","rideId is required.");
  const rideRef=db.collection("rides").doc(rideId), offerRef=db.collection("rideOffers").doc(rideId+"_"+driverId);
  await db.runTransaction(async tx=>{
    const ride=await tx.get(rideRef), offer=await tx.get(offerRef), driver=await tx.get(db.collection("drivers").doc(driverId));
    if(!ride.exists||!offer.exists) throw new HttpsError("not-found","Corrida ou oferta não encontrada.");
    if(driver.data()?.approved!==true||driver.data()?.online!==true) throw new HttpsError("failed-precondition","Motorista indisponível.");
    if(!["SEARCHING","OFFERED"].includes(String(ride.data()?.status))) throw new HttpsError("failed-precondition","Corrida não está disponível.");
    tx.update(rideRef,{driverId,status:"ACCEPTED",updatedAt:FieldValue.serverTimestamp()});
    tx.update(offerRef,{status:"ACCEPTED",acceptedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true,rideId,status:"ACCEPTED"};
});

export const updateRideStatus = onCall(async request => {
  const id=uid(request), rideId=String(request.data?.rideId??""), status=String(request.data?.status??"");
  const transitions:Record<string,string[]>={ACCEPTED:["DRIVER_ARRIVING","CANCELLED"],DRIVER_ARRIVING:["DRIVER_ARRIVED","CANCELLED"],DRIVER_ARRIVED:["TRIP_STARTED","CANCELLED"],TRIP_STARTED:["TRIP_COMPLETED","CANCELLED"],SEARCHING:["CANCELLED","EXPIRED"],OFFERED:["CANCELLED","EXPIRED"],REQUESTED:["SEARCHING","CANCELLED"]};
  if(!rideId||!status) throw new HttpsError("invalid-argument","rideId/status inválidos.");
  const ref=db.collection("rides").doc(rideId), snap=await ref.get();
  if(!snap.exists) throw new HttpsError("not-found","Corrida não encontrada.");
  const ride=snap.data()!, current=String(ride.status);
  if(ride.passengerId!==id&&ride.driverId!==id) throw new HttpsError("permission-denied","Você não participa desta corrida.");
  if(!transitions[current]?.includes(status)) throw new HttpsError("failed-precondition","Transição de corrida inválida.");
  if(["DRIVER_ARRIVING","DRIVER_ARRIVED","TRIP_STARTED","TRIP_COMPLETED"].includes(status)&&ride.driverId!==id) throw new HttpsError("permission-denied","Somente o motorista pode alterar este status.");
  await ref.update({status,updatedAt:Timestamp.now()});
  return {ok:true,status};
});


function requireAdmin(request: any): string {
  const id = uid(request);
  const role = request.auth?.token?.role;
  if (!["SUPER_ADMIN","ADMIN","OPERATOR","FINANCE"].includes(role)) {
    throw new HttpsError("permission-denied", "Acesso administrativo necessário.");
  }
  return id;
}

export const setDriverApproval = onCall(async request => {
  requireAdmin(request);
  const driverId = String(request.data?.driverId ?? "");
  const approved = Boolean(request.data?.approved);
  if (!driverId) throw new HttpsError("invalid-argument", "driverId is required.");
  await db.collection("drivers").doc(driverId).update({
    approved,
    status: approved ? "APPROVED" : "REJECTED",
    online: false,
    updatedAt: FieldValue.serverTimestamp()
  });
  return { ok: true, driverId, approved };
});

export const savePricing = onCall(async request => {
  requireAdmin(request);
  const data = request.data ?? {};
  const fields = ["baseFareCents","perKmCents","perMinuteCents","minimumFareCents","cancellationFeeCents","commissionPercent"];
  const pricing:any = {};
  for (const field of fields) {
    const value = Number(data[field]);
    if (!Number.isFinite(value) || value < 0) throw new HttpsError("invalid-argument", field + " inválido.");
    pricing[field] = value;
  }
  pricing.updatedAt = FieldValue.serverTimestamp();
  await db.collection("pricing").doc("default").set(pricing, { merge: true });
  return { ok: true };
});


export const submitRating = onCall(async request => {
  const raterId = uid(request);
  const rideId = String(request.data?.rideId ?? "");
  const rating = Number(request.data?.rating);
  const comment = request.data?.comment == null ? "" : String(request.data.comment).slice(0, 500);
  if (!rideId || !Number.isInteger(rating) || rating < 1 || rating > 5) {
    throw new HttpsError("invalid-argument", "rideId e nota de 1 a 5 são obrigatórios.");
  }

  const ride = await db.collection("rides").doc(rideId).get();
  if (!ride.exists) throw new HttpsError("not-found", "Corrida não encontrada.");
  const data = ride.data()!;
  if (data.status !== "TRIP_COMPLETED") throw new HttpsError("failed-precondition", "A corrida ainda não foi concluída.");
  if (data.passengerId !== raterId && data.driverId !== raterId) {
    throw new HttpsError("permission-denied", "Você não participa desta corrida.");
  }

  const targetId = data.passengerId === raterId ? data.driverId : data.passengerId;
  if (!targetId) throw new HttpsError("failed-precondition", "Participante da corrida não encontrado.");

  const existing = await db.collection("ratings")
    .where("rideId","==",rideId)
    .where("raterId","==",raterId)
    .limit(1)
    .get();
  if (!existing.empty) throw new HttpsError("already-exists", "Você já avaliou esta corrida.");

  const ref = db.collection("ratings").doc();
  await ref.set({
    rideId,
    raterId,
    targetId,
    rating,
    comment,
    createdAt: FieldValue.serverTimestamp()
  });

  return {ok:true, ratingId:ref.id};
});


function assertParticipant(data:any,id:string){ if(data.storeId!==id && data.driverId!==id && data.courierId!==id && data.passengerId!==id) throw new HttpsError("permission-denied","Você não participa deste serviço."); }
function deliveryFare(distance:number, duration:number, p:any){
  const base=Number(p.deliveryBaseFareCents??700), perKm=Number(p.deliveryPerKmCents??180), perMinute=Number(p.deliveryPerMinuteCents??20), min=Number(p.deliveryMinimumFareCents??1200);
  return Math.max(Math.round(base+distance*perKm+duration*perMinute),min);
}

export const ensureStoreProfile = onCall(async request => {
  const id=uid(request), name=String(request.data?.displayName ?? request.auth?.token.name ?? "Loja");
  await db.collection("stores").doc(id).set({storeId:id,ownerId:id,displayName:name,email:request.auth?.token.email ?? null,status:"PENDING_APPROVAL",active:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await db.collection("users").doc(id).set({role:"STORE",roles:["STORE"],displayName:name,email:request.auth?.token.email ?? null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {ok:true,status:"PENDING_APPROVAL"};
});

export const setStoreApproval = onCall(async request => {
  requireAdmin(request);
  const storeId=String(request.data?.storeId??"");
  const approved=Boolean(request.data?.approved);
  if(!storeId) throw new HttpsError("invalid-argument","storeId is required.");
  await db.collection("stores").doc(storeId).update({active:approved,status:approved?"APPROVED":"REJECTED",updatedAt:FieldValue.serverTimestamp()});
  return {ok:true,storeId,approved};
});

export const saveDeliveryPricing = onCall(async request => {
  requireAdmin(request);
  const data=request.data??{};
  const fields=["deliveryBaseFareCents","deliveryPerKmCents","deliveryPerMinuteCents","deliveryMinimumFareCents","deliveryCommissionPercent"];
  const pricing:any={};
  for(const field of fields){const value=Number(data[field]);if(!Number.isFinite(value)||value<0)throw new HttpsError("invalid-argument",field+" inválido.");pricing[field]=value;}
  pricing.updatedAt=FieldValue.serverTimestamp();
  await db.collection("pricing").doc("default").set(pricing,{merge:true});
  return {ok:true};
});

export const calculateDeliveryFare = onCall(async request => {
  uid(request);
  const distance=n(request.data?.distanceKm,"distanceKm"), duration=n(request.data?.durationMin,"durationMin");
  if(distance<=0||distance>200||duration<=0||duration>480) throw new HttpsError("invalid-argument","Distância ou duração inválida.");
  const p=(await db.collection("pricing").doc("default").get()).data()??{};
  return {fareCents:deliveryFare(distance,duration,p),currency:"BRL",distanceKm:distance,durationMin:duration};
});

export const createDelivery = onCall(async request => {
  const storeId=uid(request);
  const store=await db.collection("stores").doc(storeId).get();
  if(!store.exists||store.data()?.active!==true) throw new HttpsError("failed-precondition","Loja não aprovada ou inativa.");
  const pickup=request.data?.pickup, destination=request.data?.destination;
  const p={latitude:n(pickup?.latitude,"pickup.latitude"),longitude:n(pickup?.longitude,"pickup.longitude")};
  const d={latitude:n(destination?.latitude,"destination.latitude"),longitude:n(destination?.longitude,"destination.longitude")};
  const distance=n(request.data?.estimatedDistanceKm,"estimatedDistanceKm"), duration=n(request.data?.estimatedDurationMin,"estimatedDurationMin");
  if(distance<=0||distance>200||duration<=0||duration>480) throw new HttpsError("invalid-argument","Distância ou duração inválida.");
  const pricing=(await db.collection("pricing").doc("default").get()).data()??{};
  const fare=deliveryFare(distance,duration,pricing);
  const couriers=await db.collection("drivers").where("online","==",true).where("approved","==",true).where("deliveryEnabled","==",true).limit(100).get();
  const candidates=couriers.docs.map(d=>({id:d.id,data:d.data()})).filter(x=>Number.isFinite(Number(x.data.latitude))&&Number.isFinite(Number(x.data.longitude))).map(x=>({id:x.id,distance:km(p.latitude,p.longitude,Number(x.data.latitude),Number(x.data.longitude))})).sort((a,b)=>a.distance-b.distance).slice(0,5);
  const ref=db.collection("deliveries").doc();
  await ref.set({storeId,pickup:p,destination:d,status:candidates.length?"SEARCHING_COURIER":"NO_COURIER",estimatedDistanceKm:distance,estimatedDurationMin:duration,estimatedFareCents:fare,paymentStatus:"PENDING",candidateCourierIds:candidates.map(x=>x.id),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  if(candidates.length){const batch=db.batch();for(const x of candidates)batch.set(db.collection("serviceOffers").doc(ref.id+"_"+x.id),{serviceId:ref.id,serviceType:"DELIVERY",courierId:x.id,status:"OFFERED",distanceToPickupKm:x.distance,createdAt:FieldValue.serverTimestamp()});await batch.commit();}
  return {deliveryId:ref.id,status:candidates.length?"SEARCHING_COURIER":"NO_COURIER",fareCents:fare,candidates:candidates.length};
});

export const acceptDelivery = onCall(async request => {
  const courierId=uid(request), deliveryId=String(request.data?.deliveryId??"");
  if(!deliveryId) throw new HttpsError("invalid-argument","deliveryId is required.");
  const ref=db.collection("deliveries").doc(deliveryId), offer=db.collection("serviceOffers").doc(deliveryId+"_"+courierId), driver=db.collection("drivers").doc(courierId);
  await db.runTransaction(async tx=>{
    const [deliverySnap,offerSnap,driverSnap]=await Promise.all([tx.get(ref),tx.get(offer),tx.get(driver)]);
    if(!deliverySnap.exists||!offerSnap.exists) throw new HttpsError("not-found","Entrega ou oferta não encontrada.");
    if(driverSnap.data()?.approved!==true||driverSnap.data()?.online!==true||driverSnap.data()?.deliveryEnabled!==true) throw new HttpsError("failed-precondition","Entregador indisponível.");
    if(!["SEARCHING_COURIER","OFFERED"].includes(String(deliverySnap.data()?.status))) throw new HttpsError("failed-precondition","Entrega não está disponível.");
    tx.update(ref,{courierId,status:"ACCEPTED",updatedAt:FieldValue.serverTimestamp()});
    tx.update(offer,{status:"ACCEPTED",acceptedAt:FieldValue.serverTimestamp()});
  });
  return {ok:true,deliveryId,status:"ACCEPTED"};
});

export const updateDeliveryStatus = onCall(async request => {
  const id=uid(request), deliveryId=String(request.data?.deliveryId??""), status=String(request.data?.status??"");
  const transitions:Record<string,string[]>={ACCEPTED:["GOING_TO_PICKUP","CANCELLED"],GOING_TO_PICKUP:["ARRIVED_PICKUP","CANCELLED"],ARRIVED_PICKUP:["PICKED_UP","CANCELLED"],PICKED_UP:["IN_DELIVERY","CANCELLED"],IN_DELIVERY:["ARRIVED_DESTINATION","CANCELLED"],ARRIVED_DESTINATION:["DELIVERED"],SEARCHING_COURIER:["CANCELLED","EXPIRED"],OFFERED:["CANCELLED","EXPIRED"]};
  if(!deliveryId||!status) throw new HttpsError("invalid-argument","deliveryId/status inválidos.");
  const ref=db.collection("deliveries").doc(deliveryId), snap=await ref.get();
  if(!snap.exists) throw new HttpsError("not-found","Entrega não encontrada.");
  const data=snap.data()!;
  assertParticipant(data,id);
  if(!transitions[String(data.status)]?.includes(status)) throw new HttpsError("failed-precondition","Transição de entrega inválida.");
  if(!data.courierId && !["SEARCHING_COURIER","OFFERED","CANCELLED","EXPIRED"].includes(status)) throw new HttpsError("failed-precondition","Entregador não atribuído.");
  await ref.update({status,updatedAt:FieldValue.serverTimestamp(),...(status==="DELIVERED"?{deliveredAt:FieldValue.serverTimestamp()}: {})});
  return {ok:true,status};
});


function menuPriceCents(value: unknown): number {
  const x=Number(value);
  if(!Number.isInteger(x)||x<0||x>1000000) throw new HttpsError("invalid-argument","Preço inválido.");
  return x;
}

export const upsertMenuCategory = onCall(async request => {
  const storeId=uid(request);
  const store=await db.collection("stores").doc(storeId).get();
  if(!store.exists || store.data()?.active!==true) throw new HttpsError("failed-precondition","Loja não aprovada.");
  const name=String(request.data?.name??"").trim();
  if(!name||name.length>80) throw new HttpsError("invalid-argument","Nome da categoria inválido.");
  const categoryId=String(request.data?.categoryId??db.collection("menuCategories").doc().id);
  await db.collection("menuCategories").doc(categoryId).set({categoryId,storeId,name,description:String(request.data?.description??"").trim().slice(0,240),sortOrder:Number(request.data?.sortOrder??0),active:request.data?.active!==false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  return {ok:true,categoryId};
});

export const upsertMenuItem = onCall(async request => {
  const storeId=uid(request);
  const store=await db.collection("stores").doc(storeId).get();
  if(!store.exists || store.data()?.active!==true) throw new HttpsError("failed-precondition","Loja não aprovada.");
  const name=String(request.data?.name??"").trim();
  const categoryId=String(request.data?.categoryId??"");
  if(!name||name.length>120||!categoryId) throw new HttpsError("invalid-argument","Produto ou categoria inválidos.");
  const itemId=String(request.data?.itemId??db.collection("menuItems").doc().id);
  const priceCents=menuPriceCents(request.data?.priceCents);
  const promotionalPriceCents=request.data?.promotionalPriceCents==null?null:menuPriceCents(request.data.promotionalPriceCents);
  if(promotionalPriceCents!==null&&promotionalPriceCents>priceCents) throw new HttpsError("invalid-argument","Preço promocional não pode ser maior que o preço normal.");
  await db.collection("menuItems").doc(itemId).set({
    itemId,storeId,categoryId,name,description:String(request.data?.description??"").trim().slice(0,500),
    imageUrl:String(request.data?.imageUrl??"").trim(),priceCents,promotionalPriceCents,
    available:request.data?.available!==false,featured:Boolean(request.data?.featured),
    preparationMinutes:Math.max(0,Math.min(240,Number(request.data?.preparationMinutes??20))),
    tags:Array.isArray(request.data?.tags)?request.data.tags.map((x:any)=>String(x).slice(0,30)).slice(0,10):[],
    updatedAt:FieldValue.serverTimestamp()
  },{merge:true});
  return {ok:true,itemId};
});

export const setMenuPromotion = onCall(async request => {
  const storeId=uid(request), itemId=String(request.data?.itemId??"");
  const item=await db.collection("menuItems").doc(itemId).get();
  if(!item.exists||item.data()?.storeId!==storeId) throw new HttpsError("permission-denied","Produto não pertence à loja.");
  const enabled=Boolean(request.data?.enabled);
  const promotionalPriceCents=enabled?menuPriceCents(request.data?.promotionalPriceCents):null;
  const normal=Number(item.data()?.priceCents??0);
  if(enabled&&promotionalPriceCents!<normal){} 
  if(enabled&&promotionalPriceCents>normal) throw new HttpsError("invalid-argument","Promoção deve ter preço menor que o normal.");
  await item.ref.update({promotionalPriceCents,updatedAt:FieldValue.serverTimestamp()});
  return {ok:true};
});

export const getStoreCatalog = onCall(async request => {
  uid(request);
  const storeId=String(request.data?.storeId??"");
  if(!storeId) throw new HttpsError("invalid-argument","storeId é obrigatório.");
  const store=await db.collection("stores").doc(storeId).get();
  if(!store.exists||store.data()?.active!==true) throw new HttpsError("not-found","Loja não encontrada.");
  const [cats,items]=await Promise.all([
    db.collection("menuCategories").where("storeId","==",storeId).where("active","==",true).orderBy("sortOrder").get(),
    db.collection("menuItems").where("storeId","==",storeId).where("available","==",true).get()
  ]);
  return {store:{id:store.id,...store.data()},categories:cats.docs.map(x=>({id:x.id,...x.data()})),items:items.docs.map(x=>({id:x.id,...x.data()}))};
});

export const createFoodOrder = onCall(async request => {
  const customerId=uid(request);
  const storeId=String(request.data?.storeId??"");
  const rawItems=Array.isArray(request.data?.items)?request.data.items:[];
  if(!storeId||rawItems.length<1||rawItems.length>50) throw new HttpsError("invalid-argument","Carrinho inválido.");
  const store=await db.collection("stores").doc(storeId).get();
  if(!store.exists||store.data()?.active!==true) throw new HttpsError("failed-precondition","Loja indisponível.");
  const ids=rawItems.map((x:any)=>String(x.itemId)).filter(Boolean);
  const unique=[...new Set(ids)];
  const snaps=await Promise.all(unique.map(id=>db.collection("menuItems").doc(id).get()));
  const byId=new Map(snaps.filter(s=>s.exists).map(s=>[s.id,s.data()!]));
  const lines=rawItems.map((x:any)=>{
    const item=byId.get(String(x.itemId));
    const qty=Math.max(1,Math.min(20,Math.floor(Number(x.quantity))));
    if(!item||item.storeId!==storeId||item.available!==true||!Number.isFinite(qty)) throw new HttpsError("failed-precondition","Produto indisponível.");
    const unit=Number(item.promotionalPriceCents??item.priceCents);
    return {itemId:item.itemId,name:item.name,quantity:qty,unitPriceCents:unit,totalCents:unit*qty};
  });
  const subtotalCents=lines.reduce((a,x)=>a+x.totalCents,0);
  const deliveryFeeCents=Math.max(0,Math.round(Number(request.data?.deliveryFeeCents??0)));
  const totalCents=subtotalCents+deliveryFeeCents;
  const ref=db.collection("foodOrders").doc();
  await ref.set({orderId:ref.id,customerId,storeId,items:lines,subtotalCents,deliveryFeeCents,totalCents,status:"PENDING_STORE",paymentStatus:"PENDING",deliveryStatus:"WAITING_DISPATCH",deliveryAddress:request.data?.deliveryAddress??null,notes:String(request.data?.notes??"").slice(0,500),createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
  return {orderId:ref.id,totalCents};
});

export const updateFoodOrderStatus = onCall(async request => {
  const id=uid(request), orderId=String(request.data?.orderId??""), status=String(request.data?.status??"");
  const ref=db.collection("foodOrders").doc(orderId), snap=await ref.get();
  if(!snap.exists) throw new HttpsError("not-found","Pedido não encontrado.");
  const data=snap.data()!;
  const storeId=String(data.storeId??"");
  const allowedAdmin=["CANCELLED"];
  const isStore=id===storeId, isAdminUser=(()=>{const role=String(request.auth?.token?.role??"");return ["SUPER_ADMIN","ADMIN","OPERATOR"].includes(role)})();
  if(!isStore&&!isAdminUser) throw new HttpsError("permission-denied","Sem permissão.");
  const transitions:Record<string,string[]>={PENDING_STORE:["ACCEPTED","REJECTED","CANCELLED"],ACCEPTED:["PREPARING","CANCELLED"],PREPARING:["READY","CANCELLED"],READY:["OUT_FOR_DELIVERY","CANCELLED"],OUT_FOR_DELIVERY:["DELIVERED"],REJECTED:[],DELIVERED:[],CANCELLED:[]};
  if(!transitions[data.status]?.includes(status)&&!allowedAdmin.includes(status)) throw new HttpsError("failed-precondition","Status de pedido inválido.");
  await ref.update({status,updatedAt:FieldValue.serverTimestamp(),...(status==="DELIVERED"?{deliveredAt:FieldValue.serverTimestamp()}: {})});
  return {ok:true,status};
});

export const createMercadoPagoPix = onCall(async request => {
  const requester=uid(request), serviceId=String(request.data?.serviceId??""), serviceType=String(request.data?.serviceType??"");
  if(!["RIDE","DELIVERY"].includes(serviceType)||!serviceId) throw new HttpsError("invalid-argument","serviceId e serviceType são obrigatórios.");
  const collectionName=serviceType==="RIDE"?"rides":"deliveries";
  const snap=await db.collection(collectionName).doc(serviceId).get();
  if(!snap.exists) throw new HttpsError("not-found","Serviço não encontrado.");
  const data=snap.data()!;
  assertParticipant(data,requester);
  if(data.paymentStatus==="APPROVED") return {ok:true,status:"APPROVED",paymentId:data.paymentId};
  const sellerId=serviceType==="RIDE"?data.driverId:data.courierId;
  if(!sellerId) throw new HttpsError("failed-precondition","Ainda não existe profissional atribuído.");
  const seller=await db.collection("drivers").doc(sellerId).get();
  const sellerData=seller.data()??{};
  const accessToken=String(sellerData.mercadoPago?.accessToken??"");
  if(!accessToken) throw new HttpsError("failed-precondition","O profissional ainda não conectou o Mercado Pago.");
  const amountCents=Number(data.estimatedFareCents??0);
  if(!Number.isInteger(amountCents)||amountCents<100) throw new HttpsError("failed-precondition","Valor inválido.");
  const commissionPercent=Number((await db.collection("pricing").doc("default").get()).data()?.commissionPercent??20);
  const fee=Math.max(0,Math.round(amountCents*commissionPercent/100))/100;
  const externalReference=serviceType.toLowerCase()+"_"+serviceId;
  const response=await fetch("https://api.mercadopago.com/v1/payments",{method:"POST",headers:{"Authorization":"Bearer "+accessToken,"Content-Type":"application/json","X-Idempotency-Key":externalReference},body:JSON.stringify({transaction_amount:amountCents/100,description:"SancaMobi "+(serviceType==="RIDE"?"corrida":"entrega"),payment_method_id:"pix",payer:{email:String(request.auth?.token?.email??"cliente@sancamobi.local")},application_fee:fee,external_reference:externalReference,notification_url:process.env.MERCADOPAGO_WEBHOOK_URL})});
  const payload:any=await response.json();
  if(!response.ok) throw new HttpsError("internal","Mercado Pago recusou a criação do pagamento.");
  await db.collection("paymentTransactions").doc(String(payload.id)).set({paymentId:String(payload.id),serviceId,serviceType,sellerId,requesterId:requester,amountCents,applicationFeeCents:Math.round(fee*100),status:String(payload.status??"pending"),createdAt:FieldValue.serverTimestamp(),rawStatusDetail:String(payload.status_detail??"")});
  await db.collection(collectionName).doc(serviceId).update({paymentId:String(payload.id),paymentStatus:String(payload.status??"pending"),updatedAt:FieldValue.serverTimestamp()});
  return {ok:true,paymentId:String(payload.id),status:String(payload.status??"pending"),qrCode:payload.point_of_interaction?.transaction_data?.qr_code??null,qrCodeBase64:payload.point_of_interaction?.transaction_data?.qr_code_base64??null,ticketUrl:payload.point_of_interaction?.transaction_data?.ticket_url??null};
});

export const mercadoPagoWebhook = onRequest(async (req,res) => {
  try {
    if(req.method!=="POST"){res.status(405).send("Method Not Allowed");return;}
    const type=String(req.body?.type??req.query?.type??"");
    const paymentId=String(req.body?.data?.id??req.query?.["data.id"]??"");
    const signature=String(req.headers["x-signature"]??"");
    const requestId=String(req.headers["x-request-id"]??"");
    const secret=String(process.env.MERCADOPAGO_WEBHOOK_SECRET??"");
    if(secret){
      const parts=signature.split(",").map(x=>x.trim().split("="));
      const ts=parts.find(x=>x[0]==="ts")?.[1]??"";
      const v1=parts.find(x=>x[0]==="v1")?.[1]??"";
      const manifest=`id:${paymentId};request-id:${requestId};ts:${ts};`;
      const expected=createHmac("sha256",secret).update(manifest).digest("hex");
      if(!v1||v1.length!==expected.length||!timingSafeEqual(Buffer.from(v1),Buffer.from(expected))){res.status(401).send("Invalid signature");return;}
    } else {
      res.status(503).send("Webhook secret not configured"); return;
    }
    if(type!=="payment"||!paymentId){res.status(200).send("ignored");return;}
    const tx=await db.collection("paymentTransactions").doc(paymentId).get();
    if(!tx.exists){res.status(200).send("unknown");return;}
    const accessToken=String((await db.collection("drivers").doc(tx.data()?.sellerId).get()).data()?.mercadoPago?.accessToken??"");
    if(!accessToken){res.status(200).send("seller-not-connected");return;}
    const response=await fetch("https://api.mercadopago.com/v1/payments/"+paymentId,{headers:{Authorization:"Bearer "+accessToken}});
    const payment:any=await response.json();
    if(!response.ok){res.status(200).send("lookup-failed");return;}
    const status=String(payment.status??"pending");
    await tx.ref.update({status,statusDetail:String(payment.status_detail??""),updatedAt:FieldValue.serverTimestamp()});
    const serviceType=String(tx.data()?.serviceType), serviceId=String(tx.data()?.serviceId);
    const collectionName=serviceType==="RIDE"?"rides":"deliveries";
    await db.collection(collectionName).doc(serviceId).update({paymentStatus:status,updatedAt:FieldValue.serverTimestamp()});
    res.status(200).send("ok");
  } catch { res.status(200).send("ok"); }
});

export const mercadoPagoOAuthCallback = onRequest(async (req,res) => {
  try {
    const code=String(req.query.code??""), state=String(req.query.state??"");
    if(!code||!state){res.status(400).send("OAuth inválido");return;}
    const stateSnap=await db.collection("mercadoPagoOAuthStates").doc(state).get();
    if(!stateSnap.exists){res.status(400).send("Estado inválido");return;}
    const stateData=stateSnap.data()!;
    if(Date.now()-Number(stateData.createdAtMs)>10*60*1000){res.status(400).send("Estado expirado");return;}
    const body=new URLSearchParams({client_id:String(process.env.MERCADOPAGO_CLIENT_ID??""),client_secret:String(process.env.MERCADOPAGO_CLIENT_SECRET??""),grant_type:"authorization_code",code,redirect_uri:String(process.env.MERCADOPAGO_REDIRECT_URI??"")});
    const tokenResponse=await fetch("https://api.mercadopago.com/oauth/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
    const token:any=await tokenResponse.json();
    if(!tokenResponse.ok){res.status(502).send("Falha ao vincular Mercado Pago");return;}
    await db.collection("drivers").doc(String(stateData.driverId)).set({mercadoPago:{accessToken:token.access_token,refreshToken:token.refresh_token,userId:String(token.user_id),expiresIn:Number(token.expires_in??0),connectedAt:FieldValue.serverTimestamp()}},{merge:true});
    await stateSnap.ref.delete();
    res.status(200).send("Mercado Pago conectado ao SancaMobi. Você pode fechar esta janela.");
  } catch { res.status(500).send("Erro ao concluir conexão"); }
});

export const startMercadoPagoOAuth = onCall(async request => {
  const driverId=uid(request);
  const state=db.collection("mercadoPagoOAuthStates").doc().id;
  await db.collection("mercadoPagoOAuthStates").doc(state).set({driverId,createdAtMs:Date.now()});
  const redirectUri=String(process.env.MERCADOPAGO_REDIRECT_URI??"");
  const clientId=String(process.env.MERCADOPAGO_CLIENT_ID??"");
  if(!redirectUri||!clientId) throw new HttpsError("failed-precondition","Mercado Pago OAuth ainda não foi configurado no ambiente.");
  const url="https://auth.mercadopago.com.br/authorization?client_id="+encodeURIComponent(clientId)+"&response_type=code&platform_id=mp&redirect_uri="+encodeURIComponent(redirectUri)+"&state="+encodeURIComponent(state);
  return {url};
});
