import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { auth, db, functions } from "../lib/firebase";

type Offer={id:string;rideId:string;distanceToPickupKm?:number;status:string};

export default function DriverHome(){
  const [email,setEmail]=useState(""),[password,setPassword]=useState(""),[online,setOnline]=useState(false),[busy,setBusy]=useState(false),[offers,setOffers]=useState<Offer[]>([]);
  async function authenticate(){
    setBusy(true);
    try{
      try{await signInWithEmailAndPassword(auth,email.trim(),password);}
      catch{await createUserWithEmailAndPassword(auth,email.trim(),password);}
      await httpsCallable(functions,"ensureDriverProfile")({displayName:email.trim().split("@")[0]});
      Alert.alert("SancaMobi","Cadastro enviado para aprovação.");
    }catch(e){Alert.alert("SancaMobi",e instanceof Error?e.message:"Falha na autenticação.");}
    finally{setBusy(false);}
  }
  async function toggleOnline(value:boolean){
    if(!auth.currentUser)return;
    try{
      if(value){
        const p=await Location.requestForegroundPermissionsAsync();
        if(p.status!=="granted")throw new Error("A localização é necessária para ficar online.");
        const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
        await httpsCallable(functions,"setDriverAvailability")({online:true,latitude:loc.coords.latitude,longitude:loc.coords.longitude});
      }else await httpsCallable(functions,"setDriverAvailability")({online:false});
      setOnline(value);
    }catch(e){Alert.alert("SancaMobi",e instanceof Error?e.message:"Não foi possível alterar o status.");}
  }
  useEffect(()=>{
    if(!auth.currentUser)return;
    const q=query(collection(db,"rideOffers"),where("driverId","==",auth.currentUser.uid),where("status","==","OFFERED"));
    return onSnapshot(q,s=>setOffers(s.docs.map(d=>({id:d.id,...d.data()} as Offer))));
  },[]);
  useEffect(()=>{
    if(!online||!auth.currentUser)return;
    const interval=setInterval(async()=>{
      try{const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});await httpsCallable(functions,"updateDriverLocation")({latitude:loc.coords.latitude,longitude:loc.coords.longitude});}catch{}
    },15000);
    return()=>clearInterval(interval);
  },[online]);
  async function accept(rideId:string){
    try{await httpsCallable(functions,"acceptRide")({rideId});Alert.alert("SancaMobi","Corrida aceita.");}
    catch(e){Alert.alert("Corrida",e instanceof Error?e.message:"A corrida não está mais disponível.");}
  }
  return <View style={styles.container}><Text style={styles.logo}>SancaMobi</Text><Text style={styles.subtitle}>Painel do motorista</Text>
    {!auth.currentUser?<><TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" value={email} onChangeText={setEmail}/><TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword}/><Pressable style={styles.primary} onPress={authenticate} disabled={busy}><Text style={styles.primaryText}>{busy?"Entrando...":"Entrar / Cadastrar"}</Text></Pressable></>:<>
      <View style={styles.row}><Text>Online</Text><Switch value={online} onValueChange={toggleOnline}/></View>
      <Text style={styles.section}>Ofertas disponíveis</Text>
      {offers.length===0?<Text>Nenhuma oferta no momento.</Text>:offers.map(o=><View style={styles.offer} key={o.id}><View><Text style={styles.offerTitle}>Nova corrida</Text><Text>Até {Number(o.distanceToPickupKm??0).toFixed(1)} km do embarque</Text></View><Pressable style={styles.accept} onPress={()=>accept(o.rideId)}><Text style={styles.primaryText}>Aceitar</Text></Pressable></View>)}
      <Pressable style={styles.secondary} onPress={()=>auth.signOut()}><Text>Sair</Text></Pressable>
    </>}</View>;
}
const styles=StyleSheet.create({container:{flex:1,justifyContent:"center",padding:24,gap:14},logo:{fontSize:36,fontWeight:"900",textAlign:"center"},subtitle:{textAlign:"center",fontSize:17},input:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14},primary:{backgroundColor:"#111",padding:15,borderRadius:12,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"700"},secondary:{borderWidth:1,borderColor:"#ddd",padding:14,borderRadius:12,alignItems:"center"},row:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:16},section:{fontSize:20,fontWeight:"800",marginTop:8},offer:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14},offerTitle:{fontWeight:"800"},accept:{backgroundColor:"#111",padding:10,borderRadius:10}});
