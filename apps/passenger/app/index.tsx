import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
import * as Location from "expo-location";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../lib/firebase";

type Coord = { latitude: number; longitude: number };
type Ride = {
  status: string;
  pickup: Coord;
  destination: Coord;
  driverId?: string;
  driverLocation?: Coord;
  estimatedDistanceKm?: number;
  estimatedDurationMin?: number;
  estimatedFareCents?: number;
};

const DEFAULT_REGION: Region = {
  latitude: -22.0175,
  longitude: -47.8908,
  latitudeDelta: 0.08,
  longitudeDelta: 0.08
};

const statusLabel: Record<string,string> = {
  SEARCHING: "Procurando motorista",
  OFFERED: "Motorista sendo acionado",
  ACCEPTED: "Motorista aceitou",
  DRIVER_ARRIVING: "Motorista a caminho",
  DRIVER_ARRIVED: "Motorista chegou",
  TRIP_STARTED: "Corrida em andamento",
  TRIP_COMPLETED: "Corrida concluída",
  CANCELLED: "Corrida cancelada",
  EXPIRED: "Busca expirada",
  NO_DRIVER: "Nenhum motorista disponível"
};

function distanceKm(a: Coord, b: Coord) {
  const R = 6371;
  const dLat = (b.latitude-a.latitude) * Math.PI / 180;
  const dLng = (b.longitude-a.longitude) * Math.PI / 180;
  const x = Math.sin(dLat/2)**2 +
    Math.cos(a.latitude*Math.PI/180) *
    Math.cos(b.latitude*Math.PI/180) *
    Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1-x));
}

export default function PassengerHome() {
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [busy,setBusy]=useState(false);
  const [authenticated,setAuthenticated]=useState(Boolean(auth.currentUser));
  const [pickup,setPickup]=useState<Coord | null>(null);
  const [destination,setDestination]=useState<Coord | null>(null);
  const [region,setRegion]=useState<Region>(DEFAULT_REGION);
  const [activeRideId,setActiveRideId]=useState<string | null>(null);
  const [ride,setRide]=useState<Ride | null>(null);
  const [message,setMessage]=useState("Toque no mapa para escolher o destino.");

  useEffect(() => onAuthStateChanged(auth,user => setAuthenticated(Boolean(user))),[]);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      const permission = await Location.requestForegroundPermissionsAsync();
      if (permission.status !== "granted") {
        setMessage("Permita a localização para usar o SancaMobi.");
        return;
      }
      const loc = await Location.getCurrentPositionAsync({accuracy: Location.Accuracy.High});
      if (cancelled) return;
      const current = {latitude: loc.coords.latitude, longitude: loc.coords.longitude};
      setPickup(current);
      setRegion({...current, latitudeDelta: 0.03, longitudeDelta: 0.03});
    })();
    return () => { cancelled = true; };
  },[authenticated]);

  useEffect(() => {
    if (!activeRideId) {
      setRide(null);
      return;
    }
    return onSnapshot(doc(db,"rides",activeRideId),snap => {
      if (!snap.exists()) {
        setRide(null);
        setMessage("A corrida não está mais disponível.");
        return;
      }
      setRide(snap.data() as Ride);
    },error => setMessage(error.message));
  },[activeRideId]);

  const calculated = useMemo(() => {
    if (!pickup || !destination) return null;
    const km = distanceKm(pickup,destination);
    const min = Math.max(3, Math.round(km / 30 * 60));
    return {km,min};
  },[pickup,destination]);

  async function authenticate() {
    if (!email || password.length < 6) {
      Alert.alert("Dados inválidos","Informe e-mail e senha com pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try {
      try { await signInWithEmailAndPassword(auth,email.trim(),password); }
      catch { await createUserWithEmailAndPassword(auth,email.trim(),password); }
      await httpsCallable(functions,"ensurePassengerProfile")({
        displayName: email.trim().split("@")[0]
      });
    } catch(e) {
      Alert.alert("SancaMobi",e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally { setBusy(false); }
  }

  async function requestRide() {
    if (!pickup || !destination || !auth.currentUser || !calculated) {
      Alert.alert("Destino","Escolha um destino no mapa.");
      return;
    }
    setBusy(true);
    try {
      const fareResult = await httpsCallable(functions,"calculateRideFare")({
        distanceKm: calculated.km,
        durationMin: calculated.min
      });
      const fareCents = Number((fareResult.data as {fareCents:number}).fareCents);
      const result = await httpsCallable(functions,"createRide")({
        pickup,
        destination,
        estimatedDistanceKm: calculated.km,
        estimatedDurationMin: calculated.min,
        estimatedFareCents: fareCents
      });
      const data = result.data as {rideId:string;status:string};
      setActiveRideId(data.rideId);
      setMessage(statusLabel[data.status] ?? data.status);
      if (data.status === "NO_DRIVER") {
        Alert.alert("Sem motoristas","Não encontramos motorista disponível agora.");
      }
    } catch(e) {
      Alert.alert("SancaMobi",e instanceof Error ? e.message : "Falha ao solicitar corrida.");
    } finally { setBusy(false); }
  }

  async function cancelRide() {
    if (!activeRideId || !ride) return;
    try {
      await httpsCallable(functions,"updateRideStatus")({rideId:activeRideId,status:"CANCELLED"});
      setMessage("Corrida cancelada.");
    } catch(e) {
      Alert.alert("Corrida",e instanceof Error ? e.message : "Não foi possível cancelar.");
    }
  }

  if (!authenticated) {
    return <View style={styles.auth}>
      <Text style={styles.logo}>SancaMobi</Text>
      <Text style={styles.subtitle}>Mobilidade de São Carlos</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Acesse sua conta</Text>
        <Text style={styles.inputHint}>E-mail</Text>
        <View style={styles.input}><Text style={styles.inputText}>{email || "Digite seu e-mail no teclado"}</Text></View>
        <Pressable style={styles.primary} onPress={authenticate} disabled={busy}>
          <Text style={styles.primaryText}>{busy ? "Entrando..." : "Entrar / Criar conta"}</Text>
        </Pressable>
      </View>
    </View>;
  }

  return <View style={styles.container}>
    <MapView
      style={styles.map}
      region={region}
      showsUserLocation
      showsMyLocationButton
      onPress={event => {
        const point = event.nativeEvent.coordinate;
        setDestination(point);
        setMessage("Destino selecionado. Confira o valor e peça a corrida.");
      }}
    >
      {pickup && <Marker coordinate={pickup} title="Embarque" pinColor="green" />}
      {destination && <Marker coordinate={destination} title="Destino" />}
      {ride?.driverLocation && <Marker coordinate={ride.driverLocation} title="Motorista" pinColor="blue" />}
    </MapView>

    <View style={styles.topBar}>
      <View><Text style={styles.brand}>SancaMobi</Text><Text style={styles.small}>São Carlos</Text></View>
      <Pressable onPress={()=>auth.signOut()}><Text style={styles.logout}>Sair</Text></Pressable>
    </View>

    <View style={styles.sheet}>
      {activeRideId && ride ? <>
        <Text style={styles.title}>{statusLabel[ride.status] ?? ride.status}</Text>
        <Text style={styles.detail}>
          {ride.estimatedDistanceKm ? ride.estimatedDistanceKm.toFixed(1) : calculated?.km.toFixed(1)} km ·
          {ride.estimatedFareCents ? " R$ " + (ride.estimatedFareCents/100).toFixed(2) : ""}
        </Text>
        {ride.driverLocation && <Text style={styles.live}>● Motorista localizado em tempo real</Text>}
        {!["TRIP_COMPLETED","CANCELLED","EXPIRED","NO_DRIVER"].includes(ride.status) &&
          <Pressable style={styles.cancel} onPress={cancelRide}><Text style={styles.cancelText}>Cancelar corrida</Text></Pressable>}
        {ride.status === "TRIP_COMPLETED" &&
          <Pressable style={styles.primary} onPress={()=>Alert.alert("Avaliação","Obrigado! A avaliação será disponibilizada no próximo módulo.")}>
            <Text style={styles.primaryText}>Avaliar corrida</Text>
          </Pressable>}
      </> : <>
        <Text style={styles.title}>{message}</Text>
        {destination && calculated && <>
          <Text style={styles.detail}>Estimativa: {calculated.km.toFixed(1)} km · {calculated.min} min</Text>
          <Pressable style={styles.primary} onPress={requestRide} disabled={busy}>
            <Text style={styles.primaryText}>{busy ? "Calculando..." : "Confirmar corrida"}</Text>
          </Pressable>
        </>}
      </>}
    </View>
  </View>;
}

const styles=StyleSheet.create({
  container:{flex:1,backgroundColor:"#f4f5f7"},
  auth:{flex:1,justifyContent:"center",padding:24,backgroundColor:"#f4f5f7"},
  logo:{fontSize:38,fontWeight:"900",textAlign:"center"},
  subtitle:{textAlign:"center",fontSize:17,marginBottom:20},
  card:{backgroundColor:"#fff",borderRadius:22,padding:20,gap:14},
  label:{fontSize:20,fontWeight:"800"},
  inputHint:{fontSize:13,color:"#666"},
  input:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14},
  inputText:{color:"#666"},
  map:{flex:1},
  topBar:{position:"absolute",top:50,left:16,right:16,flexDirection:"row",justifyContent:"space-between",alignItems:"center",backgroundColor:"#fff",borderRadius:18,padding:14},
  brand:{fontSize:20,fontWeight:"900"},
  small:{fontSize:12,color:"#666"},
  logout:{fontWeight:"800"},
  sheet:{position:"absolute",left:12,right:12,bottom:20,backgroundColor:"#fff",borderRadius:24,padding:18,gap:10},
  title:{fontSize:18,fontWeight:"800"},
  detail:{fontSize:15,color:"#555"},
  live:{fontSize:13,color:"#16803c",fontWeight:"700"},
  primary:{backgroundColor:"#111",padding:15,borderRadius:14,alignItems:"center"},
  primaryText:{color:"#fff",fontWeight:"800"},
  cancel:{borderWidth:1,borderColor:"#ddd",padding:14,borderRadius:14,alignItems:"center"},
  cancelText:{fontWeight:"700"}
});
