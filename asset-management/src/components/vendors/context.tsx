"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useLoadOnDemand, useRequestLoad, type LoadOptions } from "@/lib/lazy";
import { apiDelete, apiGetAll, apiPatch, apiPost } from "@/lib/api";
import type { Vendor, VendorType } from "@/components/vendors/data";

type VendorInput = {
  name: string;
  type: VendorType;
  email: string;
  phone: string;
  status: "Active" | "Inactive";
  // Business/address/procurement/notes fields — now persisted server-side
  // (see organization.models.Vendor); all optional, matching the model's
  // blank=True columns.
  companyName?: string;
  contactPerson?: string;
  vendorCode?: string;
  gstNumber?: string;
  address?: string;
  city?: string;
  state?: string;
  country?: string;
  postalCode?: string;
  paymentTerms?: string;
  currency?: string;
  notes?: string;
};

type VendorsContextValue = {
  requestLoad: () => void;
  vendors: Vendor[];
  createVendor: (input: VendorInput) => Promise<Vendor>;
  updateVendor: (id: number, input: VendorInput) => Promise<Vendor>;
  deleteVendor: (id: number) => Promise<void>;
};

const VendorsContext = createContext<VendorsContextValue | null>(null);

// The backend's CapitalizedStatusField ALWAYS returns "Active"/"Inactive"
// (capitalized) on read — see CapitalizedStatusField.to_representation in
// organization/serializers.py — so no runtime comparison is needed here.
//
// `vendor_type` is the raw internal key (e.g. "distributor"), while `type`
// is a read-only SerializerMethodField echoing the human label (e.g.
// "Distributor") — see VendorSerializer.get_type. The frontend's VendorType
// union is the human-label form, so reads must map from `type`; writes
// still go through `vendor_type` (fuzzy-matched server-side either way).
type BackendVendor = {
  id: number;
  name: string;
  email: string;
  phone: string;
  vendor_type: string;
  type: string;
  status: "Active" | "Inactive";
  company_name: string;
  contact_person: string;
  vendor_code: string;
  gst_number: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postal_code: string;
  payment_terms: string;
  currency: string;
  notes: string;
};

function fromBackend(vendor: BackendVendor): Vendor {
  return {
    id: vendor.id,
    name: vendor.name,
    type: vendor.type as VendorType,
    email: vendor.email,
    phone: vendor.phone,
    status: vendor.status as "Active" | "Inactive",
    companyName: vendor.company_name || undefined,
    contactPerson: vendor.contact_person || undefined,
    vendorCode: vendor.vendor_code || undefined,
    gstNumber: vendor.gst_number || undefined,
    address: vendor.address || undefined,
    city: vendor.city || undefined,
    state: vendor.state || undefined,
    country: vendor.country || undefined,
    postalCode: vendor.postal_code || undefined,
    paymentTerms: vendor.payment_terms || undefined,
    currency: vendor.currency || undefined,
    notes: vendor.notes || undefined,
  };
}

function toBackend(input: VendorInput) {
  return {
    name: input.name,
    vendor_type: input.type,
    email: input.email,
    phone: input.phone,
    status: input.status,
    company_name: input.companyName ?? "",
    contact_person: input.contactPerson ?? "",
    gst_number: input.gstNumber ?? "",
    address: input.address ?? "",
    city: input.city ?? "",
    state: input.state ?? "",
    country: input.country ?? "",
    postal_code: input.postalCode ?? "",
    payment_terms: input.paymentTerms ?? "",
    currency: input.currency ?? "",
    notes: input.notes ?? "",
  };
}

export function VendorsProvider({ children }: { children: ReactNode }) {
  const [vendors, setVendors] = useState<Vendor[]>([]);

  const [loadRequested, requestLoad] = useLoadOnDemand();

  // Loads the first time a component on screen reads this context (see lib/lazy.ts).
  useEffect(() => {
    if (!loadRequested) return;
    void apiGetAll<BackendVendor>("/organization/vendors/")
      .then((items) => setVendors(items.map(fromBackend)))
      .catch(() => setVendors([]));
  }, [loadRequested]);

  async function createVendor(input: VendorInput) {
    const created = await apiPost<BackendVendor>("/organization/vendors/", toBackend(input));
    const vendor = fromBackend(created);
    setVendors((prev) => [...prev, vendor]);
    return vendor;
  }

  async function updateVendor(id: number, input: VendorInput) {
    const updated = await apiPatch<BackendVendor>(`/organization/vendors/${id}/`, toBackend(input));
    const vendor = fromBackend(updated);
    setVendors((prev) => prev.map((v) => (v.id === id ? vendor : v)));
    return vendor;
  }

  async function deleteVendor(id: number) {
    await apiDelete(`/organization/vendors/${id}/`);
    setVendors((prev) => prev.filter((v) => v.id !== id));
  }

  return (
    <VendorsContext.Provider value={{ requestLoad, vendors, createVendor, updateVendor, deleteVendor }}>
      {children}
    </VendorsContext.Provider>
  );
}

export function useVendors(options?: LoadOptions) {
  const ctx = useContext(VendorsContext);
  useRequestLoad(ctx?.requestLoad, options);
  if (!ctx) throw new Error("useVendors must be used within a VendorsProvider");
  return ctx;
}
