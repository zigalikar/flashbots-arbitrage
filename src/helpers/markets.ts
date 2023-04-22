import * as _ from 'lodash';

import { Contract, providers } from "ethers";
import { IArbitrageWatchlistItem } from "../model/arbitrage-watchlist-item";
import { Market } from "../model/market";
import { Uniswap } from "../model/markets/uniswap";
import { UNISWAP_LIKE_PAIR_ABI, UNISWAP_LIKE_QUERY_ABI } from "../utils/abi";
import { FACTORY_ADDRESSES, UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, WETH_ADDRESS } from "../utils/address";
import { Logging } from "./logging";

/**
 * Static helper class for markets
 */
export class Markets {

    /**
     * Updates reserves of the markets
     * @param provider Provider of the Ethereum RPC node
     * @param markets List of markets to update reserves for
     * @returns 
     */
    public static async updateReserves(provider: providers.Provider, markets: Market[]): Promise<void> {
        return new Promise<void>((res, rej) => {
            res(Uniswap.updateReserves(provider, markets));

            // const uniswap = markets.filter(x => x instanceof Uniswap);
            // const sushiswap = markets.filter(x => x instanceof Sushiswap);

            // // TODO: all vs allSettled
            // // rejects if any of the markets rejects
            // Promise.all([
            //     Uniswap.updateReserves(provider, uniswap),
            //     Sushiswap.updateReserves(provider, sushiswap)
            // ])
            //     .then(() => res())
            //     .catch(e => rej(e));
        });
    }

    /**
     * Gets a watchlist for potential arbitrage
     * @param provider Provider of the Ethereum RPC node
     * @returns Watchlist for arbitrage
     */
    public static getArbitrageWatchlist(provider: providers.Provider): Promise<IArbitrageWatchlistItem[]> {
        return new Promise<IArbitrageWatchlistItem[]>(async (res, rej) => {
            const logger = Logging.getLogger('markets.ts');

            // uniswap query contract
            const uniswapQuery = new Contract(UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, UNISWAP_LIKE_QUERY_ABI, provider);

            // batch sizes of query
            const BATCH_COUNT_LIMIT = 100;
            const UNISWAP_BATCH_SIZE = 1000;

            // blacklisted tokens
            const blacklistTokens = [
                '0xD75EA151a61d06868E31F8988D28DFE5E9df57B4'
            ];

            // groups array of markets by tokens in the markets
            const group = (mkts: Array<Market>): Array<IArbitrageWatchlistItem> => {
                const grouped = _.mapValues(_.groupBy(mkts, (item: Market) => {
                    const index = [item.token0Address, item.token1Address].sort().join('-');
                    return index;
                }));

                const wl = new Array<IArbitrageWatchlistItem>();
                for (let token in grouped) {
                    const tokenMarkets: Market[] = grouped[token];
                    if (tokenMarkets.length > 1) {
                        wl.push({
                            name: token,
                            markets: tokenMarkets
                        });
                    }
                }

                return wl;
            };

            // loop through all markets
            const markets = new Array<Market>();
            for (let j = 0; j < FACTORY_ADDRESSES.length; j++) {
                const factoryAddress = FACTORY_ADDRESSES[j];
                for (let i = 0; i < BATCH_COUNT_LIMIT * UNISWAP_BATCH_SIZE; i += UNISWAP_BATCH_SIZE) {
                    try {
                        const pairs: Array<Array<string>> = (await uniswapQuery.functions.getPairsByIndexRange(factoryAddress, i, i + UNISWAP_BATCH_SIZE))[0];
                        for (let i = 0; i < pairs.length; i++) {
                            const pair = pairs[i];
                            const marketAddress = pair[2];
                            let tokenAddress: string;

                            // TODO: support other tokens besides WETH
                            // only support WETH for now
                            if (pair[0] === WETH_ADDRESS)
                                tokenAddress = pair[1];
                            else if (pair[1] === WETH_ADDRESS)
                                tokenAddress = pair[0];
                            else
                                continue;

                            if (!blacklistTokens.includes(tokenAddress))
                                markets.push(new Uniswap(provider, marketAddress, pair[0], pair[1], UNISWAP_LIKE_PAIR_ABI, 0.003));

                            // if (markets.length > 50) // FOR TESTING
                            //     res(group(markets));
                        }

                        if (pairs.length < UNISWAP_BATCH_SIZE)
                            break;
                    }
                    catch (e) {
                        logger.error('Error when getting arbitrage watchlist.', e);
                    }
                }
            }

            res(group(markets));
        });
    }
}
