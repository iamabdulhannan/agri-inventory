export type Role = 'owner' | 'admin' | 'staff'
export type PackUnit = 'ml' | 'l' | 'g' | 'kg' | 'pcs'
export type PackType = 'bottle' | 'can' | 'gallon' | 'drum' | 'bag' | 'packet' | 'box' | 'piece'
export type MovementType = 'purchase' | 'return_in' | 'sale' | 'return_out' | 'damaged' | 'expired' | 'adjustment'

export const IN_TYPES: MovementType[] = ['purchase', 'return_in']
export const OUT_TYPES: MovementType[] = ['sale', 'return_out', 'damaged', 'expired']
export const ALL_TYPES: MovementType[] = [...IN_TYPES, ...OUT_TYPES, 'adjustment']

export interface Organization {
  id: string
  name: string
  address: string | null
  phone: string | null
  expiry_alert_days: number
  timezone: string
  created_at: string
}

export interface Profile {
  id: string
  full_name: string
  email: string | null
}

export interface Membership {
  role: Role
  organizations: Organization
}

export interface Category {
  id: string
  org_id: string
  name: string
  name_ur: string | null
}

export interface Company {
  id: string
  org_id: string
  name: string
}

export interface Product {
  id: string
  org_id: string
  name: string
  name_ur: string | null
  category_id: string
  company_id: string | null
  pack_size: number
  pack_unit: PackUnit
  pack_type: PackType
  min_stock: number
  is_active: boolean
  notes: string | null
  created_at: string
}

/** Row of the product_stock view */
export interface ProductStock extends Product {
  category_name: string
  category_name_ur: string | null
  company_name: string | null
  qty: number
  next_expiry: string | null
  active_batches: number
}

export interface BatchStock {
  id: string
  org_id: string
  product_id: string
  batch_no: string
  mfg_date: string | null
  expiry_date: string
  created_at: string
  qty: number
}

export interface ExpiryAlert {
  batch_id: string
  org_id: string
  product_id: string
  batch_no: string
  mfg_date: string | null
  expiry_date: string
  qty: number
  name: string
  name_ur: string | null
  pack_size: number
  pack_unit: PackUnit
  pack_type: PackType
  company_name: string | null
  days_left: number
}

export interface Movement {
  id: string
  org_id: string
  batch_id: string
  movement_date: string
  type: MovementType
  qty: number
  party: string | null
  reference: string | null
  note: string | null
  created_by: string | null
  created_at: string
  batches?: { batch_no: string; expiry_date: string; product_id: string } | null
  profiles?: { full_name: string } | null
  /** name saved on the entry; kept after the member is removed */
  created_by_name?: string | null
}

export interface SummaryRow {
  product_id: string
  opening: number
  purchased: number
  returned_in: number
  sold: number
  returned_out: number
  damaged: number
  expired: number
  adjusted: number
  closing: number
}

export interface RegisterRow {
  day: string
  product_id: string
  opening: number
  qty_in: number
  qty_out: number
  closing: number
}

/** Who made a stock entry: live profile name, or the saved name if the member was removed */
export const authorOf = (m: Pick<Movement, 'profiles' | 'created_by_name'>) => m.profiles?.full_name || m.created_by_name || ''
