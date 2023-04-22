import * as winston from 'winston';

import { providers } from 'ethers';
import { Logging } from "../../helpers/logging";
import { Uniswap } from './uniswap';

/**
 * Model for Sushiswap market
 */
export class Sushiswap extends Uniswap {

    private static readonly sushiLogger: winston.Logger = Logging.getLogger('Sushiswap');

    public static updateReserves(provider: providers.Provider, markets: Sushiswap[]): Promise<void> {
        return Uniswap.updateReserves(provider, markets);
        // return new Promise<void>(async (res, rej) => {
        //     try {
        //         const addresses = markets.map(x => x.address);
        //         // Sushiswap.sushiLogger.info('Updating markets: ' + addresses.join(', '));

        //         // IDENTICAL TO UNISWAP DUE TO SIMILAR CONTRACT ABI
        //         const sushiswapQuery = new Contract(UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, UNISWAP_LIKE_QUERY_ABI, provider);

        //         const reserves: Array<Array<BigNumber>> = (await sushiswapQuery.functions.getReservesByPairs(addresses))[0];
        //         for (let i = 0; i < reserves.length; i++) {
        //             const marketPair = markets[i];
        //             const reserve = reserves[i];
        //               marketPair.setReserves(reserve[0], reserve[1]);


                    
        //             // // FOR DEBUGGING
        //             // marketPair.setReserves(BigNumber.from("42752141001919873668"), BigNumber.from("378447996719527898157201"));
        //         }

        //         res();
        //     }
        //     catch (e) {
        //         Sushiswap.sushiLogger.error(JSON.stringify(e));
        //         rej(e);
        //     }
        // });
    }
}
