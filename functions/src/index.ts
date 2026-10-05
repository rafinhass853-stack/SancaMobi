import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

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
  await db.collection("drivers").doc(id).set({userId:id,displayName:name,email:request.auth?.token.email ?? null,status:"PENDING_APPROVAL",online:false,city:"São Carlos",approved:false,updatedAt:FieldValue.serverTimestamp()},{merge:true});
  await db.collection("users").doc(id).set({role:"DRIVER",displayName:name,email:request.auth?.token.email ?? null,updatedAt:FieldValue.serverTimestamp()},{merge:true});
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
  await ref.update({latitude:n(request.data?.latitude,"latitude"),longitude:n(request.data?.longitude,"longitude"),locationUpdatedAt:FieldValue.serverTimestamp()});
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
  const distance=n(request.data?.estimatedDistanceKm,"estimatedDistanceKm"), duration=n(request.data?.estimatedDurationMin,"estimatedDurationMin"), fare=n(request.data?.estimatedFareCents,"estimatedFareCents");
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
  const valid=["REQUESTED","SEARCHING","OFFERED","ACCEPTED","DRIVER_ARRIVING","DRIVER_ARRIVED","TRIP_STARTED","TRIP_COMPLETED","CANCELLED","EXPIRED","NO_DRIVER","FAILED"];
  if(!rideId||!valid.includes(status)) throw new HttpsError("invalid-argument","rideId/status inválidos.");
  const ref=db.collection("rides").doc(rideId), snap=await ref.get();
  if(!snap.exists) throw new HttpsError("not-found","Corrida não encontrada.");
  const ride=snap.data()!;
  if(ride.passengerId!==id&&ride.driverId!==id) throw new HttpsError("permission-denied","Você não participa desta corrida.");
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
