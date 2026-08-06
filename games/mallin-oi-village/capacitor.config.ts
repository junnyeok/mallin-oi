import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.mallinoi.specialcity",
  appName: "말오닷특별시",
  webDir: "dist",
  backgroundColor: "#77b84a",
  ios: {
    contentInset: "never",
    preferredContentMode: "mobile",
  },
  android: {
    backgroundColor: "#77b84a",
  },
};

export default config;
