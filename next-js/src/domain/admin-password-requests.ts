export const adminPasswordRequestsApi = "/api/admin/password-requests";

export const passwordRequestStatusLabels = {
  pending: "Pending",
  "link-generated": "Link Generated",
  expired: "Expired",
  completed: "Completed",
  cancelled: "Cancelled",
} as const;

export const passwordRequestOwnershipMethods = { call: "Phone call", sms: "SMS", whatsapp: "WhatsApp" } as const;
export const passwordRequestSentChannels = { sms: "SMS", whatsapp: "WhatsApp", other: "Other" } as const;

export type PasswordRequestOwnershipMethod = keyof typeof passwordRequestOwnershipMethods;
export type PasswordRequestSentChannel = keyof typeof passwordRequestSentChannels;
export type PasswordRequestRow = Readonly<{
  id: string;
  phone: string;
  requestedAt: string;
  status: keyof typeof passwordRequestStatusLabels;
}>;

export type PasswordRequestDetails = PasswordRequestRow & Readonly<{
  accountId: string;
  accountCreatedAt: string;
  phoneVerifiedAt: string | null;
  ownershipVerifiedAt: string | null;
  ownershipMethod: PasswordRequestOwnershipMethod | null;
  generatedAt: string | null;
  expiresAt: string | null;
  generation: number;
  link: string | null;
  markedSentAt: string | null;
  markedSentChannel: PasswordRequestSentChannel | null;
  completedAt: string | null;
}>;

export type PasswordRequestMutation = Readonly<{ id: string } & (
  { action: "verify-ownership"; method: PasswordRequestOwnershipMethod; confirmed: true }
  | { action: "generate-link"; generation: number }
  | { action: "mark-sent"; channel: PasswordRequestSentChannel; generation: number; confirmed: true }
)>;
