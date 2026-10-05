import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as Location from "expo-location";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword } from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { auth, functions } from "../lib/firebase";

export default function PassengerHome() {
  const [email,setEmail]=useState(""), [password,setPassword]=useState(""), [busy,setBusy]=useState(false);
  const [authenticated,setAuthenticated]=useState(Boolean(auth.currentUser));
  const [destLat,setDestLat]=useState("-22.0175"), [destLng,setDestLng]=useState("-47.8908");
  const [distance,setDistance]=useState("5"), [duration,setDuration]=useState("15"), [fare,setFare]=useState<number|null>(null);

  async function authenticate(){
    if(!email||password.length<6){Alert.alert("Dados inválidos","Informe e-mail e senha com pelo menos 6 caracteres.");return;}
    setBusy(true);
    try{
      try{await signInWithEmailAndPassword(auth,email.trim(),password);}
      catch{await createUserWithEmailAndPassword(auth,email.trim(),password);}
      await httpsCallable(functions,"ensurePassengerProfile")({displayName:email.trim().split("@")[0]});
      setAuthenticated(true);
    }catch(e){Alert.alert("SancaMobi",e instanceof Error?e.message:"Não foi possível entrar.");}
    finally{setBusy(false);}
  }

  async function requestRide(){
    if(!auth.currentUser)return;
    setBusy(true);
    try{
      const permission=await Location.requestForegroundPermissionsAsync();
      if(permission.status!=="granted")throw new Error("Permita o acesso à localização para solicitar uma corrida.");
      const loc=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.Balanced});
      const distanceKm=Number(distance), durationMin=Number(duration);
      const fareFn=httpsCallable(functions,"calculateRideFare");
      const result=await fareFn({distanceKm,durationMin});
      const fareCents=Number((result.data as any).fareCents);
      setFare(fareCents);
      const create=httpsCallable(functions,"createRide");
      const ride=await create({pickup:{latitude:loc.coords.latitude,longitude:loc.coords.longitude},destination:{latitude:Number(destLat),longitude:Number(destLng)},estimatedDistanceKm:distanceKm,estimatedDurationMin:durationMin,estimatedFareCents:fareCents});
      Alert.alert("Corrida solicitada","Status: "+String((ride.data as any).status)+"\nValor estimado: R$ "+(fareCents/100).toFixed(2));
    }catch(e){Alert.alert("SancaMobi",e instanceof Error?e.message:"Falha ao solicitar corrida.");}
    finally{setBusy(false);}
  }

  if(!authenticated)return <View style={styles.container}><Text style={styles.logo}>SancaMobi</Text><Text style={styles.subtitle}>Passageiro</Text><TextInput style={styles.input} placeholder="E-mail" autoCapitalize="none" keyboardType="email-address" value={email} onChangeText={setEmail}/><TextInput style={styles.input} placeholder="Senha" secureTextEntry value={password} onChangeText={setPassword}/><Pressable style={styles.primary} onPress={authenticate} disabled={busy}><Text style={styles.primaryText}>{busy?"Entrando...":"Entrar / Criar conta"}</Text></Pressable></View>;

  return <View style={styles.container}><Text style={styles.logo}>SancaMobi</Text><Text style={styles.subtitle}>Solicitar corrida</Text><TextInput style={styles.input} placeholder="Latitude destino" keyboardType="numeric" value={destLat} onChangeText={setDestLat}/><TextInput style={styles.input} placeholder="Longitude destino" keyboardType="numeric" value={destLng} onChangeText={setDestLng}/><TextInput style={styles.input} placeholder="Distância estimada (km)" keyboardType="numeric" value={distance} onChangeText={setDistance}/><TextInput style={styles.input} placeholder="Duração estimada (min)" keyboardType="numeric" value={duration} onChangeText={setDuration}/><Pressable style={styles.primary} onPress={requestRide} disabled={busy}><Text style={styles.primaryText}>{busy?"Processando...":"Pedir corrida"}</Text></Pressable>{fare!==null&&<Text style={styles.fare}>Última estimativa: R$ {(fare/100).toFixed(2)}</Text>}<Pressable style={styles.secondary} onPress={()=>auth.signOut().then(()=>setAuthenticated(false))}><Text>Sair</Text></Pressable></View>;
}
const styles=StyleSheet.create({container:{flex:1,justifyContent:"center",padding:24,gap:12},logo:{fontSize:36,fontWeight:"900",textAlign:"center"},subtitle:{fontSize:17,textAlign:"center",marginBottom:10},input:{borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14,fontSize:16},primary:{backgroundColor:"#111",padding:15,borderRadius:12,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"700"},secondary:{borderWidth:1,borderColor:"#ddd",padding:14,borderRadius:12,alignItems:"center"},fare:{fontSize:18,fontWeight:"700",textAlign:"center"}});
