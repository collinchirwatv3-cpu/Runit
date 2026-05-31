import { registerRootComponent } from 'expo';
import * as Sentry from '@sentry/react-native';

import App from './App';

Sentry.init({
  dsn: 'https://368904ba3b2be1d306d79049c8e466a2@o4511483258273792.ingest.de.sentry.io/4511483297136720',
  tracesSampleRate: 1.0,
  environment: __DEV__ ? 'development' : 'production',
});

registerRootComponent(App);
