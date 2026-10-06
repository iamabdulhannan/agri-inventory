/** Low stock: a minimum is set and stock has fallen to it (including 0). Used by Dashboard and Products. */
export const isLowStock = (p: { qty: number; min_stock: number }) => p.min_stock > 0 && p.qty <= p.min_stock
