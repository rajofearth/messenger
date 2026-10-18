import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

export default function App() {
  return (
    <View style={styles.container}>
      <StatusBar style="dark" />
      <Text style={styles.eyebrow}>MESSENGER</Text>
      <Text accessibilityRole="header" style={styles.title}>A fresh start.</Text>
      <Text style={styles.description}>
        Your app is ready. No Expo Go or development server required.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f6f5f1',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  eyebrow: {
    color: '#52685b',
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 3,
    marginBottom: 20,
  },
  title: {
    color: '#18251f',
    fontSize: 44,
    fontWeight: '700',
    marginBottom: 16,
  },
  description: {
    color: '#58635c',
    fontSize: 17,
    lineHeight: 26,
    maxWidth: 340,
  },
});
