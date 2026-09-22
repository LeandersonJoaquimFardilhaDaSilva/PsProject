import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.flow.organizer.mobile',
  appName: 'Flow',
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
