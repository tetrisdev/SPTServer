import { ProfileFixerService } from "@spt/services/ProfileFixerService";
import { container } from "tsyringe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("ProfileFixerService", () => {
    let profileFixerService: any; // Using "any" to access private/protected methods without type errors.

    beforeEach(() => {
        profileFixerService = container.resolve<ProfileFixerService>("ProfileFixerService");
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe("FixPmcProfileIssues", () => {
        it("should reset nextResupply to 0 when it is undefined", () => {
            const pmcProfile = { TradersInfo: { traderId: { nextResupply: undefined } } };

            profileFixerService.fixNullTraderNextResupply(pmcProfile);

            expect(pmcProfile.TradersInfo.traderId.nextResupply).toBe(0);
        });

        it("should not reset nextResupply to 0 when it is not undefined", () => {
            const pmcProfile = { TradersInfo: { traderId: { nextResupply: 1234 } } };

            profileFixerService.fixNullTraderNextResupply(pmcProfile);

            expect(pmcProfile.TradersInfo.traderId.nextResupply).toBe(1234);
        });
    });
});
