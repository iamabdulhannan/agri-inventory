# Agri Inventory

Stock and expiry management for agricultural medicines (pesticides, fungicides, herbicides), fertilizers and seeds.
React + Vite + Tailwind on the front end, Supabase (Postgres + Auth) on the back end. English and Urdu (RTL).

## Features

- **Organizations**: sign up creates a new organization (you become the owner), or joins an existing one with an invite code. Each organization's data is fully isolated by Row Level Security.
- **Roles**: Owner / Admin / Staff. Staff can add products and record stock. Only admins can delete entries, adjust counts, manage members and change settings.
- **Products with pack sizes**: 100 / 200 / 250 / 400 / 500 / 800 ml, 1 L bottles, 3 / 5 / 10 / 15 / 20 L gallons, g / kg packets and bags, or any custom size. You can create one product in several sizes at once. Stock is counted in packs and also shown in liters or kg.
- **Batches & expiry**: every stock-in records a batch number and expiry date. Expired and soon-to-expire batches (default **60 days / 2 months**, configurable) are pinned at the **top of every screen** and listed first on the dashboard.
- **Stock In**: purchase or customer return, with several items per entry.
- **Stock Out**: sale, return to supplier, damaged, or expired write-off. Batches are picked **earliest expiry first** automatically, or you can choose one yourself.
- **Safety rules enforced in the database**:
  - Stock can never go below zero on any date, including backdated entries.
  - Expired batches cannot be sold.
  - Future dates are rejected.
  - Concurrent sales are locked so the same stock can't be sold twice.
- **Reports** (print / Excel export):
  - **Daily**: opening, in, out, adjustment and closing per product for any day.
  - **Monthly**: the same for the whole month, plus day-by-day totals (packs, liters, kg).
  - **Day by day**: a register for one product showing the balance every day.
  - **Stock on date**: stock for every product on any past date, grouped by category.
  - **Expiry**: expired, within 30 days, within the alert window, or all batches.
- **Stock history**: every entry with filters, search and Excel export. Admins can delete wrong entries, and stock is recalculated.

## Setup

### 1. Create the Supabase project

1. Create a project at <https://supabase.com>.
2. Open **SQL Editor** and run each migration file in order (paste the whole file, click **Run**):
   1. `supabase/migrations/001_schema.sql`: tables, security, reports
   2. `supabase/migrations/002_one_org_per_user.sql`: one account = one organization
   3. `supabase/migrations/003_password_reset.sql`: owner/admin can reset member passwords
   4. `supabase/migrations/004_remove_member.sql`: removing a member deletes their account and signs them out (stock history keeps their name)
   5. `supabase/migrations/005_sales_khata.sql`: prices, sales invoices and receipts, purchases, khata (customer and supplier ledgers), roznamcha and profit
   6. `supabase/migrations/006_sale_returns.sql`: customer returns against a sale invoice (credit to khata or cash refund)
   7. `supabase/migrations/007_opening_stock.sql`: opening stock (no cash or khata entry), used by single and bulk stock-in
   8. `supabase/migrations/008_edit_stock_in.sql`: edit purchases and single stock-in lines (owner / admin)
   9. `supabase/migrations/009_delete_stock_in_line.sql`: delete a wrong purchase / stock-in line (owner / admin)
   10. `supabase/migrations/010_loose_sale.sql`: sell bags loose by kg (sale and invoice returns)
   11. `supabase/migrations/011_precise_qty.sql`: exact loose sales from any bag size (e.g. 10 kg from a 60 kg bag)
3. Under **Authentication → URL Configuration**:
   - Set **Site URL** to your app URL (`http://localhost:5173` while developing).
   - Add `http://localhost:5173/**` and your production URL `/**` to **Redirect URLs**.
4. Optional: under **Authentication → Sign In / Providers → Email**, turn off **Confirm email** if you want users to sign in straight after signing up.

### 2. Run the app

```bash
cp .env.example .env      # then fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # http://localhost:5173
```

Both values are in **Project Settings → API** (use the *anon / public* key, never the service-role key).

### 3. Deploy

```bash
npm run build             # outputs dist/
```

Deploy `dist/` to Vercel, Netlify or Cloudflare Pages. `vercel.json` and `public/_redirects` are already included so page refreshes work. Add the two `VITE_SUPABASE_*` environment variables in the hosting dashboard, and add the production URL to Supabase Redirect URLs.

## Passwords (no email needed)

The app sends **no emails** while `VITE_EMAILS_ENABLED=false` in `.env`. Keep it that way until custom SMTP is set up in Supabase. Also turn **Confirm email** off in Supabase (Authentication → Sign In / Providers).

- **Staff or admin forgot their password:** the owner opens **Settings → Members → Reset password** and sets a new one. Admins can reset staff passwords. The member is signed out on all devices.
- **Change your own password:** use **Settings → My profile → Change password**.
- **Owner forgot password:** open `supabase/tools/reset_owner_password.sql` and put in the owner's email and a new password. Run it in the Supabase SQL Editor, then sign in with the new password.

When Gmail or other SMTP is configured, set `VITE_EMAILS_ENABLED=true` to turn the email-based "Forgot password" link and confirmation emails back on.

## Sales, khata and roznamcha

- **Prices:** each product and pack size has a **purchase rate** and an **MRP**. Stock In records the rate you paid, and the product keeps the latest one.
- **New Sale:** choose a walk-in customer or a khata customer. The rate is filled in from the MRP and can be changed. Add any discount and the amount received; the unpaid balance goes to the customer's khata. A receipt is shown, which you can print on 80 mm thermal paper or A4.
- **Profit** uses the actual cost of the batch that was sold, so it is exact even when purchase rates change.
- **Khata:** customers and suppliers, with opening balance, full ledger, running balance and "Receive payment" / "Pay supplier".
- **Roznamcha:** daily cash book showing opening cash, every cash in and out (sales, purchases, khata payments, expenses, cash in/out) and closing cash. There is also a month view.
- **Invoices:** every sale and purchase. Reprint receipts here; admins can void an invoice, which returns its stock and removes its khata and roznamcha entries.
- **Optional test prices:** `supabase/seed/sample_prices.sql` fills in rough prices for products that have none.

## Bulk stock in (Excel / CSV)

Go to **Stock In → Bulk import (Excel / CSV)**.
1. Download **Template with my products**. It has one row per product, with name, company, pack size and purchase rate already filled. There is also a blank template.
2. For each batch you have, fill in **Batch no, Expiry date, Quantity** (and Mfg date if you like). Leave products you don't have empty. Save as **.xlsx** or **.csv**.
3. Upload the file and check the preview. Rows with problems (missing expiry, unknown size, conflicting batch and so on) are shown in red and skipped. Products that aren't in your list yet are created automatically (you can turn this off).
4. Choose **Opening stock** (no cash or khata entry) or **Purchase** (supplier, invoice, paid now), then click **Save**.

Dates can be Excel dates, 30/06/2028, 2028-06-30, 30-Jun-2028, or 06/2028 (end of month).

## Daily use

1. **Settings → Invite codes**: create a code for each staff member and share it on WhatsApp. They choose **Join organization** and enter the code.
2. **Products → Add product**: enter the name, company and category, then tick every pack size you stock (e.g. 200 ml, 500 ml, 1 L).
3. **Stock In**: enter the supplier and invoice, then for each item choose the product, batch number, expiry date and quantity.
4. **Stock Out**: choose the product and quantity. The earliest-expiring batch is used automatically.
5. Check the expiry bar at the top every day, and use **Reports** for daily and monthly figures.

## Project structure

```
supabase/migrations/001_schema.sql   tables, RLS policies, triggers, report functions
src/lib/          supabase client, app/auth context, i18n (EN/UR), units, dates, CSV
src/components/   layout + expiry bar, UI kit, product form, product picker, expiry table
src/pages/        Auth, Dashboard, Products, ProductDetail, StockIn, StockOut, Expiry, History, Reports, Settings
```
