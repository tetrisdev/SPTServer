import { ApplicationContext } from "@spt/context/ApplicationContext";
import { ContextVariableType } from "@spt/context/ContextVariableType";
import { ProfileHelper } from "@spt/helpers/ProfileHelper";
import { IRegisterPlayerRequestData } from "@spt/models/eft/inRaid/IRegisterPlayerRequestData";
import { IScavSaveRequestData } from "@spt/models/eft/inRaid/IScavSaveRequestData";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { IBotConfig } from "@spt/models/spt/config/IBotConfig";
import { IInRaidConfig } from "@spt/models/spt/config/IInRaidConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { LocalisationService } from "@spt/services/LocalisationService";
import { inject, injectable } from "tsyringe";

/**
 * Logic for handling In Raid callbacks
 */
@injectable()
export class InraidController {
    protected inRaidConfig: IInRaidConfig;
    protected botConfig: IBotConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("ProfileHelper") protected profileHelper: ProfileHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ApplicationContext") protected applicationContext: ApplicationContext,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.inRaidConfig = this.configServer.getConfig(ConfigTypes.IN_RAID);
        this.botConfig = this.configServer.getConfig(ConfigTypes.BOT);
    }

    /**
     * Save locationId to active profiles inraid object AND app context
     * @param sessionID Session id
     * @param info Register player request
     */
    public addPlayer(sessionID: string, info: IRegisterPlayerRequestData): void {
        this.applicationContext.addValue(ContextVariableType.REGISTER_PLAYER_REQUEST, info);
        const profile = this.saveServer.getProfile(sessionID);
        if (!profile) {
            this.logger.error(this.localisationService.getText("inraid-no_profile_found", sessionID));

            return;
        }
        if (!profile.inraid) {
            profile.inraid = { character: sessionID, location: info.locationId };

            return;
        }

        profile.inraid.location = info.locationId;
    }

    /**
     * Handle raid/profile/save
     * Save profile state to disk
     * Handles pmc/pscav
     * @param offraidData post-raid request data
     * @param sessionID Session id
     */
    public savePostRaidProfileForScav(offraidData: IScavSaveRequestData, sessionID: string): void {
        const serverScavProfile = this.profileHelper.getScavProfile(sessionID);

        serverScavProfile.Inventory.items = offraidData.profile.Inventory.items;
    }

    /**
     * Get the inraid config from configs/inraid.json
     * @returns InRaid Config
     */
    public getInraidConfig(): IInRaidConfig {
        return this.inRaidConfig;
    }

    public getTraitorScavHostileChance(url: string, sessionID: string): number {
        return this.inRaidConfig.playerScavHostileChancePercent;
    }

    public getBossConvertSettings(url: string, sessionId: string): string[] {
        return Object.keys(this.botConfig.assaultToBossConversion.bossesToConvertToWeights);
    }
}
