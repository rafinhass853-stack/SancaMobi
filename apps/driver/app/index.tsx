import { StyleSheet, Text, View } from "react-native";

export default function DriverHome() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>SancaMobi</Text>
      <Text style={styles.subtitle}>Área do motorista</Text>
      <Text style={styles.status}>App motorista — base inicial</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24
  },
  title: {
    fontSize: 34,
    fontWeight: "800"
  },
  subtitle: {
    marginTop: 8,
    fontSize: 18
  },
  status: {
    marginTop: 8,
    fontSize: 16
  }
});
