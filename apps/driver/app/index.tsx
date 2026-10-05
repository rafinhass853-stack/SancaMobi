import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword } from "firebase/auth";
import { collection, doc, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../lib/firebase";

type Offer={id:string;rideId:string;distanceToPickupKm?:number;status:string};
type Ride={status:string;estimatedFareCents?:number;destination?:{latitude:number;longitude:number}};

const statusLabel: Record<string,string> = {
  ACCEPTED:"Aceita — siga para o embarque",
  DRIVER_ARRIVING:"A caminho do embarque",
  DRIVER_ARRIVED:"Cheguei ao embarque",
  TRIP_STARTED:"Corrida em andamento",
  TRIP_COMPLETED:"Corrida concluída",
  CANCELLED:"Corrida cancelada"
};

const nextStatus: Record<string,string> = {
  ACCEPTED:"DRIVER_ARRIVING",
  DRIVER_ARRIVING:"DRIVER_ARRIVED",
  DRIVER_ARRIVED:"TRIP_STARTED",
  TRIP_STARTED:"TRIP_COMPLETED"
};

export default function DriverHome(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [online,setOnline]=useState(false);
  const [busy,setBusy]=useState(false);
  const [offers,setOffers]=useState<Offer[]>([]);
  const [authenticated,setAuthenticated]=useState(Boolean(auth.currentUser));
  const [activeRideId,setActiveRideId]=useState<string|null>(null);
  const [ride,setRide]=useState<Ride|null>(null);

  useEffect(() => onAuthStateChanged(auth,user => setAuthenticated(Boolean(user))),[]);

  useEffect(()=>{
    const user=auth.currentUser;
    if(!user){setOffers([]);return;}
    const q=query(
      collection(db,"rideOffers"),
      where("driverId","==",user.uid),
      where("status","==","OFFERED")
    );
    return onSnapshot(q,s=>setOffers(s.docs.map(d=>({id:d.id,...d.data()} as Offer))),e=>Alert.alert("Ofertas",e.message));
  },[authenticated]);

  useEffect(()=>{
    if(!activeRideId){setRide(null);return;}
    return onSnapshot(doc(db,"rides",activeRideId),snap=>{
      if(!snap.exists()){setRide(null);return;}
      setRide(snap.data() as Ride);
    },e=>Alert.alert("Corrida",e.message));
  },[activeRideId]);

  useEffect(()=>{
    if(!online || !auth.currentUser)return;
    let active=true;
    const send=async()=>{
      if(!active)return;
      try{
        const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
        await httpsCallable(functions,"updateDriverLocation")({
          latitude:loc.coords.latitude,
          longitude:loc.coords.longitude
        });
      }catch{}
    };
    void send();
    const interval=setInterval(send,10000);
    return()=>{active=false;clearInterval(interval);};
  },[online]);

  async function authenticate(){
    if(!email || password.length<6){
      Alert.alert("Dados inválidos","Informe e-mail e senha com pelo menos 6 caracteres.");
      return;
    }
    setBusy(true);
    try{
      let signedIn=false;
      try{await signInWithEmailAndPassword(auth,email.trim(),password);signedIn=true;}
      catch{}
      if(!signedIn) await createUserWithEmailAndPassword(auth,email.trim(),password);
      await httpsCallable(functions,"ensureDriverProfile")({
        displayName:email.trim().split("@")[0]
      });
    }catch(e){
      Alert.alert("SancaMobi",e instanceof Error?e.message:"Falha na autenticação.");
    }finally{setBusy(false);}
  }

  async function toggleOnline(value:boolean){
    if(!auth.currentUser)return;
    try{
      if(value){
        const p=await Location.requestForegroundPermissionsAsync();
        if(p.status!=="granted")throw new Error("A localização é necessária para ficar online.");
        const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
        await httpsCallable(functions,"setDriverAvailability")({
          online:true,
          latitude:loc.coords.latitude,
          longitude:loc.coords.longitude
        });
      }else{
        await httpsCallable(functions,"setDriverAvailability")({online:false});
      }
      setOnline(value);
    }catch(e){
      Alert.alert("SancaMobi",e instanceof Error?e.message:"Não foi possível alterar o status.");
    }
  }

  async function accept(rideId:string){
    try{
      await httpsCallable(functions,"acceptRide")({rideId});
      setActiveRideId(rideId);
      setOffers(current=>current.filter(o=>o.rideId!==rideId));
    }catch(e){
      Alert.alert("Corrida",e instanceof Error?e.message:"A corrida não está mais disponível.");
    }
  }

  async function advanceRide(){
    if(!activeRideId || !ride) return;
    const status=nextStatus[ride.status];
    if(!status)return;
    setBusy(true);
    try{
      await httpsCallable(functions,"updateRideStatus")({rideId:activeRideId,status});
      if(status==="TRIP_COMPLETED") {
        Alert.alert("Corrida concluída","Obrigado por dirigir com o SancaMobi.");
      }
    }catch(e){
      Alert.alert("Corrida",e instanceof Error?e.message:"Não foi possível atualizar a corrida.");
    }finally{setBusy(false);}
  }

  async function cancelRide(){
    if(!activeRideId)return;
    try{
      await httpsCallable(functions,"updateRideStatus")({rideId:activeRideId,status:"CANCELLED"});
      setActiveRideId(null);
    }catch(e){
      Alert.alert("Corrida",e instanceof Error?e.message:"Não foi possível cancelar.");
    }
  }

  if(!authenticated){
    return <View style={styles.auth}>
      <Text style={styles.logo}>SancaMobi</Text>
      <Text style={styles.subtitle}>Motorista</Text>
      <TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/>
      <TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword}/>
      <Pressable style={styles.primary} onPress={authenticate} disabled={busy}>
        <Text style={styles.primaryText}>{busy?"Entrando...":"Entrar / Criar conta"}</Text>
      </Pressable>
    </View>;
  }

  return <View style={styles.container}>
    <View style={styles.header}>
      <View><Text style={styles.logoSmall}>SancaMobi</Text><Text style={styles.small}>Motorista</Text></View>
      <Pressable onPress={()=>auth.signOut()}><Text style={styles.logout}>Sair</Text></Pressable>
    </View>

    <View style={styles.card}>
      <View style={styles.row}><View><Text style={styles.title}>Disponibilidade</Text><Text style={styles.small}>Só recebe chamadas quando estiver online</Text></View><Switch value={online} onValueChange={toggleOnline}/></View>
    </View>

    {activeRideId && ride ? <View style={styles.card}>
      <Text style={styles.title}>{statusLabel[ride.status] ?? ride.status}</Text>
      <Text style={styles.fare}>R$ {((ride.estimatedFareCents??0)/100).toFixed(2)}</Text>
      <Text style={styles.small}>Siga as etapas da corrida para manter o passageiro atualizado.</Text>
      {nextStatus[ride.status] && <Pressable style={styles.primary} onPress={advanceRide} disabled={busy}>
        <Text style={styles.primaryText}>{nextStatus[ride.status]==="DRIVER_ARRIVING"?"Iniciar deslocamento":nextStatus[ride.status]==="DRIVER_ARRIVED"?"Cheguei ao embarque":nextStatus[ride.status]==="TRIP_STARTED"?"Iniciar corrida":"Finalizar corrida"}</Text>
      </Pressable>}
      {["ACCEPTED","DRIVER_ARRIVING","DRIVER_ARRIVED"].includes(ride.status) &&
        <Pressable style={styles.secondary} onPress={cancelRide}><Text>Cancelar corrida</Text></Pressable>}
      {ride.status==="TRIP_COMPLETED" &&
        <Pressable style={styles.secondary} onPress={()=>Alert.alert("Avaliação","A avaliação do passageiro será disponibilizada no próximo módulo.")}><Text>Avaliar passageiro</Text></Pressable>}
    </View> : <View style={styles.card}>
      <Text style={styles.title}>Ofertas disponíveis</Text>
      {offers.length===0?<Text style={styles.small}>Nenhuma oferta no momento.</Text>:offers.map(o=>
        <View style={styles.offer} key={o.id}>
          <View style={{flex:1}}><Text style={styles.offerTitle}>Nova corrida</Text><Text style={styles.small}>Aproximadamente {Number(o.distanceToPickupKm??0).toFixed(1)} km até o embarque</Text></View>
          <Pressable style={styles.accept} onPress={()=>accept(o.rideId)}><Text style={styles.primaryText}>Aceitar</Text></Pressable>
        </View>
      )}
    </View>}
  </View>;
}

const styles=StyleSheet.create({
  container:{flex:1,padding:20,paddingTop:60,gap:14,backgroundColor:"#f4f5f7"},
  auth:{flex:1,justifyContent:"center",padding:24,gap:14,backgroundColor:"#f4f5f7"},
  logo:{fontSize:38,fontWeight:"900",textAlign:"center"},
  logoSmall:{fontSize:24,fontWeight:"900"},
  subtitle:{textAlign:"center",fontSize:17,marginBottom:8},
  small:{fontSize:13,color:"#666"},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  logout:{fontWeight:"800"},
  card:{backgroundColor:"#fff",borderRadius:20,padding:18,gap:12},
  row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},
  title:{fontSize:19,fontWeight:"800"},
  input:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14,backgroundColor:"#fff"},
  primary:{backgroundColor:"#111",padding:15,borderRadius:14,alignItems:"center"},
  primaryText:{color:"#fff",fontWeight:"800"},
  secondary:{borderWidth:1,borderColor:"#ddd",padding:14,borderRadius:14,alignItems:"center"},
  offer:{flexDirection:"row",alignItems:"center",gap:12,borderTopWidth:1,borderTopColor:"#eee",paddingTop:12},
  offerTitle:{fontWeight:"800"},
  accept:{backgroundColor:"#111",padding:11,borderRadius:11},
  fare:{fontSize:24,fontWeight:"900"}
});
