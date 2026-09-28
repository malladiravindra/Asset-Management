"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { LicenseCategory, LicenseType, SoftwareLicense } from "@/components/software-licenses/data";

export type SoftwareLicenseInput = {
  name: string;
  vendor: string;
  category: LicenseCategory;
  licenseType: LicenseType;
  licenseKey: string;
  totalSeats: number;
  seatsUsed: number;
  purchaseDate: Date | null;
  expiryDate: Date | null;
  autoRenew: boolean;
  cost: number;
  notes: string;
};

type SoftwareLicensesContextValue = {
  requestLoad: () => void;
  licenses: SoftwareLicense[];
  createLicense: (input: SoftwareLicenseInput) => Promise<SoftwareLicense>;
  updateLicense: (id: number, input: SoftwareLicenseInput) => Promise<SoftwareLicense>;
  deleteLicense: (id: number) => Promise<void>;
};

const SoftwareLicensesContext = createContext<SoftwareLicensesContextValue | null>(null);

type BackendSoftwareLicense = {
  id: number;
  license_id: string;
  name: string;
  vendor: string;
  category: LicenseCategory;
  license_type: LicenseType;
  license_key: string;
  total_seats: number;
  seats_used: number;
  purchase_date: string | null;
  expiry_date: string | null;
  auto_renew: boolean;
  cost: string | number;
  notes: string;
};

function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

function toISODate(date: Date | null): string | null {
  if (!date) return null;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function fromBackend(license: BackendSoftwareLicense): SoftwareLicense {
  return {
    id: license.id,
    licenseId: license.license_id,
    name: license.name,
    vendor: license.vendor || "",
    category: license.category,
    licenseType: license.license_type,
    licenseKey: license.license_key || "",
    totalSeats: license.total_seats,
    seatsUsed: license.seats_used,
    purchaseDate: toDate(license.purchase_date),
    expiryDate: toDate(license.expiry_date),
    autoRenew: license.auto_renew,
    cost: Number(license.cost) || 0,
    notes: license.notes || "",
  };
}

function toBackend(input: SoftwareLicenseInput) {
  return {
    name: input.name,
    vendor: input.vendor,
    category: input.category,
    license_type: input.licenseType,
    license_key: input.licenseKey,
    total_seats: input.totalSeats,
    seats_used: input.seatsUsed,
    purchase_date: toISODate(input.purchaseDate),
    expiry_date: input.licenseType === "Perpetual" ? null : toISODate(input.expiryDate),
    auto_renew: input.autoRenew,
    cost: input.cost,
    notes: input.notes,
  };
}

export function SoftwareLicensesProvider({ children }: { children: ReactNode }) {
  const [licenses, setLicenses] = useState<SoftwareLicense[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendSoftwareLicense>("/operation/software-licenses/")
      .then((items) => setLicenses(items.map(fromBackend)))
      .catch(() => setLicenses([]));
  }, [loadRequested]);

  async function createLicense(input: SoftwareLicenseInput) {
    const created = await apiPost<BackendSoftwareLicense>("/operation/software-licenses/", toBackend(input));
    const license = fromBackend(created);
    setLicenses((prev) => [license, ...prev]);
    return license;
  }

  async function updateLicense(id: number, input: SoftwareLicenseInput) {
    const updated = await apiPatch<BackendSoftwareLicense>(`/operation/software-licenses/${id}/`, toBackend(input));
    const license = fromBackend(updated);
    setLicenses((prev) => prev.map((l) => (l.id === id ? license : l)));
    return license;
  }

  async function deleteLicense(id: number) {
    await apiDelete(`/operation/software-licenses/${id}/`);
    setLicenses((prev) => prev.filter((l) => l.id !== id));
  }

  return (
    <SoftwareLicensesContext.Provider value={{ requestLoad, licenses, createLicense, updateLicense, deleteLicense }}>
      {children}
    </SoftwareLicensesContext.Provider>
  );
}

export function useSoftwareLicenses(options?: LoadOptions) {
  const ctx = useContext(SoftwareLicensesContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useSoftwareLicenses must be used within a SoftwareLicensesProvider");
  return ctx;
}
