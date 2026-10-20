import type { ReactNode } from 'react';
import { createContext, useContext, useState, useCallback } from 'react';

export type SelectableCountry = 'CL' | 'CO';

const STORAGE_KEY = 'qg_country';

interface CountryContextType {
  country: SelectableCountry | null;
  setCountry: (country: SelectableCountry) => void;
  clearCountry: () => void;
}

const CountryContext = createContext<CountryContextType | undefined>(undefined);

function readStoredCountry(): SelectableCountry | null {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'CL' || stored === 'CO' ? stored : null;
}

export function CountryProvider({ children }: { children: ReactNode }) {
  const [country, setCountryState] = useState<SelectableCountry | null>(readStoredCountry);

  const setCountry = useCallback((next: SelectableCountry) => {
    localStorage.setItem(STORAGE_KEY, next);
    setCountryState(next);
  }, []);

  const clearCountry = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setCountryState(null);
  }, []);

  return (
    <CountryContext.Provider value={{ country, setCountry, clearCountry }}>
      {children}
    </CountryContext.Provider>
  );
}

export function useCountry(): CountryContextType {
  const ctx = useContext(CountryContext);
  if (!ctx) throw new Error('useCountry must be used within a CountryProvider');
  return ctx;
}
