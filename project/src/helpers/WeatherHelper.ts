import { ConfigTypes } from "@spt/models/enums/ConfigTypes";
import { DateTime } from "@spt/models/enums/DateTime";
import { IWeatherConfig } from "@spt/models/spt/config/IWeatherConfig";
import { ILogger } from "@spt/models/spt/utils/ILogger";
import { ConfigServer } from "@spt/servers/ConfigServer";
import { TimeUtil } from "@spt/utils/TimeUtil";
import { inject, injectable } from "tsyringe";

@injectable()
export class WeatherHelper {
    protected weatherConfig: IWeatherConfig;

    constructor(
        @inject("PrimaryLogger") protected logger: ILogger,
        @inject("TimeUtil") protected timeUtil: TimeUtil,
        @inject("ConfigServer") protected configServer: ConfigServer,
    ) {
        this.weatherConfig = this.configServer.getConfig(ConfigTypes.WEATHER);
    }

    /**
     * Get the current in-raid time
     * @param currentDate (new Date())
     * @returns Date object of current in-raid time
     */
    public getInRaidTime(): Date {
        // tarkov time = (real time * 7 % 24 hr) + 3 hour
        const russiaOffset = this.timeUtil.getHoursAsSeconds(3) * 1000;
        return new Date(
            (russiaOffset + new Date().getTime() * this.weatherConfig.acceleration) %
                (this.timeUtil.getHoursAsSeconds(24) * 1000),
        );
    }

    /**
     * Is the current raid at nighttime
     * @param timeVariant PASS OR CURR (from raid settings)
     * @returns True when nighttime
     */
    public isNightTime(timeVariant: DateTime) {
        const time = this.getInRaidTime();

        // We get left side value, if player chose right side, set ahead 12 hrs
        if (timeVariant === "PAST") {
            time.setHours(time.getHours() + 12);
        }

        // Night if after 9pm or before 5am
        return time.getHours() > 21 || time.getHours() < 5;
    }
}