import { slipConfigurationFixture } from "@/../tests/helpers/slip-configuration-fixture.mjs";

/** Shared process state lives only in this isolated acceptance app; no real account or database is read. */
const state = globalThis as typeof globalThis & { slipConfigurationAcceptance?: ReturnType<typeof slipConfigurationFixture> };
export const fixture = state.slipConfigurationAcceptance ??= slipConfigurationFixture();
export const services = async () => fixture.services;
