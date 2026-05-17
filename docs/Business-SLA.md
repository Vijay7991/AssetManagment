# AssetHub — Service Level Agreement (SLA)
## Support & Uptime Policy

**Effective date:** May 2026  
**Applies to:** All AssetHub subscription plans

---

## 1. Overview

This Service Level Agreement ("SLA") describes the uptime commitment, support response times, and remedies that AssetHub provides to customers. By using AssetHub, you agree to the terms described here.

---

## 2. Uptime Commitment

### Target availability

| Plan | Monthly Uptime Target |
|------|----------------------|
| Free | Best effort (no SLA) |
| Pro | **99.5%** |
| Enterprise | **99.9%** |

**Downtime definition:** The AssetHub application is unavailable for end users to log in, view assets, or perform core operations. Scheduled maintenance windows (announced 24 hours in advance) do not count as downtime.

### Uptime calculation

```
Uptime % = ((Total minutes in month − Downtime minutes) / Total minutes in month) × 100
```

### Status & incidents

- **Status page:** Real-time service status is available at the AssetHub status page.
- **Incident notifications:** Subscribers receive email and/or webhook notifications for incidents affecting their region.

---

## 3. Support Channels & Response Times

### By plan

| Support tier | Free | Pro | Enterprise |
|-------------|------|-----|-----------|
| Community forum | ✅ | ✅ | ✅ |
| Email support | ❌ | ✅ | ✅ |
| Priority email | ❌ | ❌ | ✅ |
| Phone / video call | ❌ | ❌ | ✅ |
| Dedicated account manager | ❌ | ❌ | ✅ |

### Response time targets

| Severity | Description | Pro | Enterprise |
|----------|-------------|-----|-----------|
| **P1 — Critical** | System down or data inaccessible | 4 business hours | 1 hour |
| **P2 — High** | Major feature broken, workaround needed | 8 business hours | 4 hours |
| **P3 — Medium** | Feature degraded, workaround available | 2 business days | 1 business day |
| **P4 — Low** | General questions, feature requests | 5 business days | 2 business days |

**Business hours:** Monday–Friday, 09:00–18:00 local time of the account's primary region (excluding public holidays).

---

## 4. Severity Definitions

### P1 — Critical
- All users in the organization are unable to access AssetHub
- Data cannot be read or written
- Security breach or unauthorized data access

### P2 — High
- A core feature (check-out, QR scanning, maintenance tickets) is non-functional for all users
- Performance degradation causing significant delays (> 30 seconds for normal operations)
- Integrations or data import completely broken

### P3 — Medium
- A feature is degraded but a workaround exists
- A subset of users are affected
- Non-critical data is inaccurate or displays incorrectly

### P4 — Low
- General how-to questions
- Feature enhancement requests
- Non-urgent configuration help

---

## 5. Scheduled Maintenance

AssetHub performs scheduled maintenance for upgrades, security patches, and infrastructure updates.

- **Notice period:** At least **24 hours** for standard maintenance; at least **72 hours** for extended windows.
- **Window:** Typically Sundays 02:00–04:00 UTC (subject to change with notice).
- **Communication:** Notification via status page banner and registered admin email.
- **Duration:** Standard windows are expected to last < 30 minutes.

Scheduled maintenance that stays within the declared window is **excluded** from downtime calculations.

---

## 6. Data & Security

### Data residency
Customer data is stored in the selected region at signup. AssetHub does not transfer personal data across regions without explicit consent.

### Backup policy

| Backup type | Frequency | Retention |
|-------------|-----------|-----------|
| Database full backup | Daily | 30 days |
| Database incremental | Hourly | 7 days |
| Application logs | Continuous | 90 days |

### Recovery objectives

| Metric | Target |
|--------|--------|
| Recovery Point Objective (RPO) | < 1 hour |
| Recovery Time Objective (RTO) | < 4 hours |

---

## 7. Service Credits

If AssetHub fails to meet the uptime targets in a given calendar month, Pro and Enterprise customers are eligible for service credits.

| Actual uptime | Credit (% of monthly fee) |
|--------------|--------------------------|
| 99.0% – 99.49% | 10% |
| 95.0% – 98.99% | 25% |
| Below 95.0% | 50% |

**To claim a credit:**
1. Submit a request to support within **14 days** of the end of the affected month
2. Include the approximate time and duration of the outage
3. AssetHub will verify against its monitoring records and apply the credit to the next billing cycle

**Limitations:** Credits are the sole and exclusive remedy for SLA breaches. Credits are not refundable as cash. Credits may not be applied to Free plan accounts.

---

## 8. Exclusions

The following are **not** covered by this SLA:

- Downtime caused by the customer's own network, hardware, or browser
- Force majeure events (natural disasters, internet backbone failures, government actions)
- Scheduled maintenance within the declared window
- Free plan accounts
- Beta or preview features (clearly labeled)
- Issues arising from customer-provided integrations or third-party tools

---

## 9. Customer Responsibilities

To maintain a productive support relationship, customers agree to:

- Keep contact information and billing details up to date
- Designate at least one **technical contact** who can respond to incident-related questions
- Provide sufficient detail when reporting issues (steps to reproduce, screenshots, affected user count)
- Apply security patches to any self-hosted or on-premise installations within 30 days of release

---

## 10. SLA Review & Changes

AssetHub reserves the right to update this SLA with **30 days' notice** to registered admins. The most current version is always available in the AssetHub documentation portal.

---

## 11. Contact

| Channel | Address |
|---------|---------|
| General support | support@assethub.io |
| Security issues | security@assethub.io |
| Billing | billing@assethub.io |
| Status page | status.assethub.io |

> *(Replace the above with your actual contact addresses before distributing.)*

---

*AssetHub Service Level Agreement · May 2026 · v1.0*  
*This document does not constitute a legally binding contract until countersigned by an authorized AssetHub representative. Consult your legal team before distribution to customers.*
