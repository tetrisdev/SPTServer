import { LootGenerator } from "@spt/generators/LootGenerator";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { WeightedRandomHelper } from "@spt/helpers/WeightedRandomHelper";
import { Item } from "@spt/models/eft/common/tables/IItem";
import { IGetAirdropLootResponse } from "@spt/models/eft/location/IGetAirdropLootResponse";
import { AirdropTypeEnum } from "@spt/models/enums/AirdropType";
import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { ItemTpl } from "@spt/models/enums/ItemTpl";
import { AirdropLoot, IAirdropConfig } from "@spt/models/spt/config/IAirdropConfig";
import { LootRequest } from "@spt/models/spt/services/LootRequest";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { DatabaseService } from "@spt/services/DatabaseService";
import { ItemFilterService } from "@spt/services/ItemFilterService";
import { LocalisationService } from "@spt/services/LocalisationService";
import { HashUtil } from "@spt/utils/HashUtil";
import { ICloner } from "@spt/utils/cloners/ICloner";
import { inject, injectable } from "tsyringe";

@injectable()
export class AirdropService {
    protected airdropConfig: IAirdropConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("WeightedRandomHelper") protected weightedRandomHelper: WeightedRandomHelper,
        @inject("LocalisationService") protected localisationService: LocalisationService,
        @inject("ItemFilterService") protected itemFilterService: ItemFilterService,
        @inject("LootGenerator") protected lootGenerator: LootGenerator,
        @inject("DatabaseService") protected databaseService: DatabaseService,
        @inject("ConfigServer") protected configServer: ConfigServer,
        @inject("PrimaryCloner") protected cloner: ICloner,
    ) {
        this.airdropConfig = this.configServer.getConfig(ConfigTypes.AIRDROP);
    }

    /**
     * Handle client/location/getAirdropLoot
     * Get loot for an airdrop container
     * Generates it randomly based on config/airdrop.json values
     * @returns Array of LootItem objects
     */
    public generateAirdropLoot(): IGetAirdropLootResponse {
        const airdropType = this.chooseAirdropType();
        this.logger.debug(`Chose ${airdropType} for airdrop loot`);

        // Common/weapon/etc
        const airdropConfig = this.getAirdropLootConfigByType(airdropType);

        // generate loot to put into airdrop crate
        const crateLoot = this.lootGenerator.createRandomLoot(airdropConfig);

        // Create airdrop crate and add to result in first spot
        const airdropCrateItem = this.getAirdropCrateItem(airdropType);

        // Add crate to front of array
        crateLoot.unshift(airdropCrateItem);

        // Reparent loot items to create we added above
        for (const item of crateLoot) {
            if (item._id == airdropCrateItem._id) {
                // Crate itself, don't alter
                continue;
            }

            // no parentId = root item, make item have create as parent
            if (!item.parentId) {
                item.parentId = airdropCrateItem._id;
                item.slotId = "main";
            }
        }

        return { icon: airdropType, container: crateLoot };
    }

    /**
     * Create a container create item based on passed in airdrop type
     * @param airdropType What tpye of container: weapon/common etc
     * @returns Item
     */
    protected getAirdropCrateItem(airdropType: AirdropTypeEnum): Item {
        const airdropContainer = {
            _id: this.hashUtil.generate(),
            _tpl: "", // picked later
            upd: {
                SpawnedInSession: true,
                StackObjectsCount: 1,
            },
        };

        switch (airdropType) {
            case AirdropTypeEnum.MEDICAL:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_MEDICAL_CRATE;
                break;
            case AirdropTypeEnum.SUPPLY:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_SUPPLY_CRATE;
                break;
            case AirdropTypeEnum.WEAPON:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_WEAPON_CRATE;
                break;
            case AirdropTypeEnum.COMMON:
            default:
                airdropContainer._tpl = ItemTpl.LOOTCONTAINER_AIRDROP_COMMON_SUPPLY_CRATE;
                break;
        }

        return airdropContainer;
    }

    /**
     * Randomly pick a type of airdrop loot using weighted values from config
     * @returns airdrop type value
     */
    protected chooseAirdropType(): AirdropTypeEnum {
        const possibleAirdropTypes = this.airdropConfig.airdropTypeWeightings;

        return this.weightedRandomHelper.getWeightedValue(possibleAirdropTypes);
    }

    /**
     * Get the configuration for a specific type of airdrop
     * @param airdropType Type of airdrop to get settings for
     * @returns LootRequest
     */
    protected getAirdropLootConfigByType(airdropType: AirdropTypeEnum): LootRequest {
        let lootSettingsByType: AirdropLoot = this.airdropConfig.loot[airdropType];
        if (!lootSettingsByType) {
            this.logger.error(
                this.localisationService.getText("location-unable_to_find_airdrop_drop_config_of_type", airdropType),
            );
            lootSettingsByType = this.airdropConfig.loot[AirdropTypeEnum.COMMON];
        }

        return {
            weaponPresetCount: lootSettingsByType.weaponPresetCount,
            armorPresetCount: lootSettingsByType.armorPresetCount,
            itemCount: lootSettingsByType.itemCount,
            weaponCrateCount: lootSettingsByType.weaponCrateCount,
            itemBlacklist: [
                ...lootSettingsByType.itemBlacklist,
                ...this.itemFilterService.getItemRewardBlacklist(),
                ...this.itemFilterService.getBossItems(),
            ],
            itemTypeWhitelist: lootSettingsByType.itemTypeWhitelist,
            itemLimits: lootSettingsByType.itemLimits,
            itemStackLimits: lootSettingsByType.itemStackLimits,
            armorLevelWhitelist: lootSettingsByType.armorLevelWhitelist,
            allowBossItems: lootSettingsByType.allowBossItems,
        };
    }
}
