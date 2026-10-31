import type { MemberServices } from "../../src/server/members/member-http.ts";
import type { MemberIdentity } from "../../src/server/members/member-sessions.ts";
import type { SlipConfigurationsService } from "../../src/server/slips/slip-configurations.ts";

export function slipConfigurationFixture(): {
  services: MemberServices;
  service: SlipConfigurationsService;
  first: { token: string; member: MemberIdentity };
};
