"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  type ReactNode,
} from "react";
import {
  useServices,
  useInvalidateServiceData,
  type Service,
} from "@/hooks/queries/use-service-data";

interface ServiceContextValue {
  services: Service[];
  currentService: Service | null;
  setCurrentService: (s: Service) => void;
  refresh: () => Promise<void>;
}

const ServiceContext = createContext<ServiceContextValue | null>(null);

export function useService() {
  const ctx = useContext(ServiceContext);
  if (!ctx) throw new Error("useService must be used within ServiceProvider");
  return ctx;
}

const STORAGE_KEY = "dim_current_service";

export function ServiceProvider({ children }: { children: ReactNode }) {
  const [currentService, setCurrentServiceState] = useState<Service | null>(null);

  const servicesQuery = useServices();
  const invalidate = useInvalidateServiceData();

  const services = servicesQuery.data ?? [];

  // Pick initial service from localStorage once the list loads
  useEffect(() => {
    if (currentService || services.length === 0) return;
    const savedId = typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    const saved = savedId ? services.find((s) => s.id === savedId) : null;
    setCurrentServiceState(saved ?? services[0]);
  }, [services, currentService]);

  const setCurrentService = useCallback((s: Service) => {
    setCurrentServiceState(s);
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_KEY, s.id);
    }
  }, []);

  const refresh = useCallback(async () => {
    invalidate();
  }, [invalidate]);

  const value = useMemo<ServiceContextValue>(
    () => ({
      services,
      currentService,
      setCurrentService,
      refresh,
    }),
    [services, currentService, setCurrentService, refresh],
  );

  return <ServiceContext.Provider value={value}>{children}</ServiceContext.Provider>;
}
