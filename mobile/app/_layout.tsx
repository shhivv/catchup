import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { View, ActivityIndicator } from "react-native";
import { colors } from "../lib/theme";

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Geist: require("@expo-google-fonts/geist/400Regular/Geist_400Regular.ttf"),
    "Geist-Bold": require("@expo-google-fonts/geist/700Bold/Geist_700Bold.ttf"),
    "Geist-Mono": require("@expo-google-fonts/geist-mono/400Regular/GeistMono_400Regular.ttf"),
    "EB-Garamond": require("@expo-google-fonts/eb-garamond/400Regular/EBGaramond_400Regular.ttf"),
    "EB-Garamond-Italic": require("@expo-google-fonts/eb-garamond/400Regular_Italic/EBGaramond_400Regular_Italic.ttf"),
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
          animation: "slide_from_right",
        }}
      />
    </>
  );
}
