import React from 'react';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import HomeScreen from './screens/HomeScreen';
import PreviewScreen from './screens/PreviewScreen';

export type RootStackParamList = {
  Home: undefined;
  Preview: {
    pages: string[];
    pdfUri?: string;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function App() {
  // SafeAreaProvider è necessario perché l'app è edge-to-edge
  // (edgeToEdgeEnabled=true): senza, i contenuti finiscono sotto le barre di sistema.
  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{headerShown: false}}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen
            name="Preview"
            component={PreviewScreen}
            options={{animation: 'slide_from_right'}}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
