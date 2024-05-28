import { inject, injectable } from "tsyringe";
import { SavedCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/GiveCommand/SavedCommand";
import { ISptCommand } from "@spt/helpers/Dialogue/Commando/SptCommands/ISptCommand";
import { ItemHelper } from "@spt/helpers/ItemHelper";
import { PresetHelper } from "@spt/helpers/PresetHelper";
import { ISendMessageRequest } from "@spt/models/eft/dialog/ISendMessageRequest";
import { IUserDialogInfo } from "@spt/models/eft/profile/ISptProfile";
import { IProfileChangeEvent, ProfileChangeEventType } from "@spt/models/spt/dialog/ISendMessageDetails";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { DatabaseServer } from "@spt/servers/DatabaseServer";
import { LocaleService } from "@spt/services/LocaleService";
import { MailSendService } from "@spt/services/MailSendService";
import { HashUtil } from "@spt/utils/HashUtil";

@injectable()
export class TraderSptCommand implements ISptCommand
{
    /**
     * Regex to account for all these cases:
     * spt trader prapor rep 100
     * spt trader mechanic spend 1000000
     */
    private static commandRegex = /^spt trader (?<trader>[\w]+) (?<command>rep|spend) (?<quantity>(?!0+)[0-9]+)$/;

    protected savedCommand: SavedCommand;

    public constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("ItemHelper") protected itemHelper: ItemHelper,
        @inject("HashUtil") protected hashUtil: HashUtil,
        @inject("PresetHelper") protected presetHelper: PresetHelper,
        @inject("MailSendService") protected mailSendService: MailSendService,
        @inject("LocaleService") protected localeService: LocaleService,
        @inject("DatabaseServer") protected databaseServer: DatabaseServer,
    )
    {}

    public getCommand(): string
    {
        return "trader";
    }

    public getCommandHelp(): string
    {
        return "spt trader\n========\nSets the reputation or money spent to the input quantity through the message system.\n\n\tspt trader [trader] rep [quantity]\n\t\tEx: spt trader prapor rep 2\n\n\tspt trader [trader] spend [quantity]\n\t\tEx: spt trader therapist spend 1000000";
    }

    public performAction(commandHandler: IUserDialogInfo, sessionId: string, request: ISendMessageRequest): string
    {
        if (!TraderSptCommand.commandRegex.test(request.text))
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                'Invalid use of trader command. Use "help" for more information.',
            );
            return request.dialogId;
        }

        const result = TraderSptCommand.commandRegex.exec(request.text);

        const trader: string = result.groups.trader;
        const command: string = result.groups.command;
        const quantity: number = +result.groups.quantity;

        const dbTrader = Object.values(this.databaseServer.getTables().traders!).find(
            (t) => t.base.nickname.toLocaleLowerCase() === trader.toLocaleLowerCase(),
        );
        if (dbTrader === undefined)
        {
            this.mailSendService.sendUserMessageToPlayer(
                sessionId,
                commandHandler,
                'Invalid use of trader command, the trader was not found. Use "help" for more information.',
            );
            return request.dialogId;
        }
        let profileChangeEventType: ProfileChangeEventType;
        switch (command)
        {
            case "rep":
                profileChangeEventType = ProfileChangeEventType.TRADER_STANDING;
                break;
            case "spend":
                profileChangeEventType = ProfileChangeEventType.TRADER_SALES_SUM;
                break;
        }

        const event: IProfileChangeEvent = {
            _id: this.hashUtil.generate(),
            Type: profileChangeEventType,
            value: quantity,
            entity: dbTrader.base._id,
        };

        this.mailSendService.sendSystemMessageToPlayer(
            sessionId,
            "A single ruble is being attached, required by BSG logic.",
            [
                {
                    _id: this.hashUtil.generate(),
                    _tpl: "5449016a4bdc2d6f028b456f",
                    upd: { StackObjectsCount: 1 },
                    parentId: this.hashUtil.generate(),
                    slotId: "main",
                },
            ],
            undefined,
            [event],
        );
        return request.dialogId;
    }
}
