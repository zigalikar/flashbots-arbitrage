import * as winston from 'winston';
const { combine, timestamp, label, printf } = winston.format;

export class Logging {
    private static _loggers: {[name: string]: winston.Logger} = {};

    public static getLogger(name: string): winston.Logger {
        const logger = this._loggers[name];
        if (logger == undefined) {
            const format = printf(({ level, message, label, timestamp }) => {
                return `${timestamp} [${label}] ${level}: ${message}`;
            });

            this._loggers[name] = winston.createLogger({
                level: 'info',
                format: combine(
                    label({ label: name }),
                    timestamp(),
                    format
                  ),
                transports: [
                    new winston.transports.File({ filename: 'logs/logs.log' }),
                    new winston.transports.Console()
                ],
            });
        }

        return this._loggers[name];
    }
}
