import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.tove.organizer.mobile',
  appName: 'Tove',
  webDir: '../dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'http',
    cleartext: true,
  },
  plugins: {
    CapacitorHttp: {
      enabled: false,
    },
    Camera: { permissions: ['camera'] },
  },
};

export default config;
