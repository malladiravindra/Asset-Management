"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { Location, LocationType } from "@/components/locations/data";

type LocationInput = {
  name: string;
  type: LocationType;
  address: string;
};

type LocationsContextValue = {
  requestLoad: () => void;
  locations: Location[];
  createLocation: (input: LocationInput) => Promise<Location>;
  updateLocation: (id: number, input: LocationInput) => Promise<Location>;
  deleteLocation: (id: number) => Promise<void>;
};

const LocationsContext = createContext<LocationsContextValue | null>(null);

type BackendLocation = { id: number; name: string; type: string; address: string };

function typeFromBackend(type: string): LocationType {
  if (type === "branch_office") return "Branch Office";
  if (type === "remote") return "Remote";
  return "Headquarters";
}

function typeToBackend(type: LocationType): string {
  if (type === "Branch Office") return "branch_office";
  if (type === "Remote") return "remote";
  return "headquarters";
}

function fromBackend(location: BackendLocation): Location {
  return {
    id: location.id,
    name: location.name,
    type: typeFromBackend(location.type),
    address: location.address || "",
  };
}

function toBackend(input: LocationInput) {
  return { name: input.name, type: typeToBackend(input.type), address: input.address };
}

export function LocationsProvider({ children }: { children: ReactNode }) {
  const [locations, setLocations] = useState<Location[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendLocation>("/organization/locations/")
      .then((items) => setLocations(items.map(fromBackend)))
      .catch(() => setLocations([]));
  }, [loadRequested]);

  async function createLocation(input: LocationInput) {
    const created = await apiPost<BackendLocation>("/organization/locations/", toBackend(input));
    const location = fromBackend(created);
    setLocations((prev) => [...prev, location]);
    return location;
  }

  async function updateLocation(id: number, input: LocationInput) {
    const updated = await apiPatch<BackendLocation>(`/organization/locations/${id}/`, toBackend(input));
    const location = fromBackend(updated);
    setLocations((prev) => prev.map((l) => (l.id === id ? location : l)));
    return location;
  }

  async function deleteLocation(id: number) {
    await apiDelete(`/organization/locations/${id}/`);
    setLocations((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <LocationsContext.Provider value={{ requestLoad, locations, createLocation, updateLocation, deleteLocation }}>
      {children}
    </LocationsContext.Provider>
  );
}

export function useLocations(options?: LoadOptions) {
  const ctx = useContext(LocationsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useLocations must be used within a LocationsProvider");
  return ctx;
}
