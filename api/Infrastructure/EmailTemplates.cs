using System.Net;

namespace AssetHub.Api.Infrastructure;

/// <summary>
/// Generates fully-formed, responsive HTML emails for every transactional flow
/// in AssetHub. Each method returns a complete HTML document ready to send via
/// Resend. Keep presentation only here — no business logic.
/// </summary>
public static class EmailTemplates
{
    // ── Public template methods ───────────────────────────────────────────

    public static string Welcome(string displayName, string workspaceName, string loginUrl) =>
        Wrap("Welcome to AssetHub", $"""
            {Heading($"Welcome, {H(displayName)}!")}
            <p style="{BodyText}">Your AssetHub workspace <strong>{H(workspaceName)}</strong> is set up and ready. Start adding assets, managing inventory, and tracking your team's equipment — all in one place.</p>
            {Cta("Sign in to AssetHub", loginUrl)}
            {Divider}
            {MutedNote("If you didn't create this account, you can safely ignore this email.")}
            """);

    public static string VerifyEmail(string displayName, string link) =>
        Wrap("Verify your email — AssetHub", $"""
            {Heading("Verify your email address")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}">Please confirm your email address so we know it's really you. Click the button below to activate your account.</p>
            {Cta("Verify Email Address", link)}
            {Divider}
            {MutedNote("This link expires in <strong>24 hours</strong>. If you didn't create an AssetHub account, you can safely ignore this email.")}
            """);

    public static string PasswordReset(string displayName, string link) =>
        Wrap("Reset your password — AssetHub", $"""
            {Heading("Reset your password")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}">We received a request to reset the password on your AssetHub account. Click the button below to set a new password.</p>
            {Cta("Set New Password", link)}
            {Divider}
            {MutedNote("This link expires in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password won't be changed.")}
            """);

    public static string AdminPasswordReset(string displayName, string tenantName, string link) =>
        Wrap("Password reset — AssetHub", $"""
            {Heading("Your password has been reset")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}">An administrator of the workspace <strong>{H(tenantName)}</strong> has initiated a password reset for your AssetHub account. Click the button below to choose a new password.</p>
            {Cta("Set New Password", link)}
            {Divider}
            {MutedNote("This link expires in <strong>1 hour</strong>. If you believe this was done in error, contact your workspace administrator.")}
            """);

    public static string WorkspaceInvite(string tenantName, string role, string link) =>
        Wrap($"You've been invited to {tenantName} — AssetHub", $"""
            {Heading("You've been invited!")}
            <p style="{BodyText}">You've been invited to join the AssetHub workspace <strong>{H(tenantName)}</strong> as a <strong>{H(role)}</strong>.</p>
            <p style="{BodyText}">Accept the invitation below to get started. You'll be asked to create a password on your first sign-in.</p>
            {Cta("Accept Invitation", link)}
            {Divider}
            {MutedNote("This invitation expires in <strong>7 days</strong>. If you weren't expecting this, you can safely ignore it.")}
            """);

    public static string AssetAssigned(string displayName, string assetName, string? notes, string link) =>
        Wrap($"Asset assigned to you — AssetHub", $"""
            {Heading("An asset has been assigned to you")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}">The following asset has been assigned to you in AssetHub:</p>
            {InfoCard(assetName)}
            {(string.IsNullOrWhiteSpace(notes) ? "" : $"<p style=\"{BodyText}\"><strong>Note:</strong> {H(notes)}</p>")}
            {Cta("View Asset", link)}
            """);

    public static string RequestApproved(string displayName, string requestTitle, string? notes, string link) =>
        Wrap($"Request approved — AssetHub", $"""
            {Heading("Your request has been approved")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            {StatusBadge("Approved", "#16a34a", "#dcfce7")}
            <p style="{BodyText}">Your request <strong>{H(requestTitle)}</strong> has been approved.</p>
            {(string.IsNullOrWhiteSpace(notes) ? "" : $"<p style=\"{BodyText}\"><strong>Notes:</strong> {H(notes)}</p>")}
            {Cta("View Details", link)}
            """);

    public static string RequestRejected(string displayName, string requestTitle, string? reason, string link) =>
        Wrap($"Request rejected — AssetHub", $"""
            {Heading("Your request was not approved")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            {StatusBadge("Rejected", "#dc2626", "#fee2e2")}
            <p style="{BodyText}">Your request <strong>{H(requestTitle)}</strong> was not approved.</p>
            {(string.IsNullOrWhiteSpace(reason) ? "" : $"<p style=\"{BodyText}\"><strong>Reason:</strong> {H(reason)}</p>")}
            {Cta("View Details", link)}
            """);

    public static string MaintenanceAssigned(string displayName, string assetName, string ticketTitle, string priority, string link) =>
        Wrap($"Maintenance task assigned — AssetHub", $"""
            {Heading("Maintenance task assigned to you")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}">You've been assigned a maintenance task in AssetHub:</p>
            {InfoCard(ticketTitle, $"Asset: {H(assetName)} &nbsp;·&nbsp; Priority: {H(priority)}")}
            {Cta("View Ticket", link)}
            """);

    public static string TeamInvite(string displayName, string inviterName, string teamName, string role, string link) =>
        Wrap($"Team invitation — AssetHub", $"""
            {Heading("You've been added to a team")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}"><strong>{H(inviterName)}</strong> has invited you to join the team <strong>{H(teamName)}</strong> as a <strong>{H(role)}</strong>.</p>
            {Cta("View Team", link)}
            {Divider}
            {MutedNote("If you weren't expecting this, contact your workspace administrator.")}
            """);

    public static string OrgJoinRequest(string adminDisplayName, string requesterName, string requesterEmail, string orgName, string link) =>
        Wrap($"New join request — AssetHub", $"""
            {Heading("New join request")}
            <p style="{BodyText}">Hi {H(adminDisplayName)},</p>
            <p style="{BodyText}"><strong>{H(requesterName)}</strong> ({H(requesterEmail)}) has requested to join the workspace <strong>{H(orgName)}</strong>.</p>
            {Cta("Review Request", link)}
            """);

    public static string OrgJoinApproved(string displayName, string orgName, string link) =>
        Wrap($"Join request approved — AssetHub", $"""
            {Heading("Your request was approved!")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            {StatusBadge("Approved", "#16a34a", "#dcfce7")}
            <p style="{BodyText}">Your request to join <strong>{H(orgName)}</strong> on AssetHub has been approved. Click below to sign in.</p>
            {Cta("Sign in to AssetHub", link)}
            """);

    public static string OrgJoinRejected(string displayName, string orgName) =>
        Wrap($"Join request update — AssetHub", $"""
            {Heading("Join request update")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            {StatusBadge("Not approved", "#dc2626", "#fee2e2")}
            <p style="{BodyText}">Unfortunately, your request to join <strong>{H(orgName)}</strong> was not approved. Please contact the workspace administrator for more information.</p>
            """);

    public static string Notification(string title, string? body, string? link, string? linkLabel = null) =>
        Wrap(title, $"""
            {Heading(H(title))}
            {(string.IsNullOrWhiteSpace(body) ? "" : $"<p style=\"{BodyText}\">{H(body)}</p>")}
            {(string.IsNullOrWhiteSpace(link) ? "" : Cta(linkLabel ?? "View in AssetHub", link))}
            """);

    public static string WarrantyExpiry(string displayName, IEnumerable<(string AssetName, string TypeName, string ExpiresOn, int DaysLeft)> items) =>
        Wrap("Warranty expiry notice — AssetHub", $"""
            {Heading("Warranty expiry notice")}
            <p style="{BodyText}">Hi {H(displayName)},</p>
            <p style="{BodyText}">The following assets have warranties expiring soon:</p>
            {WarrantyTable(items)}
            <p style="{BodyText}">Sign in to AssetHub to review and act on these items.</p>
            """);

    // ── Private helpers ───────────────────────────────────────────────────

    const string BodyText = "margin:0 0 16px 0;color:#374151;font-size:15px;line-height:24px;";
    const string Divider   = "<hr style=\"border:none;border-top:1px solid #e5e7eb;margin:28px 0;\">";

    static string H(string? s) => WebUtility.HtmlEncode(s ?? "");

    static string Heading(string text) =>
        $"<h2 style=\"margin:0 0 20px 0;font-size:22px;font-weight:700;color:#111827;line-height:1.3;\">{text}</h2>";

    static string Cta(string label, string url) =>
        $"""
        <div style="text-align:center;margin:32px 0;">
          <a href="{WebUtility.HtmlEncode(url)}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;padding:14px 36px;border-radius:8px;font-weight:600;font-size:15px;letter-spacing:0.01em;">
            {H(label)}
          </a>
        </div>
        <p style="text-align:center;margin:0 0 16px 0;font-size:12px;color:#9ca3af;">
          Or copy this link: <a href="{WebUtility.HtmlEncode(url)}" style="color:#4f46e5;">{WebUtility.HtmlEncode(url)}</a>
        </p>
        """;

    static string MutedNote(string html) =>
        $"<p style=\"margin:0;font-size:12px;color:#9ca3af;line-height:20px;\">{html}</p>";

    static string InfoCard(string title, string? subtitle = null) =>
        $"""
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px 20px;margin:20px 0;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#111827;">{H(title)}</p>
          {(subtitle is null ? "" : $"<p style=\"margin:6px 0 0 0;font-size:13px;color:#6b7280;\">{subtitle}</p>")}
        </div>
        """;

    static string StatusBadge(string label, string textColor, string bgColor) =>
        $"""
        <div style="margin:0 0 20px 0;">
          <span style="display:inline-block;background:{bgColor};color:{textColor};font-size:13px;font-weight:600;padding:4px 12px;border-radius:999px;">
            {H(label)}
          </span>
        </div>
        """;

    static string WarrantyTable(IEnumerable<(string AssetName, string TypeName, string ExpiresOn, int DaysLeft)> items)
    {
        var rows = string.Join("", items.Select(i =>
        {
            var urgency = i.DaysLeft <= 1 ? "#dc2626" : i.DaysLeft <= 7 ? "#d97706" : "#374151";
            return $"""
                <tr>
                  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#111827;font-weight:500;">{H(i.AssetName)}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:#6b7280;">{H(i.TypeName)}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:{urgency};font-weight:600;">{H(i.ExpiresOn)}</td>
                  <td style="padding:10px 12px;border-bottom:1px solid #f3f4f6;font-size:14px;color:{urgency};font-weight:600;">{i.DaysLeft}d left</td>
                </tr>
                """;
        }));

        return $"""
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;margin:20px 0;font-family:inherit;">
              <thead>
                <tr style="background:#f9fafb;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Asset</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Type</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Expires</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;border-bottom:1px solid #e5e7eb;">Days Left</th>
                </tr>
              </thead>
              <tbody>
                {rows}
              </tbody>
            </table>
            """;
    }

    // ── HTML shell ────────────────────────────────────────────────────────

    static string Wrap(string title, string content) => $"""
        <!DOCTYPE html>
        <html lang="en" xmlns="http://www.w3.org/1999/xhtml">
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <title>{H(title)}</title>
        </head>
        <body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#f1f5f9;">
            <tr>
              <td style="padding:48px 20px;">
                <table align="center" width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;margin:0 auto;">

                  <!-- Logo -->
                  <tr>
                    <td style="padding:0 0 28px 0;text-align:center;">
                      <span style="font-size:26px;font-weight:800;color:#1e293b;letter-spacing:-0.5px;">
                        Asset<span style="color:#4f46e5;">Hub</span>
                      </span>
                    </td>
                  </tr>

                  <!-- Card -->
                  <tr>
                    <td style="background:#ffffff;border-radius:16px;padding:40px 48px;border:1px solid #e2e8f0;box-shadow:0 1px 3px 0 rgba(0,0,0,0.05);">
                      {content}
                    </td>
                  </tr>

                  <!-- Footer -->
                  <tr>
                    <td style="padding:28px 0 0 0;text-align:center;">
                      <p style="margin:0;color:#94a3b8;font-size:12px;line-height:20px;">
                        © {DateTime.UtcNow.Year} AssetHub &nbsp;·&nbsp; All rights reserved
                      </p>
                      <p style="margin:4px 0 0 0;color:#cbd5e1;font-size:11px;line-height:18px;">
                        This is a transactional email. Please do not reply directly to this message.
                      </p>
                    </td>
                  </tr>

                </table>
              </td>
            </tr>
          </table>
        </body>
        </html>
        """;
}
