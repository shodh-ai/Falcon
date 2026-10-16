# Password-reset institutional sender

## Current code contract

Password-reset messages use exactly
`Falcon <noreply.ums@mygyanvihar.com>` through the pure
`selectPasswordResetSender()` function. This is the current contract; the dated
notes below describe superseded preparation and runtime observations.

- An absent `PASSWORD_RESET_EMAIL_FROM_ADDRESS` selects the institutional address.
- If the variable is present, its trimmed value must be exactly
  `noreply.ums@mygyanvihar.com`. Empty, malformed or different values fail closed.
- The display name is always exactly `Falcon`.
  `PASSWORD_RESET_EMAIL_FROM_NAME` cannot override that name.
- There is no password-reset fallback to `EMAIL_FROM`, `EMAIL_USER` or a personal
  sender address. Shared `EMAIL_FROM` is not rewritten by this selection.
- The normal reset transport requires TLS. For `smtp.gmail.com`, its authenticated
  principal must match the institutional sender; incompatible authentication fails
  safely rather than silently substituting a personal sender.
- Sender selection does not load credentials, authenticate, send email or activate
  a running process. SMTP/provider errors remain sanitized.

Explicit non-secret configuration, when provisioned in the approved runtime:

```ini
PASSWORD_RESET_EMAIL_FROM_ADDRESS=noreply.ums@mygyanvihar.com
PASSWORD_RESET_EMAIL_FROM_NAME=Falcon
```

Normal reset SMTP configuration still uses `EMAIL_HOST`, `EMAIL_PORT`,
`EMAIL_SECURE`, `EMAIL_USER` and `EMAIL_PASSWORD`. Provision credentials privately;
never paste them into this guide, source control or logs. Shared `EMAIL_FROM`
remains untouched. The reset link origin is `FRONTEND_URL`; configure the intended
frontend explicitly. Normal code still has a deployed-URL fallback if it is absent,
which is unsuitable for isolated testing. Tokens remain one-hour and single-use.

Other email consumers have their own reviewed sender integration; password-reset
selection does not configure those modules. See the
[notification release checklist](notification-release-checklist.md) for the
current shared sender, queue activation and release gates.

## Authorization and delivery evidence

The operator reported Workspace administrator approval on 15 October 2026 for
institutional username/password SMTP, `smtp.gmail.com:587`, mandatory STARTTLS and
SPF/DKIM/DMARC configuration. This report is distinct from privately verifying the
credential loaded by a particular running backend. Mailbox access or a Gmail
Send mail as entry alone is insufficient.

The notification release checklist records one authorized local institutional
notification received on 15 October and one isolated synthetic Mailpit notification
capture on 16 October. Those results do not prove that an old password-reset
process was rebuilt/restarted, that every password-reset flow was retested, or that
hosted staging/production is configured. Inspect the exact intended runtime before
claiming password-reset delivery is corrected. Received-message From, Sender,
Return-Path and Authentication-Results require separate private verification;
never share message bodies or reset links. Display-name changes cannot guarantee
removal of a provider-managed Gmail avatar.

Before activating another runtime, its owner must confirm:

1. The approved institutional authenticated principal and privately provisioned
   credential; do not pair a personal account secret with the institutional user.
2. The approved endpoint, port, TLS and authentication method, organizational
   restrictions and any applicable relay source-IP authorization.
3. Permission to send as the final institutional address, plus envelope/bounce
   handling and provider rewriting policy.
4. SPF/DKIM/DMARC alignment and the approved recipients/quota for a controlled test.
5. The exact backend checkout, compiled artifact, loaded configuration source and
   frontend API destination. A file edit does not update an existing process.

## Current isolated notification test path

Use the [notification release checklist](notification-release-checklist.md) and its
linked notification-staging preparation files for current capture evidence and
remaining execution gates. The guarded capture path uses a synthetic recipient,
dedicated resources and local Mailpit; it does not prove Google SMTP authorization
or institutional inbox delivery. Do not replay a previously captured intent.

AuthService also has an optional injected password-reset delivery boundary. Normal
AuthModule does not bind an acceptance transport. The older password-reset
acceptance runner, schema/bootstrap preparation and local diagnostic runtimes are
independent work and are **not required or included by this sender/notification
review branch**. Their historical references below are not current execution
instructions. This guide does not authorize startup, SQL, SMTP or deployment.

## Historical notes — not the current sender contract

The following dated findings and procedures are retained to explain the earlier
personal-Gmail issue. Fallback and activation statements in these notes describe
older code, not the current institutional-only selector above. PIDs and file
observations must never be reused as current runtime evidence.

## Historical local sender diagnosis — 2026-10-14

The source selects the reset address override first, then shared `EMAIL_FROM`,
then `EMAIL_USER`. SMTP authentication uses `EMAIL_USER` independently. The
provider may rewrite an unauthorized From header; code inspection alone cannot
establish rewriting of a particular received message.

Read-only evidence at review time:

- Two Node listeners own port 4000: PID 8573 from the original backend checkout
  (IPv6 wildcard), and PID 96168 from this worktree (IPv4 loopback). Reidentify
  processes before any future restart; these IDs are observations only.
- Both compiled `dist/auth/auth.service.js` files lack the sender-address override;
  the current feature source supports it. Both compiled artifacts are stale
  relative to this feature, regardless of which process handled the request.
- Processes started at 16:58:52 and 14:36:41 local time. The original checkout's
  `.env` was modified later, at 19:23:26. Default Nest configuration loads dotenv
  at startup; a file edit does not refresh a running process. Inherited environment
  values take precedence over dotenv values.
- This worktree backend has no `.env`. Masked comparison of the original file
  finds SMTP login and shared sender matching the final institutional address,
  Gmail SMTP selected, and reset-specific overrides absent. No values were copied.
- Process environments and the received message's headers were not inspected.
  The exact sender process, its loaded sender and provider rewriting are unproven.
  The disk file cannot establish the configuration used for an earlier email.

No sender-selection defect is confirmed in current source. Old compiled code,
multiple listeners and a configuration file newer than both processes are proven
configuration/deployment mismatches. They do not by themselves prove the cause of
that particular received message. Institutional authorization remains unverified.

### Gated correction procedure

1. Ask the Workspace administrator to confirm the authenticated principal's send-as
   authorization for `noreply.ums@mygyanvihar.com`, approved SMTP/relay host, port,
   TLS and authentication method. If App Password authentication is approved, the
   credential must belong to the authorized account and comply with organization
   policy; do not pair a personal account's secret with a different username.
   For OAuth confirm approved client/scopes and mailbox authorization; for relay
   confirm sender restrictions and source IP allowlisting. Verify SPF/DKIM/DMARC
   alignment, envelope/bounce handling and From rewriting policy.
2. If the existing shared SMTP principal is authorized, explicitly configure only
   `PASSWORD_RESET_EMAIL_FROM_ADDRESS=noreply.ums@mygyanvihar.com` and
   `PASSWORD_RESET_EMAIL_FROM_NAME=Falcon` in the approved backend environment.
   Preserve shared `EMAIL_FROM` and SMTP. If it is unauthorized, stop: dedicated
   reset-only credentials/transport require a separate reviewed change because
   the normal transport currently shares EMAIL_* settings.
3. With separate build/restart approval, identify the intended listener and its
   environment source. Do not implicitly stop the original checkout. From this
   worktree's backend run `./node_modules/.bin/tsc -p tsconfig.build.json --incremental false`,
   then use the reviewed local startup workflow with the authorized environment.
   Inspect startup first: normal startup may initialize schema and workers.
   Do not copy an environment file or use acceptance mode for institutional SMTP.
4. Verify that the frontend targets this intended listener and compiled code.
   Restart is necessary to reload configuration; production redeployment is a
   separate approval. Do not assume a source edit or `.env` edit updated a process.
5. After authorization and explicit email-test approval, verify authentication and
   send one reset to an approved recipient. Privately inspect From, Sender,
   Return-Path and Authentication-Results without exposing message bodies or reset
   links. Report sender/alignment checks and actual inbox receipt separately.

This review did not restart processes, activate a sender, edit environment files,
connect to SMTP, or establish institutional authorization or delivery.

## Historical administrator read-only checklist — 2026-10-14

Do not add an address, send verification mail, generate credentials or save Admin
changes during this check. Record non-secret answers only.

1. Admin Console > Directory > Users: search the final address. Confirm whether it
   is an active primary user with Gmail enabled, or an alias of an existing user.
   For an alias, open its owner > Add Alternate Emails > Show all alternate emails
   and inspect only. An alias has no independent login/App Password; identify the
   primary account. If it is a group, stop and request the approved application
   sending arrangement rather than treating it as a mailbox.
2. Identify the actual intended SMTP authenticated account, not merely the account
   currently open in a browser. If the final address is its primary address, a
   separate alias Send mail as entry is unnecessary. If it is a different address,
   open that authenticated account's Gmail > Settings > See all settings > Accounts
   (or Accounts and Import) > Send mail as. Inspect whether the final address is
   already configured and verification is complete. Do not click Add/Verify/Save.
   This is evidence about Gmail configuration, not proof Nodemailer may use it:
   ask the administrator to approve the specific principal and transport.
3. For a relay, Admin Console > Apps > Google Workspace > Gmail > Routing > SMTP
   relay service: inspect the applicable rule, allowed senders, authentication,
   permitted source IPs and TLS requirement without editing. Confirm that the
   future application host is covered. A developer laptop's changing public IP is
   not automatically covered. Do not broaden the allowed-sender rule to test.
4. Administrator records the approved host, port, TLS, authentication and principal.
   Google's documented options include smtp.gmail.com (465 implicit TLS or 587
   STARTTLS) and smtp-relay.gmail.com; these are options, not this project's approved
   settings. App Password authentication requires an eligible account with 2-Step
   Verification and organization approval. Never use an ordinary account password
   or a personal account's App Password with the institutional username. OAuth or
   relay-only authentication would need code/configuration compatibility review:
   the existing normal password-reset transporter uses EMAIL_USER/EMAIL_PASSWORD.
   Port587 secure:false enables STARTTLS negotiation; it does not alone require
   TLS. If policy requires mandatory STARTTLS, review requireTLS before activation.
5. Ask the domain administrator to confirm the actual sending route is covered by
   SPF, DKIM signs with an aligned institutional domain, and DMARC is configured
   with SPF or DKIM alignment to the visible From. Inspect Gmail Authenticate email
   settings/DNS evidence without changing records. Final authentication results
   can only be demonstrated by a separately approved received-message test.

Safe approval response (no secrets): address type and owner; approved authenticated
principal; approved endpoint/port/TLS/authentication method; explicit permission to
send From noreply.ums@mygyanvihar.com; relay restrictions; SPF/DKIM/DMARC status;
administrator approval reference. Mailbox access alone does not satisfy this list.

Do not activate the override until confirmed. If shared SMTP cannot send as this
address, prepare a separately reviewed reset-only transport; never change unrelated
senders or shared credentials as a shortcut. Mailpit needs no Google authorization,
but still needs its independent isolated-execution approval.

Official references reviewed:
- https://support.google.com/a/answer/33327
- https://support.google.com/mail/answer/22370
- https://support.google.com/a/answer/176600
- https://support.google.com/a/answer/2956491
- https://support.google.com/mail/answer/185833

For an existing received message, Gmail's message More menu > Show original exposes
From, Sender (if present), Return-Path and Authentication-Results. Review only those
headers and timestamp privately. Return-Path alone does not establish the visible
From or rewriting. Compare the application's submitted header/configuration evidence
with the received From; without both, stale configuration versus rewriting remains
unproven. Do not share the body, full source, reset link or token.

Historical 14 October behavior: an explicitly empty/whitespace override failed
closed, while removing the variable retained the then-existing shared fallback.
That fallback was subsequently removed; see the current code contract above.


## Historical administrator approval and pending activation — 2026-10-15

The operator reports administrator approval for the institutional principal,
username/password SMTP, smtp.gmail.com:587 with mandatory STARTTLS, and domain
alignment. Authentication and delivery are still untested. The reset transport
now requires TLS when its explicit sender override is enabled; absent-override
fallback and unrelated transports are unchanged.

Original PID 8573 listens on IPv6 port 4000; feature PID 96168 listens on IPv4
127.0.0.1:4000. Original frontend defaults to localhost:4000. No captured request
proves the previous destination process. Original source/artifact lacks the reset
override; feature source/artifact contains it. Original on-disk configuration
selects the institutional SMTP username but has no reset sender override. Feature
backend has no .env. Neither observation proves loaded process configuration.

Next activation gates (not executed):
1. Explicitly authorize a unique-port feature runtime and frontend API destination.
   Existing port 4001 routing preview cannot perform recovery. Review normal
   startup database/worker side effects before starting any functional backend.
2. Approve the runtime configuration source, without copying the original .env:
   PASSWORD_RESET_EMAIL_FROM_ADDRESS=noreply.ums@mygyanvihar.com and
   PASSWORD_RESET_EMAIL_FROM_NAME=Falcon. EMAIL_HOST, EMAIL_PORT, EMAIL_SECURE,
   EMAIL_USER and EMAIL_PASSWORD must use the approved institutional configuration.
   Privately verify the credential belongs to the approved principal.
3. In the feature backend, rebuild using node_modules/.bin/tsc -p
   tsconfig.build.json --incremental false (avoids destructive npm prebuild).
   Recheck process identities and obtain restart/startup approval first.
4. Verify sanitized loaded configuration and unambiguous routing. Separately
   authorize SMTP authentication and one test email to the approved recipient.
   Inspect From, Sender, Return-Path and Authentication-Results privately.

No configuration edits, restart, SMTP request, database access or email occurred.
