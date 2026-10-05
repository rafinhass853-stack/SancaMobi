import {useEffect,useState} from "react";
import {Alert,Pressable,ScrollView,StyleSheet,Text,TextInput,View} from "react-native";
import {httpsCallable} from "firebase/functions";
import {auth,functions} from "../lib/firebase";

export default function Menu(){
 const [category,setCategory]=useState("Lanches");
 const [name,setName]=useState("");
 const [price,setPrice]=useState("");
 const [promo,setPromo]=useState("");
 const [items,setItems]=useState<any[]>([]);
 async function load(){try{const r=await httpsCallable(functions,"getStoreCatalog")({storeId:auth.currentUser?.uid});setItems((r.data as any).items||[])}catch{}}
 useEffect(()=>{void load()},[]);
 async function save(){try{await httpsCallable(functions,"upsertMenuItem")({name,categoryId:category.toLowerCase().replace(/\s+/g,"-"),priceCents:Math.round(Number(price.replace(",","."))*100),promotionalPriceCents:promo?Math.round(Number(promo.replace(",","."))*100):null,available:true});setName("");setPrice("");setPromo("");await load();Alert.alert("Cardápio","Produto salvo.")}catch(e){Alert.alert("Cardápio",e instanceof Error?e.message:"Falha ao salvar.")}}
 return <ScrollView style={s.page} contentContainerStyle={s.content}><Text style={s.title}>Meu Cardápio</Text><Text style={s.subtitle}>Produtos, preços e promoções em tempo real</Text><TextInput style={s.input} placeholder="Categoria" value={category} onChangeText={setCategory}/><TextInput style={s.input} placeholder="Nome do produto" value={name} onChangeText={setName}/><TextInput style={s.input} placeholder="Preço normal: 29,90" keyboardType="decimal-pad" value={price} onChangeText={setPrice}/><TextInput style={s.input} placeholder="Preço promocional (opcional)" keyboardType="decimal-pad" value={promo} onChangeText={setPromo}/><Pressable style={s.button} onPress={save}><Text style={s.buttonText}>Salvar produto</Text></Pressable><Text style={s.section}>Produtos publicados</Text>{items.map(x=><View style={s.row} key={x.id||x.itemId}><View style={{flex:1}}><Text style={s.name}>{x.name}</Text><Text style={s.muted}>{x.description||"Sem descrição"}</Text></View><View><Text style={s.price}>R$ {((x.promotionalPriceCents??x.priceCents)/100).toFixed(2)}</Text>{x.promotionalPriceCents&&<Text style={s.promo}>PROMOÇÃO</Text>}</View></View>)}</ScrollView>
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:"#f4f5f7"},content:{padding:20,paddingTop:60,gap:12},title:{fontSize:30,fontWeight:"900"},subtitle:{color:"#666",marginBottom:8},input:{backgroundColor:"#fff",borderWidth:1,borderColor:"#ddd",borderRadius:12,padding:14},button:{backgroundColor:"#111",padding:15,borderRadius:14,alignItems:"center"},buttonText:{color:"#fff",fontWeight:"800"},section:{fontSize:20,fontWeight:"800",marginTop:12},row:{backgroundColor:"#fff",borderRadius:16,padding:14,flexDirection:"row",alignItems:"center",gap:12},name:{fontWeight:"800",fontSize:16},muted:{color:"#777",fontSize:12},price:{fontWeight:"900"},promo:{fontSize:10,fontWeight:"900"}});