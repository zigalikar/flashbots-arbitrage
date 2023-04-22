import * as winston from 'winston';

import { BigNumber, Contract, logger, providers } from "ethers";
import { Logging } from "../../helpers/logging";
import { Market } from "../market";
import { UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, WETH_ADDRESS } from '../../utils/address';
import { UNISWAP_LIKE_QUERY_ABI } from '../../utils/abi';

/**
 * Model for Uniswap market
 */
export class Uniswap extends Market {

    protected static readonly logger: winston.Logger = Logging.getLogger('Uniswap');

    public override swap(from: string, amount: BigNumber, recipient: string): Promise<string> {
        return new Promise<string>(async (res, rej) => {
            // function swap(uint amount0Out, uint amount1Out, address to, bytes calldata data) external lock {
            let amount0Out = BigNumber.from(0);
            let amount1Out = BigNumber.from(0);
            let tokenOut: string;

            if (from === this.token0Address) {
                tokenOut = this.token1Address;
                amount1Out = this.getTokens1Out(amount);
            }
            else if (from === this.token1Address) {
                tokenOut = this.token0Address;
                amount0Out = this.getTokens0Out(amount);
            }
            else
                throw new Error("Bad token input address")

            const populatedTransaction = await this._contract.populateTransaction.swap(amount0Out, amount1Out, recipient, []);
            if (populatedTransaction === undefined || populatedTransaction.data === undefined) throw new Error("HI")
            res(populatedTransaction.data);
        });
    }

    public static updateReserves(provider: providers.Provider, markets: Uniswap[]): Promise<void> {
        return new Promise<void>(async (res, rej) => {
            try {
                const uniswapQuery = new Contract(UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, UNISWAP_LIKE_QUERY_ABI, provider);
                const pairAddresses = markets.map(marketPair => marketPair.address);
                const reserves: Array<Array<BigNumber>> = (await uniswapQuery.functions.getReservesByPairs(pairAddresses))[0];
                for (let i = 0; i < markets.length; i++) {
                    const marketPair = markets[i];
                    const reserve = reserves[i];
                    marketPair.setReserves(reserve[0], reserve[1]);
                }

                res();
            }
            catch (e) {
                Uniswap.logger.error('Error when updating reserves.', JSON.stringify(e));
                rej(e);
            }
        });
    }

    // public static updateReserves(provider: providers.Provider, markets: Uniswap[]): Promise<void> {
    //     return new Promise<void>(async (res, rej) => {
    //         try {
    //             const addresses = markets.map(x => x.address);

    //             // IDENTICAL TO SUSHISWAP DUE TO SIMILAR CONTRACT ABI
    //             const uniswapQuery = new Contract(UNISWAP_LIKE_LOOKUP_CONTRACT_ADDRESS, UNISWAP_LIKE_QUERY_ABI, provider);

    //             const response = await uniswapQuery.functions.getReservesAndTokens(addresses);
    //             const reserves: Array<Array<BigNumber>> = response[0];
    //             const tokens: Array<Array<string>> = response[1];
    //             for (let i = 0; i < reserves.length; i++) {
    //                 const marketPair = markets[i];
    //                 const reserve = reserves[i];

    //                 // let base = tokens[i][0];
    //                 // let quote = tokens[i][1];
    //                 // let baseReserve = reserve[0];
    //                 // let quoteReserve = reserve[1];
    //                 // if (base === WETH_ADDRESS) {
    //                 //     // switch the base address to be WETH
    //                 //     // TODO: for USDC, USDT, ...
    //                 //     const temp = quote;
    //                 //     quote = base;
    //                 //     base = temp;

    //                 //     const tempReserve = quoteReserve;
    //                 //     quoteReserve = baseReserve;
    //                 //     baseReserve = tempReserve;
    //                 // }

    //                 // marketPair.setTokenAddresses(base, quote);
    //                 // marketPair.setReserves(baseReserve, quoteReserve);



    //                 // // // FOR DEBUGGING
    //                 // // marketPair.setReserves(BigNumber.from("318759329860961379348"), BigNumber.from("2838433813960055001016159"));
    //             }

    //             res();
    //         }
    //         catch (e) {
    //             Uniswap.logger.error(JSON.stringify(e));
    //             rej(e);
    //         }
    //     });
    // }
}
