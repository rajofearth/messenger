import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import React from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';

import App from './App';
import { registerBackgroundWake } from './src/services/backgroundWake';
import { convexClient, secureTokenStorage } from './src/services/convexClient';

function Root() {
  return React.createElement(
    ConvexAuthProvider,
    {
      client: convexClient,
      storage: Platform.OS === 'android' || Platform.OS === 'ios' ? secureTokenStorage : undefined,
      children: React.createElement(App),
    },
  );
}

// Registering the wake task happens at module scope, fire-and-forget: the OS
// loads this bundle with no views mounted, and a failure only means no
// background wakes.
void registerBackgroundWake().catch(() => {});

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
