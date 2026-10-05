const admin = require("firebase-admin");

const raw = process.env.SANCAMOBI_FIREBASE_SERVICE_ACCOUNT_JSON;
const email = process.env.SANCAMOBI_ADMIN_EMAIL;
if (!raw || !email) throw new Error("SANCAMOBI_FIREBASE_SERVICE_ACCOUNT_JSON and SANCAMOBI_ADMIN_EMAIL are required.");

const serviceAccount = JSON.parse(raw);
admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });

(async () => {
  const user = await admin.auth().getUserByEmail(email);
  const claims = user.customClaims || {};
  await admin.auth().setCustomUserClaims(user.uid, { ...claims, role: "ADMIN" });
  console.log("ADMIN role configured for:", user.email);
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
