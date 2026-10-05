import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { getFirestore } from "firebase-admin/firestore";
import { initializeApp } from "firebase-admin/app";

initializeApp();

setGlobalOptions({
  region: "southamerica-east1",
  maxInstances: 10
});

export const healthCheck = onCall(() => ({
  ok: true,
  service: "sancamobi-functions",
  projectId: getFirestore().app.options.projectId ?? null
}));

export const calculateRideFare = onCall((request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Authentication required.");
  }

  const distanceKm = Number(request.data?.distanceKm);
  const durationMin = Number(request.data?.durationMin);

  if (!Number.isFinite(distanceKm) || !Number.isFinite(durationMin)) {
    throw new HttpsError("invalid-argument", "distanceKm and durationMin are required.");
  }

  const baseCents = 600;
  const perKmCents = 220;
  const perMinuteCents = 35;
  const minimumFareCents = 1000;

  const calculated = Math.round(
    baseCents + distanceKm * perKmCents + durationMin * perMinuteCents
  );

  return {
    fareCents: Math.max(calculated, minimumFareCents),
    currency: "BRL"
  };
});
