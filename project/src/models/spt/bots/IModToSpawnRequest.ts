import { IItem } from "@spt/models/eft/common/tables/IItem";
import { ITemplateItem } from "@spt/models/eft/common/tables/ITemplateItem";
import { ModSpawn } from "@spt/models/enums/ModSpawn";
import { IBotData, IWeaponStats } from "@spt/models/spt/bots/IGenerateWeaponRequest";
import { IEquipmentFilterDetails, IRandomisationDetails } from "@spt/models/spt/config/IBotConfig";

export interface IModToSpawnRequest {
    /** Slot mod will fit into */
    modSlot: string;
    /** Will generate a randomised mod pool if true */
    isRandomisableSlot: boolean;
    randomisationSettings: IRandomisationDetails;
    /** Parent slot the item will be a part of */
    botWeaponSightWhitelist: Record<string, string[]>;
    /** Blacklist to prevent mods from being picked */
    botEquipBlacklist: IEquipmentFilterDetails;
    /** Pool of items to pick from */
    itemModPool: Record<string, string[]>;
    /** Array with only weapon tpl in it, ready for mods to be added */
    weapon: IItem[];
    /** Ammo tpl to use if slot requires a cartridge to be added (e.g. mod_magazine) */
    ammoTpl: string;
    /** Parent item the mod will go into */
    parentTemplate: ITemplateItem;
    /** Should mod be spawned/skipped/use default */
    modSpawnResult: ModSpawn;
    /** Weapon stats for weapon being generated */
    weaponStats: IWeaponStats;
    /** Array of item tpls the weapon does not support */
    conflictingItemTpls: Set<string>;
    botData: IBotData;
}
