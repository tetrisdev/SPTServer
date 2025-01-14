import { ItemHelper } from "@spt/helpers/ItemHelper";
import { IPmcData } from "@spt/models/eft/common/IPmcData";
import { BanType, Common, CounterKeyValue, Stats } from "@spt/models/eft/common/tables/IBotBase";
import { ISptProfile } from "@spt/models/eft/profile/ISptProfile";
import { IValidateNicknameRequestData } from "@spt/models/eft/profile/IValidateNicknameRequestData";
import { AccountTypes } from "@spt/models/enums/AccountTypes";
import { BonusType } from "@spt/models/enums/BonusType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { GameEditions } from "@spt/models/enums/GameEditions";
import { SkillTypes } from "@spt/models/enums/SkillTypes";
import { IInventoryConfig } from "@spt/models/spt/config/IInventoryConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { SaveServer } from "@spt/servers/SaveServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { ProfileSnapshotService } from "@spt/services/ProfileSnapshotService";
import { HashUtil } from "@spt/utils/HashUtil";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { Watermark } from "@spt/utils/Watermark";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class ProfileHelper {
    protected inventoryConfig: IInventoryConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("Watermark") protected watermark: Watermark,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("SaveServer") protected saveServer: SaveServer,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("ProfileSnapshotService") protected profileSnapshotService: ProfileSnapshotService,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.inventoryConfig = this.configServer.getConfig(ConfigTypes.INVENTORY);
    }

    /**
     * Remove/reset a completed quest condtion from players profile quest data
     * @param sessionID Session id
     * @param questConditionId Quest with condition to remove
     */
    public removeQuestConditionFromProfile(pmcData: IPmcData, questConditionId: Record<string, string>): void {
        for (const questId in questConditionId) {
            const conditionId = questConditionId[questId];
            const profileQuest = pmcData.Quests.find((x) => x.qid === questId);

            // Find index of condition in array
            const index = profileQuest.completedConditions.indexOf(conditionId);
            if (index > -1) {
                // Remove condition
                profileQuest.completedConditions.splice(index, 1);
            }
        }
    }

    /**
     * Get all profiles from server
     * @returns Dictionary of profiles
     */
    public getProfiles(): Record<string, ISptProfile> {
        return this.saveServer.getProfiles();
    }

    /**
     * Get the pmc and scav profiles as an array by profile id
     * @param sessionId
     * @returns Array of IPmcData objects
     */
    public getCompleteProfile(sessionId: string): IPmcData[] {
        const output: IPmcData[] = [];

        if (this.isWiped(sessionId)) {
            return output;
        }

        const fullProfile = this.getFullProfile(sessionId);

        // Edge-case, true post raid
        if (this.profileSnapshotService.hasProfileSnapshot(sessionId)) {
            return this.postRaidXpWorkaroundFix(
                sessionId,
                fullProfile.characters.pmc,
                fullProfile.characters.scav,
                output,
            );
        }

        // PMC must be at array index 0, scav at 1
        output.push(fullProfile.characters.pmc);
        output.push(fullProfile.characters.scav);

        return output;
    }

    /**
     * Fix xp doubling on post-raid xp reward screen by sending a 'dummy' profile to the post-raid screen
     * Server saves the post-raid changes prior to the xp screen getting the profile, this results in the xp screen using
     * the now updated profile values as a base, meaning it shows x2 xp gained
     * Instead, clone the post-raid profile (so we dont alter its values), apply the pre-raid xp values to the cloned objects and return
     * Delete snapshot of pre-raid profile prior to returning profile data
     * @param sessionId Session id
     * @param output pmc and scav profiles array
     * @param pmcProfile post-raid pmc profile
     * @param scavProfile post-raid scav profile
     * @returns Updated profile array
     */
    protected postRaidXpWorkaroundFix(
        sessionId: string,
        pmcProfile: IPmcData,
        scavProfile: IPmcData,
        output: IPmcData[],
    ): IPmcData[] {
        const clonedPmc = this.cloner.clone(pmcProfile);
        const clonedScav = this.cloner.clone(scavProfile);

        const profileSnapshot = this.profileSnapshotService.getProfileSnapshot(sessionId);
        clonedPmc.Info.Level = profileSnapshot.characters.pmc.Info.Level;
        clonedPmc.Info.Experience = profileSnapshot.characters.pmc.Info.Experience;

        clonedScav.Info.Level = profileSnapshot.characters.scav.Info.Level;
        clonedScav.Info.Experience = profileSnapshot.characters.scav.Info.Experience;

        this.profileSnapshotService.clearProfileSnapshot(sessionId);

        output.push(clonedPmc);
        output.push(clonedScav);

        return output;
    }

    /**
     * Check if a nickname is used by another profile loaded by the server
     * @param nicknameRequest nickname request object
     * @param sessionID Session id
     * @returns True if already in use
     */
    public isNicknameTaken(nicknameRequest: IValidateNicknameRequestData, sessionID: string): boolean {
        const allProfiles = Object.values(this.saveServer.getProfiles());

        // Find a profile that doesn't have same session id but has same name
        return allProfiles.some(
            (profile) =>
                this.profileHasInfoProperty(profile) &&
                !this.stringsMatch(profile.info.id, sessionID) && // SessionIds dont match
                this.stringsMatch(
                    // Nicknames do
                    profile.characters.pmc.Info.LowerNickname.toLowerCase(),
                    nicknameRequest.nickname.toLowerCase(),
                ),
        );
    }

    protected profileHasInfoProperty(profile: ISptProfile): boolean {
        return !!profile?.characters?.pmc?.Info;
    }

    protected stringsMatch(stringA: string, stringB: string): boolean {
        return stringA === stringB;
    }

    /**
     * Add experience to a PMC inside the players profile
     * @param sessionID Session id
     * @param experienceToAdd Experience to add to PMC character
     */
    public addExperienceToPmc(sessionID: string, experienceToAdd: number): void {
        const pmcData = this.getPmcProfile(sessionID);
        pmcData.Info.Experience += experienceToAdd;
    }

    /**
     * Iterate all profiles and find matching pmc profile by provided id
     * @param pmcId Profile id to find
     * @returns IPmcData
     */
    public getProfileByPmcId(pmcId: string): IPmcData | undefined {
        return Object.values(this.saveServer.getProfiles()).find((profile) => profile.characters.pmc?._id === pmcId)
            ?.characters.pmc;
    }

    /**
     * Get experience value for given level
     * @param level Level to get xp for
     * @returns Number of xp points for level
     */
    public getExperience(level: number): number {
        let playerLevel = level;
        const expTable = this.databaseService.getGlobals().config.exp.level.exp_table;
        let exp = 0;

        if (playerLevel >= expTable.length) {
            // make sure to not go out of bounds
            playerLevel = expTable.length - 1;
        }

        for (let i = 0; i < playerLevel; i++) {
            exp += expTable[i].exp;
        }

        return exp;
    }

    /**
     * Get the max level a player can be
     * @returns Max level
     */
    public getMaxLevel(): number {
        return this.databaseService.getGlobals().config.exp.level.exp_table.length - 1;
    }

    public getDefaultSptDataObject(): any {
        return { version: this.watermark.getVersionTag(true) };
    }

    /**
     * Get full representation of a players profile json
     * @param sessionID Profile id to get
     * @returns ISptProfile object
     */
    public getFullProfile(sessionID: string): ISptProfile | undefined {
        return this.saveServer.profileExists(sessionID) ? this.saveServer.getProfile(sessionID) : undefined;
    }

    /**
     * Get a PMC profile by its session id
     * @param sessionID Profile id to return
     * @returns IPmcData object
     */
    public getPmcProfile(sessionID: string): IPmcData | undefined {
        const fullProfile = this.getFullProfile(sessionID);
        if (!fullProfile?.characters?.pmc) {
            return undefined;
        }

        return this.saveServer.getProfile(sessionID).characters.pmc;
    }

    /**
     * Is given user id a player
     * @param userId Id to validate
     * @returns True is a player
     */
    public isPlayer(userId: string): boolean {
        return this.saveServer.profileExists(userId);
    }

    /**
     * Get a full profiles scav-specific sub-profile
     * @param sessionID Profiles id
     * @returns IPmcData object
     */
    public getScavProfile(sessionID: string): IPmcData {
        return this.saveServer.getProfile(sessionID).characters.scav;
    }

    /**
     * Get baseline counter values for a fresh profile
     * @returns Default profile Stats object
     */
    public getDefaultCounters(): Stats {
        return {
            Eft: {
                CarriedQuestItems: [],
                DamageHistory: { LethalDamagePart: "Head", LethalDamage: undefined!, BodyParts: <any>[] },
                DroppedItems: [],
                ExperienceBonusMult: 0,
                FoundInRaidItems: [],
                LastPlayerState: undefined,
                LastSessionDate: 0,
                OverallCounters: { Items: [] },
                SessionCounters: { Items: [] },
                SessionExperienceMult: 0,
                SurvivorClass: "Unknown",
                TotalInGameTime: 0,
                TotalSessionExperience: 0,
                Victims: [],
            },
        };
    }

    /**
     * is this profile flagged for data removal
     * @param sessionID Profile id
     * @returns True if profile is to be wiped of data/progress
     */
    protected isWiped(sessionID: string): boolean {
        return this.saveServer.getProfile(sessionID).info.wipe;
    }

    /**
     * Iterate over player profile inventory items and find the secure container and remove it
     * @param profile Profile to remove secure container from
     * @returns profile without secure container
     */
    public removeSecureContainer(profile: IPmcData): IPmcData {
        const items = profile.Inventory.items;
        const secureContainer = items.find((x) => x.slotId === "SecuredContainer");
        if (secureContainer) {
            // Find and remove container + children
            const childItemsInSecureContainer = this.itemHelper.findAndReturnChildrenByItems(
                items,
                secureContainer._id,
            );

            // Remove child items + secure container
            profile.Inventory.items = items.filter((x) => !childItemsInSecureContainer.includes(x._id));
        }

        return profile;
    }

    /**
     *  Flag a profile as having received a gift
     * Store giftid in profile spt object
     * @param playerId Player to add gift flag to
     * @param giftId Gift player received
     * @param maxCount Limit of how many of this gift a player can have
     */
    public flagGiftReceivedInProfile(playerId: string, giftId: string, maxCount: number): void {
        const profileToUpdate = this.getFullProfile(playerId);

        // nullguard receivedGifts
        profileToUpdate.spt.receivedGifts ||= [];

        const giftData = profileToUpdate.spt.receivedGifts.find((gift) => gift.giftId === giftId);
        if (giftData) {
            // Increment counter
            giftData.current++;

            return;
        }

        // Player has never received gift, make a new object
        profileToUpdate.spt.receivedGifts.push({
            giftId: giftId,
            timestampLastAccepted: this.timeUtil.getTimestamp(),
            current: 1,
        });
    }

    /**
     * Check if profile has recieved a gift by id
     * @param playerId Player profile to check for gift
     * @param giftId Gift to check for
     * @param maxGiftCount Max times gift can be given to player
     * @returns True if player has recieved gift previously
     */
    public playerHasRecievedMaxNumberOfGift(playerId: string, giftId: string, maxGiftCount: number): boolean {
        const profile = this.getFullProfile(playerId);
        if (!profile) {
            this.logger.debug(`Unable to gift ${giftId}, profile: ${playerId} does not exist`);
            return false;
        }

        if (!profile.spt.receivedGifts) {
            return false;
        }

        const giftDataFromProfile = profile.spt.receivedGifts.find((x) => x.giftId === giftId);
        if (!giftDataFromProfile) {
            return false;
        }

        return giftDataFromProfile.current >= maxGiftCount;
    }

    /**
     * Find Stat in profile counters and increment by one
     * @param counters Counters to search for key
     * @param keyToIncrement Key
     */
    public incrementStatCounter(counters: CounterKeyValue[], keyToIncrement: string): void {
        const stat = counters.find((x) => x.Key.includes(keyToIncrement));
        if (stat) {
            stat.Value++;
        }
    }

    /**
     * Check if player has a skill at elite level
     * @param skillType Skill to check
     * @param pmcProfile Profile to find skill in
     * @returns True if player has skill at elite level
     */
    public hasEliteSkillLevel(skillType: SkillTypes, pmcProfile: IPmcData): boolean {
        const profileSkills = pmcProfile?.Skills?.Common;
        if (!profileSkills) {
            return false;
        }

        const profileSkill = profileSkills.find((x) => x.Id === skillType);
        if (!profileSkill) {
            this.logger.warning(`Unable to check for elite skill ${skillType}, not found in profile`);

            return false;
        }
        return profileSkill.Progress >= 5100; // level 51
    }

    /**
     * Add points to a specific skill in player profile
     * @param skill Skill to add points to
     * @param pointsToAdd Points to add
     * @param pmcProfile Player profile with skill
     * @param useSkillProgressRateMultipler Skills are multiplied by a value in globals, default is off to maintain compatibility with legacy code
     * @returns
     */
    public addSkillPointsToPlayer(
        pmcProfile: IPmcData,
        skill: SkillTypes,
        pointsToAdd: number,
        useSkillProgressRateMultipler = false,
    ): void {
        let pointsToAddToSkill = pointsToAdd;

        if (!pointsToAddToSkill || pointsToAddToSkill < 0) {
            this.logger.warning(
                this.localisationService.getText("player-attempt_to_increment_skill_with_negative_value", skill),
            );
            return;
        }

        const profileSkills = pmcProfile?.Skills?.Common;
        if (!profileSkills) {
            this.logger.warning(`Unable to add ${pointsToAddToSkill} points to ${skill}, profile has no skills`);
            return;
        }

        const profileSkill = profileSkills.find((profileSkill) => profileSkill.Id === skill);
        if (!profileSkill) {
            this.logger.error(this.localisationService.getText("quest-no_skill_found", skill));
            return;
        }

        if (useSkillProgressRateMultipler) {
            const skillProgressRate = this.databaseService.getGlobals().config.SkillsSettings.SkillProgressRate;
            pointsToAddToSkill *= skillProgressRate;
        }

        // Apply custom multipler to skill amount gained, if exists
        if (this.inventoryConfig.skillGainMultiplers[skill]) {
            pointsToAddToSkill *= this.inventoryConfig.skillGainMultiplers[skill];
        }

        profileSkill.Progress += pointsToAddToSkill;
        profileSkill.Progress = Math.min(profileSkill.Progress, 5100); // Prevent skill from ever going above level 51 (5100)
        profileSkill.LastAccess = this.timeUtil.getTimestamp();
    }

    /**
     * Get a speciic common skill from supplied profile
     * @param pmcData Player profile
     * @param skill Skill to look up and return value from
     * @returns Common skill object from desired profile
     */
    public getSkillFromProfile(pmcData: IPmcData, skill: SkillTypes): Common {
        const skillToReturn = pmcData.Skills.Common.find((commonSkill) => commonSkill.Id === skill);
        if (!skillToReturn) {
            this.logger.warning(`Profile ${pmcData.sessionId} does not have a skill named: ${skill}`);
            return undefined;
        }

        return skillToReturn;
    }

    /**
     * Is the provided session id for a developer account
     * @param sessionID Profile id ot check
     * @returns True if account is developer
     */
    public isDeveloperAccount(sessionID: string): boolean {
        return this.getFullProfile(sessionID).info.edition.toLowerCase().startsWith(AccountTypes.SPT_DEVELOPER);
    }

    /**
     * Add stash row bonus to profile or increments rows given count if it already exists
     * @param sessionId Profile id to give rows to
     * @param rowsToAdd How many rows to give profile
     */
    public addStashRowsBonusToProfile(sessionId: string, rowsToAdd: number): void {
        const profile = this.getPmcProfile(sessionId);
        const existingBonus = profile.Bonuses.find((bonus) => bonus.type === BonusType.STASH_ROWS);
        if (!existingBonus) {
            profile.Bonuses.push({
                id: this.hashUtil.generate(),
                value: rowsToAdd,
                type: BonusType.STASH_ROWS,
                passive: true,
                visible: true,
                production: false,
            });
        } else {
            existingBonus.value += rowsToAdd;
        }
    }

    public playerIsFleaBanned(pmcProfile: IPmcData): boolean {
        const currentTimestamp = this.timeUtil.getTimestamp();
        return pmcProfile.Info.Bans.some((ban) => ban.banType === BanType.RAGFAIR && currentTimestamp < ban.dateTime);
    }

    /**
     * Add an achievement to player profile
     * @param pmcProfile Profile to add achievement to
     * @param achievementId Id of achievement to add
     */
    public addAchievementToProfile(pmcProfile: IPmcData, achievementId: string): void {
        pmcProfile.Achievements[achievementId] = this.timeUtil.getTimestamp();
    }

    public hasAccessToRepeatableFreeRefreshSystem(pmcProfile: IPmcData): boolean {
        return [GameEditions.EDGE_OF_DARKNESS, GameEditions.UNHEARD].includes(<any>pmcProfile.Info?.GameVersion);
    }
}
