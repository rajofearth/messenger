import { registerRootComponent } from 'expo';
import { Platform } from 'react-native';
import React from 'react';
import { ConvexAuthProvider } from '@convex-dev/auth/react';

import App from './App';
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

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(Root);
