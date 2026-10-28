/** Imported by next.config.ts and proxy.ts. Source identity is locally pinned at install. */
import identity from "./cloud-identity.json";
import { evaluateCloudShell } from "./cloud-policy";
export function currentCloudShellStatus() {
  return evaluateCloudShell(process.env, identity);
}
export function assertCloudShellBuildGate():void {
  const result=currentCloudShellStatus();
  if(!result.ok)throw new Error("V3.7D.2C.3 CLOUD SHELL STARTUP BLOCK: "+result.reason);
}
