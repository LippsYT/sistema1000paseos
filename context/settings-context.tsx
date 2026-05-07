

"use client";

import * as React from "react";

type Settings = {
  appName: string;
  appLogo?: string;
};

type SettingsContextType = {
  settings: Settings;
  setSettings: (settings: Partial<Settings>) => void;
  isLoading: boolean;
};

const SettingsContext = React.createContext<SettingsContextType | undefined>(
  undefined
);

const defaultSettings: Settings = {
  appName: "1000 Paseos",
  appLogo: undefined,
};

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettingsState] = React.useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = React.useState(true);

  React.useEffect(() => {
    try {
      const storedSettingsJson = localStorage.getItem("appSettings");
      if (storedSettingsJson) {
        const storedSettings = JSON.parse(storedSettingsJson);
        setSettingsState(storedSettings);
      }
    } catch (error) {
        console.error("Failed to load settings from localStorage", error)
    } finally {
        setIsLoading(false);
    }
  }, []);

  const handleSetSettings = (newSettings: Partial<Settings>) => {
    setSettingsState((prevSettings) => {
      const updatedSettings = { ...prevSettings, ...newSettings };
      try {
        localStorage.setItem("appSettings", JSON.stringify(updatedSettings));
      } catch (error) {
        console.error("Failed to save settings to localStorage", error);
      }
      return updatedSettings;
    });
  };

  const value = {
    settings,
    setSettings: handleSetSettings,
    isLoading,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = React.useContext(SettingsContext);
  if (context === undefined) {
    throw new Error("useSettings must be used within a SettingsProvider");
  }
  return context;
}
