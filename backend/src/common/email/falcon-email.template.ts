export function wrapFalconEmailHtml(
  bodyHtml: string,
  frontendUrl?: string,
): string {
  const dashboardUrl = frontendUrl ?? 'http://localhost:3000';
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Falcon Campus OS</title>
</head>
<body style="margin:0;padding:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#08234a;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f7fb;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
          <tr>
            <td style="background:#08234a;padding:20px 24px;">
              <table role="presentation" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="padding-right:12px;vertical-align:middle;">
                    <div style="width:40px;height:40px;border-radius:10px;background:#d6b65d;display:inline-block;text-align:center;line-height:40px;font-weight:900;color:#08234a;font-size:18px;">F</div>
                  </td>
                  <td style="vertical-align:middle;">
                    <div style="color:#ffffff;font-size:20px;font-weight:800;line-height:1.2;">Falcon</div>
                    <div style="color:#d6b65d;font-size:11px;font-weight:600;letter-spacing:0.12em;text-transform:uppercase;">SGVU Campus OS</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:24px;font-size:15px;line-height:1.6;color:#1f2937;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 24px 24px;">
              <hr style="border:none;border-top:1px solid #eaeaea;margin-top:8px;" />
              <p style="color:#888;font-size:12px;line-height:1.6;margin:16px 0 0;">
                Sent securely via <strong>Falcon Campus OS</strong> for SGVU.<br />
                <a href="${dashboardUrl}" style="color:#d6b65d;text-decoration:none;">Access your Falcon Dashboard</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
