/**
 * @format
 * Polyfill crypto.getRandomValues for React Native (required by viem). Must run before any other imports.
 */
import "react-native-get-random-values";

import { AppRegistry } from 'react-native';
import App from './App';
import { name as appName } from './app.json';

AppRegistry.registerComponent(appName, () => App);
