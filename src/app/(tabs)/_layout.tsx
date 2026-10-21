import { Tabs } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ChartTabIcon,
  HomeTabIcon,
  ProfileTabIcon,
} from '@/components/home/HomeIcons';

type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

const TAB_CONFIG: Record<
  string,
  {
    label: string;
    accentColor?: string;
    renderIcon: (color: string) => React.ReactNode;
  }
> = {
  home: {
    label: '홈',
    renderIcon: (color) => <HomeTabIcon color={color} size={22} />,
  },
  record: {
    label: '기록',
    renderIcon: (color) => <ChartTabIcon color={color} size={22} />,
  },
  workout: {
    label: '코치',
    accentColor: '#E53935',
    renderIcon: (color) => <ChartTabIcon color={color} size={22} />,
  },
  profile: {
    label: '나',
    renderIcon: (color) => <ProfileTabIcon color={color} size={22} />,
  },
};

function FloatingTabBar({ state, descriptors, navigation }: TabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrapper,
        { bottom: Math.max(insets.bottom, 12) + 4 },
      ]}>
      <View style={styles.pillContainer}>
        {state.routes.map((route, index) => {
          const config = TAB_CONFIG[route.name];
          if (!config) return null;

          const { options } = descriptors[route.key];
          const isFocused = state.index === index;

          const tintColor =
            config.accentColor ?? (isFocused ? '#111111' : '#A1A1AA');

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={isFocused ? { selected: true } : {}}
              accessibilityLabel={options.tabBarAccessibilityLabel ?? config.label}
              onPress={onPress}
              onLongPress={onLongPress}
              style={({ pressed }) => [
                styles.tabItem,
                isFocused && styles.tabItemActive,
                pressed && styles.tabItemPressed,
              ]}>
              {config.renderIcon(tintColor)}
              <Text
                style={[
                  styles.tabLabel,
                  { color: tintColor },
                  isFocused && styles.tabLabelActive,
                ]}>
                {config.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      screenOptions={{
        headerShown: false,
      }}>
      <Tabs.Screen name="home" options={{ title: '홈' }} />
      <Tabs.Screen name="record" options={{ title: '기록' }} />
      <Tabs.Screen name="workout" options={{ title: '코치' }} />
      <Tabs.Screen name="profile" options={{ title: '나' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 44,
    right: 44,
    alignItems: 'center',
  },
  pillContainer: {
    width: '100%',
    height: 66,
    borderRadius: 33,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#EBEBED',
    padding: 5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
  },
  tabItem: {
    flex: 1,
    height: '100%',
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tabItemActive: {
    backgroundColor: '#F6F6F7',
  },
  tabItemPressed: {
    opacity: 0.75,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: -0.2,
  },
  tabLabelActive: {
    fontWeight: '700',
  },
});
