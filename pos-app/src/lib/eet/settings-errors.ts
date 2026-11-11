import { EetProbeError } from "./probe-errors";
import { describeEetSetupFailure } from "./setup-diagnostics";

const issues: Record<string, { code: string; message: string }> = {
  "EET preparation could not be saved.": { code: "EET_PREPARATION_SAVE", message: "The preparation save could not be confirmed. Use Recheck setup to check the latest stored preparation before retrying; your form has been kept." },
  "Invalid EET settings.": { code: "EET_SETTINGS_INVALID", message: "The settings request is invalid. Recheck setup before saving again." },
  "Invalid EET configuration.": { code: "EET_SETTINGS_INVALID", message: "Choose valid reporting, submission and tip-policy options." },
  "Business information is too long.": { code: "EET_SETTINGS_BUSINESS", message: "Use at most 200 characters for the business name and 500 for its address." },
  "Complete business information and confirm the tip policy before enabling capture.": { code: "EET_SETTINGS_BUSINESS", message: "Complete the business name, address and tip ownership policy before enabling Playground or Production capture." },
  "Deploy and verify secure EET checkout before enabling capture.": { code: "EET_SETTINGS_CAPTURE_OFF", message: "Not saved: secure payment capture is off on this deployment (EET_CHECKOUT_ENABLED). Complete checkout acceptance before enabling it. Connection tests remain available with Disabled + Paused." },
  "Configure the durable worker before automatic submission.": { code: "EET_SETTINGS_WORKER_OFF", message: "Not saved: Automatic requires a configured durable worker and EET_WORKER_ENABLED on the server. Connection tests do not require Automatic." },
  "Review and pin the official WSDL/XSD before submission.": { code: "EET_SETTINGS_PROTOCOL_PENDING", message: "Not saved: operational protocol acceptance/review is pending (EET_PROTOCOL_REVIEWED). Complete the Playground acceptance checks and review first; the test buttons remain available." },
  "Production is locked. Explicit production approval and compliance review are required.": { code: "EET_SETTINGS_PRODUCTION_LOCKED", message: "Production remains locked until explicit approval and compliance review. Use the Playground test buttons while completing setup." },
  "A Playground test identity cannot be used for Production reporting.": { code: "EET_SETTINGS_IDENTITY", message: "A Playground certificate identity cannot be used for Production reporting." },
  "Invalid EIČ.": { code: "EET_SETTINGS_EIC", message: "Enter a valid certificate EIČ: CZ followed by 8–10 digits." },
  "Invalid registrating unit identifier.": { code: "EET_SETTINGS_UNIT", message: "The Unit ID must contain 1–9 digits and must not start with zero." },
  "Invalid register identifier.": { code: "EET_SETTINGS_REGISTER", message: "Use a supported ASCII POS/register identifier of 1–20 characters." },
  "Settings changed. Reload before saving": { code: "EET_SETTINGS_CONFLICT", message: "Another save changed the settings. Use Recheck setup, review the saved values and your draft, then save again." },
  "Production confirmation required": { code: "EET_SETTINGS_CONFIRMATION", message: "Enter ACTIVATE PRODUCTION to confirm the requested Production activation." },
  "Live suspension confirmation required": { code: "EET_SETTINGS_CONFIRMATION", message: "Enter STOP LIVE SUBMISSIONS to confirm stopping or pausing live reporting." },
  "Live obligations cannot be moved to Playground": { code: "EET_SETTINGS_LIVE_STARTED", message: "Live reporting has already started. Its reporting obligations cannot be moved to Playground." },
  "Fiscal identity/tip policy is frozen after capture starts. Use an audited migration": { code: "EET_SETTINGS_FROZEN", message: "The fiscal identity and tip policy are frozen after capture starts. An audited migration is required to change them." },
  "Resolve the existing environment queue before switching environments": { code: "EET_SETTINGS_QUEUE", message: "Resolve pending transactions in the existing environment before switching environments. The queue has been preserved." },
};

/** Only known static messages cross the server-action boundary. */
export function settingsSaveFailure(error: unknown) {
  const message = error instanceof Error ? error.message : "";
  let issue = Object.hasOwn(issues, message) ? issues[message] : null;
  if (error instanceof EetProbeError) issue = { code: "EET_SETTINGS_CREDENTIALS", message: `Not saved: ${error.message}` };
  if (!issue) {
    const setup = describeEetSetupFailure(error);
    issue = setup.code !== "EET_SETUP_UNAVAILABLE" ? { code: setup.code, message: `${setup.title} ${setup.action}` }
      : { code: "EET_SETTINGS_UNCONFIRMED", message: "The save could not be confirmed. Use Recheck setup to check the stored configuration before retrying. Your draft has been kept." };
  }
  return { ok: false as const, errorCode: issue.code, message: `${issue.code}: ${issue.message}` };
}
