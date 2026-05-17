import { useEffect, useState } from "react";
import { View, ActivityIndicator } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { getServerUrl } from "@/lib/server";
import { useTheme } from "@/lib/theme";

/// Renders a QR code locally (no network round-trip) for an asset / unit tag.
/// Encodes "{server}/t/{code}" so scanning with any camera app opens the asset.
/// Always uses a white background and pure-black modules so the code stays
/// scannable regardless of the user's theme.
export function QrTag({ code, size = 200 }: { code: string; size?: number }) {
  const t = useTheme();
  const [base, setBase] = useState<string | null>(null);

  useEffect(() => {
    getServerUrl().then(setBase);
  }, []);

  const padding = 12;
  const box = size + padding * 2;

  if (!base) {
    return (
      <View style={{
        width: box,
        height: box,
        backgroundColor: "#fff",
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
      }}>
        <ActivityIndicator color={t.accent} />
      </View>
    );
  }

  const value = `${base}/t/${code}`;
  return (
    <View style={{
      backgroundColor: "#fff",
      padding,
      borderRadius: 8,
      alignItems: "center",
      justifyContent: "center",
    }}>
      <QRCode value={value} size={size} backgroundColor="#fff" color="#000" />
    </View>
  );
}
