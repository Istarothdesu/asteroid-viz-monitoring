import { createContext, useContext } from 'react';
import type { AsteroidDetailModel } from './types';

export const LD_KM = 384400;

export const AsteroidDetailContext = createContext<AsteroidDetailModel | null>(null);

export function useAsteroidDetail(): AsteroidDetailModel | null {
  return useContext(AsteroidDetailContext);
}
