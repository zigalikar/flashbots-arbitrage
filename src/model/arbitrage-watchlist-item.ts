import { Market } from "./market";

export interface IArbitrageWatchlistItem {
    name: string;
    markets: Market[];
}
