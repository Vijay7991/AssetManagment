# AssetHub — Presentation Outline
## Slide-by-Slide Content for PowerPoint / Google Slides

> **Instructions:** Each section below is one slide. Copy the content into your slide deck. Replace `[IMAGE PLACEHOLDER: ...]` labels with actual screenshots or graphics.

---

## SLIDE 1 — Cover / Title

**Title:** AssetHub
**Subtitle:** Smart Asset Management for Modern Teams
**Tagline:** Track everything. Know where it is. Know who has it.

**Visual:**
`[IMAGE PLACEHOLDER: AssetHub logo centered on a clean gradient background — suggested: dark navy to teal. Add a subtle illustration of connected devices/assets.]`

**Footer:** © 2026 AssetHub · Confidential

---

## SLIDE 2 — The Problem

**Headline:** Do You Know Where Your Assets Are?

**Points:**
- 🔍 Hours wasted searching for equipment
- 📋 Spreadsheets that are always out of date
- ❓ No idea who took what — or when
- ⚠️ Warranty lapses you didn't see coming
- 🔧 Maintenance issues that slip through the cracks

**Visual:**
`[IMAGE PLACEHOLDER: Split graphic — left side shows a messy desk with sticky notes and spreadsheets; right side shows a clean, organized digital dashboard.]`

**Speaker note:** Open with a relatable pain point: "How many of you have ever wasted 20 minutes looking for a laptop charger that turned out to be in another department?"

---

## SLIDE 3 — The Solution

**Headline:** Introducing AssetHub

**Body:**
AssetHub is a **cloud-based asset tracking platform** that gives your entire organization a single source of truth for every asset — from laptops to forklifts.

**Three pillars:**
1. 📦 **Track** — Every asset, every location, every status. In real time.
2. 🤝 **Manage** — Checkouts, maintenance, warranties — all in one place.
3. 🔒 **Control** — Role-based access so the right people see the right things.

**Visual:**
`[IMAGE PLACEHOLDER: AssetHub dashboard screenshot showing KPI cards and the asset list with status badges.]`

---

## SLIDE 4 — Key Features Overview

**Headline:** Everything You Need. Nothing You Don't.

| Feature | Benefit |
|---------|---------|
| Asset Registry | Central database for all your assets |
| QR Code Scanning | Instant lookup — just point your phone |
| Check Out / Check In | Know who has what, right now |
| Maintenance Tickets | Report and track repairs end to end |
| Role-Based Access | Admins, Managers, Members — each sees what they need |
| Warranty Tracking | Get alerted before warranties expire |
| Activity Audit Log | Full history — who did what and when |
| Multi-Organization | One account, multiple companies or departments |

**Visual:**
`[IMAGE PLACEHOLDER: Icon grid showing each feature with a clean lucide-style icon.]`

---

## SLIDE 5 — How It Works

**Headline:** Simple 3-Step Workflow

**Step 1 — Set Up**
Admin adds assets, locations, and categories. Invites team members.

**Step 2 — Track**
Members scan QR codes or search to find assets. Check out with one tap.

**Step 3 — Manage**
Managers see live status. Maintenance team gets tickets. Everyone gets notified.

**Visual:**
`[IMAGE PLACEHOLDER: Three-step horizontal flow diagram with icons — Setup (gear icon) → Track (QR scan icon) → Manage (chart icon). Use arrows between steps.]`

---

## SLIDE 6 — Asset Tracking in Action

**Headline:** Real-Time Visibility Across Your Entire Fleet

**Left column (what you see):**
- Total assets: **342**
- In Service: **287**
- In Repair: **18**
- Checked Out: **37**
- Warranty expiring (30d): **12**

**Right column:**
- Filter by status, location, or type
- Click any stat card to jump straight to that filtered list
- Search by name, serial number, or tag

**Visual:**
`[IMAGE PLACEHOLDER: Screenshot of the Dashboard page with the KPI cards and status breakdown highlighted with callout arrows.]`

---

## SLIDE 7 — QR Code Scanning

**Headline:** The Fastest Way to Look Up Any Asset

**Points:**
- Print a QR code label for every asset
- Scan with any smartphone — no app download required
- Instantly opens the asset's full detail page
- Check out or report an issue right from the scan result

**Visual:**
`[IMAGE PLACEHOLDER: Side-by-side: left shows a physical QR code label on a laptop; right shows the AssetHub Scan page on a mobile screen with the asset detail popping up.]`

**Speaker note:** "This turns a 30-second lookup into a 3-second scan."

---

## SLIDE 8 — Role-Based Access Control

**Headline:** The Right Access for Every Person

**Three role cards:**

**👤 Member**
- View and search assets
- Check out / return equipment
- Report maintenance issues

**👔 Manager**
- Everything a Member can do +
- Create and edit assets
- Manage maintenance tickets
- Bulk import assets via CSV

**🛡️ Admin**
- Everything a Manager can do +
- Manage team members
- Set up categories, asset types, locations
- Grant custom permissions

**Visual:**
`[IMAGE PLACEHOLDER: Three column layout with user silhouette icons — Member, Manager, Admin — each with a different badge/shield icon indicating increasing access level.]`

---

## SLIDE 9 — Maintenance Management

**Headline:** Catch Problems Before They Become Crises

**Workflow:**
Open → In Progress → Resolved → Closed

**Features:**
- 4 priority levels: Low, Medium, High, Critical
- Link directly to the affected asset
- Technician notes and timestamps
- Notifications when status changes

**Visual:**
`[IMAGE PLACEHOLDER: Screenshot of the Maintenance tickets page showing a table with status badges (color-coded: orange=Open, blue=InProgress, green=Resolved) and a priority column.]`

---

## SLIDE 10 — Multi-Tenant Architecture

**Headline:** One Platform, Multiple Teams

- Each organization (tenant) is fully **isolated** — no data crosses between them
- A single user account can belong to **multiple organizations**
- Switch between organizations in one click — no re-login required
- Each organization has its own members, assets, and settings

**Use cases:**
- A company with multiple regional offices
- An MSP managing multiple client inventories
- A university with different faculties

**Visual:**
`[IMAGE PLACEHOLDER: Diagram showing one user (center icon) with arrows pointing to three organization circles, each with their own colored asset icons inside.]`

---

## SLIDE 11 — Security & Compliance

**Headline:** Built with Security in Mind

- ✅ JWT-based authentication with short-lived access tokens
- ✅ Bcrypt password hashing
- ✅ Permission enforced on every API endpoint (server-side)
- ✅ Complete audit log — every action is recorded
- ✅ Tenant isolation — strict data boundary per organization
- ✅ HTTPS-only in production
- ✅ Refresh token rotation

**Visual:**
`[IMAGE PLACEHOLDER: Security shield graphic with checkmarks listing the security features alongside it.]`

---

## SLIDE 12 — Technology Stack

**Headline:** Modern, Reliable, and Built to Scale

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 · React · Tailwind CSS |
| Backend | ASP.NET Core 9 · C# |
| Database | PostgreSQL 16 |
| Hosting | Docker · Any cloud (AWS / Azure / GCP / Railway) |
| Auth | JWT + BCrypt |
| Notifications | Built-in (SMTP) |

**Visual:**
`[IMAGE PLACEHOLDER: Technology logo grid — Next.js, React, .NET, PostgreSQL, Docker logos in a clean row.]`

---

## SLIDE 13 — Plans & Pricing

**Headline:** Simple Pricing That Grows With You

| | Free | Pro | Enterprise |
|-|------|-----|-----------|
| Assets | Up to 50 | Unlimited | Unlimited |
| Members | Up to 5 | Unlimited | Unlimited |
| QR scanning | ✅ | ✅ | ✅ |
| Maintenance tickets | ✅ | ✅ | ✅ |
| Bulk import (CSV) | ❌ | ✅ | ✅ |
| Warranty tracking | ❌ | ✅ | ✅ |
| Custom fields | ❌ | ✅ | ✅ |
| Multiple locations | ❌ | ✅ | ✅ |
| SSO / SAML | ❌ | ❌ | ✅ |
| Dedicated support | ❌ | Email | Phone + SLA |
| **Price/month** | **Free** | **$49** | **Contact us** |

**Visual:**
`[IMAGE PLACEHOLDER: Three-column pricing card layout with the Pro column highlighted/recommended. Use a "Most Popular" badge on Pro.]`

---

## SLIDE 14 — Getting Started

**Headline:** Up and Running in Under an Hour

**Step 1 — Sign up** (5 minutes)
Create your organization and invite your admin.

**Step 2 — Add your assets** (30 minutes)
Import a CSV or add assets one by one. Set up categories and locations.

**Step 3 — Invite your team** (5 minutes)
Send email invitations. Roles are assigned automatically.

**Step 4 — Print labels** (15 minutes)
Generate and print QR code labels for each asset.

**Step 5 — Go live** (0 minutes)
Your team can start scanning, checking out, and tracking immediately.

**Visual:**
`[IMAGE PLACEHOLDER: Numbered timeline / roadmap graphic showing the 5 steps from left to right with a rocket icon at the end.]`

---

## SLIDE 15 — Call to Action

**Headline:** Ready to Get Control of Your Assets?

**Body:**
Stop losing time, money, and equipment to manual tracking. AssetHub gives your team the tools they need to work smarter.

**CTA options:**
- 🆓 **Start free** — No credit card required
- 📞 **Book a demo** — 30-minute live walkthrough
- 📧 **Contact sales** — For Enterprise pricing

`[Add your website URL, email, and phone number here]`

**Visual:**
`[IMAGE PLACEHOLDER: Clean, bold CTA graphic — product screenshot on a device mockup (laptop + phone) on the right; headline and buttons on the left.]`

---

## Appendix Slides (optional, for Q&A)

### A1 — Full Feature List
*(Detailed feature breakdown by module)*

### A2 — API & Integrations
*(REST API docs, webhook support, future integrations)*

### A3 — Roadmap
*(Upcoming features: mobile app, barcode support, Slack notifications, SAML SSO)*

### A4 — Customer Success Stories
`[IMAGE PLACEHOLDER: Customer logos or testimonial quotes]`

### A5 — FAQ
- How long does setup take?
- Can we self-host?
- Is there a mobile app?
- How is data backed up?

---

## Design Guidelines for the Slide Deck

| Element | Recommendation |
|---------|---------------|
| Font (headings) | Inter Bold or Poppins SemiBold |
| Font (body) | Inter Regular |
| Primary color | `#0F172A` (navy) |
| Accent color | `#0EA5E9` (sky blue) |
| Background | White or `#F8FAFC` (off-white) |
| Icon style | Lucide icons (match the app) |
| Slide size | 16:9 widescreen |
| Max bullets/slide | 5 |
| Screenshot style | Rounded corners, subtle drop shadow |

---

*AssetHub Presentation Outline · May 2026*
