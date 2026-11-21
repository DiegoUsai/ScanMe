import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import PreviewScreen from './screens/PreviewScreen';
import SettingsScreen from './screens/SettingsScreen';
import ProjectsScreen from './screens/ProjectsScreen';
import {SettingsProvider} from './settings/SettingsContext';

export type RootStackParamList = {
  Home: undefined;
  Preview: {
    pages: string[];
    pageSizes?: Array<{width?: number; height?: number}>;
    pdfUri?: string;
    /** Progetto da proporre, se la home è filtrata su un progetto. */
    projectId?: string;
  };
  Settings: undefined;
  Projects: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // SafeAreaProvider è necessario perché l'app è edge-to-edge
  // (edgeToEdgeEnabled=true): senza, i contenuti finiscono sotto le barre di sistema.
  return (
    <SafeAreaProvider>
      <SettingsProvider>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{headerShown: false}}>
            <Stack.Screen name="Home" component={HomeScreen} />
            <Stack.Screen
              name="Preview"
              component={PreviewScreen}
              options={{animation: 'slide_from_right'}}
            />
            <Stack.Screen
              name="Settings"
              component={SettingsScreen}
              options={{animation: 'slide_from_right'}}
            />
          </Stack.Navigator>
        </NavigationContainer>
      </SettingsProvider>
    </SafeAreaProvider>
  );
}
