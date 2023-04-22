import { FlashbotsBundleProvider, SimulationResponseSuccess } from "@flashbots/ethers-provider-bundle";
import { BigNumber, Contract, logger, Wallet } from "ethers";
import { Guid } from "guid-typescript";
import { ERC20_ABI } from "../utils/abi";
import { WETH_ADDRESS } from "../utils/address";
import { BigNumberUtils } from "../utils/big-number-utils";
import { IArbitrageWatchlistItem } from "./arbitrage-watchlist-item";
import { Market } from "./market";

/**
 * Helper class for arbitrage
 */
export class Arbitrage {

    private readonly _flashbots: FlashbotsBundleProvider;
    private readonly _executor: Contract;
    private readonly _wallet: Wallet;
    private readonly _minerRewardPercentage: number;

    private readonly _minProfit: BigNumber = BigNumber.from('10000000000000000');

    /**
     * 
     * @param flashbots Flashbots bundle provider
     * @param executor Executor contract that executes the arbitrage on-chain and pays the miner
     * @param wallet Wallet that signs the arbitrage transactions
     * @param minerRewardPercentage How much the contract will pay the miner through the block.coinbase bribe (in percentages)
     */
    constructor(flashbots: FlashbotsBundleProvider, executor: Contract, wallet: Wallet, minerRewardPercentage: number) {
        if (flashbots == undefined)
            throw new Error('No argument \'flashbots\' provided.');

        if (executor == undefined)
            throw new Error('No argument \'executor\' provided.');

        if (wallet == undefined)
            throw new Error('No argument \'wallet\' provided.');

        if (minerRewardPercentage > 100)
            throw new Error('Parameter \'minerRewardPercentage\' cannot be larger than 100%.');

        this._flashbots = flashbots;
        this._executor = executor;
        this._wallet = wallet;
        this._minerRewardPercentage = minerRewardPercentage;
    }

    /**
     * Returns the best possible arbitrage opportunity from the supplied list or null if no arbitrage opportunity exists.
     * @param markets List of markets (with the same pair) to evaluate
     */
    public getBestArbitrage(item: IArbitrageWatchlistItem, totalWethBalance: BigNumber): Promise<IArbitrageOpportunity> {
        return new Promise<IArbitrageOpportunity>((res, rej) => {
            const markets = item.markets;
            let arbs: IArbitrageOpportunity[] = [];
            for (let i = 0; i < markets.length; i++) {
                for (let j = i + 1; j < markets.length; j++) {
                    if (i !== j) {
                        const market1 = markets[i];
                        const market2 = markets[j];

                        try {
                            // TODO: support other tokens besides WETH
                            // try to arb market1 & market 2
                            const size1 = this.getOptimalArbitrageSize(market1, market2, WETH_ADDRESS, totalWethBalance);
                            const size2 = this.getOptimalArbitrageSize(market2, market1, WETH_ADDRESS, totalWethBalance);

                            // USE THIS FOR DEBUGGING
                            // const size2 = this.getOptimalArbitrageSize(market2, market1, balanceQuote);
                            // const size1 = null; // FOR DEBUGGING

                            if (size1 || size2) {
                                arbs.push({
                                    buyMarket: size1 ? market1 : market2,
                                    sellMarket: size1 ? market2 : market1,
                                    addressQuote: size1 ? market1.token1Address : market2.token1Address, // token1Address properties of both vars should be the same
                                    amountQuote: (size1 || size2).amountQuote,
                                    addressBase: size1 ? market1.token0Address : market2.token0Address, // token0Address properties of both vars should be the same
                                    estimatedProfitQuote: (size1 || size2).estimatedProfitQuote
                                });
                            }
                        }
                        catch (e) {
                            logger.warn(`Error when evaluating markets ${market1.address} and ${market2.address} for arbitrage.`, e);
                        }
                    }
                }
            }

            // filter by minimum profit threshold
            // TODO: normalize for other tokens, not just WETH

            // const lenBefore = arbs.length;
            // const profits = arbs.map(a => a.estimatedProfitQuote.toString()).join(', ');
            arbs = arbs.filter(a => a.estimatedProfitQuote.gte(this._minProfit));
            // if (arbs.length === 0 && lenBefore > 0)
            //     logger.info(`All arbitrage opportunities (profits: ${profits}, name: ${item.name}) were below the minimum profit threshold (${this._minProfit.toString()}).`);

            // sort by descending estimated profits and return most profitable arb opportunity
            if (arbs.length > 0) {
                arbs = arbs.sort((a, b) => a.estimatedProfitQuote.gt(b.estimatedProfitQuote) ? 1 : -1);
                res(arbs[0]);
            }
            res(null);
        });
    }

    /**
     * Gets the optimal arbitrage size and profit for the specified arbitrage. Uses the derivate of the profit function (check the documentation in the Python project for more details).
     * @param buyFrom Market to buy from
     * @param sellTo Market to sell to
     * @param quoteTokenAddress Which token of the pair is the quote token
     * @param accountBalanceQuote Account balance of the arbitrage wallet in quote currency
     * @returns Size and estimated profit of the arbitrage (both in quote currency)
     */
    private getOptimalArbitrageSize(buyFrom: Market, sellTo: Market, quoteTokenAddress: string, accountBalanceQuote: BigNumber): { amountQuote: BigNumber, estimatedProfitQuote: BigNumber } {
        if ((buyFrom.token0Address !== quoteTokenAddress && buyFrom.token1Address !== quoteTokenAddress) || (sellTo.token0Address !== quoteTokenAddress && sellTo.token1Address !== quoteTokenAddress))
            return null; // no quote token in pair
        
        if (buyFrom.token0Reserves.eq(0) || buyFrom.token1Reserves.eq(0) || sellTo.token0Reserves.eq(0) || sellTo.token1Reserves.eq(0))
            return null; // no liquidity
        
        // calculate fee multiplier to prevent underflow
        const buySplit = buyFrom.fee.toString().split('.');
        const buyDecimals = buySplit.length > 0 ? buySplit[1].length : 0;
        const sellSplit = sellTo.fee.toString().split('.');
        const sellDecimals = sellSplit.length > 0 ? sellSplit[1].length : 0;
        const maxDecimals = buyDecimals > sellDecimals ? buyDecimals : sellDecimals;
        const feeMultiplier = 10 ** maxDecimals;

        // sort by quote token
        const base1 = buyFrom.token1Address === quoteTokenAddress ? buyFrom.token0Reserves : buyFrom.token1Reserves;
        const quote1 = buyFrom.token1Address === quoteTokenAddress ? buyFrom.token1Reserves : buyFrom.token0Reserves;
        const base2 = sellTo.token1Address === quoteTokenAddress ? sellTo.token0Reserves : sellTo.token1Reserves;
        const quote2 = sellTo.token1Address === quoteTokenAddress ? sellTo.token1Reserves : sellTo.token0Reserves;

        // TODO: for other tokens, not just WETH
        // filter by WETH liqudity
        if (quote1.lt('2000000000000000000') || quote2.lt('2000000000000000000'))
            return null;

        // logger.info(`${buyFrom.token0Address}-${buyFrom.token1Address}: ${buyFrom.token0Reserves.toString()} & ${buyFrom.token1Reserves.toString()}; ${sellTo.token0Reserves.toString()} & ${sellTo.token1Reserves.toString()}`);

        // init vars
        const
            r_a = base1,
            r_b = quote1,
            r_a2 = base2,
            r_b2 = quote2,
            y = BigNumber.from((1 - buyFrom.fee) * feeMultiplier),
            y2 = BigNumber.from((1 - sellTo.fee) * feeMultiplier);

        // roots of the derivative function of profits
        // const root1 = (Math.sqrt((r_a ** 3) * r_b * r_a2 * r_b2 * (y ** 3) * (y2 ** 3) + 2 * (r_a ** 2) * r_b * (r_a2 ** 2) * r_b2 * (y ** 3) * (y2 ** 2) + r_a * r_b * (r_a2 ** 3) * r_b2 * (y ** 3) * y2) - r_a * r_b * r_a2 * y * y2 - r_b * (r_a2 ** 2) * y) / ((r_a ** 2) * (y ** 2) * (y2 ** 2) + 2 * r_a * r_a2 * (y ** 2) * y2 + (r_a2 ** 2) * (y ** 2));
        // const root2 = (- Math.sqrt((r_a ** 3) * r_b * r_a2 * r_b2 * (y ** 3) * (y2 ** 3) + 2 * (r_a ** 2) * r_b * (r_a2 ** 2) * r_b2 * (y ** 3) * (y2 ** 2) + r_a * r_b * (r_a2 ** 3) * r_b2 * (y ** 3) * y2) - r_a * r_b * r_a2 * y * y2 - r_b * (r_a2 ** 2) * y) / ((r_a ** 2) * (y ** 2) * (y2 ** 2) + 2 * r_a * r_a2 * (y ** 2) * y2 + (r_a2 ** 2) * (y ** 2));
        const calcRoot = (negativeSqrt: boolean) => {
            // (r_a ** 3) * r_b * r_a2 * r_b2 * (y ** 3) * (y2 ** 3)
            let root_1 = r_a.pow(3).mul(r_b).mul(r_a2).mul(r_b2);
            root_1 = y.pow(3).mul(root_1).div(feeMultiplier ** 3);
            root_1 = y2.pow(3).mul(root_1).div(feeMultiplier ** 3);

            // 2 * (r_a ** 2) * r_b * (r_a2 ** 2) * r_b2 * (y ** 3) * (y2 ** 2)
            let root_2 = r_a.pow(2).mul(2).mul(r_b);
            root_2 = r_a2.pow(2).mul(root_2).mul(r_b2);
            root_2 = y.pow(3).mul(root_2).div(feeMultiplier ** 3);
            root_2 = y2.pow(2).mul(root_2).div(feeMultiplier ** 2);

            // r_a * r_b * (r_a2 ** 3) * r_b2 * (y ** 3) * y2
            let root_3 = r_a2.pow(3).mul(r_a).mul(r_b).mul(r_b2).mul(y2).div(feeMultiplier);
            root_3 = y.pow(3).mul(root_3).div(feeMultiplier ** 3);

            // (r_a ** 3) * r_b * r_a2 * r_b2 * (y ** 3) * (y2 ** 3) + 2 * (r_a ** 2) * r_b * (r_a2 ** 2) * r_b2 * (y ** 3) * (y2 ** 2) + r_a * r_b * (r_a2 ** 3) * r_b2 * (y ** 3) * y2
            root_1 = root_1.add(root_2).add(root_3);

            // Math.sqrt((r_a ** 3) * r_b * r_a2 * r_b2 * (y ** 3) * (y2 ** 3) + 2 * (r_a ** 2) * r_b * (r_a2 ** 2) * r_b2 * (y ** 3) * (y2 ** 2) + r_a * r_b * (r_a2 ** 3) * r_b2 * (y ** 3) * y2)
            root_1 = BigNumberUtils.sqrt(root_1);

            if (negativeSqrt)
                root_1 = root_1.mul(-1);

            // r_a * r_b * r_a2 * y * y2
            let root_4 = r_a.mul(r_b).mul(r_a2).mul(y).mul(y2).div(feeMultiplier ** 2);

            // r_b * (r_a2 ** 2) * y
            let root_5 = r_a2.pow(2).mul(r_b).mul(y).div(feeMultiplier);

            // Math.sqrt((r_a ** 3) * r_b * r_a2 * r_b2 * (y ** 3) * (y2 ** 3) + 2 * (r_a ** 2) * r_b * (r_a2 ** 2) * r_b2 * (y ** 3) * (y2 ** 2) + r_a * r_b * (r_a2 ** 3) * r_b2 * (y ** 3) * y2) - r_a * r_b * r_a2 * y * y2 - r_b * (r_a2 ** 2) * y)
            // OR NEGATIVE IF negativeSqrt === true
            root_1 = root_1.sub(root_4).sub(root_5);

            // (r_a ** 2) * (y ** 2) * (y2 ** 2)
            let root_6 = r_a.pow(2);
            root_6 = y.pow(2).mul(root_6).div(feeMultiplier ** 2);
            root_6 = y2.pow(2).mul(root_6).div(feeMultiplier ** 2);

            // 2 * r_a * r_a2 * (y ** 2) * y2
            let root_7 = r_a.mul(2).mul(r_a2).mul(y2);
            root_7 = y.pow(2).mul(root_7).div(feeMultiplier ** 3);

            // (r_a2 ** 2) * (y ** 2)
            let root_8 = y.pow(2);
            root_8 = r_a2.pow(2).mul(root_8).div(feeMultiplier ** 2);

            // (r_a ** 2) * (y ** 2) * (y2 ** 2) + 2 * r_a * r_a2 * (y ** 2) * y2 + (r_a2 ** 2) * (y ** 2)
            root_8 = root_8.add(root_7).add(root_6);
            return root_1.div(root_8);
        };

        const root1 = calcRoot(false);
        const root2 = calcRoot(true);

        // profit function
        const profit = (d_b: BigNumber): BigNumber => {
            // full formula:
            // r_b2 - (r_a2 * r_b2) / (r_a2 + y2 * (r_a - (r_a * r_b) / (r_b + y * d_b))) - d_b;

            let res = y.mul(d_b).div(feeMultiplier).add(r_b); // r_b + y * d_b
            res = r_a.mul(r_b).div(res); // (r_a * r_b) / (r_b + y * d_b)
            res = r_a.sub(res); // r_a - (r_a * r_b) / (r_b + y * d_b)
            res = res.mul(y2).div(feeMultiplier); // y2 * (r_a - (r_a * r_b) / (r_b + y * d_b))
            res = r_a2.add(res); // r_a2 + y2 * (r_a - (r_a * r_b) / (r_b + y * d_b))
            res = r_a2.mul(r_b2).div(res); // (r_a2 * r_b2) / (r_a2 + y2 * (r_a - (r_a * r_b) / (r_b + y * d_b)))
            res = r_b2.sub(res).sub(d_b); // r_b2 - (r_a2 * r_b2) / (r_a2 + y2 * (r_a - (r_a * r_b) / (r_b + y * d_b))) - d_b
            return res;
        }

        // calculate profits at roots
        const profit1 = root1.gt(0) ? profit(root1) : BigNumber.from(0);
        const profit2 = root2.gt(0) ? profit(root2) : BigNumber.from(0);

        // TODO: define risk:reward ratios, trade based on those
        let profits = [{ estimatedProfitQuote: profit1, amountQuote: root1 }, { estimatedProfitQuote: profit2, amountQuote: root2 }].filter(x => x.estimatedProfitQuote.gt(0));
        if (profits.length > 0) {
            profits = profits.sort((a, b) => a.estimatedProfitQuote.gt(b.estimatedProfitQuote) ? -1 : 1); // profits in descending order
            for (let i = 0; i < profits.length; i++) {
                // take first trade for which we have enough funds
                if (profits[i].amountQuote.lte(accountBalanceQuote))
                    return profits[i];
            }

            // calculate profits if buying with whole account
            logger.info(`Calculated arbitrage sizes (${profits.map(x => x.amountQuote).join(', ')}) too big - lowering to total account value (${accountBalanceQuote.toString()}).`);
            const profitWithMaxAccVal = profit(accountBalanceQuote);
            return {
                estimatedProfitQuote: profitWithMaxAccVal,
                amountQuote: accountBalanceQuote
            };
        }
        return null;
    }

    public take(arb: IArbitrageOpportunity, blockNumber: number): Promise<IArbitrageTransactionSent> {
        return new Promise<IArbitrageTransactionSent>(async (res, rej) => {
            const id = Guid.create().toString();
            logger.info(`Taking arbitrage opportunity [${id}]: buy ${arb.buyMarket.address} (amount ${arb.amountQuote} [quote]), sell ${arb.sellMarket.address}, estimated profit (quote): ${arb.estimatedProfitQuote}`);

            // get targets & payload data
            const exchangeCall = await arb.buyMarket.swap(arb.addressQuote, arb.amountQuote, arb.sellMarket.address);
            const buy = {
                data: [exchangeCall],
                targets: [arb.buyMarket.address]
            };

            // get the base amount of tokens received from buying on market 1
            const inter = arb.buyMarket.getTokensOut(arb.addressQuote, arb.addressBase, arb.amountQuote);

            // get sell payload data
            const sell = await arb.sellMarket.swap(arb.addressBase, inter, this._executor.address);

            // build targets
            const targets: Array<string> = [...buy.targets, arb.sellMarket.address];
            const payloads: Array<string> = [...buy.data, sell];
            logger.info(`Arbitrage [${id}] targets/payloads:`, { targets, payloads });

            // create tx
            const minerReward = arb.estimatedProfitQuote.mul(this._minerRewardPercentage).div(100);
            const transaction = await this._executor.populateTransaction.arbWeth(arb.amountQuote, minerReward, targets, payloads, {
                gasPrice: BigNumber.from(0),
                gasLimit: BigNumber.from(1000000)
            });

            try {
                const estimateGas = await this._executor.provider.estimateGas({
                    ...transaction,
                    from: this._wallet.address
                });

                if (estimateGas.gt(1400000))
                    rej(`estimateGas succeeded, but suspiciously large: ${estimateGas.toString()}`);

                transaction.gasLimit = estimateGas.mul(2);
            }
            catch (e) {
                rej(`Estimate gas failure [${id}]: ${e}`);
            }

            const bundledTransactions = [{
                signer: this._wallet,
                transaction: transaction
            }];

            const signedBundle = await this._flashbots.signBundle(bundledTransactions);
            const simulation = await this._flashbots.simulate(signedBundle, blockNumber + 1);
            if ("error" in simulation || simulation.firstRevert !== undefined)
                rej(`Flashbots simulation error for arbitrage [${id}]: ${JSON.stringify(simulation)}`);

            // const simulationSuccess = simulation as SimulationResponseSuccess;
            const bundlePromises = [blockNumber + 1, blockNumber + 2].map(targetBlockNumber => this._flashbots.sendRawBundle(signedBundle, targetBlockNumber));
            await Promise.all(bundlePromises);
            res({
                id: id
            });
        });
    }
}

/**
 * Interface that describes an arbitrage simulation
 */
export interface IArbitrageSimulation {
    /**
     * Amount to arbitrage in base currency
     */
    amountQuote: BigNumber;

    /**
     * Estimated profit of the arbitrage in quote currency
     */
    estimatedProfitQuote: BigNumber
}

/**
 * Interface that describes an arbitrage opportunity
 */
export interface IArbitrageOpportunity {
    /**
     * Which market to buy from
     */
    buyMarket: Market;

    /**
     * Which market to sell to
     */
    sellMarket: Market;

    /**
     * Address of the quote token
     */
    addressQuote: string;

    /**
     * Amount to buy/sell in quote currency
     */
    amountQuote: BigNumber;

    /**
     * Address of the base token
     */
    addressBase: string;

    /**
     * Estimated profit from arbitrage in quote currency
     */
    estimatedProfitQuote: BigNumber;
}

/**
 * Describes an arbitrage transaction that has been broadcasted to the network
 */
export interface IArbitrageTransactionSent {
    /**
     * ID of the arbitrage
     */
    id: string;
}
