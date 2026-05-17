# AssetHub — Onboarding Checklist

> **Who this is for:** Administrators setting up AssetHub for their organization.  
> **Time to complete:** ~60–90 minutes for a typical setup.

---

## Phase 1 — Account Setup *(~10 minutes)*

### Step 1.1 — Create your organization

- [ ] Sign up at the AssetHub web address provided by your IT team or account manager
- [ ] Enter your **organization name** (this appears throughout the app)
- [ ] Set your **admin email** and a **strong password**
- [ ] Verify your email address via the confirmation link

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the organization creation wizard / signup page.

---

### Step 1.2 — Configure your profile

- [ ] Go to **Settings** in the sidebar
- [ ] Set your **display name**
- [ ] Optionally set your **profile photo**
- [ ] Choose your preferred **theme** (Light or Dark)

---

### Step 1.3 — Set up email (optional but recommended)

- [ ] Go to **Settings → Email** (or ask your IT admin for SMTP credentials)
- [ ] Enter SMTP host, port, username, and password
- [ ] Send a **test email** to confirm delivery
- [ ] Confirm the sender name shows as desired (e.g., "AssetHub · Your Company")

> Email is required to send password reset links and member invitations.

---

## Phase 2 — Catalog Setup *(~20 minutes)*

### Step 2.1 — Create Locations

Locations represent physical places where assets live (rooms, buildings, warehouses, vehicles).

- [ ] Go to **Locations** in the sidebar
- [ ] Add your **top-level locations** first (e.g., "Main Office", "Warehouse A")
- [ ] Add **sub-locations** as needed (e.g., "Main Office → Floor 2 → Server Room")

> **Tip:** Keep location names short and consistent. Use abbreviations your team will recognize.

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the Locations page with a hierarchy of locations.

---

### Step 2.2 — Create Categories

Categories organize assets into logical groups.

- [ ] Go to **Categories** in the sidebar
- [ ] Add top-level categories (e.g., "IT Equipment", "Furniture", "Vehicles", "Tools")
- [ ] Add sub-categories if needed (e.g., "IT Equipment → Computers → Laptops")

> **Tip:** Start broad — you can always add sub-categories later.

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the Categories page with a sample list.

---

### Step 2.3 — Create Asset Types

Asset Types are templates for individual kinds of assets. They define what custom information is tracked for each type.

- [ ] Go to **Asset Types** in the sidebar
- [ ] For each type (e.g., "Laptop"):
  - [ ] Set a **name** (e.g., "Laptop")
  - [ ] Assign it to a **category** (e.g., "IT Equipment → Computers")
  - [ ] Add **custom fields** that apply (see examples below)
  - [ ] Click **Add**

**Example custom fields for a Laptop:**

| Field Key | Label | Type | Required |
|-----------|-------|------|---------|
| `serial` | Serial Number | Text | Yes |
| `model` | Model | Text | No |
| `purchase_date` | Purchase Date | Date | No |
| `specs` | Specs (RAM/Storage) | Text | No |

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the Add Asset Type form with custom fields filled in for "Laptop".

---

## Phase 3 — Add Assets *(~30 minutes)*

### Option A — Import via CSV *(recommended for 10+ assets)*

- [ ] Download the **CSV import template** from the Assets page
- [ ] Fill in your asset data — one row per asset
- [ ] Go to **Assets → Import**
- [ ] Upload the completed CSV file
- [ ] Review the preview — fix any errors shown
- [ ] Click **Import**

**Required CSV columns:**

| Column | Description |
|--------|-------------|
| `name` | Asset name (required) |
| `assetTypeId` | ID from the Asset Types page |
| `locationId` | ID from the Locations page |
| `status` | `InService`, `InRepair`, `Retired`, `Lost` |
| `serialNumber` | Optional but recommended |
| `purchaseDate` | YYYY-MM-DD format |
| `warrantyUntil` | YYYY-MM-DD format |

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the CSV import page showing the upload area and a preview table.

---

### Option B — Add assets one by one

- [ ] Go to **Assets** in the sidebar
- [ ] Click **+ New Asset**
- [ ] Fill in: Name, Asset Type, Location, Status, Serial Number
- [ ] Fill in any custom fields for the asset type
- [ ] Click **Save**

Repeat for each asset.

---

### Step 3.1 — Print QR Code Labels

- [ ] Select assets in the asset list
- [ ] Click **Print Labels** (or export QR codes)
- [ ] Print on label paper (suggested: 25mm × 25mm or 38mm × 13mm labels)
- [ ] Affix labels to each physical asset in a visible location

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the QR code export/print dialog alongside a photo of a label printed on a laptop.

---

## Phase 4 — Invite Your Team *(~10 minutes)*

### Step 4.1 — Invite members

- [ ] Go to **Members** in the sidebar
- [ ] Click **Invite Member**
- [ ] Enter the person's **email address**
- [ ] Select their **role** (Admin, Manager, or Member)
- [ ] Click **Send Invite**

They'll receive an email with a link to set their password and join.

> **🖼 IMAGE PLACEHOLDER:** Screenshot of the Invite Member dialog.

### Step 4.2 — Verify roles are correct

Review what each role can do:

| Role | Can do |
|------|--------|
| **Admin** | Everything — full control |
| **Manager** | Create/edit assets, manage maintenance, import CSV |
| **Member** | View assets, check out/in, report maintenance |

- [ ] Confirm all invited team members received their invitation emails
- [ ] Ask them to set their password and log in

---

### Step 4.3 — Grant extra permissions (optional)

If someone needs specific access beyond their role (e.g., a Member who should also create assets):

- [ ] Go to **Members**
- [ ] Click the member's name
- [ ] Under **Extra Permissions**, check the specific permissions to add
- [ ] Save

---

## Phase 5 — Test & Go Live *(~10 minutes)*

### Final checks

- [ ] Log in as a **Manager** or **Member** (use a test account or have a colleague test)
- [ ] Confirm they see the correct tabs in the sidebar
- [ ] Scan one QR code with a phone and confirm the asset page loads
- [ ] Check out an asset and confirm it shows as "Checked Out"
- [ ] Check it back in and confirm it returns to "In Service"
- [ ] Submit a test maintenance ticket
- [ ] Confirm notifications arrive after the ticket is submitted

### Announce to your team

- [ ] Send a team-wide message explaining:
  - What AssetHub is for
  - How to scan QR codes
  - How to check out equipment
  - Who to contact for access issues (your admin)

> **🖼 IMAGE PLACEHOLDER:** Sample internal announcement email template — feel free to copy and personalize.

---

## Ongoing Admin Tasks

| Task | Frequency | Where |
|------|-----------|-------|
| Review pending maintenance tickets | Daily / Weekly | Maintenance |
| Check assets with expiring warranties | Monthly | Dashboard → Warranty card |
| Review activity log for anomalies | Monthly | Activity |
| Retire or delete decommissioned assets | As needed | Assets → Edit → Status: Retired |
| Add new members as team grows | As needed | Members → Invite |
| Update asset locations when equipment moves | As needed | Assets → Edit |

---

## Need Help?

| Resource | Link |
|----------|------|
| User Manual | `docs/User-Manual.md` |
| Developer Guide | `docs/Developer-Guide.md` |
| Support email | support@assethub.io *(update with your actual address)* |
| Status page | status.assethub.io *(update with your actual address)* |

---

*AssetHub Onboarding Checklist · May 2026*
